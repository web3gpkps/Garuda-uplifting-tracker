-- The first BMI check is the one taken during the Coaching Assessment (screens: "Pengecekan Saat Coaching
-- Assessment"). Its date, height, weight and Komitmen/Target are entered in the Google Sheet only and the
-- screens show them read-only. The app already refuses to save it; this closes the same door in the
-- database, so a branch account, a station link or the owner cannot change it by calling the RPC
-- directly. The Google Sheet sync writes the table itself (service role) and is not affected.

create or replace function public.share_save_check(
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
  -- Period 1 is the Coaching Assessment check: read-only here (set in the Google Sheet).
  if p_period = 1 then
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
