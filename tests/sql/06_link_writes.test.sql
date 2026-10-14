-- Link write RPCs, called as anon: in-scope success, cross-station writes (out_of_scope),
-- KPS-only functions from station links (forbidden_field), national action items (KPS only),
-- remedial and replacement scoping, validation (invalid_input + DETAIL), revoked links
-- (invalid_link), and updated_by_link attribution. Uses its own fixtures (TST-*).
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- ------------------------------------------------------------- fixtures (as postgres)
insert into public.share_links (token, scope, label, revoked_at) values
  (repeat('a1', 24), 'SUB', 'PIC SUB', null),
  (repeat('c3', 24), 'KPS', 'Kantor Pusat', null),
  (repeat('b2', 24), 'SUB', 'SUB dicabut', now()),
  (repeat('e5', 24), 'CGK', 'PIC CGK', null);

insert into public.staff (code, program, station, name, role_play, post_test, report_remark, notes) values
  ('TST-SUB',  'IULS', 'SUB', 'Dummy A', 70, 80, 'Failed', 'catatan'),
  ('TST-SUB2', 'RUST', 'SUB', 'Dummy B', 90, 90, 'Passed', null),
  ('TST-DPS',  'IULS', 'DPS', 'Dummy C', 60, 70, 'Failed', null),
  ('TST-CGK',  'RUST', 'CGK', 'Dummy D', 80, 80, 'Failed', null);

insert into public.action_items (code, group_name, aspect, action, kps_notes, sort_order) values
  ('TST-TL01', 'Coaching Frontliner', 'Product Knowledge', 'tindakan', 'catatan garuda', 1);

insert into public.remedials (staff_code, action) values ('TST-DPS', 'Individual Coaching');
insert into public.replacements (program, station, replaced_name) values ('IULS', 'DPS', 'Repl Dps');

create temp table _r (pk text primary key, v jsonb);
grant select, insert, update, delete on _r to anon;
create temp table _ids (k text primary key, id bigint);
grant select, insert on _ids to anon;
insert into _ids select 'dps', id from public.replacements where replaced_name = 'Repl Dps';

set local request.jwt.claims = '{"role":"anon"}';
set local role anon;

-- ------------------------------------------------------------- weekly scores
insert into _r select 'ws', public.share_save_weekly_score(repeat('a1', 24), 'TST-SUB', 1, 'Check-in Counter',
  86, 92.5, 90, 88, 'GA Miles', ' Observer Satu ', 'catatan coaching');
insert into _r select 'ws_kps', public.share_save_weekly_score(repeat('c3', 24), 'TST-DPS', 1, null, 80, null, null, null, null, null, null);
select throws_ok(format('select public.share_save_weekly_score(%L, %L, 1, null, 80, null, null, null, null, null, null)', repeat('a1', 24), 'TST-DPS'),
  'P0001', 'out_of_scope', 'weekly score: SUB link cannot score DPS staff');
select throws_ok(format('select public.share_save_weekly_score(%L, %L, 2, null, 101, null, null, null, null, null, null)', repeat('a1', 24), 'TST-SUB'),
  '22023', 'invalid_input', 'weekly score: score 101 rejected');
select throws_ok(format('select public.share_save_weekly_score(%L, %L, 2, null, null, null, -1, null, null, null, null)', repeat('a1', 24), 'TST-SUB'),
  '22023', 'invalid_input', 'weekly score: score -1 rejected');
select throws_ok(format('select public.share_save_weekly_score(%L, %L, 11, null, 80, null, null, null, null, null, null)', repeat('a1', 24), 'TST-SUB'),
  '22023', 'invalid_input', 'weekly score: week beyond settings.weeks rejected');
select throws_ok(format('select public.share_save_weekly_score(%L, %L, 0, null, 80, null, null, null, null, null, null)', repeat('a1', 24), 'TST-SUB'),
  '22023', 'invalid_input', 'weekly score: week 0 rejected');
select throws_ok(format('select public.share_save_weekly_score(%L, %L, 2, %L, 80, null, null, null, null, null, null)', repeat('a1', 24), 'TST-SUB', 'Lounge'),
  '22023', 'invalid_input', 'weekly score: unknown touch point rejected');
select throws_ok(format('select public.share_save_weekly_score(%L, %L, 2, null, 80, null, null, null, null, null, null)', repeat('b2', 24), 'TST-SUB'),
  'P0001', 'invalid_link', 'weekly score: revoked link rejected');
insert into _r select 'ws_tmp', public.share_save_weekly_score(repeat('a1', 24), 'TST-SUB', 3, null, 70, null, null, null, null, null, null);
insert into _r select 'ws_del', public.share_save_weekly_score(repeat('a1', 24), 'TST-SUB', 3, ' ', null, null, null, null, '', null, '   ');

-- ------------------------------------------------------------- action items: national, KPS only
select throws_ok(format('select public.share_update_action_item(%L, %L, %L, 50, null, null)', repeat('a1', 24), 'TST-TL01', 'On Progress'),
  'P0001', 'forbidden_field', 'action item: a station link cannot update progress');
select throws_ok(format('select public.share_kps_update_action_item(%L, %L, %L, null, null, null, null, null, null, null, null, %L, null)',
  repeat('a1', 24), 'TST-TL01', 'Coaching Frontliner', 'diubah stasiun'),
  'P0001', 'forbidden_field', 'action item: a station link cannot change definitions or the Garuda / KPS note');
insert into _r select 'ai', public.share_update_action_item(repeat('c3', 24), 'TST-TL01', 'On Progress', 60, date '2026-10-14', ' foto ');
select throws_ok(format('select public.share_update_action_item(%L, %L, %L, 50, null, null)', repeat('c3', 24), 'NOPE', 'On Progress'),
  'P0001', 'out_of_scope', 'action item: unknown code is out_of_scope');
select throws_ok(format('select public.share_update_action_item(%L, %L, %L, 50, null, null)', repeat('c3', 24), 'TST-TL01', 'Batal'),
  '22023', 'invalid_input', 'action item: unknown status rejected');
select throws_ok(format('select public.share_update_action_item(%L, %L, %L, 101, null, null)', repeat('c3', 24), 'TST-TL01', 'Selesai'),
  '22023', 'invalid_input', 'action item: progress 101 rejected');
insert into _r select 'ai_def', public.share_kps_update_action_item(repeat('c3', 24), 'TST-TL01', 'Timeline Training', 'Remedial',
  'akar', 'tindakan baru', 'target', 'Rutin', 'mingguan', date '2026-10-30', 'PIC Garuda', 'catatan KPS', 'Slide 27');
select throws_ok(format('select public.share_kps_update_action_item(%L, %L, null, null, null, null, null, %L, null, null, null, null, null)',
  repeat('c3', 24), 'TST-TL01', 'Harian'), '22023', 'invalid_input', 'action item: bad kind rejected');
select throws_ok(format('select public.share_kps_update_action_item(%L, %L, null, %L, null, null, null, null, null, null, null, null, null)',
  repeat('c3', 24), 'TST-TL01', 'Lainnya'), '22023', 'invalid_input', 'action item: bad aspect rejected');

-- ------------------------------------------------------------- remedials
insert into _r select 'rm', public.share_save_remedial(repeat('a1', 24), 'TST-SUB', 'Individual Coaching', date '2026-10-20', 85, 90, 'Belum', ' catatan ');
select throws_ok(format('select public.share_save_remedial(%L, %L, %L, null, null, null, null, null)', repeat('a1', 24), 'TST-DPS', 'Individual Coaching'),
  'P0001', 'out_of_scope', 'remedial: SUB link cannot write a DPS remedial');
select throws_ok(format('select public.share_delete_remedial(%L, %L)', repeat('a1', 24), 'TST-DPS'),
  'P0001', 'out_of_scope', 'remedial: SUB link cannot delete a DPS remedial');
select throws_ok(format('select public.share_save_remedial(%L, %L, %L, null, null, null, null, null)', repeat('a1', 24), 'TST-SUB2', 'Libur'),
  '22023', 'invalid_input', 'remedial: action is enumerated');
select throws_ok(format('select public.share_save_remedial(%L, %L, null, null, 120, null, null, null)', repeat('a1', 24), 'TST-SUB2'),
  '22023', 'invalid_input', 'remedial: role_play 0..100');
select throws_ok(format('select public.share_save_remedial(%L, %L, null, null, null, null, %L, null)', repeat('a1', 24), 'TST-SUB2', 'Tidak'),
  '22023', 'invalid_input', 'remedial: reported is Ya/Belum');
insert into _r select 'rm2', public.share_save_remedial(repeat('a1', 24), 'TST-SUB2', 'Refresher & Remedial Assessment', null, null, null, null, null);
insert into _r select 'rm2_del', public.share_delete_remedial(repeat('a1', 24), 'TST-SUB2');
insert into _r select 'rm_kps', public.share_save_remedial(repeat('c3', 24), 'TST-DPS', 'Individual Coaching', null, 90, 92, 'Ya', null);

-- ------------------------------------------------------------- replacements
insert into _r select 'rp', public.share_save_replacement(repeat('a1', 24), null, null, null, 'TST-SUB', null, 'mutasi', date '2026-10-10',
  'Dummy Pengganti', date '2026-10-15', null, null, null, null, null);
select throws_ok(format('select public.share_save_replacement(%L, null, null, %L, null, %L, null, null, null, null, null, null, null, null, null)', repeat('a1', 24), 'DPS', 'x'),
  'P0001', 'out_of_scope', 'replacement: SUB link cannot add a DPS row');
select throws_ok(format('select public.share_save_replacement(%L, null, null, null, %L, null, null, null, null, null, null, null, null, null, null)', repeat('a1', 24), 'TST-DPS'),
  'P0001', 'out_of_scope', 'replacement: SUB link cannot link a DPS staff member');
select throws_ok(format('select public.share_save_replacement(%L, %s, null, null, null, %L, null, null, null, null, null, null, null, null, null)', repeat('a1', 24), (select id from _ids where k = 'dps'), 'x'),
  'P0001', 'out_of_scope', 'replacement: SUB link cannot edit a DPS row');
select throws_ok(format('select public.share_delete_replacement(%L, %s)', repeat('a1', 24), (select id from _ids where k = 'dps')),
  'P0001', 'out_of_scope', 'replacement: SUB link cannot delete a DPS row');
select throws_ok(format('select public.share_delete_replacement(%L, 999999)', repeat('a1', 24)),
  'P0001', 'out_of_scope', 'replacement: unknown id is out_of_scope');
select throws_ok(format('select public.share_save_replacement(%L, null, null, null, null, null, null, null, null, null, null, null, null, null, null)', repeat('a1', 24)),
  '22023', 'invalid_input', 'replacement: name required');
select throws_ok(format('select public.share_save_replacement(%L, null, null, null, null, %L, null, null, null, null, null, null, null, %L, null)', repeat('a1', 24), 'x', 'Tidak'),
  '22023', 'invalid_input', 'replacement: reported must be Ya/Belum');
select throws_ok(format('select public.share_save_replacement(%L, null, null, null, null, %L, null, null, null, null, null, 101, null, null, null)', repeat('a1', 24), 'x'),
  '22023', 'invalid_input', 'replacement: post_test 0..100');
select throws_ok(format('select public.share_save_replacement(%L, null, %L, null, null, %L, null, null, null, null, null, null, null, null, null)', repeat('a1', 24), 'ABC', 'x'),
  '22023', 'invalid_input', 'replacement: program is IULS/RUST');
select throws_ok(format('select public.share_save_replacement(%L, null, null, %L, %L, null, null, null, null, null, null, null, null, null, null)', repeat('c3', 24), 'SUB', 'TST-DPS'),
  '22023', 'invalid_input', 'replacement: KPS cannot link a staff member of another station');
select throws_ok(format('select public.share_save_replacement(%L, null, null, %L, null, %L, null, null, null, null, null, null, null, null, null)', repeat('c3', 24), 'ZZZ', 'x'),
  '22023', 'invalid_input', 'replacement: KPS unknown station rejected');
insert into _r select 'rp_kps', public.share_save_replacement(repeat('c3', 24), null, null, null, 'TST-CGK', null, null, null, null, null, null, null, null, null, null);
insert into _r select 'rp_del', public.share_delete_replacement(repeat('c3', 24), (select id from _ids where k = 'dps'));

-- ------------------------------------------------------------- staff
insert into _r select 'st_new', public.share_save_staff(repeat('a1', 24), null, 'iuls', 'Gapura', null, 'Dummy Baru', 'EMP-9', 'p', 'Boarding Gate', null, null);
insert into _r select 'st_new2', public.share_save_staff(repeat('a1', 24), null, null, null, 'SUB', 'Dummy Baru Dua', null, null, null, null, null);
insert into _r select 'st_upd', public.share_save_staff(repeat('a1', 24), 'TST-SUB', 'IULS', null, null, 'Dummy A', null, 'L', null, 'Remedial', 'catatan baru');
select throws_ok(format('select public.share_save_staff(%L, null, null, null, %L, %L, null, null, null, null, null)', repeat('a1', 24), 'DPS', 'x'),
  'P0001', 'out_of_scope', 'staff: SUB link cannot add staff to DPS');
select throws_ok(format('select public.share_save_staff(%L, %L, null, null, null, %L, null, null, null, null, null)', repeat('a1', 24), 'TST-DPS', 'x'),
  'P0001', 'out_of_scope', 'staff: SUB link cannot edit DPS staff');
select throws_ok(format('select public.share_save_staff(%L, %L, null, null, %L, %L, null, null, null, null, null)', repeat('a1', 24), 'TST-SUB', 'DPS', 'Dummy A'),
  'P0001', 'out_of_scope', 'staff: SUB link cannot move its staff to another station');
select throws_ok(format('select public.share_save_staff(%L, null, null, null, null, %L, null, null, null, null, null)', repeat('a1', 24), ' '),
  '22023', 'invalid_input', 'staff: name required');
select throws_ok(format('select public.share_save_staff(%L, null, null, null, null, %L, null, %L, null, null, null)', repeat('a1', 24), 'x', 'X'),
  '22023', 'invalid_input', 'staff: gender must be L/P');
select throws_ok(format('select public.share_save_staff(%L, null, null, null, null, %L, null, null, null, %L, null)', repeat('a1', 24), 'x', 'Cuti'),
  '22023', 'invalid_input', 'staff: assignment_status is enumerated');
select throws_ok(format('select public.share_save_staff(%L, null, null, null, null, %L, null, null, %L, null, null)', repeat('a1', 24), 'x', repeat('t', 61)),
  '22023', 'invalid_input', 'staff: touch_point is at most 60 characters');
insert into _r select 'st_other', public.share_save_staff(repeat('a1', 24), null, null, null, null, 'Dummy Other', null, null, '  Lounge VIP  ', null, null);
select throws_ok(format('select public.share_save_staff(%L, null, null, null, null, %L, null, null, null, null, null)', repeat('c3', 24), 'x'),
  '22023', 'invalid_input', 'staff: KPS must name a station on insert');
insert into _r select 'st_kps_move', public.share_save_staff(repeat('c3', 24), 'TST-SUB2', null, null, 'KNO', 'Dummy B', null, null, null, null, null);

-- ------------------------------------------------------------- staff training baseline (KPS only)
select throws_ok(format('select public.share_kps_save_staff_baseline(%L, %L, 90, null, null, null)', repeat('a1', 24), 'TST-SUB'),
  'P0001', 'forbidden_field', 'baseline: station link gets forbidden_field (DETAIL role_play)');
select throws_ok(format('select public.share_kps_save_staff_baseline(%L, %L, null, null, %L, null)', repeat('a1', 24), 'TST-SUB', 'Passed'),
  'P0001', 'forbidden_field', 'baseline: station link setting the remark gets forbidden_field');
insert into _r select 'bl', public.share_kps_save_staff_baseline(repeat('c3', 24), 'TST-SUB', 88, 92, ' Passed ', 'umpan balik');
select throws_ok(format('select public.share_kps_save_staff_baseline(%L, %L, 101, null, null, null)', repeat('c3', 24), 'TST-SUB'),
  '22023', 'invalid_input', 'baseline: role_play 0..100');
select throws_ok(format('select public.share_kps_save_staff_baseline(%L, %L, null, null, %L, null)', repeat('c3', 24), 'TST-SUB', 'Lulus'),
  '22023', 'invalid_input', 'baseline: remark is Passed/Failed');
select throws_ok(format('select public.share_kps_save_staff_baseline(%L, %L, 80, null, null, null)', repeat('c3', 24), 'NOPE-1'),
  'P0001', 'out_of_scope', 'baseline: unknown staff is out_of_scope');

-- ------------------------------------------------------------- weekly report (own scope)
insert into _r select 'wr', public.share_save_weekly_report(repeat('a1', 24), 1, ' temuan SUB ');
insert into _r select 'wr_kps', public.share_save_weekly_report(repeat('c3', 24), 1, 'temuan KPS');
select throws_ok(format('select public.share_save_weekly_report(%L, 11, %L)', repeat('a1', 24), 'x'),
  '22023', 'invalid_input', 'weekly report: week beyond settings.weeks rejected');
insert into _r select 'wr_tmp', public.share_save_weekly_report(repeat('a1', 24), 2, 'sementara');
insert into _r select 'wr_del', public.share_save_weekly_report(repeat('a1', 24), 2, '   ');
reset role;

-- ------------------------------------------------------------- results (as postgres)
create temp table _links as select scope, label, id from public.share_links;
create function pg_temp.link(p_label text) returns uuid language sql as $$ select id from _links where label = p_label $$;

select is((select v -> 'row' ->> 'observer' from _r where pk = 'ws'), 'Observer Satu', 'weekly score: returns the stored row (observer trimmed)');
select ok((select not (v -> 'row' ? 'updated_by') from _r where pk = 'ws'), 'weekly score: row hides updated_by');
select is((select row(score_knowledge, updated_by_link, updated_by)::text from public.weekly_scores where staff_code = 'TST-SUB' and week = 1),
          row(92.5, pg_temp.link('PIC SUB'), null::uuid)::text, 'weekly score: stored, attributed to the SUB link, updated_by NULL');
select is((select updated_by_link from public.weekly_scores where staff_code = 'TST-DPS' and week = 1), pg_temp.link('Kantor Pusat'),
  'weekly score: KPS can score any station');
select is((select v from _r where pk = 'ws_del'), '{"deleted": true, "row": {"staff_code": "TST-SUB", "week": 3}}'::jsonb,
  'weekly score: all empty returns the deleted key');
select is((select count(*) from public.weekly_scores where staff_code = 'TST-SUB' and week = 3), 0::bigint, 'weekly score: all empty deletes the row');
select is((select count(*) from public.weekly_scores where staff_code = 'TST-DPS'), 1::bigint, 'weekly score: only the KPS row exists for DPS');

select is((select row(status, progress, evidence, updated_by_link)::text from public.action_items where code = 'TST-TL01'),
          row('On Progress', 60, 'foto', pg_temp.link('Kantor Pusat'))::text, 'action item: KPS progress update written and attributed');
select is((select row(group_name, aspect, kind, due_date, pic, kps_notes, source)::text from public.action_items where code = 'TST-TL01'),
          row('Timeline Training', 'Remedial', 'Rutin', date '2026-10-30', 'PIC Garuda', 'catatan KPS', 'Slide 27')::text,
          'action item: definitions and the Garuda / KPS note written by KPS');

select is((select row(action, role_play, post_test, reported, notes, updated_by_link)::text from public.remedials where staff_code = 'TST-SUB'),
          row('Individual Coaching', 85::numeric, 90::numeric, 'Belum', 'catatan', pg_temp.link('PIC SUB'))::text,
          'remedial: SUB link writes its own staff member''s remedial, attributed');
select is((select v from _r where pk = 'rm2_del'), '{"deleted": true, "row": {"staff_code": "TST-SUB2"}}'::jsonb, 'remedial: delete returns the key');
select is((select count(*) from public.remedials where staff_code = 'TST-SUB2'), 0::bigint, 'remedial: SUB link deleted its own remedial');
select is((select row(post_test, updated_by_link)::text from public.remedials where staff_code = 'TST-DPS'),
          row(92::numeric, pg_temp.link('Kantor Pusat'))::text, 'remedial: KPS writes any station, the out-of-scope attempts changed nothing');

select is((select row(station, program, replaced_name, updated_by_link)::text from public.replacements where replacement_name = 'Dummy Pengganti'),
          row('SUB', 'IULS', 'Dummy A', pg_temp.link('PIC SUB'))::text,
          'replacement: station forced to SUB, program and name from the linked staff member, attributed');
select ok((select sort_order is not null from public.replacements where replacement_name = 'Dummy Pengganti'), 'replacement: new rows get a sort_order');
select is((select (v -> 'row' ->> 'station') from _r where pk = 'rp_kps'), 'CGK', 'replacement: KPS row takes station from the linked staff member');
select is((select count(*) from public.replacements where replaced_name = 'Repl Dps'), 0::bigint, 'replacement: KPS deleted the DPS row');

select ok((select v -> 'row' ->> 'code' ~ '^TMB-[0-9]{2,}$' from _r where pk = 'st_new'), 'staff: new staff gets the next TMB-xx code');
select is((select row(program, station, gender, touch_point, assignment_status)::text from public.staff where code = (select v -> 'row' ->> 'code' from _r where pk = 'st_new')),
          row('IULS', 'SUB', 'P', 'Boarding Gate', 'Aktif')::text, 'staff: insert defaults to the link station and Aktif, normalises case');
select isnt((select v -> 'row' ->> 'code' from _r where pk = 'st_new2'), (select v -> 'row' ->> 'code' from _r where pk = 'st_new'),
  'staff: a second insert gets a different TMB code');
select is((select row(assignment_status, notes, role_play, updated_by_link)::text from public.staff where code = 'TST-SUB'),
          row('Remedial', 'catatan baru', 88::numeric, pg_temp.link('Kantor Pusat'))::text,
          'staff: SUB update kept the KPS-only baseline; KPS wrote it last');
select is((select station from public.staff where code = 'TST-SUB2'), 'KNO', 'staff: KPS may move staff to another station');

select is((select row(role_play, post_test, report_remark, feedback)::text from public.staff where code = 'TST-SUB'),
          row(88::numeric, 92::numeric, 'Passed', 'umpan balik')::text, 'baseline: written by KPS (remark trimmed)');

select is((select row(findings, updated_by_link)::text from public.weekly_reports where week = 1 and scope = 'SUB'),
          row('temuan SUB', pg_temp.link('PIC SUB'))::text, 'weekly report: SUB row in its own scope, trimmed, attributed');
select is((select findings from public.weekly_reports where week = 1 and scope = 'KPS'), 'temuan KPS', 'weekly report: KPS writes the KPS row');
select is((select count(*) from public.weekly_reports where week = 2), 0::bigint, 'weekly report: blank findings deletes the row');

select is((select touch_point from public.staff where code = (select v -> 'row' ->> 'code' from _r where pk = 'st_other')), 'Lounge VIP',
  'staff: touch_point accepts free text ("Other"), trimmed');

select * from finish();
rollback;
