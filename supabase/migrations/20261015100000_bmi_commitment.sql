-- Komitmen/Target: a note per BMI check for the person who is not in the Normal category (for
-- example a weight target). When the check is Normal the column holds the fixed text
-- 'Sudah Ideal', set by the database itself so it is the same whoever wrote the check: the app, an
-- owner, or the Google Sheet sync. The column is the sixth of each check's group in the sheet tab.
--
-- The category is decided exactly as lib/rules.ts does it: BMI = weight / (height/100)^2 rounded to
-- one decimal, then below bmi_underweight_below is Kurus, up to bmi_normal_max is Normal, and so on.

alter table public.bmi_checks add column commitment text;
alter table public.bmi_checks add constraint bmi_checks_commitment_check check (
  commitment is null or (pg_catalog.btrim(commitment) <> '' and char_length(commitment) <= 500)
);

create or replace function private.bmi_check_commitment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_under  numeric;
  v_normal numeric;
  v_bmi    numeric;
begin
  select s.bmi_underweight_below, s.bmi_normal_max into v_under, v_normal from public.settings s where s.id = 1;
  if v_under is null then
    return new;
  end if;
  v_bmi := pg_catalog.round(new.weight_kg / pg_catalog.power(new.height_cm / 100.0, 2), 1);
  if v_bmi >= v_under and v_bmi <= v_normal then
    new.commitment := 'Sudah Ideal';
  elsif new.commitment = 'Sudah Ideal' then
    new.commitment := null;
  end if;
  return new;
end;
$$;

revoke all on function private.bmi_check_commitment() from public, anon, authenticated;

create trigger bmi_checks_commitment
  before insert or update on public.bmi_checks
  for each row execute function private.bmi_check_commitment();

-- Existing checks: the Normal ones get their 'Sudah Ideal' without touching who changed them last.
alter table public.bmi_checks disable trigger bmi_checks_set_updated_at;
alter table public.bmi_checks disable trigger bmi_checks_stamp_author;
update public.bmi_checks set commitment = commitment;
alter table public.bmi_checks enable trigger bmi_checks_set_updated_at;
alter table public.bmi_checks enable trigger bmi_checks_stamp_author;

-- share_save_check with the commitment. It replaces the six-argument version; p_commitment defaults to
-- NULL, so a deployed app that does not know the column keeps working (its saves carry no commitment).
drop function public.share_save_check(text, text, integer, date, numeric, numeric);

create function public.share_save_check(
  p_token      text,
  p_staff_code text,
  p_period     integer,
  p_check_date date,
  p_height_cm  numeric,
  p_weight_kg  numeric,
  p_commitment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link       public.share_links;
  v_periods    smallint;
  v_commitment text := private.share_clean(p_commitment);
  v_row        public.bmi_checks;
begin
  v_link := private.share_begin_write(p_token);
  perform private.share_scope_staff(v_link.scope, p_staff_code);

  select t.bmi_periods into v_periods from public.settings t where t.id = 1;
  if p_period is null or p_period < 1 or p_period > coalesce(v_periods, 12) then
    perform private.share_fail('invalid_input', 'period');
  end if;

  if p_height_cm is null and p_weight_kg is null then
    delete from public.bmi_checks c
     where c.staff_code = p_staff_code and c.period = p_period;
    perform private.share_end_write();
    return pg_catalog.jsonb_build_object('deleted', true,
      'row', pg_catalog.jsonb_build_object('staff_code', p_staff_code, 'period', p_period));
  end if;

  if p_height_cm is null or p_height_cm < 120 or p_height_cm > 210 then
    perform private.share_fail('invalid_input', 'height_cm');
  end if;
  if p_weight_kg is null or p_weight_kg < 30 or p_weight_kg > 200 then
    perform private.share_fail('invalid_input', 'weight_kg');
  end if;
  perform private.share_check_text(v_commitment, 'commitment', 500);

  insert into public.bmi_checks (staff_code, period, check_date, height_cm, weight_kg, commitment)
  values (p_staff_code, p_period, p_check_date, p_height_cm, p_weight_kg, v_commitment)
  on conflict (staff_code, period) do update
    set check_date = excluded.check_date,
        height_cm  = excluded.height_cm,
        weight_kg  = excluded.weight_kg,
        commitment = excluded.commitment
  returning * into v_row;

  perform private.share_end_write();
  return pg_catalog.jsonb_build_object('deleted', false, 'row', pg_catalog.to_jsonb(v_row) - 'updated_by_user');
end;
$$;

revoke all on function public.share_save_check(text, text, integer, date, numeric, numeric, text) from public, anon, authenticated;
grant execute on function public.share_save_check(text, text, integer, date, numeric, numeric, text) to anon, authenticated;
