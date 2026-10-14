-- 1. The number of BMI checks is no longer capped at the six of the first programme: the owner can
--    raise it (Parameter), and the Google Sheet tab grows with it. Up to 52 checks (two years of
--    checks every two weeks).
-- 2. Touch Point replaces Program on the BMI screens. Besides the five listed touch points a person
--    can have "Other", stored as the text typed (up to 60 characters).
-- 3. The number of checks cannot be lowered below a check that already has data.
--
-- The interval is one number for everyone (bmi_interval_days, 14 = every two weeks). The column
-- bmi_interval_months stays in the table, unused, so existing rows and the replica keep their shape.

alter table public.settings drop constraint settings_bmi_periods_check;
alter table public.settings add constraint settings_bmi_periods_check check (bmi_periods between 1 and 52);

alter table public.bmi_checks drop constraint bmi_checks_period_check;
alter table public.bmi_checks add constraint bmi_checks_period_check check (period between 1 and 52);

alter table public.staff drop constraint staff_touch_point_check;
alter table public.staff add constraint staff_touch_point_check check (
  touch_point is null or (pg_catalog.btrim(touch_point) <> '' and char_length(touch_point) <= 60)
);

-- Lowering bmi_periods below the highest period that has a check would orphan that data (the sheet
-- tab would drop the column). Refuse it; the Parameter form shows the reason.
create or replace function private.settings_guard_bmi_periods()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used smallint;
begin
  if new.bmi_periods < old.bmi_periods then
    select max(c.period) into v_used from public.bmi_checks c;
    if v_used is not null and new.bmi_periods < v_used then
      raise exception using errcode = '23514', message = 'bmi_periods_below_used',
        detail = pg_catalog.format('check %s already has data', v_used);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.settings_guard_bmi_periods() from public, anon, authenticated;

create trigger settings_guard_bmi_periods
  before update of bmi_periods on public.settings
  for each row execute function private.settings_guard_bmi_periods();

-- share_save_staff: touch_point is the five listed values or free text up to 60 characters.
create or replace function public.share_save_staff(
  p_token             text,
  p_code              text,
  p_program           text,
  p_provider          text,
  p_station           text,
  p_name              text,
  p_employee_no       text,
  p_gender            text,
  p_touch_point       text,
  p_assignment_status text,
  p_notes             text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link    public.share_links;
  v_old     public.staff;
  v_program text := pg_catalog.upper(private.share_clean(p_program));
  v_station text := pg_catalog.upper(private.share_clean(p_station));
  v_name    text := private.share_clean(p_name);
  v_gender  text := pg_catalog.upper(private.share_clean(p_gender));
  v_touch   text := private.share_clean(p_touch_point);
  v_status  text := private.share_clean(p_assignment_status);
  v_code    text;
  v_n       integer;
  v_row     public.staff;
begin
  v_link := private.share_begin_write(p_token);

  if p_code is not null then
    v_old := private.share_scope_staff(v_link.scope, p_code);
    v_station := coalesce(v_station, v_old.station);
    v_status := coalesce(v_status, v_old.assignment_status);
  else
    v_station := coalesce(v_station, case when v_link.scope <> 'KPS' then v_link.scope end);
    v_status := coalesce(v_status, 'Aktif');
  end if;

  if v_station is null then
    perform private.share_fail('invalid_input', 'station');
  end if;
  if v_link.scope <> 'KPS' and v_station <> v_link.scope then
    perform private.share_fail('out_of_scope');
  end if;
  if not exists (select 1 from public.stations s where s.code = v_station) then
    perform private.share_fail('invalid_input', 'station');
  end if;
  if v_name is null then
    perform private.share_fail('invalid_input', 'name');
  end if;
  perform private.share_check_in(v_program, array['IULS', 'RUST'], 'program');
  perform private.share_check_in(v_gender, array['L', 'P'], 'gender');
  perform private.share_check_text(v_touch, 'touch_point', 60);
  perform private.share_check_in(v_status,
    array['Aktif', 'Remedial', 'Individual Coaching', 'Ditarik dari layanan'], 'assignment_status');
  perform private.share_check_text(v_name, 'name', 200);
  perform private.share_check_text(p_provider, 'provider', 100);
  perform private.share_check_text(p_employee_no, 'employee_no', 50);
  perform private.share_check_text(p_notes, 'notes');

  if p_code is null then
    -- Serialise code generation so two concurrent inserts can't pick the same TMB number.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('tracker.staff.tmb_code'));
    select coalesce(max(pg_catalog.substring(s.code, '^TMB-([0-9]+)$')::integer), 0) + 1
      into v_n
      from public.staff s
     where s.code ~ '^TMB-[0-9]+$';
    v_code := 'TMB-' || case when v_n < 10 then '0' else '' end || v_n::text;

    insert into public.staff (code, program, provider, station, name, employee_no, gender, touch_point,
                              assignment_status, notes, sort_order)
    values (v_code, v_program, private.share_clean(p_provider), v_station, v_name,
            private.share_clean(p_employee_no), v_gender, v_touch, v_status, private.share_clean(p_notes),
            (select coalesce(max(s.sort_order), 0) + 1 from public.staff s))
    returning * into v_row;
  else
    update public.staff s
       set program = v_program, provider = private.share_clean(p_provider), station = v_station,
           name = v_name, employee_no = private.share_clean(p_employee_no), gender = v_gender,
           touch_point = v_touch, assignment_status = v_status, notes = private.share_clean(p_notes)
     where s.code = p_code
    returning * into v_row;
  end if;

  perform private.share_end_write();
  return pg_catalog.jsonb_build_object('deleted', false, 'row', pg_catalog.to_jsonb(v_row));
end;
$$;
