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
| Akun cabang | daftar di `/register`, disetujui pemilik, masuk di `/login`, area `/cabang` | cabang akun itu (stasiun atau KPS) |
| Pemilik | masuk di `/login`, area `/admin` | semua stasiun, termasuk tautan, akun cabang, Parameter dan sinkronisasi |

Halaman: Beranda, Laporan Mingguan (bisa dicetak A4), Penilaian Mingguan, Cek BMI, Remedial,
Tindak Lanjut (KPS dan pemilik), Data SDM dan Penggantian SDM. Di desktop pengisian memakai
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

### Cek BMI

Cek BMI mengikuti prototype `CGK_BMI_Tracker_Prototype_Interaktif.html`: banner, empat angka ringkasan, tabel
bergaya spreadsheet dengan kolom identitas beku, enam kelompok cek (Tgl Cek, Tinggi, Berat, BMI,
Kategori) dan kolom ringkasan, pilihan periode, filter status, tombol Semua periode / Fokus periode,
panel profil, dialog ubah isian, Tambah SDM dan Ekspor CSV. Di bawah 561px layar memakai kartu per
orang. Teks panjang (Coaching Evaluation Feedback, Result/Remarks, Catatan Program Kebugaran) dipotong
satu baris dan bisa dibuka penuh dengan tombol di sel. Warna prototype dipakai; hanya warna teks yang
kurang dari 4,5:1 yang digelapkan (dijaga `components/bmi/palette.test.ts`). Catatan arah desain ada di
bagian akhir `DESIGN.md`.

Tautan stasiun CGK tetap hanya menampilkan menu Cek BMI. Tambah SDM tersedia untuk tautan atau akun
satu stasiun (stasiun diambil dari lingkup di server, bukan dari form); pemilik dan KPS memilih
stasiun. ID SDM dibuat otomatis oleh `share_save_staff`. Penyimpanan bertahap
(`saveStaff`, lalu `saveBmiProfile`, lalu `saveBmiCheck`) bukan transaksi atomik: bila langkah akhir gagal,
form menampilkan hasil parsial dan mengulang dengan ID yang sama.

Struktur tab `Cek BMI 2 Mingguan` di Google Sheet saat ini: A sampai I identitas (No, ID SDM, Nama, Unit,
Program, L/P, Coaching Evaluation Feedback, Result/Remarks, Ada Catatan BMI), enam cek mulai kolom J (lima
kolom tiap cek), ringkasan AN sampai AU dan dua kolom Laporan AV dan AW. Mesin sinkronisasi membaca posisi
dari judul kolom, jadi menggeser kolom tidak merusaknya; lihat `docs/SYNC.md`.

### Akun cabang: daftar, persetujuan, masuk

Selain tautan, setiap cabang bisa punya akun sendiri (pola yang sama dengan IAP Monitoring):

1. Orang mendaftar di `/register` (nama, email, kata sandi, cabang: kode stasiun atau KPS). Akun dibuat
   `pending` oleh trigger di `auth.users`; peran dan status dari form tidak pernah dipakai.
2. Pemilik membuka **Akun Cabang** (`/admin/akun`), memilih cabang bila perlu, lalu Setujui, Tolak
   (Nonaktifkan), mengganti cabang, atau menghapus akun.
3. Akun yang disetujui masuk di `/login` dan dikirim ke `/cabang`: halaman yang sama dengan tautan stasiun,
   lingkupnya cabang akun itu (KPS = semua stasiun), ditentukan di database, bukan dari URL. Akun
   `pending` atau `inactive` ditolak dengan alasan dan tidak memegang sesi.
4. Lupa kata sandi: `/forgot-password`, tautan email ke `/auth/callback`, lalu `/reset-password`.

Pengaturan di dashboard Supabase (tidak bisa diubah dari migrasi): Authentication, URL Configuration:
**Site URL** = alamat aplikasi, dan **Redirect URLs** memuat `<alamat aplikasi>/auth/callback` (serta
`http://localhost:3000/auth/callback` untuk pengembangan). Konfirmasi email saat ini aktif di project;
pengirim email bawaan Supabase dibatasi jumlahnya, jadi pasang SMTP sendiri bila pendaftar banyak.
Tabel `public.profiles`, fungsi `admin_delete_account` dan `registration_branches` ada di
`supabase/migrations/20261014090000_branch_accounts.sql` dan `20261014090200_registration_branches.sql`; tes
keamanannya di `tests/sql/08_accounts.test.sql`.

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
