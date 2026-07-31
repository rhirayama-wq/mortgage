-- ============================================================================
-- 40_phase2a_customer_cases.sql — Phase 2A-1 (customer cases / invitations /
--   participants) の RLS・業務関数・テナント分離テスト (PG_HARNESS)
-- FICTIONAL / TEST ONLY / PRODUCTION USE PROHIBITED
-- 依存: 0001 + 0002 migration、10_fixtures（org_a/org_b、m_s1/m_a1/m_b1 等）。
-- 本ファイルは全 CONC テストの後（最後）に実行し、既存 membership を変更しない
-- （新規の営業ユーザー・案件のみを追加する）。
-- ============================================================================
\set ON_ERROR_STOP on

-- 架空の顧客・追加営業ユーザー（auth.users への insert で profile 自動作成）
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000c1', 'cust.primary.fictional@example.test'),
  ('00000000-0000-4000-8000-0000000000c2', 'cust.co.fictional@example.test'),
  ('00000000-0000-4000-8000-0000000000c3', 'cust.b.fictional@example.test'),
  ('00000000-0000-4000-8000-0000000000c4', 'cust.outsider.fictional@example.test'),
  ('00000000-0000-4000-8000-0000000000c5', 'sales.a2.fictional@example.test')
on conflict (id) do nothing;

-- ---- セットアップ: 追加営業(m_s2)、案件A(org_a)、申込者/招待/受諾、案件B(org_b) ----
do $$
declare
  c_a1  constant uuid := '00000000-0000-4000-8000-000000000002'; -- org_a admin
  c_s1  constant uuid := '00000000-0000-4000-8000-000000000003'; -- org_a sales (assigned)
  c_b1  constant uuid := '00000000-0000-4000-8000-000000000004'; -- org_b admin
  c_cp  constant uuid := '00000000-0000-4000-8000-0000000000c1'; -- customer primary
  c_cc  constant uuid := '00000000-0000-4000-8000-0000000000c2'; -- customer co-applicant
  c_cb  constant uuid := '00000000-0000-4000-8000-0000000000c3'; -- customer (org_b case)
  c_s2  constant uuid := '00000000-0000-4000-8000-0000000000c5'; -- org_a sales #2 (unassigned)
  v_m_s2 uuid; v_case_a uuid; v_case_b uuid; v_case_c uuid;
  v_app_p uuid; v_app_c uuid; v_inv_p uuid; v_inv_c uuid; v_part_p uuid;
begin
  -- org_a admin が営業#2 を招待、本人受諾
  perform test.as_user(c_a1);
  v_m_s2 := public.app_invite_organization_member(test.id('org_a'), 'sales.a2.fictional@example.test', 'SALES_USER');
  perform test.as_user(c_s2);
  perform public.app_accept_invitation(v_m_s2);

  -- 営業#1(assigned) が案件A作成（m_s1 割当）
  perform test.as_user(c_s1);
  v_case_a := public.app_create_customer_case(test.id('org_a'), test.id('m_s1'),
                'Fictional Case A (test only)', 80000000);
  -- 主申込者・共同申込者を招待
  v_inv_p := public.app_invite_case_applicant(v_case_a, 'primary', 'cust.primary.fictional@example.test');
  v_inv_c := public.app_invite_case_applicant(v_case_a, 'co_applicant', 'cust.co.fictional@example.test', '配偶者');

  -- 顧客が受諾（本人メール一致）
  perform test.as_user(c_cp);
  v_part_p := public.app_accept_case_invitation(v_inv_p);
  perform test.as_user(c_cc);
  perform public.app_accept_case_invitation(v_inv_c);

  -- org_b 側に同名の案件B（テナント分離テスト用）
  perform test.as_user(c_b1);
  v_case_b := public.app_create_customer_case(test.id('org_b'), test.id('m_b1'),
                'Fictional Case A (test only)', 80000000);
  v_inv_c := public.app_invite_case_applicant(v_case_b, 'primary', 'cust.b.fictional@example.test');
  perform test.as_user(c_cb);
  perform public.app_accept_case_invitation(v_inv_c);

  -- 営業#2 に案件C（suspended 可視性テスト用）
  perform test.as_user(c_s2);
  v_case_c := public.app_create_customer_case(test.id('org_a'), v_m_s2,
                'Fictional Case C (test only)');

  -- id 保存: case_applicants は RLS 対象。現在ロール(営業#2)は案件A未担当で不可視のため、
  --   superuser(test.reset)へ戻してから読み戻す（applicant は招待時に作成済み。10_fixtures と同じ手順）。
  perform test.reset();
  select id into v_app_p from public.case_applicants
   where case_id = v_case_a and applicant_type = 'primary';
  select id into v_app_c from public.case_applicants
   where case_id = v_case_a and applicant_type = 'co_applicant';
  if v_app_p is null then
    raise exception 'FIXTURE FAIL: P2A primary applicant not found for case_a';
  end if;
  if v_app_c is null then
    raise exception 'FIXTURE FAIL: P2A co-applicant not found for case_a';
  end if;
  insert into test.ids values
    ('p2a_m_s2', v_m_s2), ('p2a_case_a', v_case_a), ('p2a_case_b', v_case_b),
    ('p2a_case_c', v_case_c), ('p2a_app_p', v_app_p), ('p2a_app_c', v_app_c),
    ('p2a_inv_p', v_inv_p), ('p2a_part_p', v_part_p);
end
$$;

-- P2A-RLS-01: 顧客(primary)は自案件Aを1件見える／案件B(他org)は不可視
do $$
declare v_n int;
begin
  perform test.as_user('00000000-0000-4000-8000-0000000000c1');
  select count(*) into v_n from public.customer_cases where id = test.id('p2a_case_a');
  if v_n <> 1 then raise exception 'TEST FAIL: P2A-RLS-01 own case not visible: %', v_n; end if;
  select count(*) into v_n from public.customer_cases where id = test.id('p2a_case_b');
  if v_n <> 0 then raise exception 'TEST FAIL: P2A-RLS-01 other-org case visible: %', v_n; end if;
end
$$;

-- P2A-RLS-02: 顧客は自分の申込者PIIのみ可視（共同申込者PIIは不可視）
do $$
declare v_own int; v_other int;
begin
  perform test.as_user('00000000-0000-4000-8000-0000000000c1'); -- primary
  select count(*) into v_own   from public.case_applicant_profiles where applicant_id = test.id('p2a_app_p');
  select count(*) into v_other from public.case_applicant_profiles where applicant_id = test.id('p2a_app_c');
  if v_own <> 1 then raise exception 'TEST FAIL: P2A-RLS-02 own PII invisible: %', v_own; end if;
  if v_other <> 0 then raise exception 'TEST FAIL: P2A-RLS-02 co-applicant PII visible: %', v_other; end if;
end
$$;

-- P2A-RLS-03: assigned 営業(m_s1=U3)は案件Aを見える／未担当営業#2は不可視
do $$
declare v_assigned int; v_unassigned int;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000003'); -- assigned sales
  select count(*) into v_assigned from public.customer_cases where id = test.id('p2a_case_a');
  perform test.as_user('00000000-0000-4000-8000-0000000000c5'); -- sales #2 (unassigned to case A)
  select count(*) into v_unassigned from public.customer_cases where id = test.id('p2a_case_a');
  if v_assigned <> 1 then raise exception 'TEST FAIL: P2A-RLS-03 assigned sales cannot see case: %', v_assigned; end if;
  if v_unassigned <> 0 then raise exception 'TEST FAIL: P2A-RLS-03 unassigned sales sees case: %', v_unassigned; end if;
end
$$;

-- P2A-RLS-04: ORG_ADMIN(org_a)は自org案件Aを見える／org_b ADMIN は不可視
do $$
declare v_own int; v_other int;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000002'); -- org_a admin
  select count(*) into v_own from public.customer_cases where id = test.id('p2a_case_a');
  perform test.as_user('00000000-0000-4000-8000-000000000004'); -- org_b admin
  select count(*) into v_other from public.customer_cases where id = test.id('p2a_case_a');
  if v_own <> 1 then raise exception 'TEST FAIL: P2A-RLS-04 org admin cannot see own-org case: %', v_own; end if;
  if v_other <> 0 then raise exception 'TEST FAIL: P2A-RLS-04 other-org admin sees case: %', v_other; end if;
end
$$;

-- P2A-RLS-05: suspended 営業は担当案件を失う（案件C=営業#2）
do $$
declare v_before int; v_after int;
begin
  perform test.as_user('00000000-0000-4000-8000-0000000000c5'); -- sales #2 assigned to case C
  select count(*) into v_before from public.customer_cases where id = test.id('p2a_case_c');
  -- org_a admin が営業#2 を suspend
  perform test.as_user('00000000-0000-4000-8000-000000000002');
  perform public.app_suspend_member(test.id('p2a_m_s2'));
  perform test.as_user('00000000-0000-4000-8000-0000000000c5');
  select count(*) into v_after from public.customer_cases where id = test.id('p2a_case_c');
  if v_before <> 1 then raise exception 'TEST FAIL: P2A-RLS-05 active sales cannot see assigned case: %', v_before; end if;
  if v_after <> 0 then raise exception 'TEST FAIL: P2A-RLS-05 suspended sales still sees case: %', v_after; end if;
end
$$;

-- P2A-RLS-06: anon / JWTなし authenticated は不可視
do $$
declare v_anon_blocked boolean := false; v_n int;
begin
  perform test.as_anon();
  begin
    select count(*) into v_n from public.customer_cases;
  exception when insufficient_privilege then v_anon_blocked := true;
  end;
  if not v_anon_blocked then raise exception 'TEST FAIL: P2A-RLS-06 anon can select customer_cases'; end if;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_n from public.customer_cases;
  if v_n <> 0 then raise exception 'TEST FAIL: P2A-RLS-06 no-jwt authenticated sees cases: %', v_n; end if;
end
$$;

-- P2A-FN-01: 他org へ案件作成は不可（営業#1 が org_b へ作成 → not_authorized）
do $$
declare v_failed boolean := false;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000003');
  begin
    perform public.app_create_customer_case(test.id('org_b'), test.id('m_b1'), 'x (test)');
  exception when others then
    if position('not_authorized' in sqlerrm) = 0 then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'TEST FAIL: P2A-FN-01 cross-org create allowed'; end if;
end
$$;

-- P2A-FN-02: 無効な assigned membership（他org の membership を割当）は拒否
do $$
declare v_failed boolean := false;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000002'); -- org_a admin
  begin
    perform public.app_create_customer_case(test.id('org_a'), test.id('m_b1'), 'x (test)');
  exception when others then
    if position('invalid_assigned_membership' in sqlerrm) = 0 then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'TEST FAIL: P2A-FN-02 invalid assigned membership accepted'; end if;
end
$$;

-- P2A-FN-03: 非スタッフ(顧客)の招待は拒否
do $$
declare v_failed boolean := false;
begin
  perform test.as_user('00000000-0000-4000-8000-0000000000c1'); -- customer
  begin
    perform public.app_invite_case_applicant(test.id('p2a_case_a'), 'co_applicant', 'x.fictional@example.test');
  exception when others then
    if position('not_authorized' in sqlerrm) = 0 then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'TEST FAIL: P2A-FN-03 non-staff invite allowed'; end if;
end
$$;

-- P2A-FN-04: メール不一致の受諾は拒否（無関係顧客が primary 招待を受諾）
do $$
declare v_failed boolean := false;
begin
  perform test.as_user('00000000-0000-4000-8000-0000000000c4'); -- outsider
  begin
    perform public.app_accept_case_invitation(test.id('p2a_inv_p'));
  exception when others then
    if position('invite_email_mismatch' in sqlerrm) = 0 then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'TEST FAIL: P2A-FN-04 email-mismatch accept allowed'; end if;
end
$$;

-- P2A-FN-05: 二重受諾は重複 participant を作らない（冪等）
do $$
declare v_n int; v_part uuid;
begin
  perform test.as_user('00000000-0000-4000-8000-0000000000c1');
  v_part := public.app_accept_case_invitation(test.id('p2a_inv_p'));
  if v_part is distinct from test.id('p2a_part_p') then
    raise exception 'TEST FAIL: P2A-FN-05 re-accept returned different participant';
  end if;
  perform test.reset();
  select count(*) into v_n from public.case_participants where applicant_id = test.id('p2a_app_p');
  if v_n <> 1 then raise exception 'TEST FAIL: P2A-FN-05 duplicate participant created: %', v_n; end if;
end
$$;

-- P2A-FN-06: 期限切れ招待の受諾は拒否（superuser で expires_at を過去へ）
do $$
declare v_inv uuid; v_case_exp uuid; v_failed boolean := false;
begin
  -- 新規案件・招待を作り、期限を過去へ改変（テスト専用の superuser 操作）。
  -- 案件 id は関数戻り値で確実に取得する（RLS 依存の再 SELECT を避ける）。
  perform test.as_user('00000000-0000-4000-8000-000000000003');
  v_case_exp := public.app_create_customer_case(test.id('org_a'), test.id('m_s1'), 'Fictional Case Exp (test only)');
  v_inv := public.app_invite_case_applicant(
    v_case_exp, 'primary', 'cust.primary.fictional@example.test');
  perform test.reset();
  update public.case_invitations set expires_at = now() - interval '1 day' where id = v_inv;
  perform test.as_user('00000000-0000-4000-8000-0000000000c1');
  begin
    perform public.app_accept_case_invitation(v_inv);
  exception when others then
    if position('invitation_expired' in sqlerrm) = 0 then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'TEST FAIL: P2A-FN-06 expired invitation accepted'; end if;
end
$$;

-- P2A-FN-07: 未許可の状態遷移は拒否 / 許可遷移は成功（案件A: opened -> draft 不可, opened -> cancelled 可）
do $$
declare v_failed boolean := false; v_status public.customer_case_status;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000003'); -- assigned sales
  begin
    perform public.app_transition_customer_case_status(test.id('p2a_case_a'), 'draft');
  exception when others then
    if position('invalid_transition' in sqlerrm) = 0 then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'TEST FAIL: P2A-FN-07 invalid transition allowed'; end if;
  perform public.app_transition_customer_case_status(test.id('p2a_case_a'), 'cancelled');
  perform test.reset();
  select status into v_status from public.customer_cases where id = test.id('p2a_case_a');
  if v_status <> 'cancelled' then raise exception 'TEST FAIL: P2A-FN-07 valid transition not applied: %', v_status; end if;
end
$$;

-- P2A-FN-08: 認証済みユーザーの直接 INSERT/UPDATE/DELETE は拒否
do $$
declare v_ok int := 0;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000003');
  begin
    insert into public.customer_cases (organization_id, assigned_membership_id, case_name, created_by)
    values (test.id('org_a'), test.id('m_s1'), 'hack (test)', '00000000-0000-4000-8000-000000000003');
  exception when insufficient_privilege then v_ok := v_ok + 1; end;
  begin
    update public.customer_cases set case_name = 'hack' where id = test.id('p2a_case_b');
  exception when insufficient_privilege then v_ok := v_ok + 1; end;
  begin
    insert into public.case_participants (case_id, applicant_id, user_id, participant_role)
    values (test.id('p2a_case_b'), test.id('p2a_app_p'),
            '00000000-0000-4000-8000-0000000000c1', 'primary_applicant');
  exception when insufficient_privilege then v_ok := v_ok + 1; end;
  if v_ok <> 3 then raise exception 'TEST FAIL: P2A-FN-08 direct writes blocked %/3', v_ok; end if;
end
$$;

-- P2A-AUD-01: 成功操作で監査が作成される（PII を含まない）
do $$
declare v_created int; v_accepted int; v_pii int;
begin
  perform test.reset();
  select count(*) into v_created from public.authoritative_audit_logs
   where action = 'customer_case.created' and resource_id = test.id('p2a_case_a')::text and success;
  select count(*) into v_accepted from public.authoritative_audit_logs
   where action = 'case_invitation.accepted' and resource_id = test.id('p2a_inv_p')::text and success;
  if v_created <> 1 then raise exception 'TEST FAIL: P2A-AUD-01 no create audit: %', v_created; end if;
  if v_accepted <> 1 then raise exception 'TEST FAIL: P2A-AUD-01 no accept audit: %', v_accepted; end if;
  -- 監査 metadata に PII（email 断片）が入っていないこと
  select count(*) into v_pii from public.authoritative_audit_logs
   where metadata::text ilike '%fictional@example.test%';
  if v_pii <> 0 then raise exception 'TEST FAIL: P2A-AUD-01 PII in audit metadata: %', v_pii; end if;
end
$$;

-- P2A-TEN-01: 同名 case_name・同構造でも org 越境しない（顧客Bは案件A不可視・顧客primaryは案件B不可視）
do $$
declare v_ab int; v_ba int;
begin
  perform test.as_user('00000000-0000-4000-8000-0000000000c3'); -- customer of org_b case
  select count(*) into v_ab from public.customer_cases where id = test.id('p2a_case_a');
  perform test.as_user('00000000-0000-4000-8000-0000000000c1'); -- customer of org_a case
  select count(*) into v_ba from public.customer_cases where id = test.id('p2a_case_b');
  if v_ab <> 0 then raise exception 'TEST FAIL: P2A-TEN-01 org_b customer sees org_a case: %', v_ab; end if;
  if v_ba <> 0 then raise exception 'TEST FAIL: P2A-TEN-01 org_a customer sees org_b case: %', v_ba; end if;
  perform test.reset();
end
$$;

\echo 'P2A: ALL Phase 2A-1 customer-case tests passed'
