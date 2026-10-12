-- Configuration tables: stations (units) and the single settings row (workbook sheet "Parameter").

create table public.stations (
  code text primary key,
  sort smallint not null,
  constraint stations_code_check check (code ~ '^[A-Z0-9]{2,5}$' and code <> 'KPS')
);

-- Unit list from sheet Parameter (station codes found in the PDF). The owner adds more stations
-- with an insert (SQL editor / migration); links and staff can only use listed stations.
insert into public.stations (code, sort) values
  ('AAP', 1),  ('BDJ', 2),  ('BPN', 3),  ('BTH', 4),  ('BTJ', 5),  ('CGK', 6),
  ('DJB', 7),  ('DJJ', 8),  ('DPS', 9),  ('KDI', 10), ('KNO', 11), ('LBJ', 12),
  ('LOP', 13), ('MDC', 14), ('MKQ', 15), ('PDG', 16), ('PLM', 17), ('PNK', 18),
  ('SOC', 19), ('SRG', 20), ('SUB', 21), ('UPG', 22);

alter table public.stations enable row level security;

create policy stations_admin_all on public.stations
  as permissive for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

revoke all on table public.stations from anon;
revoke truncate, references, trigger on table public.stations from authenticated;


create table public.settings (
  id                       smallint primary key default 1,
  week1_start              date     not null,
  weeks                    smallint not null,
  bmi_first_check          date     not null,
  bmi_interval_days        smallint not null,
  bmi_interval_months      smallint not null,
  bmi_periods              smallint not null,
  bmi_underweight_below    numeric  not null,
  bmi_normal_max           numeric  not null,
  bmi_overweight_max       numeric  not null,
  pass_grade               numeric  not null,
  weight_role_play         numeric  not null,
  weight_post_test         numeric  not null,
  target_overweight_max    numeric  not null,
  target_overweight_months smallint not null,
  target_knowledge         numeric  not null,
  target_interactive       numeric  not null,
  target_coverage          integer  not null,
  coverage_done            integer  not null,
  target_pass_rate         numeric  not null,
  replacement_deadline     date     not null,
  updated_at               timestamptz not null default now(),
  constraint settings_singleton check (id = 1),
  constraint settings_weeks_check check (weeks between 1 and 20),
  constraint settings_bmi_interval_days_check check (bmi_interval_days between 1 and 90),
  constraint settings_bmi_interval_months_check check (bmi_interval_months between 1 and 12),
  constraint settings_bmi_periods_check check (bmi_periods between 1 and 12),
  constraint settings_bmi_thresholds_check check (
    bmi_underweight_below > 0
    and bmi_underweight_below <= bmi_normal_max
    and bmi_normal_max <= bmi_overweight_max
    and bmi_overweight_max <= 100
  ),
  constraint settings_pass_grade_check check (pass_grade between 0 and 100),
  constraint settings_weights_check check (
    weight_role_play between 0 and 1 and weight_post_test between 0 and 1
  ),
  constraint settings_targets_check check (
    target_overweight_max between 0 and 1
    and target_knowledge between 0 and 1
    and target_interactive between 0 and 1
    and target_pass_rate between 0 and 1
  ),
  constraint settings_target_overweight_months_check check (target_overweight_months between 1 and 36),
  constraint settings_coverage_check check (target_coverage > 0 and coverage_done >= 0)
);

insert into public.settings (
  id, week1_start, weeks, bmi_first_check, bmi_interval_days, bmi_interval_months, bmi_periods,
  bmi_underweight_below, bmi_normal_max, bmi_overweight_max,
  pass_grade, weight_role_play, weight_post_test,
  target_overweight_max, target_overweight_months, target_knowledge, target_interactive,
  target_coverage, coverage_done, target_pass_rate, replacement_deadline
) values (
  1, date '2026-10-05', 10, date '2026-10-12', 14, 1, 6,
  18.5, 25, 27,
  85, 0.4, 0.6,
  0.20, 6, 0.90, 0.92,
  812, 795, 1.0, date '2026-12-14'
);

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function private.set_updated_at();

alter table public.settings enable row level security;

create policy settings_admin_select on public.settings
  as permissive for select to authenticated
  using ((select public.is_admin()));

create policy settings_admin_update on public.settings
  as permissive for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on table public.settings from anon;
-- The singleton row is edited, never inserted or deleted by the app.
revoke insert, delete, truncate, references, trigger on table public.settings from authenticated;
