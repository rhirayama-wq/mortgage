-- ============================================================================
-- 60_phase2b_partner_loans.sql — Phase 2A-2b（提携ローン管理基盤）の
--   RLS・テナント分離・role・version・監査テスト (PG_HARNESS)
-- FICTIONAL / TEST ONLY / PRODUCTION USE PROHIBITED
-- 依存: 0001+0002+0003+0004 migration、10_fixtures（org_a/org_b、admin/sales）。
-- 40/50 の後に実行。既存 membership を変更しない（新規の提携ローンのみ追加）。
-- ============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000e1', 'cust.p2b.fictional@example.test')
on conflict (id) do nothing;

-- ---- セットアップ: org_a admin が提携ローンを作成（draft, version1） ----
do $$
declare
  c_a1 constant uuid := '00000000-0000-4000-8000-000000000002'; -- org_a admin
  v_loan uuid; v_v1 uuid;
begin
  perform test.as_user(c_a1);
  v_loan := public.app_create_organization_partner_loan(
    test.id('org_a'), '架空信用金庫', '架空 提携住宅ローン A',
    jsonb_build_object(
      'product_name', '架空 提携フラット',
      'interest_rate_type', 'fixed',
      'indicative_rate_bps', 125,
      'minimum_loan_amount_yen', 1000000,
      'maximum_loan_amount_yen', 100000000,
      'internal_underwriting_notes', '社外秘メモXYZ',
      'application_url', 'https://apply.example.test/a',
      'valid_from', to_char(current_date, 'YYYY-MM-DD'),
      'valid_until', to_char(current_date + 365, 'YYYY-MM-DD')));
  perform test.reset();
  select current_version_id into v_v1
    from public.organization_partner_loans where id = v_loan;
  if v_v1 is null then raise exception 'FIXTURE FAIL: P2B current version null'; end if;
  insert into test.ids values ('p2b_loan', v_loan), ('p2b_v1', v_v1);
end
$$;

-- P2B-01: 作成された提携ローンは draft・version1・current 設定済み
do $$
declare v_status public.partner_loan_status; v_n int;
begin
  perform test.reset();
  select status into v_status from public.organization_partner_loans where id = test.id('p2b_loan');
  if v_status <> 'draft' then raise exception 'TEST FAIL: P2B-01 status %', v_status; end if;
  select count(*) into v_n from public.organization_partner_loan_versions where partner_loan_id = test.id('p2b_loan');
  if v_n <> 1 then raise exception 'TEST FAIL: P2B-01 version count %', v_n; end if;
end
$$;

-- P2B-02: SALES_USER は作成不可（not_authorized）
do $$
declare v_failed boolean := false;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000003'); -- org_a sales
  begin
    perform public.app_create_organization_partner_loan(test.id('org_a'), 'X', 'Y',
      jsonb_build_object('product_name','p','interest_rate_type','variable'));
  exception when others then
    if position('not_authorized' in sqlerrm) = 0 then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'TEST FAIL: P2B-02 sales created partner loan'; end if;
end
$$;

-- P2B-03: SALES は draft 不可視 / 有効化後は可視（RLS + active list）
do $$
declare v_draft int; v_active int; v_list int;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000003');
  select count(*) into v_draft from public.organization_partner_loans where id = test.id('p2b_loan');
  if v_draft <> 0 then raise exception 'TEST FAIL: P2B-03 sales sees draft %', v_draft; end if;

  perform test.as_user('00000000-0000-4000-8000-000000000002'); -- admin activate
  perform public.app_activate_organization_partner_loan(test.id('p2b_loan'));

  perform test.as_user('00000000-0000-4000-8000-000000000003');
  select count(*) into v_active from public.organization_partner_loans where id = test.id('p2b_loan');
  if v_active <> 1 then raise exception 'TEST FAIL: P2B-03 sales cannot see active %', v_active; end if;
  select count(*) into v_list from public.app_list_org_active_partner_loans(test.id('org_a'))
   where partner_loan_id = test.id('p2b_loan');
  if v_list <> 1 then raise exception 'TEST FAIL: P2B-03 active list missing loan %', v_list; end if;
end
$$;

-- P2B-04: 他 organization からは不可視・更新不可
do $$
declare v_seen int; v_failed boolean := false;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000004'); -- org_b admin
  select count(*) into v_seen from public.organization_partner_loans where id = test.id('p2b_loan');
  if v_seen <> 0 then raise exception 'TEST FAIL: P2B-04 cross-org visible %', v_seen; end if;
  begin
    perform public.app_deactivate_organization_partner_loan(test.id('p2b_loan'));
  exception when others then
    if position('not_authorized' in sqlerrm) = 0 then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'TEST FAIL: P2B-04 cross-org update allowed'; end if;
end
$$;

-- P2B-05: 顧客（membership なし）は管理テーブル・金融機関マスタを一切見られない
do $$
declare v_l int; v_i int; v_v int;
begin
  perform test.as_user('00000000-0000-4000-8000-0000000000e1');
  select count(*) into v_l from public.organization_partner_loans;
  select count(*) into v_i from public.lending_institutions;
  select count(*) into v_v from public.organization_partner_loan_versions;
  if v_l <> 0 then raise exception 'TEST FAIL: P2B-05 customer sees loans %', v_l; end if;
  if v_i <> 0 then raise exception 'TEST FAIL: P2B-05 customer sees institutions %', v_i; end if;
  if v_v <> 0 then raise exception 'TEST FAIL: P2B-05 customer sees versions %', v_v; end if;
end
$$;

-- P2B-06: 直接 INSERT / UPDATE / DELETE は拒否
do $$
declare v_ok int := 0;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000002'); -- admin: それでも直接 DML 不可
  begin
    insert into public.organization_partner_loans
      (organization_id, lending_institution_id, stable_key, display_name,
       created_by_membership_id, updated_by_membership_id)
    values (test.id('org_a'), gen_random_uuid(), 'k', 'n', test.id('m_a1'), test.id('m_a1'));
  exception when insufficient_privilege then v_ok := v_ok + 1; when others then v_ok := v_ok + 1; end;
  begin
    update public.organization_partner_loans set display_name = 'hack' where id = test.id('p2b_loan');
  exception when insufficient_privilege then v_ok := v_ok + 1; end;
  begin
    update public.organization_partner_loan_versions set product_name = 'hack' where id = test.id('p2b_v1');
  exception when insufficient_privilege then v_ok := v_ok + 1; end;
  begin
    delete from public.organization_partner_loans where id = test.id('p2b_loan');
  exception when insufficient_privilege then v_ok := v_ok + 1; end;
  if v_ok <> 4 then raise exception 'TEST FAIL: P2B-06 direct writes not blocked %/4', v_ok; end if;
end
$$;

-- P2B-07: version 競合検知 / 正しい expected で新 version append・過去 version 保持
do $$
declare v_v2 uuid; v_cur uuid; v_n int; v_failed boolean := false;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000002');
  begin
    perform public.app_update_organization_partner_loan(
      test.id('p2b_loan'), gen_random_uuid(), '架空 提携住宅ローン A',
      jsonb_build_object('product_name','v2','interest_rate_type','variable'));
  exception when others then
    if position('partner_loan_version_conflict' in sqlerrm) = 0 then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'TEST FAIL: P2B-07 conflict not detected'; end if;

  v_v2 := public.app_update_organization_partner_loan(
    test.id('p2b_loan'), test.id('p2b_v1'), '架空 提携住宅ローン A 改',
    jsonb_build_object('product_name','v2','interest_rate_type','variable','indicative_rate_bps',100));
  perform test.reset();
  select current_version_id into v_cur from public.organization_partner_loans where id = test.id('p2b_loan');
  if v_cur is distinct from v_v2 then raise exception 'TEST FAIL: P2B-07 current not switched'; end if;
  select count(*) into v_n from public.organization_partner_loan_versions where partner_loan_id = test.id('p2b_loan');
  if v_n <> 2 then raise exception 'TEST FAIL: P2B-07 version count %', v_n; end if;
  if not exists (select 1 from public.organization_partner_loan_versions where id = test.id('p2b_v1')) then
    raise exception 'TEST FAIL: P2B-07 past version lost';
  end if;
end
$$;

-- P2B-08: 監査が作成され、内部審査メモが含まれない
do $$
declare v_c int; v_leak int;
begin
  perform test.reset();
  select count(*) into v_c from public.authoritative_audit_logs
   where action = 'partner_loan.created' and resource_id = test.id('p2b_loan')::text and success;
  if v_c <> 1 then raise exception 'TEST FAIL: P2B-08 no create audit %', v_c; end if;
  select count(*) into v_leak from public.authoritative_audit_logs
   where metadata::text ilike '%社外秘メモXYZ%';
  if v_leak <> 0 then raise exception 'TEST FAIL: P2B-08 internal note leaked to audit'; end if;
end
$$;

-- P2B-09: 無効化すると SALES の有効一覧から除外される
do $$
declare v_before int; v_after int;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000003');
  select count(*) into v_before from public.app_list_org_active_partner_loans(test.id('org_a'))
   where partner_loan_id = test.id('p2b_loan');
  perform test.as_user('00000000-0000-4000-8000-000000000002');
  perform public.app_deactivate_organization_partner_loan(test.id('p2b_loan'));
  perform test.as_user('00000000-0000-4000-8000-000000000003');
  select count(*) into v_after from public.app_list_org_active_partner_loans(test.id('org_a'))
   where partner_loan_id = test.id('p2b_loan');
  if v_before <> 1 then raise exception 'TEST FAIL: P2B-09 active not listed before %', v_before; end if;
  if v_after <> 0 then raise exception 'TEST FAIL: P2B-09 inactive still listed %', v_after; end if;
end
$$;

-- P2B-10: 確認済み更新（変更なし）で last_confirmed_at が設定される
do $$
declare v_ts timestamptz;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000002');
  perform public.app_confirm_organization_partner_loan(test.id('p2b_loan'));
  perform test.reset();
  select last_confirmed_at into v_ts from public.organization_partner_loans where id = test.id('p2b_loan');
  if v_ts is null then raise exception 'TEST FAIL: P2B-10 last_confirmed_at null'; end if;
end
$$;

\echo 'P2B: ALL Phase 2A-2b partner-loan tests passed'
