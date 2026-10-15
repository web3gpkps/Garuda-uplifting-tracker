-- Data validation at the table level (what the Sheets sync relies on to reject bad cells),
-- the settings row and its Parameter defaults, the station list, and link scope/token rules.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into public.staff (code, station, name) values ('TST-SUB', 'SUB', 'Dummy A');

-- staff
select throws_ok($$update public.staff set gender = 'X' where code = 'TST-SUB'$$, '23514', null, 'staff.gender must be L/P/NULL');
select throws_ok($$update public.staff set program = 'ABC' where code = 'TST-SUB'$$, '23514', null, 'program is IULS/RUST');
select throws_ok($$update public.staff set role_play = 101 where code = 'TST-SUB'$$, '23514', null, 'role_play is 0..100');
select throws_ok($$update public.staff set post_test = -1 where code = 'TST-SUB'$$, '23514', null, 'post_test is 0..100');
select throws_ok($$update public.staff set report_remark = 'Bagus' where code = 'TST-SUB'$$, '23514', null, 'report_remark is Passed/Failed');
select lives_ok($$update public.staff set touch_point = 'Lounge' where code = 'TST-SUB'$$, 'touch_point accepts free text ("Other")');
select throws_ok($$update public.staff set touch_point = '   ' where code = 'TST-SUB'$$, '23514', null, 'touch_point is not blank');
select throws_ok($$update public.staff set touch_point = repeat('x', 61) where code = 'TST-SUB'$$, '23514', null, 'touch_point is at most 60 characters');
select throws_ok($$update public.staff set assignment_status = 'Cuti' where code = 'TST-SUB'$$, '23514', null, 'assignment_status is enumerated');
select throws_ok($$update public.staff set name = '  ' where code = 'TST-SUB'$$, '23514', null, 'staff name is not blank');
select throws_ok($$insert into public.staff (code, station, name) values ('TST-X', 'XXX', 'x')$$, '23503', null, 'staff.station must be a known station');
select is((select assignment_status from public.staff where code = 'TST-SUB'), 'Aktif', 'assignment_status defaults to Aktif');
select lives_ok($$update public.staff set program = 'RUST', role_play = 0, post_test = 100, report_remark = 'Failed',
                   touch_point = 'Baggage Service', assignment_status = 'Ditarik dari layanan', bmi_has_note = false
                 where code = 'TST-SUB'$$, 'valid staff values are accepted');

-- weekly_scores
select throws_ok($$insert into public.weekly_scores (staff_code, week, score_grooming) values ('TST-SUB', 1, 101)$$, '23514', null, 'weekly score 101 is rejected');
select throws_ok($$insert into public.weekly_scores (staff_code, week, score_attitude) values ('TST-SUB', 1, -5)$$, '23514', null, 'weekly score -5 is rejected');
select throws_ok($$insert into public.weekly_scores (staff_code, week) values ('TST-SUB', 21)$$, '23514', null, 'week is 1..20');
select lives_ok($$insert into public.weekly_scores (staff_code, week, score_knowledge, score_communication) values ('TST-SUB', 1, 92.5, 0)$$, 'valid weekly score (0..100, decimals)');
select throws_ok($$insert into public.weekly_scores (staff_code, week) values ('TST-SUB', 1)$$, '23505', null, 'one row per staff x week');

-- bmi_checks
select throws_ok($$insert into public.bmi_checks (staff_code, period, height_cm, weight_kg) values ('TST-SUB', 53, 170, 60)$$, '23514', null, 'slot is 1..52');
select lives_ok($$insert into public.bmi_checks (staff_code, period, height_cm, weight_kg) values ('TST-SUB', 52, 170, 60)$$, 'slot 52 is accepted');
select lives_ok($$delete from public.bmi_checks where staff_code = 'TST-SUB' and period = 52$$, 'slot 52 removed again');
select throws_ok($$insert into public.bmi_checks (staff_code, period, height_cm, weight_kg) values ('TST-SUB', 1, null, 60)$$, '23502', null, 'height is required on a stored check');
select lives_ok($$insert into public.bmi_checks (staff_code, period, height_cm, weight_kg) values ('TST-SUB', 6, 170, 60)$$, 'slot 6 is accepted');
select is((select commitment from public.bmi_checks where staff_code = 'TST-SUB' and period = 6), 'Sudah Ideal', 'a Normal check gets Sudah Ideal from the database');
select lives_ok($$update public.bmi_checks set weight_kg = 80, commitment = 'Turun 5 kg dalam 2 bulan' where staff_code = 'TST-SUB' and period = 6$$, 'a check above Normal takes a commitment');
select is((select commitment from public.bmi_checks where staff_code = 'TST-SUB' and period = 6), 'Turun 5 kg dalam 2 bulan', 'the commitment is kept while the check is not Normal');
select lives_ok($$update public.bmi_checks set weight_kg = 60 where staff_code = 'TST-SUB' and period = 6$$, 'the check goes back to Normal');
select is((select commitment from public.bmi_checks where staff_code = 'TST-SUB' and period = 6), 'Sudah Ideal', 'Normal again: Sudah Ideal replaces the typed commitment');
select lives_ok($$update public.bmi_checks set weight_kg = 85 where staff_code = 'TST-SUB' and period = 6$$, 'the check leaves Normal');
select is((select commitment from public.bmi_checks where staff_code = 'TST-SUB' and period = 6), null, 'Sudah Ideal is cleared when the check is no longer Normal');
select throws_ok($$update public.bmi_checks set commitment = '  ' where staff_code = 'TST-SUB' and period = 6$$, '23514', null, 'a commitment is not blank');
select throws_ok($$update public.bmi_checks set commitment = repeat('x', 501) where staff_code = 'TST-SUB' and period = 6$$, '23514', null, 'a commitment is at most 500 characters');

-- action_items
select throws_ok($$insert into public.action_items (code, group_name, status) values ('TST-TL01', 'Coaching Frontliner', 'Batal')$$, '23514', null, 'action status is enumerated');
select throws_ok($$insert into public.action_items (code, group_name, kind) values ('TST-TL01', 'Coaching Frontliner', 'Harian')$$, '23514', null, 'action kind is Sekali/Rutin');
select throws_ok($$insert into public.action_items (code, group_name, progress) values ('TST-TL01', 'Coaching Frontliner', 101)$$, '23514', null, 'progress is 0..100');
select throws_ok($$insert into public.action_items (code, group_name) values ('TST-TL01', 'SUB')$$, '23514', null, 'group_name is one of the three Garuda groups');
select throws_ok($$insert into public.action_items (code, group_name, aspect) values ('TST-TL01', 'Coaching Frontliner', 'Lainnya')$$, '23514', null, 'aspect is enumerated');
select throws_ok($$insert into public.action_items (code) values ('TST-TL01')$$, '23502', null, 'group_name is required');
select lives_ok(
  $$insert into public.action_items (code, group_name, aspect, kind) values
      ('TST-TL01', 'Coaching Frontliner', 'Fit & Grooming (BMI)', 'Rutin'),
      ('TST-TL02', 'Timeline Training', 'Coaching Coverage', 'Sekali'),
      ('TST-TL03', 'Evaluasi IULS & RUST', 'Remedial', null)$$,
  'the three groups, aspects and kinds are accepted'
);
select is((select row(status, progress)::text from public.action_items where code = 'TST-TL01'), '("Belum Mulai",0)',
  'status defaults to Belum Mulai, progress to 0');

-- remedials
select throws_ok($$insert into public.remedials (staff_code, action) values ('TST-SUB', 'Libur')$$, '23514', null, 'remedial action is enumerated');
select throws_ok($$insert into public.remedials (staff_code, role_play) values ('TST-SUB', 120)$$, '23514', null, 'remedial role_play is 0..100');
select throws_ok($$insert into public.remedials (staff_code, reported) values ('TST-SUB', 'Tidak')$$, '23514', null, 'remedial reported is Ya/Belum');
select throws_ok($$insert into public.remedials (staff_code) values ('NOPE-01')$$, '23503', null, 'remedial staff must exist');
select lives_ok($$insert into public.remedials (staff_code, action, post_test, reported) values ('TST-SUB', 'Refresher + Individual Coaching', 88, 'Ya')$$, 'valid remedial');
select throws_ok($$insert into public.remedials (staff_code) values ('TST-SUB')$$, '23505', null, 'one remedial per staff member');

-- replacements
select throws_ok($$insert into public.replacements (replaced_name, reported) values ('x', 'Tidak')$$, '23514', null, 'reported is Ya/Belum/NULL');
select throws_ok($$insert into public.replacements (replaced_name, final_result) values ('x', 101)$$, '23514', null, 'final_result is 0..100');
select throws_ok($$insert into public.replacements (replaced_name, program) values ('x', 'ABC')$$, '23514', null, 'replacement program is IULS/RUST');
select throws_ok($$insert into public.replacements (replaced_name, staff_code) values ('x', 'NOPE-01')$$, '23503', null, 'replacements.staff_code must be a known staff code');
select lives_ok($$insert into public.replacements (station, staff_code, replaced_name) values ('SUB', 'TST-SUB', 'Dummy A')$$, 'replacement linked to a staff record');
update public.staff set code = 'TST-SUB-R' where code = 'TST-SUB';
select is((select staff_code from public.replacements where replaced_name = 'Dummy A'), 'TST-SUB-R', 'staff code rename cascades to replacements');
select is((select count(*) from public.remedials where staff_code = 'TST-SUB-R'), 1::bigint, 'staff code rename cascades to remedials');
delete from public.staff where code = 'TST-SUB-R';
select is((select row(staff_code, replaced_name)::text from public.replacements where replaced_name = 'Dummy A'), '(,"Dummy A")',
  'deleting the staff record sets replacements.staff_code NULL and keeps the row');
select is((select count(*) from public.remedials where staff_code = 'TST-SUB-R'), 0::bigint, 'deleting the staff record deletes its remedial');

-- settings
select throws_ok($$update public.settings set bmi_periods = 53$$, '23514', null, 'bmi_periods is 1..52');
select throws_ok($$update public.settings set bmi_periods = 0$$, '23514', null, 'bmi_periods is at least 1');
select lives_ok($$update public.settings set bmi_periods = 8$$, 'the number of checks can be raised');
select lives_ok($$update public.settings set bmi_periods = 6$$, 'and lowered again while no check uses the dropped slots');
insert into public.staff (code, station, name) values ('TST-GRD', 'SUB', 'Guard');
insert into public.bmi_checks (staff_code, period, height_cm, weight_kg) values ('TST-GRD', 6, 170, 60);
select throws_ok($$update public.settings set bmi_periods = 5$$, '23514', 'bmi_periods_below_used', 'the number of checks cannot drop below a check that has data (slot 6 is stored)');
select is((select bmi_periods from public.settings), 6::smallint, 'the refused change left the number of checks as it was');
delete from public.staff where code = 'TST-GRD';
select throws_ok($$update public.settings set bmi_interval_months = 0$$, '23514', null, 'bmi_interval_months is 1..12');
select throws_ok($$update public.settings set bmi_normal_max = 30$$, '23514', null, 'BMI thresholds stay ordered');
select throws_ok($$update public.settings set pass_grade = 101$$, '23514', null, 'pass_grade is 0..100');
select throws_ok($$update public.settings set weight_role_play = 40$$, '23514', null, 'weights are fractions 0..1');
select throws_ok($$update public.settings set target_knowledge = 90$$, '23514', null, 'targets are fractions 0..1');
select throws_ok($$update public.settings set target_coverage = 0$$, '23514', null, 'target_coverage is positive');
select throws_ok($$insert into public.settings (id, week1_start, weeks, bmi_first_check, bmi_interval_days, bmi_interval_months,
                     bmi_periods, bmi_underweight_below, bmi_normal_max, bmi_overweight_max, pass_grade, weight_role_play,
                     weight_post_test, target_overweight_max, target_overweight_months, target_knowledge, target_interactive,
                     target_coverage, coverage_done, target_pass_rate, replacement_deadline)
                   select 2, week1_start, weeks, bmi_first_check, bmi_interval_days, bmi_interval_months,
                     bmi_periods, bmi_underweight_below, bmi_normal_max, bmi_overweight_max, pass_grade, weight_role_play,
                     weight_post_test, target_overweight_max, target_overweight_months, target_knowledge, target_interactive,
                     target_coverage, coverage_done, target_pass_rate, replacement_deadline from public.settings$$,
  '23514', null, 'settings is a single row');
select is(
  (select row(week1_start, weeks, bmi_first_check, bmi_interval_days, bmi_interval_months, bmi_periods,
              bmi_underweight_below, bmi_normal_max, bmi_overweight_max, pass_grade, weight_role_play, weight_post_test,
              target_overweight_max, target_overweight_months, target_knowledge, target_interactive,
              target_coverage, coverage_done, target_pass_rate, replacement_deadline)::text
     from public.settings),
  row(date '2026-10-05', 10, date '2026-10-12', 14, 1, 6, 18.5, 25, 27, 85, 0.4, 0.6,
      0.20, 6, 0.90, 0.92, 812, 795, 1.0, date '2026-12-14')::text,
  'settings defaults match the workbook Parameter sheet'
);

-- stations
select is((select count(*) from public.stations), 34::bigint, 'the 22 station codes from sheet Parameter plus the 12 from the cleaned sheet');
select throws_ok($$insert into public.stations (code, sort) values ('KPS', 99)$$, '23514', null, 'KPS is a scope, never a station');
select throws_ok($$insert into public.stations (code, sort) values ('cgk2', 99)$$, '23514', null, 'station codes are 2..5 upper-case letters/digits');

-- share links
select throws_ok($$insert into public.share_links (scope) values ('sub')$$, '23514', null, 'share scope is a station or KPS');
select throws_ok($$insert into public.share_links (scope) values ('ZZZ')$$, '23514', 'share_links_scope_check', 'share scope must be a listed station');
select throws_ok($$insert into public.share_links (token, scope) values ('abc', 'KPS')$$, '23514', null, 'share token must be 48 hex chars');
select lives_ok($$insert into public.share_links (scope) values ('UPG'), ('KPS')$$, 'any listed station or KPS is a valid scope');

-- weekly_reports
select throws_ok($$insert into public.weekly_reports (week, scope) values (21, 'KPS')$$, '23514', null, 'weekly report week is 1..20');
select throws_ok($$insert into public.weekly_reports (week, scope) values (1, 'kps')$$, '23514', null, 'weekly report scope is a station code or KPS');

select * from finish();
rollback;
