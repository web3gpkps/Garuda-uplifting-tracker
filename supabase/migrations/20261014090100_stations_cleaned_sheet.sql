-- The cleaned Google Sheet lists staff in 12 stations that the first import did not know
-- (Master SDM column E). Stations are validated against this table, so without them 89 staff rows
-- were rejected by the sync ("Unit tidak ada di daftar unit"). Added alphabetically; the existing
-- 22 stations stay, including the five that have no staff in the sheet yet.

insert into public.stations (code, sort) values
  ('AMQ', 0), ('GTO', 0), ('KOE', 0), ('PGK', 0), ('PKU', 0), ('PKY', 0),
  ('PLW', 0), ('SOQ', 0), ('TIM', 0), ('TKG', 0), ('TTE', 0), ('YIA', 0)
on conflict (code) do nothing;

-- Keep the station list in code order (it is the order of every station select and table).
with ordered as (
  select code, (row_number() over (order by code))::smallint as n from public.stations
)
update public.stations s
   set sort = o.n
  from ordered o
 where o.code = s.code
   and s.sort is distinct from o.n;
