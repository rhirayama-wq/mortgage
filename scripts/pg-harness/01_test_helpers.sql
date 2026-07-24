-- ============================================================================
-- 01_test_helpers.sql — ハーネス内の擬似JWT・ロール切替ヘルパー
-- FICTIONAL / TEST ONLY / PRODUCTION USE PROHIBITED
-- ============================================================================

create schema if not exists test;
grant usage on schema test to anon, authenticated, service_role;

-- 認証ユーザーとして実行（トランザクションローカル）
create or replace function test.as_user(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function test.as_anon()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
end;
$$;

create or replace function test.as_service()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'service_role', true);
end;
$$;

-- スーパーユーザーへ戻す
create or replace function test.reset()
returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

grant execute on function test.as_user(uuid) to anon, authenticated, service_role;
grant execute on function test.as_anon()     to anon, authenticated, service_role;
grant execute on function test.as_service()  to anon, authenticated, service_role;
grant execute on function test.reset()       to anon, authenticated, service_role;

-- fixture ID 保管
create table if not exists test.ids (key text primary key, id uuid not null);
grant select on test.ids to anon, authenticated, service_role;

create or replace function test.id(p_key text)
returns uuid language sql stable as $$
  select id from test.ids where key = p_key
$$;
grant execute on function test.id(text) to anon, authenticated, service_role;
