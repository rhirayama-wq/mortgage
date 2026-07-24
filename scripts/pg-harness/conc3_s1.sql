-- CONC-03 session1: U1 が U10(sysadmin3) の SYSTEM_ADMIN を revoke
-- （グローバル SYSTEM_ADMIN 集合ロックを保持したまま 6 秒待機）
-- FICTIONAL / TEST ONLY
begin;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select public.app_revoke_system_admin('00000000-0000-4000-8000-00000000000a');
select pg_sleep(6);
commit;
