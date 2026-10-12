-- Link workspace RPCs. Every share_* function:
--   SECURITY DEFINER, search_path = '', token first, scope checked in SQL, EXECUTE for anon + authenticated.
-- Scope: a station code = that station only; KPS = everything. Action items are national: every
-- scope reads them, only KPS writes them.
-- Owner path: p_token NULL or blank AND public.is_admin() -> scope KPS, no link id, label 'Pemilik'.
--
-- Errors (message is the contract):
--   invalid_link    P0001  unknown, malformed or revoked token
--   out_of_scope    P0001  target row is outside the link's scope, or does not exist
--   forbidden_field P0001  KPS-only function called by a station link; DETAIL = field
--   invalid_input   22023  bad argument; DETAIL = field
--
-- Write RPCs return {"deleted": false, "row": {...}} with the row exactly as share_open lists it,
-- or {"deleted": true, "row": {<key columns>}}.

-- ================================================================== internal helpers
create or replace function private.share_fail(p_message text, p_detail text default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_code text := case when p_message = 'invalid_input' then '22023' else 'P0001' end;
begin
  if p_detail is null then
    raise exception using errcode = v_code, message = p_message;
  end if;
  raise exception using errcode = v_code, message = p_message, detail = p_detail;
end;
$$;

create or replace function private.share_resolve_link(p_token text)
returns public.share_links
language plpgsql
set search_path = ''
as $$
declare
  v_link public.share_links;
begin
  if nullif(pg_catalog.btrim(p_token), '') is null then
    if public.is_admin() then
      v_link.scope := 'KPS';
      v_link.label := 'Pemilik';
      return v_link;
    end if;
    raise exception using errcode = 'P0001', message = 'invalid_link';
  end if;

  select l.* into v_link
    from public.share_links l
   where l.token = pg_catalog.lower(pg_catalog.btrim(p_token))
     and l.revoked_at is null;

  if not found then
    raise exception using errcode = 'P0001', message = 'invalid_link';
  end if;

  update public.share_links l
     set last_used_at = pg_catalog.now()
   where l.id = v_link.id;

  return v_link;
end;
$$;

-- Resolve the link and mark this transaction so the attribution triggers record updated_by_link
-- (owner: '' so they record NULL). Always pair with private.share_end_write().
create or replace function private.share_begin_write(p_token text)
returns public.share_links
language plpgsql
set search_path = ''
as $$
declare
  v_link public.share_links;
begin
  v_link := private.share_resolve_link(p_token);
  perform pg_catalog.set_config('tracker.share_link_id', coalesce(v_link.id::text, ''), true);
  return v_link;
end;
$$;

create or replace function private.share_end_write()
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.set_config('tracker.share_link_id', '', true);
end;
$$;

create or replace function private.share_scope_stations(p_scope text)
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(pg_catalog.array_agg(s.code order by s.sort), '{}')
    from public.stations s
   where p_scope = 'KPS' or s.code = p_scope;
$$;

-- The staff row if it is in scope; otherwise out_of_scope (also for unknown codes: no existence leak).
create or replace function private.share_scope_staff(p_scope text, p_code text)
returns public.staff
language plpgsql
set search_path = ''
as $$
declare
  v_staff public.staff;
begin
  select s.* into v_staff
    from public.staff s
   where s.code = p_code
     and (p_scope = 'KPS' or s.station = p_scope);
  if not found then
    perform private.share_fail('out_of_scope');
  end if;
  return v_staff;
end;
$$;

create or replace function private.share_require_kps(p_scope text, p_field text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_scope <> 'KPS' then
    perform private.share_fail('forbidden_field', p_field);
  end if;
end;
$$;

create or replace function private.share_clean(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(pg_catalog.btrim(p_text), '');
$$;

create or replace function private.share_check_pct(p_value numeric, p_field text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_value is not null and (p_value < 0 or p_value > 100) then
    perform private.share_fail('invalid_input', p_field);
  end if;
end;
$$;

create or replace function private.share_check_text(p_value text, p_field text, p_max integer default 4000)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if pg_catalog.char_length(p_value) > p_max then
    perform private.share_fail('invalid_input', p_field);
  end if;
end;
$$;

create or replace function private.share_check_in(p_value text, p_allowed text[], p_field text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_value is not null and not (p_value = any (p_allowed)) then
    perform private.share_fail('invalid_input', p_field);
  end if;
end;
$$;

create or replace function private.share_touch_points()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['Check-in Counter', 'Customer Service', 'Boarding Gate', 'Transfer Desk', 'Baggage Service'];
$$;


-- ================================================================== share_open
-- The whole workspace for the link's scope. Station scopes never receive another station's rows.
-- Auth user ids (weekly_scores.updated_by, bmi_checks.updated_by_user) are never sent.
create or replace function public.share_open(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link     public.share_links;
  v_stations text[];
  v_result   jsonb;
begin
  v_link := private.share_resolve_link(p_token);
  v_stations := private.share_scope_stations(v_link.scope);

  with
    st as (select s.* from public.stations s where s.code = any (v_stations)),
    sf as (select s.* from public.staff s where s.station = any (v_stations)),
    ws as (select w.* from public.weekly_scores w where w.staff_code in (select sf.code from sf)),
    bc as (select c.* from public.bmi_checks c where c.staff_code in (select sf.code from sf)),
    ai as (select a.* from public.action_items a),
    rm as (select r.* from public.remedials r where r.staff_code in (select sf.code from sf)),
    rp as (select r.* from public.replacements r
            where v_link.scope = 'KPS' or r.station = v_link.scope),
    wr as (select r.* from public.weekly_reports r
            where v_link.scope = 'KPS' or r.scope = v_link.scope),
    ids as (
      select v_link.id as link_id
      union select sf.updated_by_link from sf
      union select ws.updated_by_link from ws
      union select bc.updated_by_link from bc
      union select ai.updated_by_link from ai
      union select rm.updated_by_link from rm
      union select rp.updated_by_link from rp
      union select wr.updated_by_link from wr
    )
  select pg_catalog.jsonb_build_object(
           'scope',    v_link.scope,
           'label',    v_link.label,
           'link_id',  v_link.id,
           'stations', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(st) order by st.sort) from st), '[]'::jsonb),
           'settings', (select pg_catalog.to_jsonb(t) from public.settings t where t.id = 1),
           'staff', coalesce((
              select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(sf) order by sf.sort_order nulls last, sf.code)
                from sf), '[]'::jsonb),
           'weekly_scores', coalesce((
              select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(ws) - 'updated_by' order by ws.staff_code, ws.week)
                from ws), '[]'::jsonb),
           'bmi_checks', coalesce((
              select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(bc) - 'updated_by_user' order by bc.staff_code, bc.period)
                from bc), '[]'::jsonb),
           'action_items', coalesce((
              select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(ai) order by ai.sort_order nulls last, ai.code)
                from ai), '[]'::jsonb),
           'remedials', coalesce((
              select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(rm) order by rm.sort_order nulls last, rm.id)
                from rm), '[]'::jsonb),
           'replacements', coalesce((
              select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(rp) order by rp.sort_order nulls last, rp.id)
                from rp), '[]'::jsonb),
           'weekly_reports', coalesce((
              select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(wr) order by wr.week, wr.scope)
                from wr), '[]'::jsonb),
           'link_labels', coalesce((
              select pg_catalog.jsonb_object_agg(l.id, coalesce(l.label, l.scope))
                from public.share_links l
               where l.id in (select ids.link_id from ids)), '{}'::jsonb)
         )
    into v_result;

  return v_result;
end;
$$;


-- ================================================================== weekly coaching scores
-- Upsert on (staff_code, week). Every field NULL/blank deletes the row.
create or replace function public.share_save_weekly_score(
  p_token               text,
  p_staff_code          text,
  p_week                integer,
  p_touch_point         text,
  p_score_grooming      numeric,
  p_score_knowledge     numeric,
  p_score_attitude      numeric,
  p_score_communication numeric,
  p_gap_topic           text,
  p_observer            text,
  p_coaching_notes      text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link     public.share_links;
  v_weeks    smallint;
  v_touch    text := private.share_clean(p_touch_point);
  v_gap      text := private.share_clean(p_gap_topic);
  v_observer text := private.share_clean(p_observer);
  v_notes    text := private.share_clean(p_coaching_notes);
  v_row      public.weekly_scores;
begin
  v_link := private.share_begin_write(p_token);
  perform private.share_scope_staff(v_link.scope, p_staff_code);

  select t.weeks into v_weeks from public.settings t where t.id = 1;
  if p_week is null or p_week < 1 or p_week > coalesce(v_weeks, 20) then
    perform private.share_fail('invalid_input', 'week');
  end if;
  perform private.share_check_in(v_touch, private.share_touch_points(), 'touch_point');
  perform private.share_check_pct(p_score_grooming, 'score_grooming');
  perform private.share_check_pct(p_score_knowledge, 'score_knowledge');
  perform private.share_check_pct(p_score_attitude, 'score_attitude');
  perform private.share_check_pct(p_score_communication, 'score_communication');
  perform private.share_check_text(v_gap, 'gap_topic', 100);
  perform private.share_check_text(v_observer, 'observer', 200);
  perform private.share_check_text(v_notes, 'coaching_notes');

  if num_nonnulls(v_touch, p_score_grooming, p_score_knowledge, p_score_attitude, p_score_communication,
                  v_gap, v_observer, v_notes) = 0 then
    delete from public.weekly_scores w
     where w.staff_code = p_staff_code and w.week = p_week;
    perform private.share_end_write();
    return pg_catalog.jsonb_build_object('deleted', true,
      'row', pg_catalog.jsonb_build_object('staff_code', p_staff_code, 'week', p_week));
  end if;

  insert into public.weekly_scores
    (staff_code, week, touch_point, score_grooming, score_knowledge, score_attitude, score_communication,
     gap_topic, observer, coaching_notes)
  values
    (p_staff_code, p_week, v_touch, p_score_grooming, p_score_knowledge, p_score_attitude, p_score_communication,
     v_gap, v_observer, v_notes)
  on conflict (staff_code, week) do update
    set touch_point = excluded.touch_point,
        score_grooming = excluded.score_grooming, score_knowledge = excluded.score_knowledge,
        score_attitude = excluded.score_attitude, score_communication = excluded.score_communication,
        gap_topic = excluded.gap_topic, observer = excluded.observer, coaching_notes = excluded.coaching_notes
  returning * into v_row;

  perform private.share_end_write();
  return pg_catalog.jsonb_build_object('deleted', false, 'row', pg_catalog.to_jsonb(v_row) - 'updated_by');
end;
$$;


-- ================================================================== BMI check
-- Upsert on (staff_code, period); height and weight both NULL deletes the period row.
create or replace function public.share_save_check(
  p_token      text,
  p_staff_code text,
  p_period     integer,
  p_check_date date,
  p_height_cm  numeric,
  p_weight_kg  numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link    public.share_links;
  v_periods smallint;
  v_row     public.bmi_checks;
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

  insert into public.bmi_checks (staff_code, period, check_date, height_cm, weight_kg)
  values (p_staff_code, p_period, p_check_date, p_height_cm, p_weight_kg)
  on conflict (staff_code, period) do update
    set check_date = excluded.check_date,
        height_cm  = excluded.height_cm,
        weight_kg  = excluded.weight_kg
  returning * into v_row;

  perform private.share_end_write();
  return pg_catalog.jsonb_build_object('deleted', false, 'row', pg_catalog.to_jsonb(v_row) - 'updated_by_user');
end;
$$;


-- ================================================================== BMI profile
-- Sets gender ('L' | 'P' | NULL), bmi_has_note (NULL = belum diisi) and bmi_note. Written as given.
create or replace function public.share_save_profile(
  p_token        text,
  p_staff_code   text,
  p_gender       text,
  p_bmi_has_note boolean,
  p_bmi_note     text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link   public.share_links;
  v_gender text := pg_catalog.upper(private.share_clean(p_gender));
  v_note   text := private.share_clean(p_bmi_note);
  v_row    public.staff;
begin
  v_link := private.share_begin_write(p_token);
  perform private.share_scope_staff(v_link.scope, p_staff_code);

  perform private.share_check_in(v_gender, array['L', 'P'], 'gender');
  perform private.share_check_text(v_note, 'bmi_note', 2000);

  update public.staff s
     set gender = v_gender, bmi_has_note = p_bmi_has_note, bmi_note = v_note
   where s.code = p_staff_code
  returning * into v_row;

  perform private.share_end_write();
  return pg_catalog.jsonb_build_object('deleted', false, 'row', pg_catalog.to_jsonb(v_row));
end;
$$;


-- ================================================================== action items (national, KPS only)
create or replace function public.share_update_action_item(
  p_token      text,
  p_code       text,
  p_status     text,
  p_progress   integer,
  p_updated_on date,
  p_evidence   text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link     public.share_links;
  v_evidence text := private.share_clean(p_evidence);
  v_row      public.action_items;
begin
  v_link := private.share_begin_write(p_token);
  perform private.share_require_kps(v_link.scope, 'status');
  if not exists (select 1 from public.action_items a where a.code = p_code) then
    perform private.share_fail('out_of_scope');
  end if;

  if p_status is null or p_status not in ('Belum Mulai', 'On Progress', 'Selesai', 'Tertunda') then
    perform private.share_fail('invalid_input', 'status');
  end if;
  if p_progress is null or p_progress < 0 or p_progress > 100 then
    perform private.share_fail('invalid_input', 'progress');
  end if;
  perform private.share_check_text(v_evidence, 'evidence');

  update public.action_items a
     set status = p_status, progress = p_progress, updated_on = p_updated_on, evidence = v_evidence
   where a.code = p_code
  returning * into v_row;

  perform private.share_end_write();
  return pg_catalog.jsonb_build_object('deleted', false, 'row', pg_catalog.to_jsonb(v_row));
end;
$$;

-- KPS only: definition fields and kps_notes. All written as given (NULL clears, except group_name).
create or replace function public.share_kps_update_action_item(
  p_token      text,
  p_code       text,
  p_group_name text,
  p_aspect     text,
  p_root_cause text,
  p_action     text,
  p_target     text,
  p_kind       text,
  p_schedule   text,
  p_due_date   date,
  p_pic        text,
  p_kps_notes  text,
  p_source     text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.share_links;
  v_row  public.action_items;
begin
  v_link := private.share_begin_write(p_token);
  perform private.share_require_kps(v_link.scope, 'kps_notes');
  if not exists (select 1 from public.action_items a where a.code = p_code) then
    perform private.share_fail('out_of_scope');
  end if;

  perform private.share_check_in(private.share_clean(p_group_name),
    array['Coaching Frontliner', 'Timeline Training', 'Evaluasi IULS & RUST'], 'group_name');
  perform private.share_check_in(private.share_clean(p_aspect),
    array['Fit & Grooming (BMI)', 'Product Knowledge', 'Komunikasi & Interactive Skill',
          'Grooming & Aksesori', 'Coaching Coverage', 'Remedial'], 'aspect');
  perform private.share_check_in(p_kind, array['Sekali', 'Rutin'], 'kind');
  perform private.share_check_text(p_root_cause, 'root_cause');
  perform private.share_check_text(p_action, 'action');
  perform private.share_check_text(p_target, 'target');
  perform private.share_check_text(p_schedule, 'schedule');
  perform private.share_check_text(p_pic, 'pic');
  perform private.share_check_text(p_kps_notes, 'kps_notes');
  perform private.share_check_text(p_source, 'source', 200);

  update public.action_items a
     set group_name = coalesce(private.share_clean(p_group_name), a.group_name),
         aspect     = private.share_clean(p_aspect),
         root_cause = private.share_clean(p_root_cause),
         action     = private.share_clean(p_action),
         target     = private.share_clean(p_target),
         kind       = p_kind,
         schedule   = private.share_clean(p_schedule),
         due_date   = p_due_date,
         pic        = private.share_clean(p_pic),
         kps_notes  = private.share_clean(p_kps_notes),
         source     = private.share_clean(p_source)
   where a.code = p_code
  returning * into v_row;

  perform private.share_end_write();
  return pg_catalog.jsonb_build_object('deleted', false, 'row', pg_catalog.to_jsonb(v_row));
end;
$$;


-- ================================================================== remedials
-- Upsert on staff_code (staff must be in scope). Every field NULL/blank deletes the row.
create or replace function public.share_save_remedial(
  p_token       text,
  p_staff_code  text,
  p_action      text,
  p_remedial_on date,
  p_role_play   numeric,
  p_post_test   numeric,
  p_reported    text,
  p_notes       text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link   public.share_links;
  v_action text := private.share_clean(p_action);
  v_rep    text := private.share_clean(p_reported);
  v_notes  text := private.share_clean(p_notes);
  v_row    public.remedials;
begin
  v_link := private.share_begin_write(p_token);
  perform private.share_scope_staff(v_link.scope, p_staff_code);

  perform private.share_check_in(v_action,
    array['Refresher & Remedial Assessment', 'Individual Coaching', 'Refresher + Individual Coaching'], 'action');
  perform private.share_check_pct(p_role_play, 'role_play');
  perform private.share_check_pct(p_post_test, 'post_test');
  perform private.share_check_in(v_rep, array['Ya', 'Belum'], 'reported');
  perform private.share_check_text(v_notes, 'notes');

  if num_nonnulls(v_action, p_remedial_on, p_role_play, p_post_test, v_rep, v_notes) = 0 then
    delete from public.remedials r where r.staff_code = p_staff_code;
    perform private.share_end_write();
    return pg_catalog.jsonb_build_object('deleted', true,
      'row', pg_catalog.jsonb_build_object('staff_code', p_staff_code));
  end if;

  insert into public.remedials (staff_code, action, remedial_on, role_play, post_test, reported, notes, sort_order)
  values (p_staff_code, v_action, p_remedial_on, p_role_play, p_post_test, v_rep, v_notes,
          (select coalesce(max(r.sort_order), 0) + 1 from public.remedials r))
  on conflict (staff_code) do update
    set action = excluded.action, remedial_on = excluded.remedial_on, role_play = excluded.role_play,
        post_test = excluded.post_test, reported = excluded.reported, notes = excluded.notes
  returning * into v_row;

  perform private.share_end_write();
  return pg_catalog.jsonb_build_object('deleted', false, 'row', pg_catalog.to_jsonb(v_row));
end;
$$;

create or replace function public.share_delete_remedial(p_token text, p_staff_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.share_links;
begin
  v_link := private.share_begin_write(p_token);
  perform private.share_scope_staff(v_link.scope, p_staff_code);

  delete from public.remedials r where r.staff_code = p_staff_code;

  perform private.share_end_write();
  return pg_catalog.jsonb_build_object('deleted', true,
    'row', pg_catalog.jsonb_build_object('staff_code', p_staff_code));
end;
$$;


-- ================================================================== replacements
-- p_id NULL inserts, otherwise updates that row (must be in scope). All fields written as given.
-- Station links: station is forced to the link's station. p_staff_code (optional) must be a staff
-- member of the row's station; replaced_name and program default to that staff member's.
create or replace function public.share_save_replacement(
  p_token            text,
  p_id               bigint,
  p_program          text,
  p_station          text,
  p_staff_code       text,
  p_replaced_name    text,
  p_reason           text,
  p_withdrawn_on     date,
  p_replacement_name text,
  p_effective_on     date,
  p_training_on      date,
  p_post_test        numeric,
  p_final_result     numeric,
  p_reported         text,
  p_notes            text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link    public.share_links;
  v_old     public.replacements;
  v_station text := pg_catalog.upper(private.share_clean(p_station));
  v_program text := pg_catalog.upper(private.share_clean(p_program));
  v_staff   public.staff;
  v_name    text := private.share_clean(p_replaced_name);
  v_row     public.replacements;
begin
  v_link := private.share_begin_write(p_token);

  if p_id is not null then
    select r.* into v_old from public.replacements r where r.id = p_id;
    if not found or (v_link.scope <> 'KPS' and v_old.station is distinct from v_link.scope) then
      perform private.share_fail('out_of_scope');
    end if;
  end if;

  if v_link.scope <> 'KPS' then
    if v_station is not null and v_station <> v_link.scope then
      perform private.share_fail('out_of_scope');
    end if;
    v_station := v_link.scope;
  elsif v_station is not null and not exists (select 1 from public.stations s where s.code = v_station) then
    perform private.share_fail('invalid_input', 'station');
  end if;

  if p_staff_code is not null then
    v_staff := private.share_scope_staff(v_link.scope, p_staff_code);
    if v_station is not null and v_staff.station <> v_station then
      perform private.share_fail('invalid_input', 'staff_code');
    end if;
    v_station := coalesce(v_station, v_staff.station);
    v_name := coalesce(v_name, v_staff.name);
    v_program := coalesce(v_program, v_staff.program);
  end if;

  perform private.share_check_in(v_program, array['IULS', 'RUST'], 'program');
  if v_name is null then
    perform private.share_fail('invalid_input', 'replaced_name');
  end if;
  perform private.share_check_pct(p_post_test, 'post_test');
  perform private.share_check_pct(p_final_result, 'final_result');
  perform private.share_check_in(p_reported, array['Ya', 'Belum'], 'reported');
  perform private.share_check_text(v_name, 'replaced_name', 200);
  perform private.share_check_text(p_replacement_name, 'replacement_name', 200);
  perform private.share_check_text(p_reason, 'reason');
  perform private.share_check_text(p_notes, 'notes');

  if p_id is null then
    insert into public.replacements
      (program, station, staff_code, replaced_name, reason, withdrawn_on, replacement_name,
       effective_on, training_on, post_test, final_result, reported, notes, sort_order)
    values
      (v_program, v_station, p_staff_code, v_name, private.share_clean(p_reason), p_withdrawn_on,
       private.share_clean(p_replacement_name), p_effective_on, p_training_on, p_post_test,
       p_final_result, p_reported, private.share_clean(p_notes),
       (select coalesce(max(r.sort_order), 0) + 1 from public.replacements r))
    returning * into v_row;
  else
    update public.replacements r
       set program = v_program, station = v_station, staff_code = p_staff_code,
           replaced_name = v_name, reason = private.share_clean(p_reason),
           withdrawn_on = p_withdrawn_on, replacement_name = private.share_clean(p_replacement_name),
           effective_on = p_effective_on, training_on = p_training_on, post_test = p_post_test,
           final_result = p_final_result, reported = p_reported, notes = private.share_clean(p_notes)
     where r.id = p_id
    returning * into v_row;
  end if;

  perform private.share_end_write();
  return pg_catalog.jsonb_build_object('deleted', false, 'row', pg_catalog.to_jsonb(v_row));
end;
$$;

create or replace function public.share_delete_replacement(p_token text, p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.share_links;
begin
  v_link := private.share_begin_write(p_token);
  if not exists (
    select 1 from public.replacements r
     where r.id = p_id
       and (v_link.scope = 'KPS' or r.station = v_link.scope)
  ) then
    perform private.share_fail('out_of_scope');
  end if;

  delete from public.replacements r where r.id = p_id;

  perform private.share_end_write();
  return pg_catalog.jsonb_build_object('deleted', true, 'row', pg_catalog.jsonb_build_object('id', p_id));
end;
$$;


-- ================================================================== staff
-- p_code NULL inserts a new staff member with the next free code TMB-01, TMB-02, ...
-- otherwise updates that staff member (must be in scope). Text fields are written as given;
-- p_station / p_assignment_status NULL keep the current value (insert: link station / 'Aktif').
-- Station links can only use their own station; KPS must name a station on insert and may move staff.
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
  perform private.share_check_in(v_touch, private.share_touch_points(), 'touch_point');
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

-- KPS only: training baseline (role play, post-test, remark, feedback). All written as given.
create or replace function public.share_kps_save_staff_baseline(
  p_token         text,
  p_code          text,
  p_role_play     numeric,
  p_post_test     numeric,
  p_report_remark text,
  p_feedback      text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.share_links;
  v_row  public.staff;
begin
  v_link := private.share_begin_write(p_token);
  perform private.share_require_kps(v_link.scope, coalesce(
    case when p_role_play     is not null then 'role_play' end,
    case when p_post_test     is not null then 'post_test' end,
    case when p_report_remark is not null then 'report_remark' end,
    case when p_feedback      is not null then 'feedback' end,
    'role_play'));
  perform private.share_scope_staff(v_link.scope, p_code);

  perform private.share_check_pct(p_role_play, 'role_play');
  perform private.share_check_pct(p_post_test, 'post_test');
  perform private.share_check_in(private.share_clean(p_report_remark), array['Passed', 'Failed'], 'report_remark');
  perform private.share_check_text(p_feedback, 'feedback', 8000);

  update public.staff s
     set role_play = p_role_play, post_test = p_post_test,
         report_remark = private.share_clean(p_report_remark), feedback = private.share_clean(p_feedback)
   where s.code = p_code
  returning * into v_row;

  perform private.share_end_write();
  return pg_catalog.jsonb_build_object('deleted', false, 'row', pg_catalog.to_jsonb(v_row));
end;
$$;


-- ================================================================== weekly report (findings)
-- Always the link's own scope. NULL/blank findings deletes the row.
create or replace function public.share_save_weekly_report(p_token text, p_week integer, p_findings text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link     public.share_links;
  v_weeks    smallint;
  v_findings text := private.share_clean(p_findings);
  v_row      public.weekly_reports;
begin
  v_link := private.share_begin_write(p_token);

  select t.weeks into v_weeks from public.settings t where t.id = 1;
  if p_week is null or p_week < 1 or p_week > coalesce(v_weeks, 20) then
    perform private.share_fail('invalid_input', 'week');
  end if;
  perform private.share_check_text(v_findings, 'findings', 20000);

  if v_findings is null then
    delete from public.weekly_reports r where r.week = p_week and r.scope = v_link.scope;
    perform private.share_end_write();
    return pg_catalog.jsonb_build_object('deleted', true,
      'row', pg_catalog.jsonb_build_object('week', p_week, 'scope', v_link.scope));
  end if;

  insert into public.weekly_reports (week, scope, findings)
  values (p_week, v_link.scope, v_findings)
  on conflict (week, scope) do update set findings = excluded.findings
  returning * into v_row;

  perform private.share_end_write();
  return pg_catalog.jsonb_build_object('deleted', false, 'row', pg_catalog.to_jsonb(v_row));
end;
$$;


-- ================================================================== grants
revoke all on function private.share_fail(text, text)                     from public, anon, authenticated;
revoke all on function private.share_resolve_link(text)                   from public, anon, authenticated;
revoke all on function private.share_begin_write(text)                    from public, anon, authenticated;
revoke all on function private.share_end_write()                          from public, anon, authenticated;
revoke all on function private.share_scope_stations(text)                 from public, anon, authenticated;
revoke all on function private.share_scope_staff(text, text)              from public, anon, authenticated;
revoke all on function private.share_require_kps(text, text)              from public, anon, authenticated;
revoke all on function private.share_clean(text)                          from public, anon, authenticated;
revoke all on function private.share_check_pct(numeric, text)             from public, anon, authenticated;
revoke all on function private.share_check_text(text, text, integer)      from public, anon, authenticated;
revoke all on function private.share_check_in(text, text[], text)        from public, anon, authenticated;
revoke all on function private.share_touch_points()                       from public, anon, authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.share_open(text)',
    'public.share_save_weekly_score(text, text, integer, text, numeric, numeric, numeric, numeric, text, text, text)',
    'public.share_save_check(text, text, integer, date, numeric, numeric)',
    'public.share_save_profile(text, text, text, boolean, text)',
    'public.share_update_action_item(text, text, text, integer, date, text)',
    'public.share_kps_update_action_item(text, text, text, text, text, text, text, text, text, date, text, text, text)',
    'public.share_save_remedial(text, text, text, date, numeric, numeric, text, text)',
    'public.share_delete_remedial(text, text)',
    'public.share_save_replacement(text, bigint, text, text, text, text, text, date, text, date, date, numeric, numeric, text, text)',
    'public.share_delete_replacement(text, bigint)',
    'public.share_save_staff(text, text, text, text, text, text, text, text, text, text, text)',
    'public.share_kps_save_staff_baseline(text, text, numeric, numeric, text, text)',
    'public.share_save_weekly_report(text, integer, text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end;
$$;

-- Guard rails: anon may execute only share_* in public, and every share_* is a pinned
-- SECURITY DEFINER function.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn, p.proname, p.prosecdef, p.proconfig
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
  loop
    if pg_catalog.has_function_privilege('anon', r.fn, 'EXECUTE') and r.proname !~ '^share_' then
      raise exception 'anon can execute %', r.fn;
    end if;
    if r.proname ~ '^share_' and not (r.prosecdef and r.proconfig @> array['search_path=""']) then
      raise exception '% must be SECURITY DEFINER with search_path pinned', r.fn;
    end if;
  end loop;
end;
$$;
