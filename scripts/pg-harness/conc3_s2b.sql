-- CONC-03 / SEC-63: U10 がロック待機中に SYSTEM_ADMIN を取消される -> rename 拒否
-- FICTIONAL / TEST ONLY（期待結果: ERROR not_authorized）
begin;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
select public.app_rename_organization(test.id('org_a'), 'SEC-63 hijacked (test only)');
commit;
