# Garuda People Development Tracker

**Monitoring Coaching Frontliner, Training IULS & RUST, dan Tindak Lanjut**

Aplikasi web untuk memantau tindak lanjut people development Garuda Indonesia bagi frontliner
PT Gapura Angkasa (Check-in Counter, Customer Service, Boarding Gate, Transfer Desk, Baggage
Service) di sekitar 22 stasiun. Isinya mengikuti workbook "Tracker Tindak Lanjut People
Development Garuda", sheet demi sheet: nilai coaching mingguan peserta IULS dan RUST, cek BMI
(tiap 2 minggu bagi SDM dengan catatan BMI, bulanan bagi yang lain), 15 tindak lanjut nasional,
remedial bagi peserta yang belum lulus, penggantian SDM, dan target KPI dari slide 15.

## Siapa memakai apa

| Peran | Akses | Cakupan |
|---|---|---|
| Stasiun (kode dari tabel `stations`, misalnya CGK) | tautan ruang kerja `/s/<token>`, tanpa akun | data stasiun sendiri; Tindak Lanjut hanya dibaca |
| KPS | tautan ruang kerja dengan lingkup KPS, tanpa akun | semua stasiun, baseline training SDM, pembaruan Tindak Lanjut |
| Pemilik | masuk di `/login`, area `/admin` | semua stasiun, termasuk tautan, Parameter dan sinkronisasi |

Sheet yang tersedia: Dashboard, Master SDM, Log Performa, Cek BMI, Tindak Lanjut, Remedial,
Penggantian SDM, Laporan Mingguan (bisa dicetak A4) dan Acuan PDF. Di desktop pengisian memakai
tabel ala spreadsheet (navigasi keyboard, tempel dari Excel, simpan otomatis per baris); di
ponsel memakai kartu.

Google Sheet replika tersinkron dua arah dengan database. Bila sel yang sama diubah di kedua sisi,
perubahan dari aplikasi yang dipakai dan nilai dari Sheet dicatat di log konflik.

## Teknologi

Next.js 16 (App Router, Cache Components), React 19, TypeScript, Tailwind CSS 4, Supabase
(Postgres, Auth, RLS), Vercel, Google Sheets API dan Apps Script. Paket dikelola dengan bun.

## Menyiapkan dari nol

Aplikasi ini memakai **project Supabase baru**, terpisah dari tracker lain.

1. **Supabase.** Buat project baru di dashboard Supabase, lalu terapkan skema:

   ```bash
   supabase link --project-ref <ref-project-baru>
   supabase db push
   ```

   Admin pertama ditambahkan lewat SQL editor setelah akunnya dibuat di Authentication:
   `insert into public.admins (user_id, email) select id, email from auth.users where email = '<email>';`

2. **Data awal (opsional).** Bangun `supabase/seed.sql` dari workbook dummy di root repo, lalu
   jalankan isinya di SQL editor:

   ```bash
   python3 -I scripts/import_xlsx.py            # --check untuk validasi tanpa menulis file
   ```

   Workbook (`*.xlsx`), `supabase/seed.sql` dan `scripts/out/` diabaikan git. Jangan pernah
   meng-commit-nya.

3. **Lingkungan lokal.**

   ```bash
   bun install
   cp .env.example .env.local   # lalu isi nilainya, lihat tabel di bawah
   bun run dev
   ```

   | Variabel | Untuk |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | koneksi aplikasi ke Supabase (publik; `NEXT_PUBLIC_SUPABASE_ANON_KEY` juga diterima) |
   | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | mesin sinkronisasi, hanya di server |
   | `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SHEETS_ID` | akses service account ke Google Sheet |
   | `SYNC_SECRET`, `SYNC_PING_SECRET` | otorisasi `POST /api/sync/run` (cron dan Apps Script) |
   | `CONFLICT_POLICY` | opsional, bawaan `db-wins` |

   Jangan pernah menaruh kunci service role atau kunci Google di variabel `NEXT_PUBLIC_*`.

4. **Vercel.** Impor repo sebagai project Next.js (`vercel.json` sudah menyatakan framework-nya),
   isi variabel yang sama di Settings → Environment Variables, lalu deploy.

5. **Google Sheets dan Apps Script.** Unggah workbook ke Google Sheets, bagikan ke service
   account, dan pasang ping Apps Script. Langkahnya ada di `docs/SYNC.md` dan
   `apps-script/README.md`; langkah produksi sekali jalan (pg_cron, Vault) ada di
   `supabase/production-setup.sql`.

## Database

Skema, RLS dan fungsi `share_*` ada di `supabase/migrations/`. Setelah mengubah migrasi, bangun
ulang tipe TypeScript tanpa Docker (PGlite):

```bash
bun scripts/gen-types.ts supabase/migrations lib/database.types.ts
```

## Tes

```bash
bun test                 # rumus workbook, agregasi, grid, sinkronisasi, komponen
bun tests/sql/run.ts     # tes keamanan SQL di PGlite, tanpa Docker
bun run lint
```

`tests/sql/` membuktikan bahwa `anon` tidak punya akses tabel, tautan stasiun hanya melihat dan
mengubah stasiunnya sendiri, field khusus KPS dan Tindak Lanjut hanya bisa diubah KPS atau
pemilik, remedial dan penggantian mengikuti lingkup stasiun, tautan yang dicabut ditolak, dan setiap
perubahan lewat tautan tercatat di `updated_by_link`. Berkas yang sama juga bisa dijalankan dengan
pgTAP: `supabase test db --db-url "$SUPABASE_DB_URL" tests/sql`.

## Dokumen

- `docs/SPEC.md`: model akses, model data, aturan dari workbook
- `docs/UX.md` dan `DESIGN.md`: perilaku layar dan arah visual (Garuda Indonesia × Gapura Airport Services)
- `docs/SYNC.md` dan `apps-script/README.md`: sinkronisasi Google Sheet
