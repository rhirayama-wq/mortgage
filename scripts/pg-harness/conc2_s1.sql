-- CONC-02 session1: SYSTEM_ADMIN U1 が U7 を revoke（グローバルロック保持のまま4秒待機）
-- FICTIONAL / TEST ONLY
begin;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select public.app_revoke_system_admin('00000000-0000-4000-8000-000000000007');
select pg_sleep(4);
commit;
