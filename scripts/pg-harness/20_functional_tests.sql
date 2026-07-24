-- ============================================================================
-- 20_functional_tests.sql — 業務関数・トリガー機能テスト (PG_HARNESS)
-- FICTIONAL / TEST ONLY / PRODUCTION USE PROHIBITED
-- 各 DO ブロック = 1 トランザクション = 1 テスト。
-- 失敗時は 'TEST FAIL:' で始まる例外を送出する。
-- ============================================================================
\set ON_ERROR_STOP on

-- FUNC-01: auth.users 作成でプロフィールが自動作成され、email が小文字化される
do $$
declare v_email text;
begin
  insert into auth.users (id, email)
  values ('00000000-0000-4000-8000-0000000000f1', 'MixedCase.Fictional@Example.Test');
  select email into v_email from public.user_profiles
   where id = '00000000-0000-4000-8000-0000000000f1';
  if v_email is distinct from 'mixedcase.fictional@example.test' then
    raise exception 'TEST FAIL: FUNC-01 profile email mirror, got %', v_email;
  end if;
end
$$;

-- FUNC-02: 法人作成の成功監査が同一Txで残っている（fixtures で作成済みの分）
do $$
begin
  if (select count(*) from public.authoritative_audit_logs
       where action = 'organization.create' and success) < 3 then
    raise exception 'TEST FAIL: FUNC-02 organization.create audit missing';
  end if;
  if (select count(*) from public.authoritative_audit_logs
       where action = 'membership.invite' and success) < 6 then
    raise exception 'TEST FAIL: FUNC-02 membership.invite audit missing';
  end if;
  if (select count(*) from public.authoritative_audit_logs
       where action = 'membership.accept' and success) < 6 then
    raise exception 'TEST FAIL: FUNC-02 membership.accept audit missing';
  end if;
end
$$;

-- FUNC-03: 招待メール不一致の accept は拒否される
--   U5 の auth email を変更 → mirror 同期 → invited_email と不一致になり accept 失敗
do $$
declare v_ok boolean := false;
begin
  update auth.users set email = 'changed.fictional@example.test'
   where id = '00000000-0000-4000-8000-000000000005';
  perform test.as_user('00000000-0000-4000-8000-000000000005');
  begin
    perform public.app_accept_invitation(test.id('m_invitee'));
  exception when others then
    if sqlerrm like '%invite_email_mismatch%' then v_ok := true;
    else raise; end if;
  end;
  if not v_ok then
    raise exception 'TEST FAIL: FUNC-03 email mismatch accept was not rejected';
  end if;
  raise exception 'ROLLBACK_FIXTURE_PRESERVE' using errcode = 'P0099';
exception when sqlstate 'P0099' then null;  -- fixtureへの影響を戻す
end
$$;

-- FUNC-04: 他人の招待は accept できない
do $$
declare v_ok boolean := false;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000003'); -- sales A（他人）
  begin
    perform public.app_accept_invitation(test.id('m_invitee'));
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then
    raise exception 'TEST FAIL: FUNC-04 non-target accept was not rejected';
  end if;
end
$$;

-- FUNC-05: 正しい本人 accept は成功し、監査が残る（その後ロールバック）
do $$
begin
  perform test.as_user('00000000-0000-4000-8000-000000000005');
  perform public.app_accept_invitation(test.id('m_invitee'));
  perform test.reset();
  if (select status from public.organization_memberships where id = test.id('m_invitee'))
     is distinct from 'active'::public.membership_status then
    raise exception 'TEST FAIL: FUNC-05 accept did not activate';
  end if;
  if not exists (
    select 1 from public.authoritative_audit_logs
     where action = 'membership.accept' and success
       and resource_id = test.id('m_invitee')::text
  ) then
    raise exception 'TEST FAIL: FUNC-05 accept audit missing';
  end if;
  raise exception 'ROLLBACK_FIXTURE_PRESERVE' using errcode = 'P0099';
exception when sqlstate 'P0099' then null;
end
$$;

-- FUNC-06: role 変更は active のみ（invited 行への変更は拒否）
do $$
declare v_ok boolean := false;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000002');
  begin
    perform public.app_change_member_role(test.id('m_invitee'), 'ORGANIZATION_ADMIN');
  exception when others then
    if sqlerrm like '%membership_role_change_requires_active%' then v_ok := true;
    else raise; end if;
  end;
  if not v_ok then
    raise exception 'TEST FAIL: FUNC-06 role change on invited was not rejected';
  end if;
end
$$;

-- FUNC-07: active への role 変更は成功する（sales -> admin、ロールバックで戻す）
do $$
begin
  perform test.as_user('00000000-0000-4000-8000-000000000002');
  perform public.app_change_member_role(test.id('m_s1'), 'ORGANIZATION_ADMIN');
  perform test.reset();
  if (select role from public.organization_memberships where id = test.id('m_s1'))
     is distinct from 'ORGANIZATION_ADMIN'::public.organization_role then
    raise exception 'TEST FAIL: FUNC-07 role change failed';
  end if;
  raise exception 'ROLLBACK_FIXTURE_PRESERVE' using errcode = 'P0099';
exception when sqlstate 'P0099' then null;
end
$$;

-- FUNC-08: suspend -> reactivate -> end、left は終端
do $$
declare v_ok boolean := false;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000002');
  perform public.app_suspend_member(test.id('m_s1'));
  perform public.app_reactivate_member(test.id('m_s1'));
  perform public.app_end_membership(test.id('m_s1'));
  -- left からの再開は拒否
  begin
    perform public.app_reactivate_member(test.id('m_s1'));
  exception when others then
    if sqlerrm like '%membership_invalid_transition%' or sqlerrm like '%membership_left_terminal%'
    then v_ok := true; else raise; end if;
  end;
  if not v_ok then
    raise exception 'TEST FAIL: FUNC-08 left terminal not enforced';
  end if;
  raise exception 'ROLLBACK_FIXTURE_PRESERVE' using errcode = 'P0099';
exception when sqlstate 'P0099' then null;
end
$$;

-- FUNC-09: 最後の active ORGANIZATION_ADMIN は demote / suspend / end できない
--   OrgB は管理者1名（U4）。
do $$
declare v_fail_count int := 0;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000004');
  begin
    perform public.app_change_member_role(test.id('m_b1'), 'SALES_USER');
  exception when others then
    if sqlerrm like '%last_organization_admin_protected%' then v_fail_count := v_fail_count + 1;
    else raise; end if;
  end;
  begin
    perform public.app_suspend_member(test.id('m_b1'));
  exception when others then
    if sqlerrm like '%last_organization_admin_protected%' then v_fail_count := v_fail_count + 1;
    else raise; end if;
  end;
  begin
    perform public.app_end_membership(test.id('m_b1'));
  exception when others then
    if sqlerrm like '%last_organization_admin_protected%' then v_fail_count := v_fail_count + 1;
    else raise; end if;
  end;
  if v_fail_count <> 3 then
    raise exception 'TEST FAIL: FUNC-09 last admin protection, blocked %/3', v_fail_count;
  end if;
end
$$;

-- FUNC-10: 2人目の管理者がいれば demote は成功する（OrgA、ロールバック）
do $$
begin
  perform test.as_user('00000000-0000-4000-8000-000000000002');
  perform public.app_change_member_role(test.id('m_a2'), 'SALES_USER');
  raise exception 'ROLLBACK_FIXTURE_PRESERVE' using errcode = 'P0099';
exception when sqlstate 'P0099' then null;
end
$$;

-- FUNC-11: 重複招待は拒否される
do $$
declare v_ok boolean := false;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000002');
  begin
    perform public.app_invite_organization_member(
      test.id('org_a'), 'sales.a.fictional@example.test', 'SALES_USER');
  exception when others then
    if sqlerrm like '%membership_already_exists%' then v_ok := true;
    else raise; end if;
  end;
  if not v_ok then
    raise exception 'TEST FAIL: FUNC-11 duplicate invite not rejected';
  end if;
end
$$;

-- FUNC-12: 未登録メールへの招待は拒否される
do $$
declare v_ok boolean := false;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000002');
  begin
    perform public.app_invite_organization_member(
      test.id('org_a'), 'nobody.fictional@example.test', 'SALES_USER');
  exception when no_data_found then v_ok := true;
  end;
  if not v_ok then
    raise exception 'TEST FAIL: FUNC-12 unknown email invite not rejected';
  end if;
end
$$;

-- FUNC-13: 法人アーカイブ後は招待できない（ロールバック）
do $$
declare v_ok boolean := false;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000001');
  perform public.app_archive_organization(test.id('org_b'));
  begin
    perform public.app_invite_organization_member(
      test.id('org_b'), 'invitee.fictional@example.test', 'SALES_USER');
  exception when no_data_found then v_ok := true;
  end;
  if not v_ok then
    raise exception 'TEST FAIL: FUNC-13 invite into archived org not rejected';
  end if;
  raise exception 'ROLLBACK_FIXTURE_PRESERVE' using errcode = 'P0099';
exception when sqlstate 'P0099' then null;
end
$$;

-- FUNC-14: SYSTEM_ADMIN の grant / revoke、最後の1人は revoke 不可
do $$
declare v_ok boolean := false;
begin
  -- U7 / U10 / U11 を revoke（4人 -> 1人）
  perform test.as_user('00000000-0000-4000-8000-000000000001');
  perform public.app_revoke_system_admin('00000000-0000-4000-8000-000000000007');
  perform public.app_revoke_system_admin('00000000-0000-4000-8000-00000000000a');
  perform public.app_revoke_system_admin('00000000-0000-4000-8000-00000000000b');
  -- 最後の1人（自分）は revoke できない
  begin
    perform public.app_revoke_system_admin('00000000-0000-4000-8000-000000000001');
  exception when others then
    if sqlerrm like '%last_system_admin_protected%' then v_ok := true;
    else raise; end if;
  end;
  if not v_ok then
    raise exception 'TEST FAIL: FUNC-14 last system admin protection missing';
  end if;
  raise exception 'ROLLBACK_FIXTURE_PRESERVE' using errcode = 'P0099';
exception when sqlstate 'P0099' then null;
end
$$;

-- FUNC-15: 失敗監査（専用関数）は service_role が別Txで記録できる
do $$
begin
  perform test.as_service();
  perform public.app_record_membership_accept_failure(
    '00000000-0000-4000-8000-000000000005',
    test.id('m_invitee'),
    'not_authorized',
    '00000000-0000-4000-8000-00000000aaaa');
  perform test.reset();
  if not exists (
    select 1 from public.authoritative_audit_logs
     where action = 'membership.accept' and success = false
       and error_code = 'not_authorized'
       and resource_type = 'organization_membership'
       and organization_id = test.id('org_a')
       and correlation_id = '00000000-0000-4000-8000-00000000aaaa'
  ) then
    raise exception 'TEST FAIL: FUNC-15 failure audit row missing';
  end if;
end
$$;

-- FUNC-16: ブートストラップ関数は2回目を拒否する
do $$
declare v_ok boolean := false;
begin
  begin
    perform public.app_bootstrap_first_system_admin('00000000-0000-4000-8000-000000000002');
  exception when others then
    if sqlerrm like '%system_admin_already_exists%' then v_ok := true;
    else raise; end if;
  end;
  if not v_ok then
    raise exception 'TEST FAIL: FUNC-16 bootstrap second call not rejected';
  end if;
end
$$;

select 'FUNCTIONAL TESTS: ALL PASSED' as result;
