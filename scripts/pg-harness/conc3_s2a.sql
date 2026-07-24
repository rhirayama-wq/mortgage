-- CONC-03 / SEC-62: U10 がロック待機中に SYSTEM_ADMIN を取消される -> 法人作成拒否
-- FICTIONAL / TEST ONLY（期待結果: ERROR not_authorized）
begin;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
select public.app_create_organization('SEC-62 should never exist (test only)');
commit;
