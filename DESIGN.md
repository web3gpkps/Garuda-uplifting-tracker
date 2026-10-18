# DESIGN.md: Garuda People Development Tracker

Owner direction (12 Okt 2026): "simple dan profesional, gausah ribet", production tool, no PDF screen.
Synthesised from a three-member design council. This file is the single source of truth for UI work.

Reading this as: an internal operations tool for Gapura station PICs (phone, at the airport) and
KPS head office (laptop, ~22 stations), co-branded Garuda Indonesia × Gapura, in a quiet,
data-first operational style. **Dial: ENERGY 1 / RHYTHM 1 / MOTION 1.**

## Principles

1. **One job per screen.** Every screen is built around the one decision the user makes there.
   That element is the focal point; everything else is quieter or removed.
2. **The data is the loudest thing.** Headings are small, copy is short, colour marks exceptions only.
3. **No explanation paragraphs.** No page descriptions, no "Cara mengisi" tips, no section essays.
   One meta line per page maximum (counts + noun, e.g. "CGK · Minggu ke-2 · 31 dari 45 dinilai").
   Field help lives in labels, placeholders and one optional "Bantuan" popover per grid.
4. **Product vocabulary, not spreadsheet vocabulary.** Never show: PDF, slide, workbook, sheet,
   sel kuning, kolom H, Acuan PDF, baseline PDF, dummy, rumus. Use "halaman", "isian",
   "dihitung otomatis", "posisi awal".
5. **Honest numbers.** Every number comes from data; empty is "–" with a reason, never invented.

## Identity

- Logos: `public/brand/garuda-indonesia.png` then a 1px `--line` divider then
  `public/brand/gapura-airport-services.png`. Set height, width auto. Never recolour, stretch, crop.
  Sidebar 24px, phone top bar 20px, login 36px, printed report 32px.
- **Identity motif:** station codes (CGK, DPS…) are always set in tabular semibold as a short
  code, the way airline systems show them; the scope line ("Stasiun CGK", "KPS · semua stasiun")
  sits under the logos in the sidebar. No other decorative motif.
- One accent: Garuda teal, used only for "now" (current week/slot marker) and links in body text.

## Tokens (light only; printed reports are light)

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `--bg` | #f7f8fa | page | |
| `--surface` | #ffffff | panels, tables, inputs | |
| `--surface-sunken` | #f1f3f6 | table headers, computed (read-only) cells | |
| `--ink` | #1c2433 | text | 15.6:1 on surface, 14.0 on sunken |
| `--ink-muted` | #535b68 | secondary text | 6.85:1 surface, 6.17 sunken |
| `--line` | #d5dae1 | dividers only | |
| `--line-strong` | #7c8390 | control borders (never on sunken) | 3.81:1 |
| `--brand` | #0b2f5b | Garuda navy: primary button, active nav, focus ring | white on it 13.4:1 |
| `--brand-strong` | #082446 | hover/pressed | |
| `--brand-tint` | #e7eef7 | active nav, selected row | navy on it 11.4:1 |
| `--accent` | #00737e | "now" marker, inline links | 5.59:1 |
| good | #1d6b40 on #e6f3ea | Lulus, Passed, Normal, Selesai, Tepat waktu, Terjadwal | 5.7:1 |
| warning | #8a4b00 on #fdf1d8 | Overweight, Kurus, Jatuh tempo ≤ 7 hari, Menunggu, Cek ≤ 7 hari | 6.07:1 |
| critical | #a1261b on #fbe7e3 | Belum Lulus, Failed, Obesitas, OVERDUE, Terlambat cek | 6.28:1 |
| progress | #6b3fa0 on #f1ebf8 | On Progress, Remedial, Rutin – pantau | 6.3:1 |
| neutral | `--ink-muted` on #eceef2 | Belum Mulai, Tertunda, no data | 5.9:1 |

Removed: the yellow input tint (a spreadsheet convention), Gapura lime/emerald as UI colour,
every gradient. Editable cells are white with a `--line-strong` border on focus/hover; computed
cells sit on `--surface-sunken` in `--ink-muted`. A two-item legend ("Isian" / "Dihitung otomatis")
in the grid toolbar is the second cue.

**Status labels:** text always present. critical / warning / progress get a 4px-radius tinted
fill; good and neutral are plain text in their tone colour, so only exceptions draw the eye.
One tone map only (`components/ui/StatusChip.tsx`), keyed on lib/rules label types.

## Typography

Plus Jakarta Sans, weights 400 and 600 only (reason: already the Indonesian-made face of the
brand pair, tabular figures, two weights force hierarchy through size and colour).
`font-variant-numeric: tabular-nums` on every number, date and code.

| Use | px / line-height / weight |
|---|---|
| caption, table header | 13 / 18 / 400 (header 600) |
| body, table | 14 / 20 / 400 |
| phone inputs | 16 / 24 |
| section title | 16 / 24 / 600 |
| page title | 20 / 28 / 600 |

Sentence case everywhere. No uppercase tracking. No em dash. No exclamation marks, no emoji.

## Space, shape, depth, motion

- Spacing scale 4 / 8 / 12 / 16 / 24 / 32 / 48. Page gutter 16 (phone), 24 (≥640), 32 (≥1280).
  Gap between page sections 24.
- Density: table rows 40px, entry grid rows 36px, phone list rows ≥ 48px, tap targets ≥ 44px
  below 1024px (Button `sm` is 32px only at ≥1024).
- Radius: 6 controls, 8 panels/dialogs, 4 status labels. No pills.
- Depth: borders only (1px `--line`). `--shadow-float` only on menus, popovers, dialogs, phone sheet.
- Motion: colour/outline transitions ≤ 120ms; none with `prefers-reduced-motion`.

## Shell and navigation

- **≥1024px:** fixed left sidebar 232px, white, right border `--line`. Top: logos, scope line,
  "Minggu ke-N dari 10" in caption muted. Groups (13/600 muted heading):
  - **Pantau:** Beranda, Laporan Mingguan
  - **Input mingguan:** Penilaian Mingguan, Cek BMI, Remedial, Tindak Lanjut (KPS and owner only)
  - **Data:** Data SDM, Penggantian SDM
  - **Pengelolaan** (owner only): Tautan Akses, Parameter, Sinkronisasi
  Active item: `--brand-tint` fill, navy 600 text, `aria-current="page"`. No left stripe.
  Footer: link label or account email, and "Keluar" for the owner.
- **<1024px:** 56px top bar (logos 20px, scope code, "Menu" button) opening a left sheet with
  the same groups (focus trapped, Esc closes).
- **<640px:** also a bottom bar: Beranda, Penilaian, Cek BMI, Menu (56px + safe area).
- The week rail is not global chrome. Week/slot is a select with ‹ › steppers inside the
  toolbar of Penilaian, Cek BMI and Laporan; Beranda shows one summary line.
- Route keys stay (`/sdm`, `/performa`, `/bmi`, …); only labels change. `/acuan` is removed and
  redirects to the base path.

## Components

- **PageHeader:** h1 20/600, optional one meta line 13 muted, actions right (wrap below on phone).
  No description prop.
- **Toolbar / FilterBar:** one row above the thing it filters: labelled selects (Stasiun for
  KPS/owner, Minggu/Cek, Program, Status), count on the right, legend for editable grids.
  State lives in the URL. One shared `StationSelect` (merge LinkSelect + StationFilter).
- **DataTable / DataGrid:** sticky header on `--surface-sunken` 13/600 muted, sticky first column,
  numbers right-aligned, hover `--bg`, selected `--brand-tint`, `<caption class="sr-only">`.
  Grid editing behaviour unchanged (DataGrid.tsx logic is tested; restyle only).
- **Number cell:** comma decimal via lib/format, fixed precision (scores 1 dp, BMI 1 dp, % whole),
  empty "–" with sr-only "belum diisi". Below-threshold values get critical text and the row a status label.
- **Field:** label above 14/600, help 13 muted, error 13 critical linked by `aria-describedby`.
  Input 40px desktop / 44px phone, 16px font on phone, border `--line-strong`, 2px navy focus outline.
- **Buttons:** primary (navy), secondary (white, `--line-strong` border), ghost (navy text),
  danger (critical, confirmations only). Labels name the object: "Simpan nilai", "Catat cek BMI",
  "Cetak laporan". At most one primary per view.
- **Dialog:** native dialog, max 560, header/body/footer, primary right, full-screen sheet on phone.
- **States:** empty = one sentence why + one action; loading = static skeleton rows; error =
  title, cause in plain words (never raw database text or column names), "Coba lagi".
- **Save status:** per-row status in grids, toolbar summary ("Semua tersimpan · 14.05" or
  "2 baris gagal disimpan" + "Coba lagi"); no toasts for grid edits.

## Screens (focal element → primary action)

- **Beranda.** Station link: a to-do list of this week's work (penilaian belum diisi n/m, cek BMI
  slot ini n/m, remedial belum dijadwalkan, temuan minggu ini) → button per line.
  KPS/owner: station table, worst first, 5 columns (Dinilai, Cek BMI, Terlambat cek,
  Failed tanpa remedial, Tindak lanjut overdue), row → filtered screen; below it a compact
  target table (KPI, posisi awal, target, sekarang, status). No KPI card strips.
- **Penilaian Mingguan.** Week select + grid (ID, nama, 4 aspek, rata-rata, status); touch point,
  topik gap, observer, catatan in a collapsible column group. Phone: one card per person with 4
  inputs, live average, "Simpan & berikutnya". Rekap is a secondary toggle, not a tab bar.
- **Cek BMI.** Slot select + grid for that slot (Tgl, TB, BB, BMI, kategori), due/late first, other
  slots behind "Tampilkan semua cek". Phone card: name, status line, TB, BB, live BMI,
  "Simpan & berikutnya"; profile/history in a per-person sheet.
- **Remedial.** List of Failed participants, "Belum dijadwalkan" first; one status filter row.
  Primary: "Jadwalkan" / "Isi hasil".
- **Tindak Lanjut** (KPS/owner). Table sorted by flag; edit in a dialog. Primary: "Perbarui progres".
- **Data SDM.** Grid with core columns; training and notes columns behind "Kolom lainnya";
  "Perlu diperiksa (n)" filter instead of the flag tiles. Primary: "Tambah SDM".
- **Penggantian SDM.** One line "Batas 14 Des 2026 · n hari lagi · x dari y belum efektif" + grid.
  Primary: "Tambah penggantian".
- **Laporan Mingguan.** The printed report A–E as the page body; toolbar with week, station,
  "Cetak laporan". Station links see the Temuan editor first.
- **Admin.** Tautan: one table + "Buat tautan" dialog, revoked behind a toggle, one coverage line.
  Parameter: grouped form, plain help. Sinkronisasi: status line + open conflicts table.
- **Login.** Logos, title, email, password (with a "Tampilkan" toggle), "Masuk". Footnote: "Daftar" and
  "Lupa kata sandi?". The same form serves the owner (to /admin) and approved branch accounts (to /cabang).
- **Register, forgot and reset password.** Same frame as login, one column, the form only: no marketing copy,
  the single intro sentence says the account needs the owner's approval. Errors sit under their field.
- **Akun Cabang (/admin/akun).** Tabs Menunggu / Aktif / Dinonaktifkan with counts, one table per tab, the
  branch chosen per row, "Setujui" disabled until the row has a real branch. Waiting accounts open first.


## Theme revision (14 Okt 2026): CGK BMI prototype look

Applied across every screen from the tokens in `app/globals.css`; logos and CRUD behaviour unchanged.
- Sidebar and phone menu sheet are Garuda navy (`--navy` #123346) with the co-brand logos on a white chip
  (logos are never recoloured). Nav rows: see "Sidebar revision (18 Okt 2026)".
- Primary colour is Garuda green (`--brand` #0a7a63, white on it 5.3:1); page `--bg` #f5f8fa.
- Every page opens with the `.hero` banner (PageHeader): navy-to-green gradient, optional eyebrow,
  title, one meta line, actions (buttons restyled for dark via `.hero-actions`). Plain in print.
- `MetricCards` (components/ui) gives four-up summaries; Cek BMI shows Total SDM, Sudah diperiksa,
  Terlambat cek, BMI di atas normal.
- Radii 10 controls, 14 panels, 6 status labels; panels carry `--shadow-card`; good status labels are tinted too.
This supersedes the earlier "no gradient", "navy", "4px radius" and "borders only" rules for the shell, hero and panels.


## Cek BMI follows the CGK BMI prototype (14 Okt 2026)

Owner direction: the main content of Cek BMI is rebuilt to match `CGK_BMI_Tracker_Prototype_Interaktif.html`
(same patterns, colours and behaviour); the shell, logos and navigation are unchanged. It applies to every access
kind (station link, branch account, owner). **Dial: ENERGY 2 / RHYTHM 1 / MOTION 1.** It is a data tool: motion is
only the profile panel sliding in, the toast and hover colour; the layout repeats one pattern (banner, four counts,
one workspace).

- **Structure:** `.hero` banner (eyebrow, title, one line, station chip, "Ekspor CSV", "Tambah SDM"), four counts
  (Total SDM, Sudah diperiksa with bar, Terlambat cek, BMI di atas normal; green / red / amber), one workspace panel:
  filters (search, period, station for KPS and owner, status, touch point only when someone has one, "Lihat Cek",
  "Semua periode" / "Fokus periode"), legend and result count, then the table.
- **Table:** two header rows, the first three columns frozen, 9 identity columns, 5 columns per period (the period
  count comes from Parameter), 8 summary columns; yellow cells are inputs, green-tint cells are computed, grey is
  identity from Master SDM. 100 rows at a time ("Tampilkan 100 berikutnya"), search and filters run over everything.
  Below 561px the table is replaced by one card per person (44px targets).
- **Behaviour:** a yellow cell opens a dialog "Ubah <isian>" (Enter saves, Escape closes, focus returns to the
  cell); a saved change shows at once and a toast confirms it; a name opens the right-hand profile panel; CSV
  export downloads the rows in view. Free text (Coaching Evaluation Feedback, Result/Remarks, Catatan Program
  Kebugaran) stays on one line and gets an expand toggle only when it is really clipped; the toggle and the edit
  click are separate targets, Escape collapses.
- **Scope:** the palette is custom properties on `.bmi-tracker` in `app/globals.css`; other screens are untouched.
  `components/bmi/palette.test.ts` checks every text colour against its backgrounds.
- **Contrast (WCAG AA, 4.5:1):** the prototype fails in a few places, so only those text colours were darkened
  (same hue): muted text #718091 to #62707f, Feedback and Remarks text #768793 to #63727d, the "+ isi" hint
  #c0a66f to #7f6838, grey switch text #758695 to #62707f, amber count #b67922 to #9e691e, badges "Cek <= 7 hari"
  #a36b10 to #95620f, "Terjadwal" #198369 to #177a62, "Belum diperiksa" #778b96 to #5d6e78, banner text #cfe3e5
  to #dcebed, profile overline #b6ecd5 to #c8f2e0. Controls use the app's 3.8:1 `--line-strong` border instead of
  the prototype's pale one.
- **Deliberate differences from the prototype:** weights are 400 and 600 (the only loaded weights); panel section
  headings are sentence case (no tracked uppercase); the "+ isi" hint shows on hover and keyboard focus; text is
  12px minimum. Not carried over: demo data, "DATA SIMULASI", "Reset demo", the prototype notice strip.
- **Data source (15 Okt 2026):** Cek BMI shows only what the Google Sheet tab "Cek BMI 2 Mingguan" holds: `staff` identity
  columns, Feedback, Result/Remarks, Ada Catatan BMI and Catatan Program Kebugaran, `bmi_checks`, the schedule settings and the
  station list. No scores, remedials, replacements, action items, reports or baseline; `components/bmi/data-source.test.ts` guards it.
- **One interval for everyone:** every staff member is checked every `bmiIntervalDays`; "Ada Catatan BMI" is a note and does not
  change the rhythm. The number of checks is `bmiPeriods` (1 to 52) and nothing on the screen assumes six.
- **Check names:** a check is "BMI Cek ke-N (Periode 9-22 Nov 2026)" in table group headers, the period select, history rows, CSV
  headers and the phone list heading; the short "BMI Cek ke-N" where space is tight (dialog titles, toasts, aria-labels, count foot).
  Both come from `lib/bmi-periods.ts`. The group header is not set in capitals, so the owner's wording survives.
- **Touch Point replaces Program on this screen** (column after Unit, filter, profile, cards, CSV, Tambah SDM). The filter lists the
  five standard values plus any other value in the data and appears once someone has one. Tambah SDM offers the five and "Other";
  "Other" reveals a required text field (60 characters) and that text is saved, never the word "Other". Program is unchanged elsewhere.

## Sidebar revision (18 Okt 2026)

Same layout as the JOUMPA tracker, in Garuda navy. Sidebar (≥1024px) and the phone menu sheet share three
bands split by 1px white/15 hairlines:
- **Identity:** logos on a white chip, then the scope card (white/6 fill, white/12 inset ring): pin icon +
  scope line, calendar icon + programme week.
- **Nav:** each group (menu) is an uppercase 13/600 caption (#9bb7c2, 6.3:1) over its items; groups are separated
  by a hairline. Every item is icon + label: 20px icons from `components/shell/NavIcon.tsx` (one family,
  24 grid, 1.75 stroke, Lucide-style; Remedial is a graduation cap), inactive text #d3e3e8 (10:1) with icons
  #8fb0bd (5.7:1), hover white/8 and white. Rows 36px from 1024px, 44px below.
- **Sub-items:** indented 12px under their group caption on a 1px white/20 vertical guide line that runs
  from the caption to the last item. Long labels wrap to a second line instead of being cut off.
- **Current page:** a light pill, `--brand-tint` fill with navy 600 text (11.6:1) and a `--brand` icon
  (4.6:1). The pill is 11.6:1 against the sidebar. No side stripe.
- **Footer:** the account (user icon) or link label (link icon), then "Ganti kata sandi" (branch accounts)
  and "Keluar" as rows on the same icon column.
- Every icon, logo and label in the sidebar sits on one 24px column. Focus ring #a9e9b9 (9.5:1).
- Phone bottom bar: icon over label; the current page gets a `--brand-tint` pill behind its icon and brand
  600 text. The cells share the width, so a BMI-only view gets two wide cells.
