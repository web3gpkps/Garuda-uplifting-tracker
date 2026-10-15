# Google Sheets two-way sync: operator notes

Supabase is the primary store. The Google Sheet (`GOOGLE_SHEETS_ID`) is the imported workbook
"Tracker Tindak Lanjut People Development Garuda", kept as a live replica people may edit **in its own
layout** (its formulas, Dashboard, Laporan Mingguan and Rekap Performa keep working). The engine replicates
both ways with **lease + baseline snapshot + per-cell 3-way merge + conflict log**. Contract:
`docs/SPEC.md` → "Google Sheets two-way replication".

## Architecture

```
 pg_cron (1/min) ─┐                     ┌──────────── POST /api/sync/run (Vercel, Node) ─────────────┐
 DB trigger ping ─┼─ Bearer secret ───▶ │ 1 claim lease     sync_claim_lease(60) → uuid | null          │
 Apps Script ping ┘                     │ 2 read            sync_state.baseline + synced tables         │
                                        │                   + stations (codes, for validation)          │
                                        │                   Sheets: metadata + values + formulas        │
                                        │ 3 project         workbook layouts → row-1 tables (layouts.ts)│
                                        │ 4 merge (pure)    merge.ts → Plan                             │
                                        │ 5 translate       Plan → real cell ops; refuses formula cells │
                                        │ 6 write DB        parents first, deletes children first       │
                                        │ 7 log sheet-wins  sync_conflicts                              │
                                        │ 8 write Sheet     setup → values → notes                      │
                                        │ 9 log db-wins + new validation problems                       │
                                        │10 release lease   sync_release_lease(token, baseline, err)    │
                                        └───────────────────────────────────────────────────────────────┘
```

| File | Role |
|---|---|
| `lib/sync/tables.ts` | What is synced: keys, column types, workbook header texts, presence/placement rules |
| `lib/sync/layouts.ts` | Workbook layouts ↔ row-1 tables: projection, formula detection, free rows, translation to cell writes |
| `lib/sync/normalize.ts` | Canonical values (`"4"`/`4`/`4.0` → 4; serial / `12/10/2026` / `12 Okt 2026` → `2026-10-12`; `cgk` → `CGK`; `ya` → `Ya` ↔ `true`) and validation |
| `lib/sync/merge.ts` | Pure merge engine → `Plan` (DB ops, sheet ops, conflicts, issues, new baseline) |
| `lib/sync/sheets.ts` | Sheets REST v4 adapter (fetch + google-auth-library JWT) |
| `lib/sync/supabase.ts` | Service-role adapter: lease RPCs, reads, ordered writes, conflict log |
| `lib/sync/run.ts` | One run, failure handling |
| `lib/sync/auth.ts` | Constant-time Bearer check |
| `app/api/sync/run/route.ts` | HTTP entry point |
| `apps-script/` | Sheet-side ping trigger (setup in Bahasa Indonesia) |
| `lib/sync/scripts/probe-sheet.ts` | Read-only probe of the real sheet (tabs, sizes) |
| `lib/sync/scripts/check-remote.ts` | Read-only: DB counts, dry run against the real workbook, in-memory replay |

Tests: `bun test lib/sync` (engine cases, every workbook layout end to end on an in-memory copy of the
Garuda workbook, adapters with mocked HTTP, orchestrator failure paths).

## Where each table lives

Every workbook tab has its header on row 4 and a **fixed block** of pre-made rows: from the first data row
to the last row that holds a formula (Master SDM 5..1089, Cek BMI 6..1090, Log 5..2774, Tindak Lanjut 5..54,
Remedial 5..154, Penggantian 5..44). Dashboard, Laporan, Rekap and Cek BMI read those ranges, so the engine
never writes below a block and never inserts or deletes rows in it.

| Table | Tab (layout) | Key | Synced input columns | Notes |
|---|---|---|---|---|
| staff | `Master SDM` | B `ID SDM` | C Program, D Provider, E Unit, F Nama Petugas, G Employee Number, H L/P, I Touch Point, J Role Play, K Post-Test, M Remark di Laporan, Q Status Penugasan, R Evaluation Feedback, S Catatan; **bmi_has_note = `Cek BMI 2 Mingguan` I** (`Ya`/`Tidak` ↔ true/false), **bmi_note = `Cek BMI 2 Mingguan` AU** | No name = absent. A free row has B and F empty: new staff from the DB fill the first one (No in A kept); none left → `rejected:no_sheet_row` ("Master SDM penuh"). A deleted staff member's row is cleared **including B**, so it is free again. I/AU are written on the Cek BMI row = Master row + 1, only if that row's B still mirrors the Master row (`='Master SDM'!B<n>` or the same ID) |
| bmi_checks | `Cek BMI 2 Mingguan`, header rows 4–5, data 6.. (wide) | B (formula, computed value) + slot | slot k = 1..6: Tgl Cek / Tinggi (cm) / Berat (kg) at J/K/L, O/P/Q, T/U/V, Y/Z/AA, AD/AE/AF, AI/AJ/AK (each slot is 5 columns: Tgl, Tinggi, Berat, BMI, Kategori; slot headers read `Cek ke-N (rencana dd/mm/yyyy)`) | Long in the DB (`period` = slot). Tinggi and Berat both empty = absent; a date alone is noted; periods > 6 are reported. BMI/Kategori and the AN..AW summary (except AU) are formulas; G/H (Coaching Evaluation Feedback, Result/Remarks) mirror Master SDM R/S. A check for a staff member placed in Master SDM in the same run lands in Cek BMI on the next run (once B shows the ID) |
| weekly_scores | `Log Performa Mingguan`, data 5..2774 | A `Minggu Ke` + C `ID SDM` | G Touch Point, H–K scores (0–100), O Topik Gap Utama, P Observer / Coach, Q Catatan Coaching | Empty inputs = absent. Rows 5..2714 are pre-made (week + ID); new records go to the first row whose A, C and inputs are empty (2715..2774). B/D/E/F/L/M/N are formulas |
| action_items | `Tindak Lanjut`, data 5..54 | B `ID` | C Kelompok, D Aspek, E Akar Masalah / Temuan, F Tindakan / Inisiatif, G Target / KPI, H Jenis, I Jadwal, J Batas Waktu (literal only), K PIC, L Status, M % Progres, N Tgl Update, O Realisasi / Bukti, P Catatan Garuda / KPS, S Sumber | **% Progres is a fraction in the sheet (0.5 = 50%) and 0..100 in the DB.** J is a formula for some items (GA-TL01: `EDATE`): skipped for those rows. New items fill the next numbered free row. Q/R are formulas |
| remedials | `Remedial`, data 5..154 | B `ID SDM` | H Tindakan Remedial, I Tgl Remedial, J Role Play Ulang, K Post-Test Ulang, O Dilaporkan ke Garuda, P Catatan | One row per participant (UNIQUE staff_code). A row with B filled is a record even with empty inputs. Deleting clears the row **including B**. C–G and L–N are formulas |
| replacements | `Penggantian SDM`, rows 5..44 | P `ID Sistem` (hidden, engine) | B Program, C Unit, D–K, N Dilaporkan ke Garuda, O Catatan, Q `ID SDM` (engine, staff_code) | P/Q are added by the engine on the first run (the grid is widened if it ends at O). New records fill the first free numbered row. Deleting clears the row (No/formulas stay). L/M are formulas |
| settings | `Parameter`, label B / value C (rows 5..) | label text in B | C | Labels as in `scripts/import_xlsx.py` (`PARAMETER_LABELS`), including `Batas waktu penggantian SDM`. C30 (`Tanggal acuan (hari ini)`, `TODAY()`) is a formula: not synced |
| weekly_reports | `Temuan Mingguan` (engine-owned, row-1 header) | `Minggu Ke` + `Lingkup` | `Temuan` | the only tab the engine creates; Lingkup = any station code or `KPS` |

**Never touched:** `Petunjuk`, `Dashboard`, `Laporan Mingguan`, `Rekap Performa`, `Data Coaching`,
`Data Training` (translate refuses any write there). **Never synced:** `share_links`, `admins`, `stations`
(read only: unit codes typed in the sheet must exist there), `sync_*`, and attribution/meta columns
(`updated_at`, `updated_by`, `updated_by_user`, `updated_by_link`, `created_at`, `sort_order`, internal ids).

Generic rules for workbook tabs:

- **A cell holding a formula is never read as input and never written** (detected by reading the grid with
  `valueRenderOption=FORMULA` too). For that row the DB value stands. Keys may come from formulas
  (Cek BMI's ID SDM): their computed value is used.
- **Rows are never inserted or deleted** in workbook tabs. Deletes clear the record's input cells; new
  records fill free rows inside the block. A full block → `rejected:no_sheet_row` (the DB record is kept and
  placed as soon as a row is free or the block is extended in the workbook, with its formulas).
- Headers are matched by text on the header row (whitespace-insensitive). A renamed or missing header is a
  hard error for that table: nothing in it is read or written; other tables continue (`partial`).

## Merge rules

Per table → per row key → per cell, against the baseline (values both sides agreed on after the last run):

| Sheet vs baseline | DB vs baseline | Result |
|---|---|---|
| same | same | nothing |
| changed | same | write DB |
| same | changed | write sheet |
| changed | changed, equal | nothing (baseline updated) |
| changed | changed, different | **conflict**: `CONFLICT_POLICY` decides (default **db-wins**); the loser is logged |

Rows: new on one side → inserted on the other. In baseline but gone (absent) on one side → deleted on the
other. Delete on one side + edit on the other → whole-row conflict, same policy (`column_name` NULL).
Deleting a staff member clears their Log, Cek BMI and Remedial entries in the sheet and `ID SDM` in
Penggantian (FK cascade / set null) in the same run. Rows without a baseline entry (first run) merge as a
union: an empty cell on one side takes the other side's value; only two different non-empty values are a
conflict.

Guards and validation:

- **Deletion guard**: more than `max(3, 10 %)` of a table's baseline rows deleted in one direction in one
  run → those deletes are skipped, `rejected:deletes_skipped` logged once. Override for one run:
  `{"allowMassDelete": ["staff"]}`.
- **Invalid sheet values** (score 120, height 300, unknown option, unknown unit, bad date, `% Progres` >
  100%, required cell cleared, unknown `ID SDM`, settings breaking the DB's cross-field checks) are never
  written. The cell gets a note (`Garuda sync: …`), the baseline keeps the old value, `rejected:<kind>` is
  logged once; the note clears when the value is fixed. An invalid value never wins a conflict; if the DB
  changed meanwhile its value replaces it.
- **Blank required cell with a default** (Status Penugasan = `Aktif`, Status Tindak Lanjut = `Belum Mulai`,
  % Progres = 0): a blank cell means the default. It is not an issue and the engine does not fill the cell;
  a database change still wins over it and is written to the cell. A required cell without a default (Unit,
  Nama Petugas) that is cleared keeps the database value and gets a note.
- **Duplicate keys** (e.g. the same staff + week twice in Log): every copy is noted and the key is not
  synced until the duplicate is removed (nothing is picked silently).
- **Generated ids**: a new Penggantian row without `ID Sistem` is inserted and its id written back. An
  id-less row matching exactly one unknown DB row on Unit + Nama SDM Diganti is linked instead (first
  run; or an id lost because the sheet write failed after the insert).

Idempotent: after a run, merging again yields an empty plan (tested for every case, and replayed on a copy
of the dummy workbook with the rows `scripts/import_xlsx.py` reads from it).

## Struktur tab Cek BMI

The tab `Cek BMI 2 Mingguan` is not fixed at six checks. Its structure follows Parameter
(`bmi_periods`, `bmi_interval_days`, `bmi_first_check`), whichever side changed it, and `lib/sync/structure.ts`
applies the change as the last step of a run (after the data is written, with the settings the run ended
with). The planning is pure and tested (`lib/sync/bmi-structure.ts`).

| Parameter change | What happens to the tab |
|---|---|
| More checks (`bmi_periods` up) | Six columns per new check are inserted after the last group (`insertDimension`), copied from the last group (formats, validation, BMI and Kategori formulas), their inputs cleared, widths copied, the header merged. Formulas in Dashboard and Laporan that point at the summary columns follow, because Sheets rewrites references when columns are inserted |
| Fewer checks | The trailing groups are deleted, only when no cell in them holds data. Otherwise nothing changes and the run reports "BMI Cek ke-N masih berisi data" as an error (the database also refuses to lower `bmi_periods` below a stored period) |
| Interval or first date | Every group header is rewritten as `BMI Cek ke-N (Periode 12-25 Oct 2026)`; `Cek Berikutnya` and Laporan use `Parameter!C8` |
| Always | The summary formulas (Jumlah Cek, Tgl Cek Terakhir, BMI Terakhir, Kategori Terakhir, Delta Berat, Cek Berikutnya, the two Laporan columns) are rewritten for the current number of groups. They use one fixed-size formula over the block (`LOOKUP(2,1/(mask*present),block)` with `MOD(COLUMN(block)-COLUMN(first),6)=offset` as the mask), so 52 checks need no deeper formula than 6 |

**Komitmen/Target.** Each group has six columns: Tgl Cek, Tinggi, Berat, BMI, Kategori and Komitmen/Target
(`bmi_checks.commitment`, sixth, a yellow input). A tab whose groups still have five columns gets the sixth
first: `planCommitmentColumns` inserts a column after every Kategori (from the last group to the first), copies
the look of Kategori and Berat, merges the group title over six columns and writes the header; nothing else
changes in that run, and every formula that points to the right of an inserted column is moved by Sheets itself
(it was done once on the live tab on 15 Oct 2026, after a backup in `scripts/out`). A group without the column
(a tab not migrated yet) still syncs Tgl, Tinggi and Berat; the note is left out for it. A Normal check reads
`Sudah Ideal` in the column: the trigger `bmi_checks_commitment` sets it, whoever wrote the check (the app, the
owner or this sync), and clears it when the check is no longer Normal, so the sheet gets it on the next run.

One-time changes the same step makes (each only while the old text is still there): column E reads
`Touch Point` (mirror of Master SDM column I) instead of `Program`; the Parameter rows are renamed
(`Interval antar cek BMI (hari, semua petugas)`, and the monthly row marked as not used; the old label is
still matched); Laporan Mingguan C6 and D6 use the interval from Parameter and the new name; the sentences in
Cek BMI row 2 and Petunjuk about "per bulan" are replaced.

Safety: the step is **opt-in** (`SYNC_BMI_STRUCTURE=on` in Vercel). It rewrites formulas of the live tab, so
look at a dry run first: `POST /api/sync/run` with `{"dryRun": true}` returns `structure.actions` (what it
would do) and `structure.blockers` (what it refuses). A change is one atomic `batchUpdate`; if Google rejects
it, nothing is half applied and the error appears on Sinkronisasi. It is idempotent: when the tab matches the
settings it asks for nothing.

## Environment

### Vercel (server only; never `NEXT_PUBLIC_`, except the URL)

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) | yes | project URL |
| `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) | yes | service role; bypasses RLS |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | yes | service-account JSON on **one line**, or base64 of it. Fallback: `GOOGLE_PRIVATE_KEY` holding the JSON (legacy) |
| `GOOGLE_SHEETS_ID` | yes | spreadsheet id of the Garuda workbook |
| `SYNC_SECRET` | yes | ≥ 16 chars (`openssl rand -hex 32`); full access incl. dry run / options |
| `SYNC_PING_SECRET` | yes | ≥ 16 chars, different from `SYNC_SECRET`; can only trigger a run |
| `CONFLICT_POLICY` | no | `db-wins` (default) or `sheet-wins` |
| `SYNC_BMI_STRUCTURE` | no | `on` lets the run restructure the Cek BMI tab (see "Struktur tab Cek BMI"); anything else leaves the tab alone |
| `SYNC_SHEET_LOCALE` | no | `off` stops the engine from setting the sheet to Indonesian (`in_ID`) / `Asia/Jakarta` |

Credentials are read at request time, so rotating the Google key or a secret needs only an env update and
redeploy. dotenv (Next, Bun, Supabase CLI) truncates a multi-line quoted JSON value; for local `next dev`
put the JSON on one line in `GOOGLE_SERVICE_ACCOUNT_JSON` (`jq -c . key.json`). The local scripts read the
raw block directly.

### Supabase Vault (pg_cron + change trigger, see `*_sync_lease_and_ping.sql`, `supabase/production-setup.sql`)

| Secret name | Value |
|---|---|
| `sync_run_url` | `https://<app-domain>/api/sync/run` |
| `sync_secret` | the value of `SYNC_PING_SECRET` (least privilege; `SYNC_SECRET` also works) |

pg_cron jobs: `garuda-sync-every-minute`, `garuda-cron-log-cleanup`.

### Apps Script (standalone project, Script Properties): `SHEET_ID`, `SYNC_URL`, `SYNC_PING_SECRET`. See `apps-script/README.md`.

### Google

- The service account must be an **Editor** of the spreadsheet; the Google Sheets API enabled in its GCP
  project. (The read-only probe uses the Drive API only to report edit permission; if it is disabled,
  confirm Editor access in the Share dialog.)
- The engine sets the spreadsheet locale to Indonesian (`in_ID`; Google refuses `id_ID`) and the time zone
  to `Asia/Jakarta` once, on the first sync: `TODAY()` in Parameter C30 drives OVERDUE flags and BMI
  schedules and must be the Jakarta date, and typed dates must read as D/M/Y. If Google refuses the locale,
  only the time zone is set.

## HTTP API

`POST /api/sync/run`, `Authorization: Bearer <secret>`. GET → 405.

| Caller | Body (optional, JSON) |
|---|---|
| `SYNC_SECRET` | `{"dryRun": true}` reads both sides and returns the plan's counts (writes nothing, takes no lease). `{"conflictPolicy": "sheet-wins"}` for one run. `{"allowMassDelete": ["staff"]}` lifts the guard for named tables for one run. |
| `SYNC_PING_SECRET` | ignored; a normal run |

Response (counts only, never row data): `{ ok, caller, status: ok|partial|busy|dry-run|error, durationMs,
policy, tables: { <table>: { dbInserts, dbUpdates, dbDeletes, sheetCellUpdates, sheetAppends,
sheetRowDeletes, conflicts, newIssues, openIssues, createTab, error, dbFailed? } }, sheet: { createTabs,
headerCells, cellWrites, notes, rowDeletes, appends, tabsWritten, setLocale }, errors? }`.
HTTP 200 except `error` (500), unauthorized (401), not configured (503).

## Failure modes

| What happens | Effect | What to do |
|---|---|---|
| Two triggers at once | second gets `busy` (lease) | nothing |
| Run dies mid-way | lease expires after 60 s; baseline not stored | nothing; next run converges |
| Plan would touch a formula cell or an untouched tab | run aborts before any write (`LayoutViolation`) | a bug or a changed workbook layout: check the error, fix the layout map |
| Sheets API error / no edit permission | `error`; DB writes of that run stay; baseline not stored | fix permission/quota; next run completes the sheet side (sheet-wins conflicts were already logged) |
| One table's DB writes fail | that table skipped (sheet + baseline), others continue; `partial` | read `last_error` (`DB <table>: <code>: <message>`) |
| Header renamed / column moved out | that table frozen; `partial`; `rejected:header_error` logged once | restore the header text (`lib/sync/tables.ts` lists them) |
| New record from the website, block full (Master SDM, Log, Tindak Lanjut, Remedial, Penggantian) | `rejected:no_sheet_row` ("… penuh") | extend the block in the workbook by copying the last row (with its formulas) below it; Master SDM also needs the matching Cek BMI / Rekap rows and every range that stops at row 304 |
| BMI period > 6 in the DB | `rejected:no_sheet_row` | add slot columns to the workbook, or ignore |
| Cek BMI rows sorted / B no longer mirrors Master SDM | that staff member's `Ada Catatan BMI` / `Catatan Program Kebugaran` are not synced (DB value stands) | restore the order (row = Master row + 1, B = `=IF('Master SDM'!Bn="","",'Master SDM'!Bn)`) |
| Unknown unit typed in the sheet | `rejected:invalid_value` | use a code from `stations`, or add the station in the DB first |
| Many rows cleared in the sheet | deletes skipped; `rejected:deletes_skipped` | restore (Version history) or rerun with `allowMassDelete` |
| Bad credentials / env | `error` naming the variable (never its value) | fix env |

## Resolving conflicts

`public.sync_conflicts` (the admin page Sinkronisasi lists rows with `resolved_at IS NULL`):

| `resolution` | Meaning | `sheet_value` / `db_value` |
|---|---|---|
| `db-wins` | both sides changed the cell; DB value kept and written over the sheet | the losing sheet value / the kept DB value |
| `sheet-wins` | same, policy sheet-wins; sheet value written to DB | kept sheet value / overwritten DB value |
| `rejected:invalid_value`, `rejected:required_missing`, `rejected:unknown_parent`, `rejected:duplicate_key`, `rejected:missing_key`, `rejected:unknown_setting`, `rejected:incomplete_row` | a sheet value was not written | offending sheet value / current DB value |
| `rejected:no_sheet_row` | a DB record has no place in the workbook (block full, BMI period > 6, Parameter label renamed) | row key / null |
| `rejected:deletes_skipped` | guard tripped (`column_name` `db` or `sheet` = whose deletes were skipped) | number of rows |
| `rejected:header_error` | a tab's header is broken | null |

`column_name` NULL with `row_key` set = whole-row delete-vs-edit conflict (values hold the rows). To undo a
resolution, edit the value in the web app or the sheet; the next run syncs it like any edit. Then mark the
row reviewed ("Tandai selesai" on the admin page sets `resolved_at`/`resolved_by`).

## First sync, safely

In-memory dry run of the dummy workbook against the rows `scripts/import_xlsx.py` imports from it
(2026-10-12): **zero data changes in either direction** (staff 271 + 29 free Master rows, 479 weekly
scores in 2710 pre-made Log rows + 60 spare, 234 BMI checks, 15 action items with GA-TL01's formula due
date skipped, 103 remedials, 3 replacements, settings equal). The first real run will only:

1. set the spreadsheet locale/time zone to Indonesian / `Asia/Jakarta`;
2. create the `Temuan Mingguan` tab (header `Minggu Ke | Lingkup | Temuan`);
3. add `ID Sistem` (P4, hidden) and `ID SDM` (Q4) to `Penggantian SDM`, and fill P/Q for the existing
   replacements (linked to their DB rows by unit + name).

Steps:

1. Share the sheet with the service account as Editor; set the Vercel env vars; deploy.
2. Read-only check from a machine with `.env`: `bun lib/sync/scripts/check-remote.ts` (DB counts, dry run
   against the real workbook, in-memory replay; expect all `db*` counts 0).
3. Dry run through the route: `curl -sX POST -H "Authorization: Bearer $SYNC_SECRET" -H 'Content-Type: application/json'
   -d '{"dryRun":true}' https://<app>/api/sync/run`. Expect all `db*` counts 0,
   `sheet.createTabs = ["Temuan Mingguan"]`, `sheet.headerCells = 2`, `sheet.tabsWritten =
   ["Penggantian SDM", "Temuan Mingguan"]`, `setLocale: true`, no errors.
4. Real run: same curl without the body. Then run once more: every count should be 0.
5. Install the Apps Script (`apps-script/README.md`), then run `supabase/production-setup.sql` (Vault
   secrets + pg_cron) so the schedule and the DB trigger start calling the route.

## Local scripts

```bash
bun lib/sync/scripts/probe-sheet.ts           # read-only: tab names, sizes (no cell contents)
bun lib/sync/scripts/check-remote.ts          # read-only: DB counts, dry run vs the real workbook, in-memory replay
bun lib/sync/scripts/check-remote.ts --lease  # also claim + release the lease once (sets last_error to a check note)
```

Both use read-only Google scopes and print counts only.
