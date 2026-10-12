# Garuda People Development Tracker: build spec

Monitoring Hasil Coaching Frontliner, Training IULS & RUST, dan Tindak Lanjut People Development.

Source of truth for every agent working on this repo. This app is a fork of the JOUMPA Uplifting
Action Tracker (same architecture, different programme). The baseline workbook is
`Tracker Tindak Lanjut People Development Garuda - DUMMY.xlsx` (built from the PDF
"People Development Overview – Garuda Indonesia, September 2026" plus clearly marked dummy rows).
Workbooks are gitignored (`*.xlsx`); never commit them or the generated `supabase/seed.sql`.

## Domain in one paragraph

PT Gapura Angkasa handles Garuda Indonesia frontliners (Check-in Counter, Customer Service, Boarding
Gate, Transfer Desk, Baggage Service) at ~32 stations. Garuda ran Coaching Frontliner All BO
(795 frontliners, 15 Jun–31 Agu 2026, passing grade ≥ 85) and the IULS and RUST trainings
(Apr–Agu 2026; Gapura participants IULS 116, RUST 155). The tracker follows the Gapura participants
for 10 weeks from Monday 5 Okt 2026: weekly coaching scores (4 aspects, 0–100), a BMI check every
2 weeks for staff with a BMI note and monthly for the rest (6 slots), 15 national follow-up action
items (PDF slides 15, 16, 27), remedial for every participant who failed, staff replacements, and
the KPIs from slide 15 (BMI overweight < 20 % in 6 months, Product Knowledge > 90 %, Interactive
Communicating > 92 %, coaching coverage 100 % of 812).

UI language: **Bahasa Indonesia**, reusing the workbook's terms (Tindak Lanjut, Unit/Stasiun, SDM,
Lulus / Belum Lulus, Passed / Failed, Remedial). Dates shown as `12 Okt 2026`. "Today": `Asia/Jakarta`.

## Stack (unchanged from JOUMPA)

Next.js 16 (App Router, `cacheComponents: true`), React 19, TypeScript, Tailwind v4, bun.
**Next 16 differs from training data. Read `node_modules/next/dist/docs/` before writing Next code.**
Supabase (Postgres + Auth), Vercel, Google Sheets two-way replica, standalone Apps Script ping.
Tests: `bun test` for pure TS logic; SQL tests in `tests/sql` for RLS/RPC security.

## Access model (same as JOUMPA)

- **Station links** `/s/<token>`, no login. Scope = one station code from `stations` (e.g. `CGK`),
  or `KPS` (head office: all stations). A station link sees and edits only its station's staff,
  weekly scores, BMI checks, remedials, replacements and its own weekly findings.
- **Action items are national** (not per station): every link reads them; only `KPS` (and the owner)
  updates progress and definitions. Station links get them read-only.
- **KPS-only**: action items, staff training baseline (role play, post-test, remark, feedback),
  every station.
- **Owner** signs in (Supabase Auth, `public.admins`). `/admin` is the full workbook with CRUD,
  link management, settings and sync. Owner calls `share_*` with `p_token = ''` (scope KPS).
- Enforcement in the database: RLS on every table (admins only), no table privileges for `anon`,
  link access only via `SECURITY DEFINER` `share_*` RPCs that check the token and scope.

## Data model (public schema)

Stored data is raw input only; everything derived is computed in `lib/rules.ts`.

```
stations        code text PK (e.g. 'CGK'; ^[A-Z0-9]{2,5}$, never 'KPS'), sort smallint
settings        id=1. week1_start date, weeks smallint,
                bmi_first_check date, bmi_interval_days smallint (with note, 14),
                bmi_interval_months smallint (without note, 1), bmi_periods smallint (slots, 6),
                bmi_underweight_below, bmi_normal_max, bmi_overweight_max numeric,
                pass_grade numeric (85), weight_role_play numeric (0.4), weight_post_test numeric (0.6),
                target_overweight_max numeric (0.20), target_overweight_months smallint (6),
                target_knowledge numeric (0.90), target_interactive numeric (0.92),
                target_coverage integer (812), coverage_done integer (795),
                target_pass_rate numeric (1.0), replacement_deadline date, updated_at
staff           code text PK ('IULS-01', 'RUST-018', added 'TMB-01'), program text ('IULS'|'RUST'),
                provider text, station FK, name, employee_no, gender ('L'|'P'|NULL),
                touch_point text (5 values), role_play numeric 0–100, post_test numeric 0–100,
                report_remark text ('Passed'|'Failed'|NULL),
                assignment_status ('Aktif'|'Remedial'|'Individual Coaching'|'Ditarik dari layanan'),
                feedback text, notes text, bmi_has_note boolean NULL, bmi_note text,
                sort_order, created_at, updated_at, updated_by_link
weekly_scores   id, staff_code FK, week 1–20, touch_point, score_grooming, score_knowledge,
                score_attitude, score_communication (numeric 0–100), gap_topic text, observer,
                coaching_notes, updated_at, updated_by, updated_by_link. UNIQUE(staff_code, week)
bmi_checks      id, staff_code FK, period 1–12, check_date, height_cm 120–210, weight_kg 30–200,
                updated_at, updated_by_user, updated_by_link. UNIQUE(staff_code, period)
action_items    code PK ('GA-TL01'), group_name ('Coaching Frontliner'|'Timeline Training'|
                'Evaluasi IULS & RUST'), aspect (6 values, see lib/rules ASPECTS), root_cause,
                action, target, kind ('Sekali'|'Rutin'), schedule, due_date, pic,
                status ('Belum Mulai'|'On Progress'|'Selesai'|'Tertunda'), progress 0–100,
                updated_on, evidence, kps_notes ("Catatan Garuda / KPS"), source ("Slide 15"),
                sort_order, updated_at, updated_by_link
remedials       id, staff_code FK UNIQUE, action ('Refresher & Remedial Assessment'|
                'Individual Coaching'|'Refresher + Individual Coaching'), remedial_on date,
                role_play, post_test (0–100), reported ('Ya'|'Belum'), notes, sort_order,
                updated_at, updated_by_link
replacements    id, program, station FK, staff_code FK NULL, replaced_name NOT NULL, reason,
                withdrawn_on, replacement_name, effective_on, training_on, post_test,
                final_result (0–100), reported, notes, sort_order, updated_at, updated_by_link
weekly_reports  (week, scope) PK, findings, updated_at, updated_by_link
share_links     id, token (48 hex), scope (station code or 'KPS'), label, created_by,
                created_at, revoked_at, last_used_at
admins, sync_state, sync_conflicts: as in JOUMPA.
```

### Link RPC surface (token first, SECURITY DEFINER, scope checked in SQL)

Reads: `share_open(token)` → `{scope, label, link_id, stations[], settings, staff[], weekly_scores[],
bmi_checks[], action_items[], remedials[], replacements[], weekly_reports[], link_labels{}}`.
Writes: `share_save_weekly_score`, `share_save_check`, `share_save_profile` (gender, bmi_has_note,
bmi_note), `share_save_staff` (insert TMB-xx / update program, station, name, employee_no, gender,
touch_point, assignment_status, notes), `share_kps_save_staff_baseline` (role_play, post_test,
report_remark, feedback), `share_kps_update_action_item` (progress fields + definitions, KPS only),
`share_save_remedial`, `share_delete_remedial`, `share_save_replacement`,
`share_delete_replacement`, `share_save_weekly_report`. Errors: `invalid_link`, `out_of_scope`,
`forbidden_field`, `invalid_input` (DETAIL = field).

## Rules (`lib/rules.ts`), from the workbook

| Rule | Workbook | Definition |
|---|---|---|
| finalResult | Master L | both role play and post-test numbers → round(rp·w_rp + pt·w_pt, 1), else null |
| passStatus | Master N | final ≥ pass_grade → Passed, else Failed |
| consistency | Master O | remark and status both present: equal → Sama, else Beda – verifikasi |
| failureCause | Master P | Failed only: rp = 0 → Kendala operasional & kehadiran (absen role play); pt < pass_grade → Role play & post-test belum optimal; else Performa role play belum optimal |
| coachingAvg | Log L | round(mean of non-empty 4 aspect scores, 2) |
| coachingStatus | Log M | avg ≥ pass_grade → Lulus else Belum Lulus |
| deltaVsBaseline | Log N | weekly avg − final result |
| rekap | Rekap | per-week avg, latest, gain vs final, weeks assessed, status, trend |
| bmi, bmiCategory | BMI | as JOUMPA (Kemenkes thresholds from settings) |
| bmiCheckDate(p) | BMI header | bmi_first_check + 14·(p−1) |
| nextBmiCheck | BMI AQ | no check → bmi_first_check; has_note = false → EDATE(last, months); else last + days |
| bmiScheduleStatus | BMI AR | next < today → Terlambat cek; ≤ 7 days → Cek ≤ 7 hari; else Terjadwal |
| bmiPeriodForWeek(w) | Laporan C6 | max(1, min(periods, floor((weekStart(w) − first)/14) + 1)) |
| actionFlag | TL R | Selesai; no due → Batas waktu belum ditetapkan; <0 OVERDUE; ≤7 Jatuh tempo ≤ 7 hari; Rutin → Rutin – pantau; else On Track |
| remedialFinal / remedialStatus | Remedial L/M | final as finalResult; none → (action ? Menunggu hasil : Belum dijadwalkan); else Lulus / Belum Lulus |
| replacementPass | Penggantian L | no replacement → null; post or final missing → Belum training/dinilai; both ≥ pass_grade → Lulus else Belum Lulus |
| replacementTimeliness | Penggantian M | as JOUMPA, deadline from settings |

Aggregations (`lib/aggregate.ts`) reproduce Dashboard 1–6 and Laporan Mingguan A–E of the workbook
(per program IULS/RUST/TOTAL, per action group, per aspect, per station).

PDF reference numbers (Data Coaching, Data Training sheets) are static content in
`lib/reference.ts`, shown on the "Acuan PDF" screen. They are not synced.

## Google Sheets two-way replication (same engine as JOUMPA)

Tabs and input columns of the Garuda workbook (header row 4 unless noted):

| Table | Tab | Key | Input columns |
|---|---|---|---|
| staff | Master SDM (data 5..304) | B ID SDM | C Program, D Provider, E Unit, F Nama, G Employee Number, H L/P, I Touch Point, J Role Play, K Post-Test, M Remark, Q Status Penugasan, R Feedback, S Catatan; Cek BMI G (Ada Catatan BMI) → bmi_has_note, Cek BMI AS → bmi_note |
| bmi_checks | Cek BMI 2 Mingguan (data 6..305, row = Master row + 1) | B (formula) + slot | slot k (1..6): Tgl/Tinggi/Berat at H/I/J, M/N/O, R/S/T, W/X/Y, AB/AC/AD, AG/AH/AI |
| weekly_scores | Log Performa Mingguan (data 5..) | A Minggu Ke + C ID SDM | G Touch Point, H–K scores, O Topik Gap, P Observer, Q Catatan |
| action_items | Tindak Lanjut (data 5..54) | B ID | C Kelompok, D Aspek, E Akar Masalah, F Tindakan, G Target, H Jenis, I Jadwal, J Batas Waktu (literal only), K PIC, L Status, M % Progres (fraction), N Tgl Update, O Bukti, P Catatan, S Sumber |
| remedials | Remedial (data 5..154) | B ID SDM | H Tindakan, I Tgl, J Role Play Ulang, K Post-Test Ulang, O Dilaporkan, P Catatan |
| replacements | Penggantian SDM (data 5..44) | P ID Sistem (engine) | B–K, N, O, Q ID SDM (engine) |
| settings | Parameter (label B / value C) | label | C |
| weekly_reports | Temuan Mingguan (engine-owned) | Minggu Ke + Lingkup | Temuan |

Never touched: Petunjuk, Dashboard, Laporan Mingguan, Rekap Performa, Data Coaching, Data Training.
Formula cells are never read or written. New staff fill the first free Master SDM row (blank ID and
name); rows are never inserted.

## Brand

Co-branded **Garuda Indonesia × Gapura Airport Services**. Logos: `public/brand/garuda-indonesia.png`
(315 × 61, extracted from the PDF) and `public/brand/gapura-airport-services.png`. Never stretch,
recolor or crop. Colors: Garuda navy `#0b2f5b` (primary), Garuda teal `#00808c` (accent), Gapura
lime/emerald only as a small brand moment. See DESIGN.md.
