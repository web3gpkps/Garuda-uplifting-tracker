# UX.md: Garuda People Development Tracker, how screens behave

Carried over from the forked tracker's usability redesign (owner request: "make the dashboard and
all UI/UX on every role and screen more user friendly; a clearer dashboard; make BMI and other
data entry easier, e.g. with Excel-like tables") and re-pointed at the Garuda workbook. This file
turns that into rules every engineer follows. DESIGN.md still sets the visual direction (calm,
Garuda Indonesia × Gapura Airport Services, light, ENERGY 1 / RHYTHM 2 / MOTION 1); this file sets
how screens behave.

## 1. Mental model: it is the workbook, made easier

The team already knows the Excel workbook. Every role sees the same "sheets", named as in the
workbook, so nothing has to be relearned:

| Tab (nav label) | Workbook sheet | Owner | KPS link | Station link |
|---|---|---|---|---|
| Dashboard | Dashboard | all stations | all stations | own station |
| Master SDM | Master SDM | CRUD | edit, add, training baseline | edit, add (own); baseline read-only |
| Log Performa | Log Performa Mingguan + Rekap Performa | CRUD | CRUD | CRUD (own) |
| Cek BMI | Cek BMI 2 Mingguan | CRUD | CRUD | CRUD (own) |
| Tindak Lanjut | Tindak Lanjut (15 national items) | CRUD incl. add/delete items | update progress + definitions + Catatan Garuda / KPS | read-only |
| Remedial | Remedial | CRUD | CRUD | CRUD (own) |
| Penggantian SDM | Penggantian SDM | CRUD | CRUD | CRUD (own) |
| Laporan Mingguan | Laporan Mingguan | all + print | all + print | own + print |
| Tautan, Parameter, Sinkronisasi | Parameter | owner only | | |

Owner area routes live under `/admin/*`, station workspace under `/s/[token]/*`. Same screen
components, one `access` prop decides scope, base path and which actions exist.

**Workbook colour code, kept on purpose** ("Sel kuning = boleh diubah"): editable cells have a
soft yellow input tint, computed cells (Final Result, Status, Rata-rata, BMI, Kategori, Jadwal,
Flag, Sisa hari) are plain white/grey and read-only. A short legend sits above every grid. Status
colours stay the workbook's hijau / oranye / merah, always with the text label.

## 2. Spreadsheet grid for every bulk entry (desktop and tablet ≥ 900 px)

One shared `DataGrid` component, used by Log Performa, Cek BMI, Master SDM, Tindak Lanjut,
Remedial and Penggantian SDM. It must feel like Excel / Google Sheets:

- **Freeze panes**: sticky header row(s) and sticky ID + Nama columns. Column groups with a
  group header (e.g. Cek BMI: "Cek ke-1 (12 Okt)" over Tgl / TB / BB / BMI / Kategori, six groups
  side by side like the workbook; the current slot's group is highlighted and scrolled into view).
- **Selection and keys**: click or arrow keys move the active cell; typing starts editing and
  replaces the value; Enter or F2 edits; Enter commits and moves down; Tab / Shift+Tab move
  right / left; Esc cancels the edit; Delete / Backspace clears the selected cells; Home / End
  jump within the row. Visible active-cell outline (brand colour, 2 px), never colour-only.
- **Paste from Excel / Google Sheets**: Ctrl/Cmd+V of a copied block (tab-separated rows) fills
  cells from the active cell, validated per cell; Ctrl/Cmd+C copies the selection as TSV.
- **Cell editors by type**: number (decimal comma accepted, numeric keypad), score 0–100,
  date (type `12/10/2026` or pick), dropdown for enums (L/P, Program, Touch Point, Status
  Penugasan, Passed/Failed, Ya/Belum, Tindakan Remedial), long text opens a small editor popover.
- **Validation**: invalid cells get a red outline + message on focus/hover and are not saved;
  the rest of the row still saves. Ranges come from the DB checks (score 0–100, TB 120–210,
  BB 30–200, progress 0–100).
- **Saving: automatic, per row**, a short moment after the last committed cell (and on leaving the
  row). A narrow status column at the row start shows saving / saved / error (icon + text for
  screen readers). Nothing typed is ever lost on an error; a retry control appears. A "Belum
  tersimpan: N baris" counter sits in the grid toolbar. Leaving the page with unsaved rows asks first.
- **Toolbar**: station filter (KPS/owner: one select, "Semua stasiun" then every code from the
  stations table), search by name or ID, week / slot picker where relevant, legend, "Tambah baris"
  where adding is allowed, and a count ("40 SDM · 12 sudah dinilai").
- **Delete**: row-level "Hapus" with confirmation; for scores / BMI, clearing all input cells of
  a row deletes that entry after a confirmation.
- Accessible: ARIA grid roles, every cell reachable by keyboard, labels announced
  ("IULS-01, Dummy A, B Product Knowledge"), focus visible.

**Phones (< 900 px)**: a 15-column grid is not usable on a phone. Show the same data as one card
per staff / item with large inputs (44 px), saving per card, same validation and status. Cek BMI on
a phone at the station is the main mobile flow: one staff card at a time is fine, with "Simpan &
berikutnya".

## 3. Dashboard: clear at a glance

The Dashboard answers three questions, in this order:
1. **Where are we in the programme?** The programme rail + "Minggu ke-N dari 10, cek BMI
   berikutnya: ke-3 dari 6, Senin, 9 Nov 2026".
2. **What needs action now?** The "Perlu ditangani" list (OVERDUE / due ≤ 7 days action items,
   staff not yet coached this week, staff whose BMI check is late or due within 7 days, Failed
   participants without a scheduled remedial, replacements at risk), each item a link.
3. **How is each station doing?** A compact comparison, one row per station: SDM dinilai minggu
   ini (n/m with a bar), rata-rata coaching vs Final Result, % Lulus, BMI tercek slot ini (n/m),
   remedial selesai, penggantian tepat waktu. Every cell links to the filtered sheet.

Above those, a KPI strip of at most 5 tiles with real numbers only, measured against the targets
in Parameter (e.g. proporsi BMI overweight vs target < 20 %, Product Knowledge vs > 90 %,
Interactive Communicating vs > 92 %, cakupan coaching 795/812, Tindak Lanjut selesai n/15). Each
tile states its comparison basis in words, links to its sheet, and never shows an invented delta.
Before the programme starts, the strip says so instead of showing zeros as if they were results.
The detailed workbook tables stay available below, collapsed or in a "Detail" tab.

## 4. Comfort details that apply everywhere
- One-line "Cara mengisi" tip at the top of each entry sheet (from the workbook's Petunjuk), dismissible.
- Remember per browser: last station filter, last week/slot, dismissed tips (guarded localStorage).
- Dates shown as `12 Okt 2026`; numbers with comma decimals; tabular figures in grids.
- Loading: skeleton rows that match the grid, plus text. Empty states: why + next action.
- Every change shows who made it last ("Diubah lewat tautan CGK, 8 Okt 07.55" or "pemilik").
- Speed: the grid must stay smooth with 300 rows × 30 columns (memoised rows, no full re-render on
  each keystroke).
