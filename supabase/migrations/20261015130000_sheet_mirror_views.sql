-- Read-only mirror of the Google Sheet in the database: schema "sheet", one view per synced tab, named
-- after the tab, with the tab's header texts as column names in the tab's column order (formula columns
-- computed the way the workbook computes them, see lib/rules.ts). The real tables stay normalized (the
-- sync engine, the RPCs and the app use them); these views are what the owner opens in the Supabase
-- Table Editor (schema "sheet") to see the data the way the sheet shows it.
--
-- "Cek BMI 2 Mingguan" has one group of six columns per check, so it is rebuilt whenever
-- settings.bmi_periods changes (trigger below). Its two "slot Laporan Mingguan" helper columns follow the
-- week picked in the Laporan tab and are left out. Only postgres and service_role can read the schema:
-- it is not exposed to the API, and the views read every unit.

create schema if not exists sheet;
revoke all on schema sheet from public, anon, authenticated;
grant usage on schema sheet to service_role;
comment on schema sheet is 'Read-only views that mirror the Google Sheet tabs (same tab names, headers and column order).';

-- ---------------------------------------------------------------------------------------------
-- Helpers (lib/rules.ts)
-- ---------------------------------------------------------------------------------------------

-- The workbook's TODAY() (Parameter "Tanggal acuan"): the Jakarta date.
create or replace function private.sheet_today()
returns date
language sql
stable
set search_path = ''
as $$ select (pg_catalog.now() at time zone 'Asia/Jakarta')::date $$;

-- ROUND(AVERAGE(...), 2) with blanks ignored; NULL when nothing is filled.
create or replace function private.sheet_avg(variadic p numeric[])
returns numeric
language sql
immutable
set search_path = ''
as $$ select pg_catalog.round(pg_catalog.avg(x), 2) from pg_catalog.unnest(p) as x $$;

-- Final Result: ROUND(role play x weight + post-test x weight, 1); NULL unless both are filled.
create or replace function private.sheet_final(p_role_play numeric, p_post_test numeric, s public.settings)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when p_role_play is not null and p_post_test is not null
    then pg_catalog.round(p_role_play * s.weight_role_play + p_post_test * s.weight_post_test, 1) end
$$;

-- BMI: ROUND(weight / (height/100)^2, 1).
create or replace function private.sheet_bmi(p_height numeric, p_weight numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when p_height > 0 and p_weight is not null
    then pg_catalog.round(p_weight / ((p_height / 100) ^ 2), 1) end
$$;

create or replace function private.sheet_bmi_category(p_bmi numeric, s public.settings)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_bmi is null then null
    when p_bmi < s.bmi_underweight_below then 'Kurus'
    when p_bmi <= s.bmi_normal_max then 'Normal'
    when p_bmi <= s.bmi_overweight_max then 'Overweight'
    else 'Obesitas'
  end
$$;

-- `12 Okt` (lib/dates.ts formatTanggalPendek).
create or replace function private.sheet_short_date(p date)
returns text
language sql
immutable
set search_path = ''
as $$
  select extract(day from p)::int || ' ' ||
    (array['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'])[extract(month from p)::int]
$$;

-- Percentages in Parameter read as the sheet shows them (0.2 -> 20%).
create or replace function private.sheet_percent(p numeric)
returns text
language sql
immutable
set search_path = ''
as $$ select case when p is not null then pg_catalog.trim_scale(pg_catalog.round(p * 100, 2))::text || '%' end $$;

revoke all on function private.sheet_today(), private.sheet_avg(numeric[]),
  private.sheet_final(numeric, numeric, public.settings), private.sheet_bmi(numeric, numeric),
  private.sheet_bmi_category(numeric, public.settings), private.sheet_short_date(date),
  private.sheet_percent(numeric)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Static tabs
-- ---------------------------------------------------------------------------------------------

create or replace view sheet."Parameter" as
select p.ord as "No", p.label as "Parameter", p.value as "Nilai"
from public.settings s
cross join lateral (values
  (1,  'Tanggal mulai Minggu ke-1 (Senin)', pg_catalog.to_char(s.week1_start, 'DD/MM/YYYY')),
  (2,  'Jumlah minggu pemantauan', s.weeks::text),
  (3,  'Tanggal cek BMI slot 1', pg_catalog.to_char(s.bmi_first_check, 'DD/MM/YYYY')),
  (4,  'Interval antar cek BMI (hari, semua petugas)', s.bmi_interval_days::text),
  (5,  'Jumlah slot cek di sheet BMI', s.bmi_periods::text),
  (6,  'BMI kategori Kurus jika <', s.bmi_underweight_below::text),
  (7,  'BMI Normal s.d.', s.bmi_normal_max::text),
  (8,  'BMI Overweight s.d. (di atasnya Obesitas)', s.bmi_overweight_max::text),
  (9,  'Passing grade (skor ≥)', s.pass_grade::text),
  (10, 'Bobot Role Play di Final Result', private.sheet_percent(s.weight_role_play)),
  (11, 'Bobot Post-Test di Final Result', private.sheet_percent(s.weight_post_test)),
  (12, 'Target proporsi BMI overweight (maks.)', private.sheet_percent(s.target_overweight_max)),
  (13, 'Jangka waktu target BMI (bulan)', s.target_overweight_months::text),
  (14, 'Target ketepatan jawaban Product Knowledge', private.sheet_percent(s.target_knowledge)),
  (15, 'Target skor Interactive Communicating', private.sheet_percent(s.target_interactive)),
  (16, 'Target cakupan coaching (jumlah frontliner)', s.target_coverage::text),
  (17, 'Frontliner sudah coaching (update manual)', s.coverage_done::text),
  (18, 'Target kelulusan peserta IULS/RUST setelah remedial', private.sheet_percent(s.target_pass_rate)),
  (19, 'Batas waktu penggantian SDM', pg_catalog.to_char(s.replacement_deadline, 'DD/MM/YYYY')),
  (20, 'Tanggal acuan (hari ini)', pg_catalog.to_char(private.sheet_today(), 'DD/MM/YYYY'))
) as p(ord, label, value)
where s.id = 1
order by p.ord;

-- Master SDM L, N, O, P (lib/rules.ts staffBaseline) for every staff member; reused below.
create or replace view sheet."_baseline" as
select t.code, f.final,
  case when f.final is null then null when f.final >= s.pass_grade then 'Passed' else 'Failed' end as status,
  case
    when f.final is null or f.final >= s.pass_grade then null
    when t.role_play = 0 then 'Kendala operasional & kehadiran (absen role play)'
    when t.post_test < s.pass_grade then 'Role play & post-test belum optimal'
    else 'Performa role play belum optimal'
  end as cause
from public.staff t
left join public.settings s on s.id = 1
cross join lateral (select private.sheet_final(t.role_play, t.post_test, s) as final) f;

create or replace view sheet."Master SDM" as
select
  row_number() over (order by t.sort_order nulls last, t.code) as "No",
  t.code as "ID SDM",
  t.program as "Program",
  t.provider as "Provider",
  t.station as "Unit",
  t.name as "Nama Petugas",
  t.employee_no as "Employee Number",
  t.gender as "L/P",
  t.touch_point as "Touch Point",
  t.role_play as "Role Play",
  t.post_test as "Post-Test",
  b.final as "Final Result",
  t.report_remark as "Remark di Laporan",
  b.status as "Status Menurut Kriteria ≥85",
  case when nullif(trim(t.report_remark), '') is null or b.status is null then null
    when upper(trim(t.report_remark)) = upper(b.status) then 'Sama'
    else 'Beda – verifikasi' end as "Cek Konsistensi",
  b.cause as "Penyebab Utama",
  t.assignment_status as "Status Penugasan",
  t.feedback as "Evaluation Feedback",
  t.notes as "Catatan"
from public.staff t
join sheet."_baseline" b on b.code = t.code
order by 1;

-- Every staff member x every week, like the pre-made rows of the tab.
create or replace view sheet."Log Performa Mingguan" as
with s as (select * from public.settings where id = 1)
select
  w.week as "Minggu Ke",
  s.week1_start + (w.week - 1) * 7 as "Mulai (Senin)",
  t.code as "ID SDM",
  t.name as "Nama Petugas",
  t.station as "Unit",
  t.program as "Program",
  ws.touch_point as "Touch Point",
  ws.score_grooming as "A Grooming & Appearance",
  ws.score_knowledge as "B Product Knowledge",
  ws.score_attitude as "C Attitude & Behaviour",
  ws.score_communication as "D Communication Skill",
  a.avg as "Rata-rata",
  case when a.avg is null then null when a.avg >= s.pass_grade then 'Lulus' else 'Belum Lulus' end as "Status Minggu Ini",
  a.avg - b.final as "Δ vs Final Result",
  ws.gap_topic as "Topik Gap Utama",
  ws.observer as "Observer / Coach",
  ws.coaching_notes as "Catatan Coaching"
from s
cross join lateral pg_catalog.generate_series(1, s.weeks) as w(week)
cross join public.staff t
join sheet."_baseline" b on b.code = t.code
left join public.weekly_scores ws on ws.staff_code = t.code and ws.week = w.week
cross join lateral (
  select private.sheet_avg(ws.score_grooming, ws.score_knowledge, ws.score_attitude, ws.score_communication) as avg
) a
order by w.week, t.sort_order nulls last, t.code;

create or replace view sheet."Tindak Lanjut" as
select
  row_number() over (order by x.sort_order nulls last, x.code) as "No",
  x.code as "ID",
  x.group_name as "Kelompok",
  x.aspect as "Aspek",
  x.root_cause as "Akar Masalah / Temuan",
  x.action as "Tindakan / Inisiatif",
  x.target as "Target / KPI",
  x.kind as "Jenis",
  x.schedule as "Jadwal",
  x.due_date as "Batas Waktu",
  x.pic as "PIC",
  x.status as "Status",
  x.progress as "% Progres",
  x.updated_on as "Tgl Update",
  x.evidence as "Realisasi / Bukti",
  x.kps_notes as "Catatan Garuda / KPS",
  case when x.due_date is null or upper(trim(x.status)) = 'SELESAI' then null
    else x.due_date - private.sheet_today() end as "Sisa Hari",
  case
    when upper(trim(x.status)) = 'SELESAI' then 'Selesai'
    when x.due_date is null then 'Batas waktu belum ditetapkan'
    when x.due_date - private.sheet_today() < 0 then 'OVERDUE'
    when x.due_date - private.sheet_today() <= 7 then 'Jatuh tempo ≤ 7 hari'
    when upper(trim(x.kind)) = 'RUTIN' then 'Rutin – pantau'
    else 'On Track'
  end as "Flag",
  x.source as "Sumber"
from public.action_items x
order by 1;

create or replace view sheet."Remedial" as
with s as (select * from public.settings where id = 1)
select
  row_number() over (order by r.sort_order nulls last, r.staff_code) as "No",
  r.staff_code as "ID SDM",
  t.name as "Nama Petugas",
  t.program as "Program",
  t.station as "Unit",
  b.final as "Final Result Awal",
  b.cause as "Penyebab Utama",
  r.action as "Tindakan Remedial",
  r.remedial_on as "Tgl Remedial",
  r.role_play as "Role Play Ulang",
  r.post_test as "Post-Test Ulang",
  f.final as "Final Ulang",
  case
    when f.final is null then case when nullif(trim(r.action), '') is null then 'Belum dijadwalkan' else 'Menunggu hasil' end
    when f.final >= s.pass_grade then 'Lulus'
    else 'Belum Lulus'
  end as "Status Ulang",
  f.final - b.final as "Kenaikan",
  r.reported as "Dilaporkan ke Garuda",
  r.notes as "Catatan"
from public.remedials r
left join s on true
left join public.staff t on t.code = r.staff_code
left join sheet."_baseline" b on b.code = r.staff_code
cross join lateral (select private.sheet_final(r.role_play, r.post_test, s) as final) f
order by 1;

create or replace view sheet."Penggantian SDM" as
with s as (select * from public.settings where id = 1)
select
  row_number() over (order by r.sort_order nulls last, r.id) as "No",
  r.program as "Program",
  r.station as "Unit",
  r.replaced_name as "Nama SDM Diganti",
  r.reason as "Alasan / Dasar",
  r.withdrawn_on as "Tgl Ditarik",
  r.replacement_name as "Nama SDM Pengganti",
  r.effective_on as "Tgl Efektif",
  r.training_on as "Tgl Training",
  r.post_test as "Post-Test",
  r.final_result as "Final Result",
  case
    when nullif(trim(r.replacement_name), '') is null then null
    when r.post_test is null or r.final_result is null then 'Belum training/dinilai'
    when r.post_test >= s.pass_grade and r.final_result >= s.pass_grade then 'Lulus'
    else 'Belum Lulus'
  end as "Status Kelulusan",
  case
    when nullif(trim(r.replaced_name), '') is null then null
    when r.effective_on is null then
      case when private.sheet_today() - s.replacement_deadline > 0 then 'OVERDUE' else 'Menunggu' end
    when r.effective_on <= s.replacement_deadline then 'Tepat waktu'
    else 'Lewat ' || private.sheet_short_date(s.replacement_deadline)
  end as "Ketepatan Waktu",
  r.reported as "Dilaporkan ke Garuda",
  r.notes as "Catatan",
  r.id as "ID Sistem",
  r.staff_code as "ID SDM"
from public.replacements r
left join s on true
order by 1;

create or replace view sheet."Temuan Mingguan" as
select w.week as "Minggu Ke", w.scope as "Lingkup", w.findings as "Temuan"
from public.weekly_reports w
order by w.week, w.scope;

-- ---------------------------------------------------------------------------------------------
-- "Cek BMI 2 Mingguan": one row per staff member, one group of columns per check
-- ---------------------------------------------------------------------------------------------

create or replace function private.rebuild_sheet_cek_bmi()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_periods int := coalesce((select bmi_periods from public.settings where id = 1), 1);
  v_groups text := '';
  v_joins text := '';
  p int;
begin
  for p in 1 .. v_periods loop
    v_groups := v_groups || pg_catalog.format(
      ', c%1$s.check_date as %2$I, c%1$s.height_cm as %3$I, c%1$s.weight_kg as %4$I, '
      'private.sheet_bmi(c%1$s.height_cm, c%1$s.weight_kg) as %5$I, '
      'private.sheet_bmi_category(private.sheet_bmi(c%1$s.height_cm, c%1$s.weight_kg), s) as %6$I, '
      'c%1$s.commitment as %7$I',
      p,
      'Cek ke-' || p || ' Tgl Cek', 'Cek ke-' || p || ' Tinggi (cm)', 'Cek ke-' || p || ' Berat (kg)',
      'Cek ke-' || p || ' BMI', 'Cek ke-' || p || ' Kategori', 'Cek ke-' || p || ' Komitmen/Target');
    v_joins := v_joins || pg_catalog.format(
      ' left join public.bmi_checks c%1$s on c%1$s.staff_code = st.code and c%1$s.period = %1$s', p);
  end loop;

  drop view if exists sheet."Cek BMI 2 Mingguan";
  execute pg_catalog.format($v$
    create view sheet."Cek BMI 2 Mingguan" as
    with s0 as (select * from public.settings where id = 1),
    agg as (
      select c.staff_code,
        count(*) as checks,
        (array_agg(c.check_date order by c.period desc) filter (where c.check_date is not null))[1] as last_date,
        (array_agg(c.weight_kg order by c.period desc))[1] as weight,
        (array_agg(c.weight_kg order by c.period asc))[1] as first_weight,
        (array_agg(private.sheet_bmi(c.height_cm, c.weight_kg) order by c.period desc))[1] as bmi
      from public.bmi_checks c, s0
      where c.period between 1 and s0.bmi_periods
      group by c.staff_code
    ),
    nx as (
      select st.code, coalesce(a.last_date + s.bmi_interval_days, s.bmi_first_check) as next_check
      from public.staff st
      left join public.settings s on s.id = 1
      left join agg a on a.staff_code = st.code
    )
    select
      row_number() over (order by st.sort_order nulls last, st.code) as "No",
      st.code as "ID SDM",
      st.name as "Nama Petugas",
      st.station as "Unit",
      st.program as "Program",
      st.gender as "L/P",
      st.feedback as "Coaching Evaluation Feedback",
      st.notes as "Result/Remarks",
      case when st.bmi_has_note then 'Ya' when st.bmi_has_note = false then 'Tidak' end as "Ada Catatan BMI"
      %1$s,
      coalesce(a.checks, 0) as "Jumlah Cek",
      a.last_date as "Tgl Cek Terakhir",
      a.bmi as "BMI Terakhir",
      private.sheet_bmi_category(a.bmi, s) as "Kategori Terakhir",
      case when a.checks >= 2 then a.weight - a.first_weight end as "Δ Berat (kg)",
      nx.next_check as "Cek Berikutnya",
      case
        when nx.next_check - private.sheet_today() < 0 then 'Terlambat cek'
        when nx.next_check - private.sheet_today() <= 7 then 'Cek ≤ 7 hari'
        else 'Terjadwal'
      end as "Status Jadwal",
      st.bmi_note as "Catatan Program Kebugaran"
    from public.staff st
    left join public.settings s on s.id = 1
    left join agg a on a.staff_code = st.code
    left join nx on nx.code = st.code
    %2$s
    order by 1
  $v$, v_groups, v_joins);

  revoke all on all tables in schema sheet from public, anon, authenticated;
  grant select on all tables in schema sheet to service_role;
end;
$$;

revoke all on function private.rebuild_sheet_cek_bmi() from public, anon, authenticated;

create or replace function private.settings_rebuild_sheet_views()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.rebuild_sheet_cek_bmi();
  return null;
end;
$$;

revoke all on function private.settings_rebuild_sheet_views() from public, anon, authenticated;

drop trigger if exists settings_rebuild_sheet_views on public.settings;
create trigger settings_rebuild_sheet_views
  after update of bmi_periods on public.settings
  for each row when (old.bmi_periods is distinct from new.bmi_periods)
  execute function private.settings_rebuild_sheet_views();

select private.rebuild_sheet_cek_bmi();
