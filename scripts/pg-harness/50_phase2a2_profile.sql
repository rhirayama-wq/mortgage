-- ============================================================================
-- 50_phase2a2_profile.sql — Phase 2A-2a (顧客基本情報の途中保存 +
--   被招待者による自招待の可視化) の RLS・業務関数テスト (PG_HARNESS)
-- FICTIONAL / TEST ONLY / PRODUCTION USE PROHIBITED
-- 依存: 0001 + 0002 + 0003 migration、10_fixtures（org_a / m_s1 は active のまま）。
-- 40 の後に実行する（40 は case A を cancelled 化するが、本ファイルは新規案件のみ使う）。
-- ============================================================================
\set ON_ERROR_STOP on

-- 架空の顧客（Phase 2A-2a 用）
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000d1', 'cust.p2a2.primary@example.test'),
  ('00000000-0000-4000-8000-0000000000d2', 'cust.p2a2.co@example.test'),
  ('00000000-0000-4000-8000-0000000000d3', 'cust.p2a2.outsider@example.test'),
  ('00000000-0000-4000-8000-0000000000d4', 'cust.p2a2.pending@example.test')
on conflict (id) do nothing;

-- ---- セットアップ: 案件(primary/co 受諾済み) + 保留中招待つきの別案件 ----
do $$
declare
  c_s1  constant uuid := '00000000-0000-4000-8000-000000000003'; -- org_a sales (assigned)
  c_cp  constant uuid := '00000000-0000-4000-8000-0000000000d1'; -- primary customer
  c_cc  constant uuid := '00000000-0000-4000-8000-0000000000d2'; -- co-applicant customer
  v_case uuid; v_case2 uuid; v_inv_p uuid; v_inv_c uuid; v_inv_pend uuid;
  v_app_p uuid; v_app_c uuid;
begin
  perform test.as_user(c_s1);
  v_case := public.app_create_customer_case(test.id('org_a'), test.id('m_s1'),
              'P2A2 Profile Case (test only)', 50000000);
  v_inv_p := public.app_invite_case_applicant(v_case, 'primary', 'cust.p2a2.primary@example.test');
  v_inv_c := public.app_invite_case_applicant(v_case, 'co_applicant', 'cust.p2a2.co@example.test', '配偶者');

  perform test.as_user(c_cp);
  perform public.app_accept_case_invitation(v_inv_p);
  perform test.as_user(c_cc);
  perform public.app_accept_case_invitation(v_inv_c);

  -- 別案件に「保留中(invited)」の招待を作る（受諾しない）。
  perform test.as_user(c_s1);
  v_case2 := public.app_create_customer_case(test.id('org_a'), test.id('m_s1'),
               'P2A2 Pending Case (test only)');
  v_inv_pend := public.app_invite_case_applicant(v_case2, 'primary', 'cust.p2a2.pending@example.test');

  perform test.reset();
  select id into v_app_p from public.case_applicants where case_id = v_case and applicant_type = 'primary';
  select id into v_app_c from public.case_applicants where case_id = v_case and applicant_type = 'co_applicant';
  if v_app_p is null or v_app_c is null then
    raise exception 'FIXTURE FAIL: P2A2 applicants not found';
  end if;
  insert into test.ids values
    ('p2a2_case', v_case), ('p2a2_case2', v_case2),
    ('p2a2_app_p', v_app_p), ('p2a2_app_c', v_app_c),
    ('p2a2_inv_pend', v_inv_pend);
end
$$;

-- P2A2-01: 本人(primary)は自分の基本情報を保存でき、opened -> inputting へ遷移する
do $$
declare v_ts timestamptz; v_status public.customer_case_status; v_name text; v_email text;
begin
  perform test.as_user('00000000-0000-4000-8000-0000000000d1');
  v_ts := public.app_update_own_applicant_profile(
    test.id('p2a2_app_p'), '架空 太郎', 'カクウ タロウ', date '1990-01-01',
    'cust.p2a2.primary@example.test', '09000000000', '1000001', '東京都（架空）1-2-3');
  if v_ts is null then raise exception 'TEST FAIL: P2A2-01 no timestamp returned'; end if;
  perform test.reset();
  select status into v_status from public.customer_cases where id = test.id('p2a2_case');
  if v_status <> 'inputting' then raise exception 'TEST FAIL: P2A2-01 status not inputting: %', v_status; end if;
  select full_name, email into v_name, v_email
    from public.case_applicant_profiles where applicant_id = test.id('p2a2_app_p');
  if v_name <> '架空 太郎' then raise exception 'TEST FAIL: P2A2-01 name not saved: %', v_name; end if;
  if v_email <> 'cust.p2a2.primary@example.test' then raise exception 'TEST FAIL: P2A2-01 email not saved'; end if;
end
$$;

-- P2A2-02: 共同申込者は主申込者の PII を更新できない（not_authorized）
do $$
declare v_failed boolean := false;
begin
  perform test.as_user('00000000-0000-4000-8000-0000000000d2'); -- co-applicant
  begin
    perform public.app_update_own_applicant_profile(
      test.id('p2a2_app_p'), 'hack', null, null, null, null, null, null);
  exception when others then
    if position('not_authorized' in sqlerrm) = 0 then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'TEST FAIL: P2A2-02 co-applicant updated others PII'; end if;
end
$$;

-- P2A2-03: 無関係な顧客（非 participant）は更新できない（not_authorized）
do $$
declare v_failed boolean := false;
begin
  perform test.as_user('00000000-0000-4000-8000-0000000000d3'); -- outsider
  begin
    perform public.app_update_own_applicant_profile(
      test.id('p2a2_app_p'), 'hack', null, null, null, null, null, null);
  exception when others then
    if position('not_authorized' in sqlerrm) = 0 then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'TEST FAIL: P2A2-03 outsider updated PII'; end if;
end
$$;

-- P2A2-04: 不正なメール / 未来の生年月日は拒否される
do $$
declare v_e1 boolean := false; v_e2 boolean := false;
begin
  perform test.as_user('00000000-0000-4000-8000-0000000000d1');
  begin
    perform public.app_update_own_applicant_profile(
      test.id('p2a2_app_p'), null, null, null, 'not-an-email', null, null, null);
  exception when others then
    if position('invalid_profile_email' in sqlerrm) = 0 then raise; end if;
    v_e1 := true;
  end;
  begin
    perform public.app_update_own_applicant_profile(
      test.id('p2a2_app_p'), null, null, current_date + 1, null, null, null, null);
  exception when others then
    if position('invalid_profile_birth_date' in sqlerrm) = 0 then raise; end if;
    v_e2 := true;
  end;
  if not v_e1 then raise exception 'TEST FAIL: P2A2-04 invalid email accepted'; end if;
  if not v_e2 then raise exception 'TEST FAIL: P2A2-04 future birth_date accepted'; end if;
end
$$;

-- P2A2-05: 監査に PII が入らない（フィールド名のみ・氏名/メール断片が無い）
do $$
declare v_updated int; v_pii int; v_fields int;
begin
  perform test.reset();
  select count(*) into v_updated from public.authoritative_audit_logs
   where action = 'case_applicant_profile.updated'
     and resource_id = test.id('p2a2_app_p')::text and success;
  if v_updated < 1 then raise exception 'TEST FAIL: P2A2-05 no profile-update audit: %', v_updated; end if;
  select count(*) into v_pii from public.authoritative_audit_logs
   where metadata::text ilike '%架空 太郎%'
      or metadata::text ilike '%p2a2.primary@example.test%';
  if v_pii <> 0 then raise exception 'TEST FAIL: P2A2-05 PII found in audit metadata: %', v_pii; end if;
  -- フィールド名（full_name）は記録されていること
  select count(*) into v_fields from public.authoritative_audit_logs
   where action = 'case_applicant_profile.updated'
     and resource_id = test.id('p2a2_app_p')::text
     and metadata::text like '%full_name%';
  if v_fields < 1 then raise exception 'TEST FAIL: P2A2-05 field names not audited'; end if;
end
$$;

-- P2A2-06: 認証済みユーザーの直接 UPDATE / INSERT は拒否
do $$
declare v_ok int := 0;
begin
  perform test.as_user('00000000-0000-4000-8000-0000000000d1');
  begin
    update public.case_applicant_profiles set full_name = 'hack'
     where applicant_id = test.id('p2a2_app_p');
  exception when insufficient_privilege then v_ok := v_ok + 1; end;
  begin
    insert into public.case_applicant_profiles (applicant_id) values (test.id('p2a2_app_c'));
  exception when insufficient_privilege then v_ok := v_ok + 1;
           when unique_violation then v_ok := v_ok + 1; end;
  if v_ok <> 2 then raise exception 'TEST FAIL: P2A2-06 direct writes not blocked %/2', v_ok; end if;
end
$$;

-- P2A2-07: 被招待者本人は自分の invited 招待を SELECT でき、他人は不可視
do $$
declare v_own int; v_other int; v_accepted_hidden int;
begin
  -- 被招待者本人（保留中）
  perform test.as_user('00000000-0000-4000-8000-0000000000d4');
  select count(*) into v_own from public.case_invitations
   where invited_email = 'cust.p2a2.pending@example.test' and status = 'invited';
  if v_own <> 1 then raise exception 'TEST FAIL: P2A2-07 invitee cannot see own invitation: %', v_own; end if;

  -- 他人（別顧客）は当該保留招待を見られない
  perform test.as_user('00000000-0000-4000-8000-0000000000d1');
  select count(*) into v_other from public.case_invitations
   where invited_email = 'cust.p2a2.pending@example.test';
  if v_other <> 0 then raise exception 'TEST FAIL: P2A2-07 other customer sees pending invitation: %', v_other; end if;

  -- 受諾済み(accepted)の招待は invitee ポリシーでは不可視（status='invited' 限定）
  perform test.as_user('00000000-0000-4000-8000-0000000000d1');
  select count(*) into v_accepted_hidden from public.case_invitations
   where invited_email = 'cust.p2a2.primary@example.test';
  if v_accepted_hidden <> 0 then raise exception 'TEST FAIL: P2A2-07 accepted invitation still visible to customer: %', v_accepted_hidden; end if;
end
$$;

-- P2A2-08: cancelled 案件では基本情報を更新できない（customer_case_not_inputtable）
do $$
declare v_failed boolean := false;
begin
  -- スタッフが inputting -> cancelled
  perform test.as_user('00000000-0000-4000-8000-000000000003'); -- assigned sales
  perform public.app_transition_customer_case_status(test.id('p2a2_case'), 'cancelled');
  perform test.as_user('00000000-0000-4000-8000-0000000000d1');
  begin
    perform public.app_update_own_applicant_profile(
      test.id('p2a2_app_p'), '架空 太郎2', null, null, null, null, null, null);
  exception when others then
    if position('customer_case_not_inputtable' in sqlerrm) = 0 then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'TEST FAIL: P2A2-08 update allowed on cancelled case'; end if;
  perform test.reset();
end
$$;

\echo 'P2A2: ALL Phase 2A-2a profile/invitee tests passed'
