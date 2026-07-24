-- CONC-01 session1: SYSTEM_ADMIN が OrgC admin2 を end（ロック保持のまま4秒待機）
-- FICTIONAL / TEST ONLY
begin;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select public.app_end_membership(test.id('m_c2'));
select pg_sleep(4);
commit;
