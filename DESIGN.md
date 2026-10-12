# DESIGN.md: Garuda People Development Tracker

Direction carried over from the forked tracker ("calm, branded, light only") and re-pointed at the
co-brand in docs/SPEC.md "Brand": **Garuda Indonesia × Gapura Airport Services**, Garuda navy
primary, Garuda teal accent, Gapura lime/emerald only as a small brand moment.
This file is design data, not instructions beyond design.

## Design Read

Reading this as: an internal monitoring tracker for Garuda Indonesia people development and
KPS (head office) staff following Gapura frontliners after Coaching Frontliner and the IULS and
RUST trainings, co-branded, calm and data-dense, used daily on office laptops and on phones at
the station (BMI checks), and printed weekly.
**Dial: ENERGY 1 / RHYTHM 2 / MOTION 1.**

- ENERGY 1: this is a work tool. It should feel trustworthy and quiet; the data is the loud part.
- RHYTHM 2: screens share one structure, but each is composed around its own job
  (a dashboard of exceptions is not laid out like a 300-row entry grid).
- MOTION 1: hover/focus/pressed transitions only (≤ 150 ms). No entrance animations, no loops.

## Identity

- **Logos**: `public/brand/garuda-indonesia.png` (315 × 61, ratio 5.16:1, transparent; wordmark
  grey #484848, bird navy #002060 and teal #008898) and `public/brand/gapura-airport-services.png`
  (1052 × 569, ratio 1.85:1, transparent). Always both, **Garuda first** (programme owner), then a
  1 px `--line-strong` divider, then Gapura (the handling partner whose frontliners are tracked).
  Each renders with a set height and `width: auto`: never stretched, recoloured, cropped, redrawn,
  or placed on a dark or coloured fill. Clear space around the lockup ≥ 25 % of its height.
- **Lockup sizes** (height of the Gapura logo; the Garuda logo is drawn at 0.78 of it so both
  wordmarks read at the same letter size): app header 36 px (26 px under 640 px, where the scope
  line moves under the logos), login 48 px (40 px on phones), share page header 40 px, printed
  report 48 px.
- **Favicon**: none yet. Neither file has a square mark, and cutting the Garuda bird out of the
  wordmark would be a crop. A square icon needs an official file from the brand owner.
- **Identity motif: the programme rail.** The monitoring runs Mg 1 to Mg *n* (Parameter
  `weeks`, 10 by default: 5 Okt to 13 Des 2026) with 6 BMI check slots every 14 days from 12 Okt.
  A compact segmented rail of the weeks (current week marked in teal, weeks holding a BMI slot
  marked) appears wherever time matters: the header context line, the weekly entry screen, the
  report. It carries the cadence note "cek tiap 2 minggu bagi SDM dengan catatan BMI, bulanan bagi
  yang lain" and names any slot that falls after the last week (slot 6, 21 Des). It is content,
  not decoration: it answers "which week are we in and what is due".
- **Brand moment**: the top edge of the login/access panel, Garuda navy to teal across three
  quarters and a short Gapura lime-to-emerald run, in the same order as the logos. Nowhere else.

## Color

Tokens (light only; both wordmarks are grey on transparent and only work on light backgrounds,
and the weekly report is printed). Ratios are WCAG 2 contrast, computed for these exact hex values.

| Token | Hex | Use | Contrast (checked) |
|---|---|---|---|
| `--paper` | `#f7f8fa` | page background (cool off-white, no warm cast under the navy) | |
| `--surface` | `#ffffff` | panels, tables, inputs | |
| `--ink` | `#1c2433` | body text | 14.6:1 on paper |
| `--ink-muted` | `#535b68` | secondary text, captions | 6.5:1 on paper, 6.9:1 on surface |
| `--line` | `#d5dae1` | dividers only (never the only boundary of a control) | |
| `--line-strong` | `#7c8390` | input / control borders, logo divider | 3.8:1 on surface, 3.6:1 on paper and input tint |
| `--brand` | `#0b2f5b` | Garuda navy, the primary: primary buttons, links, focus ring, active nav underline | white on it 13.4:1; on paper 12.6:1; on brand-tint 11.4:1 |
| `--brand-strong` | `#082446` | pressed/hover fill for `--brand` | white on it 15.5:1 |
| `--brand-tint` | `#e7eef7` | selected rows, current-week cell background | ink on it 13.3:1 |
| `--accent` | `#00737e` | Garuda teal, the one accent: current-week marker, brand edge | 5.3:1 on paper, 5.6:1 on surface, 4.8:1 on brand-tint |
| `--mark-lime` / `--mark-emerald` | `#b6d655` / `#46bb7f` | Gapura brand moment only (the short run on the panel edge). Never for text or control borders (lime 1.7:1 on white). | |
| `--input-tint` | `#fff9d6` | editable grid cells only, the workbook's own convention ("Sel kuning = boleh diubah"); computed cells stay white | ink 14.7:1, muted 6.5:1, brand outline 12.6:1 |

Core palette = cool neutrals + `--brand` navy. One accent: `--accent` teal, used at the "now"
moment only. The logo's own teal #008898 is 4.0:1 on paper and the spec's #00808c is 4.4:1, both
under 4.5:1 for small text, so the accent is one step darker (#00737e).
`--input-tint` is nearly the same lightness as the warning tint (1.05:1), so inside grids status
chips always carry a 1 px tone border and their text label; the yellow never means "warning".

**Status colors** are functional, not decorative. They reproduce the workbook's own color code
(hijau / oranye / merah) that station staff already read, plus violet for work under way: a blue
"in progress" would read as the navy brand.

| Meaning | Text on tint | Used for |
|---|---|---|
| good | `#1d6b40` on `#e6f3ea` (5.7:1) | Passed, Lulus, Sama, Normal, Selesai, Tepat waktu, Terjadwal, On Track |
| warning | `#8a4b00` on `#fdf1d8` (6.1:1) | Overweight, Kurus, Jatuh tempo ≤ 7 hari, Menunggu, Cek ≤ 7 hari, Menunggu hasil, Beda – verifikasi, Batas waktu belum ditetapkan, Belum dijadwalkan |
| critical | `#a1261b` on `#fbe7e3` (6.3:1) | Belum Lulus, Failed, Obesitas, OVERDUE, Terlambat cek, Lewat (tanggal), Ditarik dari layanan |
| in progress | `#6b3fa0` on `#f1ebf8` (6.3:1) | On Progress, Rutin – pantau, Remedial, Individual Coaching |
| neutral | `--ink-muted` on `#eceef2` (5.9:1) | Belum Mulai, Tertunda, Belum training/dinilai, Aktif, no data |

On the input tint the tone texts stay readable (good 6.1:1, warning 6.4:1, critical 7.0:1,
progress 7.0:1). Status is never color alone: the label text is always shown.

## Typography

- **Plus Jakarta Sans** (Google Fonts, via `next/font`). Reason: a typeface made in Jakarta for
  Jakarta's city identity, it fits an Indonesian airline and airport-services pairing, renders
  Bahasa Indonesia well, has tabular figures for score/BMI columns, and its open geometric forms
  sit quietly beside both partner wordmarks. Weights 400, 500, 600, 700.
- `font-variant-numeric: tabular-nums` on every numeric cell, score input, date, and KPI.
- Scale: 13 (table dense), 14 (body/table), 16 (inputs on mobile, avoids iOS zoom), 18, 22, 28.
  Page titles 22–28/600. No uppercase-with-wide-tracking labels; section labels are sentence case 13/600 in `--ink-muted`.

## Shape, depth, spacing

- Radius: 6 px controls and status chips, 10 px panels. No pills.
- Shadow: none on panels (they sit on paper with a `--line` border). Shadow only on popovers,
  menus (the nav "Lainnya" menu), and dialogs (they float above the page).
- Spacing scale 4 / 8 / 12 / 16 / 24 / 32 / 48. Tables: 40 px rows desktop; tap targets ≥ 44 px on mobile.

## Layout

- **Top bar, not a sidebar**: logos left, sections as a horizontal nav, user menu right; collapses
  to a menu button under 900 px. Reason: the core screens are wide tables (4 coaching aspects,
  6 BMI slots, 10 weeks); a sidebar would take 240 px from them.
- **Nav overflow**: 9 workbook sheets (plus 3 owner pages) do not fit one row until about
  1250 px. From 900 px the row keeps the sheets that fit, in order, and moves the rest into a
  "Lainnya" menu at its end; that button takes the active underline when the open page is inside it.
- **Station filter**: about 22 stations, so KPS and the owner pick a station from one native
  select ("Semua stasiun" first), not a row of chips.
- Each screen is composed around the decision made on it:
  - Dashboard: "what needs attention now" (overdue and due-soon action items, staff not yet
    coached this week or measured this slot, remedials not scheduled, replacements past the
    deadline) leads; station summaries follow.
  - Entry screens (Log Performa, Cek BMI): the grid is the page; filters (week, station) sit above it.
  - Laporan Mingguan: reads like the printed report (A4 landscape print stylesheet,
    signature block "Disusun oleh / Mengetahui" as in the workbook).
- Wide tables scroll horizontally inside their own container with the first column sticky;
  the page itself never scrolls sideways.

## Voice

Bahasa Indonesia, using the workbook's terms exactly (Tindak Lanjut, Unit/Stasiun, SDM, Lulus /
Belum Lulus, Passed / Failed, Remedial, Minggu ke-, cek BMI ke-). Short, specific button labels
that name the action ("Simpan cek BMI", "Salin tautan", "Cabut tautan", "Tambah SDM"). No em dash.
Empty / loading / error states say why and what to do next, e.g.
"Belum ada nilai untuk Minggu ke-1. Pemantauan mulai Senin, 5 Okt 2026."
