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
- **Login.** Logos, title, email, password, "Masuk". One footnote line.
