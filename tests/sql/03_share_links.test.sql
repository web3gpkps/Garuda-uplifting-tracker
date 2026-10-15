-- share_open (link workspace) as anon: scope isolation of every array, payload shape, link_labels,
-- national action items, invalid_link; plus the BMI writers share_save_check / share_save_profile.
-- Every row that belongs to a non-SUB station or scope carries the marker XSTN, so a SUB payload
-- must not contain that string anywhere (action items are national and carry no marker).
-- Uses its own fixtures (TST-*); independent of seed.sql.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- ------------------------------------------------------------- fixtures (as postgres)
insert into public.share_links (token, scope, label, revoked_at) values
  (repeat('a1', 24), 'SUB', 'PIC SUB', null),
  (repeat('c3', 24), 'KPS', 'Kantor Pusat', null),
  (repeat('b2', 24), 'SUB', 'SUB dicabut', now()),
  (repeat('d4', 24), 'DPS', 'DPS XSTN', null),
  (repeat('e5', 24), 'CGK', 'CGK XSTN', null);

insert into public.staff
  (code, program, station, name, employee_no, role_play, post_test, report_remark, feedback, notes, bmi_note, sort_order)
values
  ('TST-SUB',  'IULS', 'SUB', 'Dummy A',      'EMP-SUB-1',  80, 90, 'Passed', 'umpan balik sub', 'catatan sub', 'bmi sub', 1),
  ('TST-SUB2', 'RUST', 'SUB', 'Dummy B',      'EMP-SUB-2',  70, 75, 'Failed', null, null, null, 2),
  ('TST-DPS',  'IULS', 'DPS', 'Dummy C XSTN', 'EMP-XSTN-2', 60, 80, 'Failed', 'XSTN', 'XSTN', null, 1),
  ('TST-CGK',  'RUST', 'CGK', 'Dummy D XSTN', 'EMP-XSTN-3', 90, 95, 'Passed', null, 'XSTN', null, 1),
  ('TST-KNO',  'IULS', 'KNO', 'Dummy E XSTN', 'EMP-XSTN-5', 85, 85, 'Passed', null, 'XSTN', null, 1);

insert into public.weekly_scores (staff_code, week, score_grooming, observer, coaching_notes)
select code, 1, 88, 'obs', case when station = 'SUB' then 'coach sub' else 'XSTN' end
  from public.staff where code like 'TST-%';
insert into public.bmi_checks (staff_code, period, check_date, height_cm, weight_kg)
select code, 1, date '2026-10-12', 165, 60 from public.staff where code like 'TST-%';

insert into public.remedials (staff_code, action, notes) values
  ('TST-SUB2', 'Individual Coaching', 'remedial sub'),
  ('TST-DPS',  'Refresher & Remedial Assessment', 'XSTN');

insert into public.action_items (code, group_name, aspect, action, kps_notes, sort_order) values
  ('TST-TL01', 'Coaching Frontliner', 'Product Knowledge', 'tindakan nasional 1', 'catatan garuda', 1),
  ('TST-TL02', 'Timeline Training',   'Remedial',          'tindakan nasional 2', null, 2);

insert into public.replacements (program, station, replaced_name, reason) values
  ('IULS', 'SUB', 'Repl Sub',        'alasan sub'),
  ('IULS', 'DPS', 'Repl Dps XSTN',   'XSTN'),
  ('RUST', 'CGK', 'Repl Cgk XSTN',   'XSTN'),
  ('RUST', null,  'Repl Kosong XSTN', 'XSTN');

insert into public.weekly_reports (week, scope, findings) values
  (1, 'SUB', 'temuan sub'),
  (1, 'DPS', 'XSTN'),
  (1, 'CGK', 'XSTN'),
  (1, 'KPS', 'XSTN kps');

-- Payloads are captured as anon into a temp table, then inspected as postgres.
create temp table _p (pk text primary key, v jsonb);
grant select, insert, update, delete on _p to anon;

-- Writes by other links (as anon) so link_labels has something to resolve.
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;
insert into _p select 'w_dps', public.share_save_profile(repeat('d4', 24), 'TST-DPS', 'L', true, 'XSTN');
insert into _p select 'w_kps', public.share_save_profile(repeat('c3', 24), 'TST-SUB2', 'P', false, 'diisi KPS');
insert into _p select 'w_kps_ai', public.share_update_action_item(repeat('c3', 24), 'TST-TL01', 'On Progress', 40, date '2026-10-12', 'bukti');
insert into _p select 'sub', public.share_open(repeat('a1', 24));
insert into _p select 'cgk', public.share_open(repeat('e5', 24));
insert into _p select 'kps', public.share_open(repeat('c3', 24));
reset role;

-- ------------------------------------------------------------- shape
select is(
  (select array_agg(k order by k collate "C") from _p, jsonb_object_keys(v) k where _p.pk = 'sub'),
  array['action_items', 'bmi_checks', 'label', 'link_id', 'link_labels', 'remedials', 'replacements', 'scope',
        'settings', 'staff', 'stations', 'weekly_reports', 'weekly_scores'],
  'share_open returns the workspace keys'
);
select is((select v ->> 'scope' from _p where pk = 'sub'), 'SUB', 'scope');
select is((select v ->> 'label' from _p where pk = 'sub'), 'PIC SUB', 'label');
select is((select (v ->> 'link_id')::uuid from _p where pk = 'sub'),
          (select id from public.share_links where token = repeat('a1', 24)), 'link_id is the opening link');
select is(
  (select array_agg(k order by k collate "C") from _p, jsonb_object_keys(v -> 'settings') k where _p.pk = 'sub'),
  (select array_agg(column_name::text collate "default" order by column_name::text collate "C") from information_schema.columns
    where table_schema = 'public' and table_name = 'settings'),
  'settings carries every settings column'
);
select is(
  (select array_agg(k order by k collate "C") from _p, jsonb_array_elements(v -> 'staff') e, jsonb_object_keys(e) k
    where _p.pk = 'sub' and e ->> 'code' = 'TST-SUB'),
  (select array_agg(column_name::text collate "default" order by column_name::text collate "C") from information_schema.columns
    where table_schema = 'public' and table_name = 'staff'),
  'staff rows carry every staff column (employee number, baseline, notes included)'
);
select ok(
  not exists (select 1 from _p, jsonb_array_elements(v -> 'weekly_scores') e where e ? 'updated_by')
  and not exists (select 1 from _p, jsonb_array_elements(v -> 'bmi_checks') e where e ? 'updated_by_user'),
  'auth user ids (updated_by, updated_by_user) are never sent to a link'
);

-- ------------------------------------------------------------- SUB: zero non-SUB rows in every array
select ok(strpos((select v::text from _p where pk = 'sub'), 'XSTN') = 0,
  'SUB payload contains no marker from any other station or scope (whole JSON scan)');
select is((select count(*) from _p, jsonb_array_elements(v -> 'stations') e
            where pk = 'sub' and e ->> 'code' <> 'SUB'), 0::bigint, 'stations[]: only SUB');
select is((select count(*) from _p, jsonb_array_elements(v -> 'staff') e
            where pk = 'sub' and e ->> 'station' <> 'SUB'), 0::bigint, 'staff[]: only SUB');
select is((select count(*) from _p, jsonb_array_elements(v -> 'weekly_scores') e
             left join public.staff s on s.code = e ->> 'staff_code'
            where pk = 'sub' and s.station is distinct from 'SUB'), 0::bigint, 'weekly_scores[]: only SUB staff');
select is((select count(*) from _p, jsonb_array_elements(v -> 'bmi_checks') e
             left join public.staff s on s.code = e ->> 'staff_code'
            where pk = 'sub' and s.station is distinct from 'SUB'), 0::bigint, 'bmi_checks[]: only SUB staff');
select is((select count(*) from _p, jsonb_array_elements(v -> 'remedials') e
             left join public.staff s on s.code = e ->> 'staff_code'
            where pk = 'sub' and s.station is distinct from 'SUB'), 0::bigint, 'remedials[]: only SUB staff');
select is((select count(*) from _p, jsonb_array_elements(v -> 'replacements') e
            where pk = 'sub' and e ->> 'station' is distinct from 'SUB'), 0::bigint, 'replacements[]: only SUB');
select is((select count(*) from _p, jsonb_array_elements(v -> 'weekly_reports') e
            where pk = 'sub' and e ->> 'scope' <> 'SUB'), 0::bigint, 'weekly_reports[]: only scope SUB');
select is((select count(*) from _p, jsonb_object_keys(v -> 'link_labels') lk
             left join public.share_links l on l.id = lk::uuid
            where pk = 'sub' and l.scope is distinct from 'SUB' and l.scope is distinct from 'KPS'),
          0::bigint, 'link_labels: only SUB or KPS links');

-- ...and nothing in scope is missing
select is((select jsonb_array_length(v -> 'staff') from _p where pk = 'sub'),
          (select count(*)::int from public.staff where station = 'SUB'), 'staff[]: every SUB staff member');
select is((select jsonb_array_length(v -> 'weekly_scores') from _p where pk = 'sub'),
          (select count(*)::int from public.weekly_scores w join public.staff s on s.code = w.staff_code where s.station = 'SUB'),
          'weekly_scores[]: every SUB row');
select is((select jsonb_array_length(v -> 'bmi_checks') from _p where pk = 'sub'),
          (select count(*)::int from public.bmi_checks c join public.staff s on s.code = c.staff_code where s.station = 'SUB'),
          'bmi_checks[]: every SUB row');
select is((select jsonb_array_length(v -> 'remedials') from _p where pk = 'sub'), 1, 'remedials[]: the SUB remedial');
select is((select jsonb_array_length(v -> 'replacements') from _p where pk = 'sub'),
          (select count(*)::int from public.replacements where station = 'SUB'), 'replacements[]: every SUB row');
select is((select jsonb_array_length(v -> 'weekly_reports') from _p where pk = 'sub'),
          (select count(*)::int from public.weekly_reports where scope = 'SUB'), 'weekly_reports[]: every SUB row');
select is((select v -> 'link_labels' ->> (select id::text from public.share_links where token = repeat('c3', 24)) from _p where pk = 'sub'),
          'Kantor Pusat', 'link_labels resolves the KPS link that edited a SUB row');
select is((select v -> 'link_labels' ->> (select id::text from public.share_links where token = repeat('a1', 24)) from _p where pk = 'sub'),
          'PIC SUB', 'link_labels includes the opening link');

-- ------------------------------------------------------------- action items are national (read for every scope)
select is((select jsonb_array_length(v -> 'action_items') from _p where pk = 'sub'),
          (select count(*)::int from public.action_items), 'SUB link reads every national action item');
select is((select jsonb_array_length(v -> 'action_items') from _p where pk = 'cgk'),
          (select count(*)::int from public.action_items), 'CGK link reads every national action item');
select is((select e ->> 'kps_notes' from _p, jsonb_array_elements(v -> 'action_items') e
            where pk = 'sub' and e ->> 'code' = 'TST-TL01'), 'catatan garuda', 'station links see the Garuda / KPS note read-only');

-- ------------------------------------------------------------- CGK link: own station only
select is((select count(*) from _p, jsonb_array_elements(v -> 'staff') e
            where pk = 'cgk' and e ->> 'station' <> 'CGK'), 0::bigint, 'CGK link: staff only CGK');
select is((select jsonb_array_length(v -> 'staff') from _p where pk = 'cgk'), 1, 'CGK link: its one staff member');
select is((select jsonb_array_length(v -> 'remedials') from _p where pk = 'cgk'), 0, 'CGK link: no other station''s remedials');
select is((select count(*) from _p, jsonb_array_elements(v -> 'replacements') e
            where pk = 'cgk' and e ->> 'station' is distinct from 'CGK'), 0::bigint, 'CGK link: replacements only station CGK');
select is((select count(*) from _p, jsonb_array_elements(v -> 'weekly_reports') e
            where pk = 'cgk' and e ->> 'scope' <> 'CGK'), 0::bigint, 'CGK link: weekly_reports only scope CGK');

-- ------------------------------------------------------------- KPS: everything
select is((select jsonb_array_length(v -> 'stations') from _p where pk = 'kps'),
          (select count(*)::int from public.stations), 'KPS gets every station in the stations table');
select is((select count(distinct e ->> 'station') from _p, jsonb_array_elements(v -> 'staff') e where pk = 'kps'),
          4::bigint, 'KPS sees staff of all 4 fixture stations');
select is((select jsonb_array_length(v -> 'staff') from _p where pk = 'kps'), (select count(*)::int from public.staff), 'KPS: all staff');
select is((select jsonb_array_length(v -> 'weekly_scores') from _p where pk = 'kps'), (select count(*)::int from public.weekly_scores), 'KPS: all weekly scores');
select is((select jsonb_array_length(v -> 'bmi_checks') from _p where pk = 'kps'), (select count(*)::int from public.bmi_checks), 'KPS: all BMI checks');
select is((select jsonb_array_length(v -> 'remedials') from _p where pk = 'kps'), (select count(*)::int from public.remedials), 'KPS: all remedials');
select is((select jsonb_array_length(v -> 'action_items') from _p where pk = 'kps'), (select count(*)::int from public.action_items), 'KPS: all action items');
select is((select jsonb_array_length(v -> 'replacements') from _p where pk = 'kps'), (select count(*)::int from public.replacements), 'KPS: all replacements (incl. no-station rows)');
select is((select jsonb_array_length(v -> 'weekly_reports') from _p where pk = 'kps'), (select count(*)::int from public.weekly_reports), 'KPS: weekly reports of every scope');
select ok((select v -> 'link_labels' ? (select id::text from public.share_links where token = repeat('d4', 24)) from _p where pk = 'kps'),
  'KPS link_labels include the DPS link that edited a DPS row');

-- ------------------------------------------------------------- invalid_link / last_used_at
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;
select throws_ok(format('select public.share_open(%L)', repeat('b2', 24)), 'P0001', 'invalid_link', 'revoked link raises invalid_link');
select throws_ok(format('select public.share_open(%L)', md5(random()::text) || left(md5(random()::text), 16)),
  'P0001', 'invalid_link', 'random token raises invalid_link');
select throws_ok('select public.share_open(null)', 'P0001', 'invalid_link', 'NULL token raises invalid_link');
select throws_ok($$select public.share_open('')$$, 'P0001', 'invalid_link', 'empty token raises invalid_link');
reset role;
select ok((select last_used_at is not null from public.share_links where token = repeat('a1', 24)), 'share_open touches last_used_at');
select ok((select last_used_at is null from public.share_links where token = repeat('b2', 24)), 'a revoked link is never touched');

-- ------------------------------------------------------------- BMI writers
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;
insert into _p select 'chk', public.share_save_check(repeat('a1', 24), 'TST-SUB', 2, date '2026-10-26', 171, 66);
select throws_ok(format('select public.share_save_check(%L, %L, 1, %L, 170, 70)', repeat('a1', 24), 'TST-DPS', '2026-10-12'),
  'P0001', 'out_of_scope', 'SUB link cannot save a DPS staff check');
select throws_ok(format('select public.share_save_check(%L, %L, 1, null, 170, 70)', repeat('a1', 24), 'NOPE-99'),
  'P0001', 'out_of_scope', 'unknown staff code raises out_of_scope');
select throws_ok(format('select public.share_save_check(%L, %L, 1, null, 170, 70)', repeat('b2', 24), 'TST-SUB'),
  'P0001', 'invalid_link', 'revoked link cannot save a check');
select throws_ok(format('select public.share_save_check(%L, %L, 1, %L, 170, 70)', repeat('a1', 24), 'TST-SUB', '2026-10-12'),
  '22023', 'invalid_input', 'a link cannot change the first (Coaching Assessment) check');
select throws_ok(format('select public.share_save_check(%L, %L, 3, null, 300, 60)', repeat('a1', 24), 'TST-SUB'),
  '22023', 'invalid_input', 'height 300 is rejected');
select throws_ok(format('select public.share_save_check(%L, %L, 3, null, 170, 10)', repeat('a1', 24), 'TST-SUB'),
  '22023', 'invalid_input', 'weight 10 is rejected');
select throws_ok(format('select public.share_save_check(%L, %L, 3, null, null, 60)', repeat('a1', 24), 'TST-SUB'),
  '22023', 'invalid_input', 'height missing while weight given is rejected');
select throws_ok(format('select public.share_save_check(%L, %L, 7, null, 170, 60)', repeat('a1', 24), 'TST-SUB'),
  '22023', 'invalid_input', 'slot beyond settings.bmi_periods (6) is rejected');
select is(public.share_save_check(repeat('a1', 24), 'TST-SUB', 4, date '2026-11-23', 170, 85, ' Turun 5 kg dalam 2 bulan ') -> 'row' ->> 'commitment', 'Turun 5 kg dalam 2 bulan',
  'share_save_check stores the commitment of a check above Normal (trimmed)');
select is(public.share_save_check(repeat('a1', 24), 'TST-SUB', 4, date '2026-11-23', 170, 60, 'Turun 5 kg dalam 2 bulan') -> 'row' ->> 'commitment', 'Sudah Ideal',
  'a Normal check is saved as Sudah Ideal whatever was sent');
select throws_ok(format('select public.share_save_check(%L, %L, 4, null, 170, 85, repeat(%L, 501))', repeat('a1', 24), 'TST-SUB', 'x'),
  '22023', 'invalid_input', 'a commitment over 500 characters is rejected');
select is(public.share_save_check(repeat('a1', 24), 'TST-SUB', 4, null, null, null) ->> 'deleted', 'true', 'the scratch check is removed again');
insert into _p select 'chk6', public.share_save_check(repeat('a1', 24), 'TST-SUB', 6, date '2026-12-21', 170, 64);
insert into _p select 'chk_kps', public.share_save_check(repeat('c3', 24), 'TST-KNO', 3, date '2026-11-09', 168, 64);
insert into _p select 'prof', public.share_save_profile(repeat('a1', 24), 'TST-SUB', ' p ', true, '  Perlu cek ulang  ');
select throws_ok(format('select public.share_save_profile(%L, %L, %L, null, null)', repeat('a1', 24), 'TST-DPS', 'L'),
  'P0001', 'out_of_scope', 'SUB link cannot edit a DPS profile');
select throws_ok(format('select public.share_save_profile(%L, %L, %L, null, null)', repeat('a1', 24), 'TST-SUB', 'X'),
  '22023', 'invalid_input', 'gender other than L/P is rejected');
insert into _p select 'chk_del', public.share_save_check(repeat('a1', 24), 'TST-SUB', 2, null, null, null);
reset role;

select is((select v ->> 'deleted' from _p where pk = 'chk'), 'false', 'save_check returns deleted=false');
select is((select (v -> 'row' ->> 'height_cm')::numeric from _p where pk = 'chk'), 171.0, 'save_check returns the stored row');
select is((select (v -> 'row' ->> 'period')::int from _p where pk = 'chk6'), 6, 'slot 6 (the last slot) is accepted');
select ok((select not (v -> 'row' ? 'updated_by_user') from _p where pk = 'chk'), 'save_check row hides updated_by_user');
select is((select (v -> 'row' ->> 'updated_by_link')::uuid from _p where pk = 'chk'),
          (select id from public.share_links where token = repeat('a1', 24)), 'save_check row shows updated_by_link');
select is((select updated_by_link from public.bmi_checks where staff_code = 'TST-KNO' and period = 3),
          (select id from public.share_links where token = repeat('c3', 24)), 'KPS save records the KPS link');
select is((select v -> 'row' ->> 'gender' from _p where pk = 'prof'), 'P', 'save_profile returns the staff row (gender trimmed, upper-cased)');
select is((select row(gender, bmi_has_note, bmi_note, employee_no, notes, role_play)::text from public.staff where code = 'TST-SUB'),
          row('P', true, 'Perlu cek ulang', 'EMP-SUB-1', 'catatan sub', 80::numeric)::text,
          'profile save changes only gender, bmi_has_note and bmi_note');
select is((select bmi_has_note from public.staff where code = 'TST-SUB2'), false, 'bmi_has_note false is stored (monthly cadence)');
select is((select updated_by_link from public.staff where code = 'TST-SUB'),
          (select id from public.share_links where token = repeat('a1', 24)), 'profile save records updated_by_link on staff');
select is((select v from _p where pk = 'chk_del'),
          '{"deleted": true, "row": {"staff_code": "TST-SUB", "period": 2}}'::jsonb, 'both NULL returns the deleted key');
select is((select count(*) from public.bmi_checks where staff_code = 'TST-SUB' and period = 2), 0::bigint, 'both NULL deletes that slot row');
select is((select count(*) from public.bmi_checks where staff_code = 'TST-DPS'), 1::bigint, 'out-of-scope save did not touch DPS data');

-- table-level constraints back up the RPC validation
select throws_ok($$insert into public.bmi_checks (staff_code, period, height_cm, weight_kg) values ('TST-DPS', 4, 300, 60)$$,
  '23514', null, 'table rejects height 300');
select throws_ok($$insert into public.bmi_checks (staff_code, period, height_cm, weight_kg) values ('TST-DPS', 4, 170, 10)$$,
  '23514', null, 'table rejects weight 10');

select * from finish();
rollback;
