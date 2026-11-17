-- Passage database. Run once in the Supabase SQL editor.
--
-- Access model: a trip's 128-bit share token is the only key to it. Tables have row-level
-- security ON and NO policies, so the anon key cannot read or write them directly. Every read
-- and write goes through the security-definer functions below, which take the token.
--
-- Entities are stored as validated JSON documents per row (the app validates with zod on read).
-- A trip is always loaded whole and is small, so this keeps one schema — lib/types.ts — as the
-- source of truth instead of two that can drift.

create extension if not exists pgcrypto;

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  token text unique not null check (length(token) >= 32),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reservations (
  trip_id uuid not null references trips(id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (trip_id, id)
);

create table if not exists expenses (
  trip_id uuid not null references trips(id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (trip_id, id)
);

-- Daily quotas for the paid Claude features, per trip and kind ('scan', 'recs').
create table if not exists ai_usage (
  token text not null,
  kind text not null,
  day date not null,
  count int not null default 0,
  primary key (token, kind, day)
);

alter table trips enable row level security;
alter table reservations enable row level security;
alter table expenses enable row level security;
alter table ai_usage enable row level security;

-- The trip document holds everything except bookings and expenses, which live in their own rows
-- so two people adding expenses at once never overwrite each other.
create or replace function trip_doc(p jsonb) returns jsonb language sql immutable set search_path = public as $$
  select p - 'id' - 'token' - 'isDemo' - 'reservations' - 'expenses' - 'recs'
$$;

create or replace function get_trip(p_token text) returns jsonb
language sql security definer set search_path = public stable as $$
  select t.data || jsonb_build_object(
    'id', t.id::text,
    'token', t.token,
    'isDemo', false,
    'reservations', coalesce((select jsonb_agg(r.data order by r.id) from reservations r where r.trip_id = t.id), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(e.data order by e.id) from expenses e where e.trip_id = t.id), '[]'::jsonb)
  )
  from trips t where t.token = p_token
$$;

create or replace function create_trip(p_trip jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_token text := p_trip->>'token';
  r jsonb;
begin
  if v_token is null or length(v_token) < 32 then raise exception 'bad token'; end if;
  insert into trips (token, data) values (v_token, trip_doc(p_trip) || jsonb_build_object('recs', coalesce(p_trip->'recs', '{}'::jsonb))) returning id into v_id;
  for r in select * from jsonb_array_elements(coalesce(p_trip->'reservations', '[]'::jsonb)) loop
    insert into reservations (trip_id, id, data) values (v_id, r->>'id', r);
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p_trip->'expenses', '[]'::jsonb)) loop
    insert into expenses (trip_id, id, data) values (v_id, r->>'id', r);
  end loop;
  return v_token;
end $$;

create or replace function apply_mutation(p_token text, p_m jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_kind text := p_m->>'kind';
  v_doc jsonb;
begin
  select id into v_id from trips where token = p_token;
  if v_id is null then raise exception 'trip not found'; end if;

  if v_kind = 'upsertReservation' then
    v_doc := p_m->'reservation';
    insert into reservations (trip_id, id, data) values (v_id, v_doc->>'id', v_doc)
      on conflict (trip_id, id) do update set data = excluded.data, updated_at = now();
  elsif v_kind = 'deleteReservation' then
    delete from reservations where trip_id = v_id and id = p_m->>'id';
  elsif v_kind = 'upsertExpense' then
    v_doc := p_m->'expense';
    insert into expenses (trip_id, id, data) values (v_id, v_doc->>'id', v_doc)
      on conflict (trip_id, id) do update set data = excluded.data, updated_at = now();
  elsif v_kind = 'deleteExpense' then
    delete from expenses where trip_id = v_id and id = p_m->>'id';
  elsif v_kind = 'upsertProfile' then
    update trips set data = jsonb_set(data, '{travelers}', (
      select jsonb_agg(case when t->>'id' = p_m->>'travelerId' then t || jsonb_build_object('profile', p_m->'profile') else t end)
      from jsonb_array_elements(data->'travelers') t
    )), updated_at = now() where id = v_id;
  elsif v_kind = 'setRecs' then
    update trips set data = data || jsonb_build_object('recs',
      coalesce(data->'recs', '{}'::jsonb) || jsonb_build_object((p_m->'recs'->>'stopId') || ':' || (p_m->'recs'->>'travelerId'), p_m->'recs')
    ), updated_at = now() where id = v_id;
  elsif v_kind = 'replaceTrip' then
    -- Keep profiles and recommendations: they are edited on their own.
    update trips set data = trip_doc(p_m->'trip')
      || jsonb_build_object('recs', coalesce(data->'recs', '{}'::jsonb))
      || jsonb_build_object('travelers', (
        select jsonb_agg(case when old.t is not null and old.t ? 'profile' then nt || jsonb_build_object('profile', old.t->'profile') else nt end)
        from jsonb_array_elements(p_m->'trip'->'travelers') nt
        left join lateral (select o as t from jsonb_array_elements(data->'travelers') o where o->>'id' = nt->>'id' limit 1) old on true
      )), updated_at = now() where id = v_id;
    -- Bookings on stops or legs that no longer exist go with them.
    delete from reservations r where r.trip_id = v_id and not exists (
      select 1 from jsonb_array_elements(p_m->'trip'->'stops') s where s->>'id' = r.data->>'stopId'
      union all
      select 1 from jsonb_array_elements(p_m->'trip'->'legs') l where l->>'id' = r.data->>'legId'
    );
  else
    raise exception 'unknown mutation %', v_kind;
  end if;
end $$;

-- Daily quota, checked by /api/scan and /api/recommend before they call Claude.
create or replace function take_quota(p_token text, p_kind text, p_limit int) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if p_kind not in ('scan', 'recs') then return false; end if;
  -- A trip that is still being created (e.g. filling a stop from a hotel booking in the new-trip
  -- form) has no row yet. Those share one small daily pool, so made-up tokens can't run up a bill.
  if p_token <> 'demo' and not exists (select 1 from trips where token = p_token) then
    p_token := '__new__';
    p_limit := least(p_limit, 60);
  end if;
  insert into ai_usage (token, kind, day, count) values (p_token, p_kind, current_date, 1)
    on conflict (token, kind, day) do update set count = ai_usage.count + 1
    returning count into v_count;
  return v_count <= p_limit;
end $$;

revoke all on function get_trip(text), create_trip(jsonb), apply_mutation(text, jsonb), take_quota(text, text, int) from public;
grant execute on function get_trip(text), create_trip(jsonb), apply_mutation(text, jsonb), take_quota(text, text, int) to anon, authenticated;

-- Opens of tagged links (e.g. https://…/?from=vivek), so T can see when someone she sent the app
-- to opened it. Only the tag she chose, the page and a rough device are kept: no IPs, no names.
create table if not exists visits (
  id bigint generated always as identity primary key,
  tag text not null check (tag ~ '^[a-z0-9-]{1,32}$'),
  path text not null default '/',
  device text,
  at timestamptz not null default now()
);
alter table visits enable row level security;

create or replace function log_visit(p_tag text, p_path text, p_device text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_tag is null or p_tag !~ '^[a-z0-9-]{1,32}$' then return; end if;
  -- At most 50 a day per tag, so the table can't be flooded.
  if (select count(*) from visits where tag = p_tag and at > now() - interval '1 day') >= 50 then return; end if;
  insert into visits (tag, path, device) values (p_tag, left(coalesce(p_path, '/'), 80), left(p_device, 20));
end $$;

revoke all on function log_visit(text, text, text) from public;
grant execute on function log_visit(text, text, text) to anon, authenticated;

-- City recommendations, saved by the server as soon as they're ready, so they aren't lost when
-- the phone sleeps or the app closes during the ~1 minute of research. Keyed by trip token and
-- stop:traveler:interests, so a changed interest list gets fresh picks. Real trips also get the
-- picks written into the trip itself (like the app's setRecs). Only the server can save (it holds
-- the secret in app_secrets); anyone with the trip's token can read.
create table if not exists recs_cache (
  token text not null,
  key text not null,
  set jsonb not null,
  at timestamptz not null default now(),
  primary key (token, key)
);
create table if not exists app_secrets (name text primary key, value text not null);
alter table recs_cache enable row level security;
alter table app_secrets enable row level security;

create or replace function save_recs(p_secret text, p_token text, p_key text, p_set jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from app_secrets where name = 'recs' and value = p_secret) then return false; end if;
  insert into recs_cache (token, key, set) values (p_token, p_key, p_set)
    on conflict (token, key) do update set set = excluded.set, at = now();
  update trips set data = data || jsonb_build_object('recs',
      coalesce(data->'recs', '{}'::jsonb) || jsonb_build_object((p_set->>'stopId') || ':' || (p_set->>'travelerId'), p_set)
    ), updated_at = now()
    where token = p_token;
  return true;
end $$;

create or replace function get_recs(p_token text, p_key text) returns jsonb
language sql security definer set search_path = public stable as $$
  select set from recs_cache where token = p_token and key = p_key and at > now() - interval '7 days'
$$;

revoke all on function save_recs(text, text, text, jsonb), get_recs(text, text) from public;
grant execute on function save_recs(text, text, text, jsonb), get_recs(text, text) to anon, authenticated;
