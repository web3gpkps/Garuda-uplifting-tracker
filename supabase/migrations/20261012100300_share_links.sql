-- Share links (/s/<token>) and the attribution helpers every data table uses.

create table public.share_links (
  id           uuid primary key default gen_random_uuid(),
  token        text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  scope        text not null,
  label        text,
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  last_used_at timestamptz,
  constraint share_links_token_key unique (token),
  constraint share_links_token_check check (token ~ '^[0-9a-f]{48}$'),
  constraint share_links_scope_check check (scope = 'KPS' or scope ~ '^[A-Z0-9]{2,5}$')
);

comment on column public.share_links.token is
  '24 random bytes, hex. Readable by admins only. Link holders reach data only via share_* RPCs.';

create index share_links_created_by_idx on public.share_links (created_by);

-- A station scope must name a listed station (a CHECK cannot look at another table).
create or replace function private.share_links_check_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.scope <> 'KPS' and not exists (select 1 from public.stations s where s.code = new.scope) then
    raise exception using errcode = '23514', message = 'share_links_scope_check',
      detail = 'scope must be KPS or a code in public.stations';
  end if;
  return new;
end;
$$;

revoke all on function private.share_links_check_scope() from public, anon, authenticated;

create trigger share_links_check_scope
  before insert or update of scope on public.share_links
  for each row execute function private.share_links_check_scope();

alter table public.share_links enable row level security;

create policy share_links_admin_all on public.share_links
  as permissive for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

revoke all on table public.share_links from anon;
revoke truncate, references, trigger on table public.share_links from authenticated;


-- ------------------------------------------------------------------ attribution
-- The share_* write RPCs set the transaction-local GUC tracker.share_link_id; every other writer
-- (owner via RLS, service role / Sheets sync, SQL) leaves it empty, so updated_by_link = NULL.
create or replace function private.stamp_link_attribution()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by_link := nullif(pg_catalog.current_setting('tracker.share_link_id', true), '')::uuid;
  return new;
end;
$$;

revoke all on function private.stamp_link_attribution() from public, anon, authenticated;
