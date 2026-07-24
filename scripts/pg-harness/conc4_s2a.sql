-- CONC-04 / SEC-76: 元SYSTEM_ADMIN U11 がロック待機中に revoke される -> invite 拒否
-- FICTIONAL / TEST ONLY（期待結果: ERROR not_authorized。無期限待機は lock_timeout で失敗させる）
begin;
set local lock_timeout = '20s';
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
select public.app_invite_organization_member(test.id('org_a'), 'invitee.fictional@example.test', 'SALES_USER');
commit;
