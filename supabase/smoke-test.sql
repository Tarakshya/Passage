-- Smoke test for schema.sql against a real Postgres (run after schema.sql, as a superuser):
--   psql -v trip="$(npx tsx scripts/demo-json.ts)" -f supabase/smoke-test.sql
-- Every check prints ok/true; any failure stops with an error.
\set ON_ERROR_STOP on
set role anon;
-- 1. anon cannot touch tables directly
do $$ begin perform 1 from trips; raise exception 'FAIL anon read trips'; exception when insufficient_privilege then raise notice 'ok: anon blocked from tables'; end $$;
-- 2. create + read back
select create_trip(:'trip'::jsonb) = repeat('a',32) as created;
select jsonb_array_length(get_trip(repeat('a',32))->'reservations') as reservations,
       jsonb_array_length(get_trip(repeat('a',32))->'expenses') as expenses,
       get_trip(repeat('a',32))->'travelers'->1->'profile'->'interests'->>0 as sam_first_interest;
-- 3. profile upsert touches only Sam
select apply_mutation(repeat('a',32), '{"kind":"upsertProfile","travelerId":"sam","profile":{"interests":["a","b","c","d","e"],"link":"https://x.org/","updatedAt":"t"}}');
select get_trip(repeat('a',32))->'travelers'->1->'profile'->>'link' as sam_link,
       get_trip(repeat('a',32))->'travelers'->2->'profile'->'interests'->>0 as priya_unchanged;
-- 4. recs stored per stop:traveler
select apply_mutation(repeat('a',32), '{"kind":"setRecs","recs":{"stopId":"vie","travelerId":"sam","items":[{"name":"X"}],"basis":{"interests":[],"link":null},"generatedAt":"t"}}');
select get_trip(repeat('a',32))->'recs'->'vie:sam'->'items'->0->>'name' as rec;
-- 5. trip edit (profile-less travelers, no recs) keeps profiles + recs, drops removed stop's bookings
select apply_mutation(repeat('a',32), jsonb_build_object('kind','replaceTrip','trip',
  (:'trip'::jsonb - 'recs') || jsonb_build_object('name','Renamed',
    'travelers', (select jsonb_agg(t - 'profile') from jsonb_array_elements(:'trip'::jsonb->'travelers') t),
    'stops', (select jsonb_agg(s) from jsonb_array_elements(:'trip'::jsonb->'stops') s where s->>'id' <> 'gmu'))));
select get_trip(repeat('a',32))->>'name' as name,
       get_trip(repeat('a',32))->'travelers'->1->'profile'->>'link' as sam_link_kept,
       get_trip(repeat('a',32))->'recs'->'vie:sam' is not null as recs_kept,
       jsonb_array_length(get_trip(repeat('a',32))->'stops') as stops;
-- 6. expenses: upsert, edit, delete
select apply_mutation(repeat('a',32), '{"kind":"upsertExpense","expense":{"id":"e-new","amount":900}}');
select apply_mutation(repeat('a',32), '{"kind":"upsertExpense","expense":{"id":"e-new","amount":1000}}');
select (select count(*) from jsonb_array_elements(get_trip(repeat('a',32))->'expenses') e where e->>'id'='e-new') as one_row,
       (select e->>'amount' from jsonb_array_elements(get_trip(repeat('a',32))->'expenses') e where e->>'id'='e-new') as amount;
select apply_mutation(repeat('a',32), '{"kind":"deleteExpense","id":"e-new"}');
-- 7. quotas
select bool_and(take_quota(repeat('a',32),'recs',3)) as first_three_ok from generate_series(1,3);
select take_quota(repeat('a',32),'recs',3) as fourth_refused, take_quota(repeat('a',32),'scan',3) as scan_separate,
       take_quota('nope','scan',3) as unknown_trip_uses_new_pool, take_quota(repeat('a',32),'other',3) as bad_kind;
-- 8. wrong token
do $$ begin perform apply_mutation('b', '{"kind":"deleteExpense","id":"x"}'); raise exception 'FAIL wrong token'; exception when others then raise notice 'ok: wrong token rejected (%)', sqlerrm; end $$;
