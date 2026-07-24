-- CONC-01 session2: 並行して OrgC admin1 を end（advisory lock 待ち後、最後の管理者保護で失敗すべき）
-- FICTIONAL / TEST ONLY
begin;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select public.app_end_membership(test.id('m_c1'));
commit;
