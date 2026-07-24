-- ============================================================================
-- 30_security_tests.sql — RLS / GRANT / 越境 / 監査保護テスト (PG_HARNESS)
-- FICTIONAL / TEST ONLY / PRODUCTION USE PROHIBITED
-- ============================================================================
\set ON_ERROR_STOP on

-- SEC-01: anon はテーブル SELECT 不可（permission denied）
do $$
declare v_ok int := 0; v_n int;
begin
  perform test.as_anon();
  begin
    select count(*) into v_n from public.user_profiles;
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;
  begin
    select count(*) into v_n from public.organization_memberships;
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;
  begin
    select count(*) into v_n from public.authoritative_audit_logs;
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;
  if v_ok <> 3 then
    raise exception 'TEST FAIL: SEC-01 anon table access, blocked %/3', v_ok;
  end if;
end
$$;

-- SEC-02: JWT なしの authenticated は RLS で 0 行
do $$
declare v_n int;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_n from public.user_profiles;
  if v_n <> 0 then raise exception 'TEST FAIL: SEC-02 profiles visible without JWT: %', v_n; end if;
  select count(*) into v_n from public.organizations;
  if v_n <> 0 then raise exception 'TEST FAIL: SEC-02 orgs visible without JWT: %', v_n; end if;
  select count(*) into v_n from public.organization_memberships;
  if v_n <> 0 then raise exception 'TEST FAIL: SEC-02 memberships visible without JWT: %', v_n; end if;
end
$$;

-- SEC-03: authenticated はテーブルへ直接 INSERT / UPDATE / DELETE できない
do $$
declare v_ok int := 0;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000002'); -- org A admin
  begin
    insert into public.organizations (name) values ('hack (test only)');
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;
  begin
    update public.organizations set name = 'hack' where id = test.id('org_a');
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;
  begin
    insert into public.organization_memberships
      (organization_id, user_id, role, status, invited_email)
    values (test.id('org_a'), '00000000-0000-4000-8000-000000000004',
            'ORGANIZATION_ADMIN', 'active', 'admin.b.fictional@example.test');
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;
  begin
    update public.organization_memberships set role = 'ORGANIZATION_ADMIN'
     where id = test.id('m_s1');
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;
  begin
    delete from public.organization_memberships where id = test.id('m_s1');
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;
  begin
    insert into public.authoritative_audit_logs (action, success) values ('forged', true);
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;
  if v_ok <> 6 then
    raise exception 'TEST FAIL: SEC-03 direct writes, blocked %/6', v_ok;
  end if;
end
$$;

-- SEC-04: user_profiles は display_name のみ更新可。email / system_role は列GRANTなし
do $$
declare v_ok int := 0; v_n int;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000003'); -- sales A
  -- 自分の display_name 更新は成功する
  update public.user_profiles set display_name = 'Fictional Sales A'
   where id = '00000000-0000-4000-8000-000000000003';
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'TEST FAIL: SEC-04 own display_name update failed';
  end if;
  begin
    update public.user_profiles set email = 'evil.fictional@example.test'
     where id = '00000000-0000-4000-8000-000000000003';
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;
  begin
    update public.user_profiles set system_role = 'SYSTEM_ADMIN'
     where id = '00000000-0000-4000-8000-000000000003';
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;
  if v_ok <> 2 then
    raise exception 'TEST FAIL: SEC-04 email/system_role update, blocked %/2', v_ok;
  end if;
  raise exception 'ROLLBACK_FIXTURE_PRESERVE' using errcode = 'P0099';
exception when sqlstate 'P0099' then null;
end
$$;

-- SEC-05: 他人の display_name は RLS で更新 0 行
do $$
declare v_n int;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000003');
  update public.user_profiles set display_name = 'hijack'
   where id = '00000000-0000-4000-8000-000000000002';
  get diagnostics v_n = row_count;
  if v_n <> 0 then
    raise exception 'TEST FAIL: SEC-05 cross-user update affected % rows', v_n;
  end if;
end
$$;

-- SEC-06: テナント越境 SELECT 不可（OrgA 管理者から OrgB が見えない）
do $$
declare v_n int;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000002');
  select count(*) into v_n from public.organizations where id = test.id('org_b');
  if v_n <> 0 then raise exception 'TEST FAIL: SEC-06 org B visible'; end if;
  select count(*) into v_n from public.organization_memberships
   where organization_id = test.id('org_b');
  if v_n <> 0 then raise exception 'TEST FAIL: SEC-06 org B memberships visible'; end if;
  select count(*) into v_n from public.user_profiles
   where id = '00000000-0000-4000-8000-000000000004';
  if v_n <> 0 then raise exception 'TEST FAIL: SEC-06 org B admin profile visible'; end if;
  select count(*) into v_n from public.authoritative_audit_logs
   where organization_id = test.id('org_b');
  if v_n <> 0 then raise exception 'TEST FAIL: SEC-06 org B audit visible'; end if;
end
$$;

-- SEC-07: SALES_USER は監査ログを閲覧できない
do $$
declare v_n int;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000003');
  select count(*) into v_n from public.authoritative_audit_logs;
  if v_n <> 0 then
    raise exception 'TEST FAIL: SEC-07 sales user sees % audit rows', v_n;
  end if;
end
$$;

-- SEC-08: ORGANIZATION_ADMIN は自法人の監査のみ、SYSTEM_ADMIN は全件閲覧可
do $$
declare v_own int; v_other int; v_all int; v_total int;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000002');
  select count(*) into v_own from public.authoritative_audit_logs
   where organization_id = test.id('org_a');
  select count(*) into v_other from public.authoritative_audit_logs
   where organization_id is distinct from test.id('org_a');
  if v_own = 0 then raise exception 'TEST FAIL: SEC-08 org admin sees no own-org audit'; end if;
  if v_other <> 0 then raise exception 'TEST FAIL: SEC-08 org admin sees other audit: %', v_other; end if;

  perform test.as_user('00000000-0000-4000-8000-000000000001');
  select count(*) into v_all from public.authoritative_audit_logs;
  perform test.reset();
  select count(*) into v_total from public.authoritative_audit_logs;
  if v_all <> v_total then
    raise exception 'TEST FAIL: SEC-08 system admin sees %/% audit rows', v_all, v_total;
  end if;
end
$$;

-- SEC-09: invited のみのユーザーは所属先法人名を見られるが、他メンバーの membership は見えない
do $$
declare v_n int;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000005');
  select count(*) into v_n from public.organizations where id = test.id('org_a');
  if v_n <> 1 then raise exception 'TEST FAIL: SEC-09 invited user cannot see own org'; end if;
  select count(*) into v_n from public.organization_memberships
   where organization_id = test.id('org_a')
     and user_id <> '00000000-0000-4000-8000-000000000005';
  if v_n <> 0 then raise exception 'TEST FAIL: SEC-09 invited user sees other memberships'; end if;
end
$$;

-- SEC-66/67: SALES_USER は同一法人の他人の profile 行（email / system_role 含む）を取得不可
do $$
declare v_rows int; v_emails int; v_roles int;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000003'); -- sales A
  select count(*) into v_rows from public.user_profiles
   where id = '00000000-0000-4000-8000-000000000002'; -- admin A
  if v_rows <> 0 then
    raise exception 'TEST FAIL: SEC-66 sales user sees co-member profile row';
  end if;
  select count(*) into v_emails from public.user_profiles
   where id <> '00000000-0000-4000-8000-000000000003' and email is not null;
  if v_emails <> 0 then
    raise exception 'TEST FAIL: SEC-66 sales user can read % other emails', v_emails;
  end if;
  select count(*) into v_roles from public.user_profiles
   where id <> '00000000-0000-4000-8000-000000000003' and system_role is not null;
  if v_roles <> 0 then
    raise exception 'TEST FAIL: SEC-67 sales user can read other system_role';
  end if;
end
$$;

-- SEC-68: ORGANIZATION_ADMIN は自法人ユーザーの profile を SELECT 可
do $$
declare v_n int;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000002'); -- admin A
  select count(*) into v_n from public.user_profiles
   where id = '00000000-0000-4000-8000-000000000003'; -- sales A
  if v_n <> 1 then
    raise exception 'TEST FAIL: SEC-68 org admin cannot see own-org member profile';
  end if;
end
$$;

-- SEC-69: ORGANIZATION_ADMIN は他法人ユーザーの profile を取得不可
do $$
declare v_n int;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000002'); -- admin A
  select count(*) into v_n from public.user_profiles
   where id = '00000000-0000-4000-8000-000000000004'; -- admin B (org B)
  if v_n <> 0 then
    raise exception 'TEST FAIL: SEC-69 org admin sees other-org profile';
  end if;
end
$$;

-- SEC-70: 本人は自分の profile を SELECT 可
do $$
declare v_n int;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000003'); -- sales A
  select count(*) into v_n from public.user_profiles
   where id = '00000000-0000-4000-8000-000000000003';
  if v_n <> 1 then
    raise exception 'TEST FAIL: SEC-70 own profile not visible';
  end if;
end
$$;

-- SEC-11: 監査ログは superuser でも UPDATE / DELETE 不可（追記専用トリガー）
do $$
declare v_ok int := 0;
begin
  begin
    update public.authoritative_audit_logs set success = false where id = 1;
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;
  begin
    delete from public.authoritative_audit_logs where id = 1;
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;
  if v_ok <> 2 then
    raise exception 'TEST FAIL: SEC-11 audit append-only, blocked %/2', v_ok;
  end if;
end
$$;

-- SEC-12: membership の organization_id は不変（法人移動の UPDATE 禁止）
do $$
declare v_ok boolean := false;
begin
  begin
    update public.organization_memberships
       set organization_id = test.id('org_b')
     where id = test.id('m_s1');
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then
    raise exception 'TEST FAIL: SEC-12 organization_id mutation not blocked';
  end if;
end
$$;

-- SEC-13: 業務関数の認可（権限のない呼出しはすべて 42501）
do $$
declare v_ok int := 0;
begin
  -- SALES_USER による招待
  perform test.as_user('00000000-0000-4000-8000-000000000003');
  begin
    perform public.app_invite_organization_member(
      test.id('org_a'), 'invitee.fictional@example.test', 'SALES_USER');
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;
  -- 他法人管理者による招待（OrgB 管理者 -> OrgA）
  perform test.as_user('00000000-0000-4000-8000-000000000004');
  begin
    perform public.app_invite_organization_member(
      test.id('org_a'), 'invitee.fictional@example.test', 'SALES_USER');
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;
  -- 一般管理者による法人作成
  perform test.as_user('00000000-0000-4000-8000-000000000002');
  begin
    perform public.app_create_organization('Hack Org (test only)');
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;
  -- 一般管理者による SYSTEM_ADMIN 付与
  begin
    perform public.app_grant_system_admin('00000000-0000-4000-8000-000000000002');
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;
  -- 他法人 membership の停止（OrgB 管理者 -> OrgA member）
  perform test.as_user('00000000-0000-4000-8000-000000000004');
  begin
    perform public.app_suspend_member(test.id('m_s1'));
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;
  if v_ok <> 5 then
    raise exception 'TEST FAIL: SEC-13 function authorization, blocked %/5', v_ok;
  end if;
end
$$;

-- SEC-14: authenticated は内部専用関数を実行できない
do $$
declare v_ok int := 0;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000001'); -- SYSTEM_ADMIN でも不可
  begin
    perform public.app_record_membership_accept_failure(
      '00000000-0000-4000-8000-000000000001', test.id('m_invitee'),
      'not_authorized', '00000000-0000-4000-8000-00000000bbbb');
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;
  begin
    perform public.app_write_audit('x', null, null, null, null, true, null, null, '{}'::jsonb);
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;
  begin
    perform public.app_bootstrap_first_system_admin('00000000-0000-4000-8000-000000000002');
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;
  begin
    perform public.app_change_member_status(test.id('m_s1'), 'left', 'membership.end', null);
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;
  if v_ok <> 4 then
    raise exception 'TEST FAIL: SEC-14 internal function execute, blocked %/4', v_ok;
  end if;
end
$$;

-- SEC-15: anon は業務関数を実行できない
do $$
declare v_ok int := 0;
begin
  perform test.as_anon();
  begin
    perform public.app_create_organization('anon org (test only)');
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;
  begin
    perform public.app_accept_invitation(test.id('m_invitee'));
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;
  if v_ok <> 2 then
    raise exception 'TEST FAIL: SEC-15 anon function execute, blocked %/2', v_ok;
  end if;
end
$$;

-- SEC-16: 認可失敗した業務関数は監査ログを残さない（失敗監査はサーバー経由のみ）
--         かつ失敗により対象データが変更されていない
do $$
declare v_before int; v_after int;
begin
  select count(*) into v_before from public.authoritative_audit_logs;
  perform test.as_user('00000000-0000-4000-8000-000000000003');
  begin
    perform public.app_suspend_member(test.id('m_a1'));
  exception when insufficient_privilege then null;
  end;
  perform test.reset();
  select count(*) into v_after from public.authoritative_audit_logs;
  if v_after <> v_before then
    raise exception 'TEST FAIL: SEC-16 failed op wrote % new audit rows in-band', v_after - v_before;
  end if;
  if (select status from public.organization_memberships where id = test.id('m_a1'))
     is distinct from 'active'::public.membership_status then
    raise exception 'TEST FAIL: SEC-16 target row was modified by failed op';
  end if;
end
$$;

-- SEC-71: 許可リスト外の error_code は拒否される（service_role でも）
do $$
declare v_ok int := 0;
begin
  perform test.as_service();
  begin
    perform public.app_record_membership_accept_failure(
      '00000000-0000-4000-8000-000000000005', test.id('m_invitee'),
      'DROP TABLE user_profiles', '00000000-0000-4000-8000-00000000cccc');
  exception when invalid_parameter_value then v_ok := v_ok + 1;
  end;
  begin
    perform public.app_record_membership_accept_failure(
      '00000000-0000-4000-8000-000000000005', test.id('m_invitee'),
      null, '00000000-0000-4000-8000-00000000cccc');
  exception when invalid_parameter_value then v_ok := v_ok + 1;
  end;
  begin
    perform public.app_record_membership_accept_failure(
      null, test.id('m_invitee'),
      'not_authorized', '00000000-0000-4000-8000-00000000cccc');
  exception when invalid_parameter_value then v_ok := v_ok + 1;
  end;
  if v_ok <> 3 then
    raise exception 'TEST FAIL: SEC-71 invalid failure-audit inputs, blocked %/3', v_ok;
  end if;
end
$$;

-- SEC-72: action / resource_type は呼出し側から指定不能（パラメータが存在しない）
do $$
declare v_ok boolean := false;
begin
  perform test.as_service();
  begin
    execute $q$select public.app_record_membership_accept_failure(
      'forged.action'::text,
      '00000000-0000-4000-8000-000000000005'::uuid,
      'org'::text, 'x'::text, 'not_authorized'::text,
      '00000000-0000-4000-8000-00000000cccc'::uuid)$q$;
  exception when undefined_function then v_ok := true;
  end;
  if not v_ok then
    raise exception 'TEST FAIL: SEC-72 action-accepting signature exists';
  end if;
end
$$;

-- SEC-73: metadata を受け付けるシグネチャが存在しない
do $$
declare v_ok boolean := false;
begin
  perform test.as_service();
  begin
    execute $q$select public.app_record_membership_accept_failure(
      '00000000-0000-4000-8000-000000000005'::uuid,
      '00000000-0000-4000-8000-000000000005'::uuid,
      'not_authorized'::text,
      '00000000-0000-4000-8000-00000000cccc'::uuid,
      '{"pii":"x"}'::jsonb)$q$;
  exception when undefined_function then v_ok := true;
  end;
  if not v_ok then
    raise exception 'TEST FAIL: SEC-73 metadata-accepting signature exists';
  end if;
end
$$;

-- SEC-74: 許可された membership.accept 失敗監査は成功し、固定値・org解決が正しい
do $$
declare v_row public.authoritative_audit_logs%rowtype;
begin
  perform test.as_service();
  perform public.app_record_membership_accept_failure(
    '00000000-0000-4000-8000-000000000005', test.id('m_invitee'),
    'invite_email_mismatch', '00000000-0000-4000-8000-00000000dddd');
  perform test.reset();
  select * into v_row from public.authoritative_audit_logs
   where correlation_id = '00000000-0000-4000-8000-00000000dddd';
  if not found then
    raise exception 'TEST FAIL: SEC-74 failure audit row missing';
  end if;
  if v_row.action <> 'membership.accept'
     or v_row.resource_type <> 'organization_membership'
     or v_row.success <> false
     or v_row.metadata <> '{}'::jsonb
     or v_row.organization_id is distinct from test.id('org_a') then
    raise exception 'TEST FAIL: SEC-74 forced fields incorrect';
  end if;
end
$$;

-- SEC-75: success=true を作る失敗監査経路が存在しない
--   (a) 旧汎用 app_record_failure_audit が存在しない
--   (b) 専用関数に success パラメータが無く、生成行は常に success=false
do $$
declare v_n int;
begin
  select count(*) into v_n from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'app_record_failure_audit';
  if v_n <> 0 then
    raise exception 'TEST FAIL: SEC-75 generic failure-audit function still exists';
  end if;
  select count(*) into v_n from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'app_record_membership_accept_failure'
     and p.pronargs = 4;
  if v_n <> 1 then
    raise exception 'TEST FAIL: SEC-75 dedicated function signature unexpected';
  end if;
  if exists (
    select 1 from public.authoritative_audit_logs
     where correlation_id in (
       '00000000-0000-4000-8000-00000000aaaa',
       '00000000-0000-4000-8000-00000000dddd')
       and success = true
  ) then
    raise exception 'TEST FAIL: SEC-75 failure-audit produced success=true row';
  end if;
end
$$;

select 'SECURITY TESTS: ALL PASSED' as result;
