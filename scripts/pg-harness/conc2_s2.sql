-- CONC-02 session2: 並行して U7 が U1 を revoke
-- （ロック待ち後の再認可で U7 は既に SYSTEM_ADMIN でないため 42501 で失敗すべき）
-- FICTIONAL / TEST ONLY
begin;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
set local role authenticated;
select public.app_revoke_system_admin('00000000-0000-4000-8000-000000000001');
commit;
