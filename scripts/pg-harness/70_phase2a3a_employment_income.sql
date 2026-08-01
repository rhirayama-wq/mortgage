-- ============================================================================
-- 70_phase2a3a_employment_income.sql — Phase 2A-3a（申込者の勤務・収入情報）の
--   RLS・業務関数・完了判定・監査・スタッフ進捗(値なし)テスト (PG_HARNESS)
-- FICTIONAL / TEST ONLY / PRODUCTION USE PROHIBITED
-- 依存: 0001+0002+0003+0004+0005 migration、10_fixtures（org_a admin/sales, org_b admin）。
-- 40/50/60 の後に実行。既存 membership/案件を変更しない（新規案件のみ使う）。
-- ============================================================================
\set ON_ERROR_STOP on

-- 架空の顧客（Phase 2A-3a 用）
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000f4', 'cust.p2a3.primary@example.test'),
  ('00000000-0000-4000-8000-0000000000f2', 'cust.p2a3.co@example.test'),
  ('00000000-0000-4000-8000-0000000000f3', 'cust.p2a3.outsider@example.test')
on conflict (id) do nothing;

-- ---- セットアップ: 案件(primary/co 受諾済み) ----
do $$
declare
  c_s1  constant uuid := '00000000-0000-4000-8000-000000000003'; -- org_a sales (assigned)
  c_cp  constant uuid := '00000000-0000-4000-8000-0000000000f4'; -- primary customer
  c_cc  constant uuid := '00000000-0000-4000-8000-0000000000f2'; -- co-applicant customer
  v_case uuid; v_inv_p uuid; v_inv_c uuid; v_app_p uuid; v_app_c uuid; v_sys uuid;
begin
  perform test.as_user(c_s1);
  v_case := public.app_create_customer_case(test.id('org_a'), test.id('m_s1'),
              'P2A3 Employment/Income Case (test only)', 50000000);
  v_inv_p := public.app_invite_case_applicant(v_case, 'primary', 'cust.p2a3.primary@example.test');
  v_inv_c := public.app_invite_case_applicant(v_case, 'co_applicant', 'cust.p2a3.co@example.test', '配偶者');

  perform test.as_user(c_cp);
  perform public.app_accept_case_invitation(v_inv_p);
  perform test.as_user(c_cc);
  perform public.app_accept_case_invitation(v_inv_c);

  perform test.reset();
  select id into v_app_p from public.case_applicants where case_id = v_case and applicant_type = 'primary';
  select id into v_app_c from public.case_applicants where case_id = v_case and applicant_type = 'co_applicant';
  if v_app_p is null or v_app_c is null then
    raise exception 'FIXTURE FAIL: P2A3 applicants not found';
  end if;
  -- 既存 SYSTEM_ADMIN を解決（除外テスト用。id はハードコードしない）。
  select id into v_sys from public.user_profiles where system_role = 'SYSTEM_ADMIN' limit 1;
  if v_sys is null then raise exception 'FIXTURE FAIL: P2A3 no SYSTEM_ADMIN in fixtures'; end if;
  insert into test.ids values
    ('p2a3_case', v_case), ('p2a3_app_p', v_app_p), ('p2a3_app_c', v_app_c),
    ('p2a3_sys', v_sys);
end
$$;

-- P2A3-01: 本人(primary)は給与系フル入力で保存でき complete=true、opened -> inputting
do $$
declare v_ts timestamptz; v_complete boolean; v_missing text[]; v_status public.customer_case_status; v_n int;
begin
  perform test.as_user('00000000-0000-4000-8000-0000000000f4');
  select updated_at, is_complete, missing_fields
    into v_ts, v_complete, v_missing
    from public.app_upsert_own_applicant_employment_income(
      test.id('p2a3_app_p'), '架空商事株式会社', 'full_time', date '2018-04-01', 6000000, 'salary', null);
  if v_ts is null then raise exception 'TEST FAIL: P2A3-01 no timestamp'; end if;
  if not v_complete then raise exception 'TEST FAIL: P2A3-01 not complete: missing=%', v_missing; end if;
  if array_length(v_missing, 1) is not null then raise exception 'TEST FAIL: P2A3-01 missing not empty: %', v_missing; end if;
  perform test.reset();
  select status into v_status from public.customer_cases where id = test.id('p2a3_case');
  if v_status <> 'inputting' then raise exception 'TEST FAIL: P2A3-01 status not inputting: %', v_status; end if;
  select count(*) into v_n from public.case_applicant_employment_income where applicant_id = test.id('p2a3_app_p');
  if v_n <> 1 then raise exception 'TEST FAIL: P2A3-01 row not upserted %', v_n; end if;
end
$$;

-- P2A3-02: 完了判定は雇用形態別ルールに従う（DB 純粋関数が唯一の正）
do $$
declare v_complete boolean; v_missing text[];
begin
  perform test.as_user('00000000-0000-4000-8000-0000000000f4');

  -- 給与系(full_time)で勤務先名欠落 -> incomplete, missing に employer_name
  select is_complete, missing_fields into v_complete, v_missing
    from public.app_upsert_own_applicant_employment_income(
      test.id('p2a3_app_p'), null, 'full_time', date '2018-04-01', 6000000, 'salary', null);
  if v_complete then raise exception 'TEST FAIL: P2A3-02 full_time w/o employer marked complete'; end if;
  if not (v_missing @> array['employer_name']::text[]) then
    raise exception 'TEST FAIL: P2A3-02 employer_name not in missing: %', v_missing;
  end if;

  -- self_employed は勤務先名/入社年月不要（income + income_type で complete）
  select is_complete, missing_fields into v_complete, v_missing
    from public.app_upsert_own_applicant_employment_income(
      test.id('p2a3_app_p'), null, 'self_employed', null, 3000000, 'business', null);
  if not v_complete then raise exception 'TEST FAIL: P2A3-02 self_employed not complete: %', v_missing; end if;

  -- unemployed は雇用形態のみで complete
  select is_complete, missing_fields into v_complete, v_missing
    from public.app_upsert_own_applicant_employment_income(
      test.id('p2a3_app_p'), null, 'unemployed', null, null, null, null);
  if not v_complete then raise exception 'TEST FAIL: P2A3-02 unemployed not complete: %', v_missing; end if;

  -- employment_type が null なら常に incomplete
  select is_complete into v_complete
    from public.app_upsert_own_applicant_employment_income(
      test.id('p2a3_app_p'), null, null, null, 3000000, 'salary', null);
  if v_complete then raise exception 'TEST FAIL: P2A3-02 null type marked complete'; end if;

  -- 後続テストのため full_time フル入力へ戻す
  perform public.app_upsert_own_applicant_employment_income(
    test.id('p2a3_app_p'), '架空商事株式会社', 'full_time', date '2018-04-01', 6000000, 'salary', null);
end
$$;

-- P2A3-03: 共同申込者・無関係顧客は他人の勤務収入を更新できない（not_authorized）
do $$
declare v_f1 boolean := false; v_f2 boolean := false;
begin
  perform test.as_user('00000000-0000-4000-8000-0000000000f2'); -- co-applicant
  begin
    perform public.app_upsert_own_applicant_employment_income(
      test.id('p2a3_app_p'), 'hack', 'full_time', null, null, null, null);
  exception when others then
    if position('not_authorized' in sqlerrm) = 0 then raise; end if; v_f1 := true;
  end;
  perform test.as_user('00000000-0000-4000-8000-0000000000f3'); -- outsider
  begin
    perform public.app_upsert_own_applicant_employment_income(
      test.id('p2a3_app_p'), 'hack', 'full_time', null, null, null, null);
  exception when others then
    if position('not_authorized' in sqlerrm) = 0 then raise; end if; v_f2 := true;
  end;
  if not v_f1 then raise exception 'TEST FAIL: P2A3-03 co-applicant updated others'; end if;
  if not v_f2 then raise exception 'TEST FAIL: P2A3-03 outsider updated others'; end if;
end
$$;

-- P2A3-04: 不正入力は種別ごとの安全コードで拒否
do $$
declare v_e1 boolean := false; v_e2 boolean := false; v_e3 boolean := false;
begin
  perform test.as_user('00000000-0000-4000-8000-0000000000f4');
  -- 不正な雇用形態 enum
  begin
    perform public.app_upsert_own_applicant_employment_income(
      test.id('p2a3_app_p'), null, 'director', null, null, null, null);
  exception when others then
    if position('invalid_employment_income_field' in sqlerrm) = 0 then raise; end if; v_e1 := true;
  end;
  -- 未来の入社年月
  begin
    perform public.app_upsert_own_applicant_employment_income(
      test.id('p2a3_app_p'), null, 'full_time', (current_date + interval '2 months')::date, null, null, null);
  exception when others then
    if position('invalid_employment_started_on' in sqlerrm) = 0 then raise; end if; v_e2 := true;
  end;
  -- 負の年収
  begin
    perform public.app_upsert_own_applicant_employment_income(
      test.id('p2a3_app_p'), null, 'full_time', null, -1, null, null);
  exception when others then
    if position('invalid_annual_income' in sqlerrm) = 0 then raise; end if; v_e3 := true;
  end;
  if not v_e1 then raise exception 'TEST FAIL: P2A3-04 bad employment_type accepted'; end if;
  if not v_e2 then raise exception 'TEST FAIL: P2A3-04 future started_on accepted'; end if;
  if not v_e3 then raise exception 'TEST FAIL: P2A3-04 negative income accepted'; end if;
end
$$;

-- P2A3-05: 入社年月は月初へ正規化される（YYYY-MM-15 -> YYYY-MM-01）
do $$
declare v_started date;
begin
  perform test.as_user('00000000-0000-4000-8000-0000000000f4');
  perform public.app_upsert_own_applicant_employment_income(
    test.id('p2a3_app_p'), '架空商事株式会社', 'full_time', date '2015-07-15', 6000000, 'salary', null);
  perform test.reset();
  select employment_started_on into v_started
    from public.case_applicant_employment_income where applicant_id = test.id('p2a3_app_p');
  if v_started <> date '2015-07-01' then raise exception 'TEST FAIL: P2A3-05 not month-normalized: %', v_started; end if;
end
$$;

-- P2A3-06: スタッフ（担当営業・org admin）は safe RPC で進捗のみ取得（値テーブルは直接 SELECT 不可＝0 件）
do $$
declare v_rows int; v_complete boolean; v_direct int;
begin
  -- 担当営業
  perform test.as_user('00000000-0000-4000-8000-000000000003');
  select count(*) into v_rows from public.app_list_case_employment_income_progress(test.id('p2a3_case'));
  if v_rows < 2 then raise exception 'TEST FAIL: P2A3-06 sales sees < 2 applicants progress: %', v_rows; end if;
  select is_required_input_complete into v_complete
    from public.app_list_case_employment_income_progress(test.id('p2a3_case'))
   where applicant_id = test.id('p2a3_app_p');
  if not v_complete then raise exception 'TEST FAIL: P2A3-06 primary not shown complete to sales'; end if;
  -- 値テーブルの直接 SELECT はスタッフに許可していない（0 件）
  select count(*) into v_direct from public.case_applicant_employment_income
   where applicant_id = test.id('p2a3_app_p');
  if v_direct <> 0 then raise exception 'TEST FAIL: P2A3-06 sales SELECTed value table %', v_direct; end if;

  -- org admin も進捗は見えるが値は不可視
  perform test.as_user('00000000-0000-4000-8000-000000000002');
  select count(*) into v_rows from public.app_list_case_employment_income_progress(test.id('p2a3_case'));
  if v_rows < 2 then raise exception 'TEST FAIL: P2A3-06 admin sees < 2 progress: %', v_rows; end if;
  select count(*) into v_direct from public.case_applicant_employment_income
   where applicant_id = test.id('p2a3_app_p');
  if v_direct <> 0 then raise exception 'TEST FAIL: P2A3-06 admin SELECTed value table %', v_direct; end if;
end
$$;

-- P2A3-07: SYSTEM_ADMIN は進捗 RPC で 0 件、値テーブルも不可視（意図的に除外）
do $$
declare v_rows int; v_direct int;
begin
  perform test.as_user(test.id('p2a3_sys'));
  select count(*) into v_rows from public.app_list_case_employment_income_progress(test.id('p2a3_case'));
  if v_rows <> 0 then raise exception 'TEST FAIL: P2A3-07 system admin got progress rows %', v_rows; end if;
  select count(*) into v_direct from public.case_applicant_employment_income
   where applicant_id = test.id('p2a3_app_p');
  if v_direct <> 0 then raise exception 'TEST FAIL: P2A3-07 system admin SELECTed value table %', v_direct; end if;
end
$$;

-- P2A3-08: 他 organization の admin は進捗 0 件・値も不可視（テナント分離）
do $$
declare v_rows int; v_direct int;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000004'); -- org_b admin
  select count(*) into v_rows from public.app_list_case_employment_income_progress(test.id('p2a3_case'));
  if v_rows <> 0 then raise exception 'TEST FAIL: P2A3-08 cross-org admin got progress %', v_rows; end if;
  select count(*) into v_direct from public.case_applicant_employment_income
   where applicant_id = test.id('p2a3_app_p');
  if v_direct <> 0 then raise exception 'TEST FAIL: P2A3-08 cross-org admin SELECTed value table %', v_direct; end if;
end
$$;

-- P2A3-09: 直接 INSERT/UPDATE/DELETE は拒否（本人でも直接 DML 不可・DELETE はガードでも禁止）
do $$
declare v_ok int := 0;
begin
  perform test.as_user('00000000-0000-4000-8000-0000000000f4'); -- 本人
  begin
    insert into public.case_applicant_employment_income (applicant_id, employer_name)
      values (test.id('p2a3_app_c'), 'hack');
  exception when insufficient_privilege then v_ok := v_ok + 1; when others then v_ok := v_ok + 1; end;
  begin
    update public.case_applicant_employment_income set employer_name = 'hack'
     where applicant_id = test.id('p2a3_app_p');
  exception when insufficient_privilege then v_ok := v_ok + 1; end;
  begin
    delete from public.case_applicant_employment_income where applicant_id = test.id('p2a3_app_p');
  exception when insufficient_privilege then v_ok := v_ok + 1; end;
  if v_ok <> 3 then raise exception 'TEST FAIL: P2A3-09 direct writes not blocked %/3', v_ok; end if;
end
$$;

-- P2A3-10: 監査は「初回作成 + 完了状態遷移」のみ・毎回の autosave では書かない・財務値なし
do $$
declare v_created int; v_updated int; v_leak int; v_ts1 timestamptz; v_ts2 timestamptz;
begin
  -- 共同申込者(app_c)で監査遷移を制御する（まだ未作成）。
  perform test.as_user('00000000-0000-4000-8000-0000000000f2');
  -- save1: 初回作成・incomplete（full_time + 勤務先名のみ） -> created 監査 1 件
  perform public.app_upsert_own_applicant_employment_income(
    test.id('p2a3_app_c'), '架空コ商事株式会社', 'full_time', null, null, null, null);
  -- save2: incomplete のまま入社年月だけ追加（遷移なし） -> 追加監査なし
  perform public.app_upsert_own_applicant_employment_income(
    test.id('p2a3_app_c'), '架空コ商事株式会社', 'full_time', date '2019-09-01', null, null, null);
  -- save3: 収入・区分追加で complete へ遷移 -> updated 監査 1 件
  perform public.app_upsert_own_applicant_employment_income(
    test.id('p2a3_app_c'), '架空コ商事株式会社', 'full_time', date '2019-09-01', 5000000, 'salary', null);

  perform test.reset();
  select count(*) into v_created from public.authoritative_audit_logs
   where action = 'case_applicant_employment_income.created'
     and resource_id = test.id('p2a3_app_c')::text and success;
  if v_created <> 1 then raise exception 'TEST FAIL: P2A3-10 created audit count %', v_created; end if;

  select count(*) into v_updated from public.authoritative_audit_logs
   where action = 'case_applicant_employment_income.updated'
     and resource_id = test.id('p2a3_app_c')::text and success;
  if v_updated <> 1 then raise exception 'TEST FAIL: P2A3-10 updated(transition) audit count %', v_updated; end if;

  -- 財務値・勤務先名が監査 metadata に入っていないこと
  select count(*) into v_leak from public.authoritative_audit_logs
   where metadata::text ilike '%架空コ商事株式会社%'
      or metadata::text ilike '%5000000%';
  if v_leak <> 0 then raise exception 'TEST FAIL: P2A3-10 financial value leaked to audit %', v_leak; end if;
end
$$;

-- P2A3-11: 案件が cancelled になると本人でも更新不可（customer_case_not_inputtable）
do $$
declare v_failed boolean := false;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000003'); -- assigned sales
  perform public.app_transition_customer_case_status(test.id('p2a3_case'), 'cancelled');
  perform test.as_user('00000000-0000-4000-8000-0000000000f4');
  begin
    perform public.app_upsert_own_applicant_employment_income(
      test.id('p2a3_app_p'), '架空商事株式会社2', 'full_time', date '2018-04-01', 6000000, 'salary', null);
  exception when others then
    if position('customer_case_not_inputtable' in sqlerrm) = 0 then raise; end if; v_failed := true;
  end;
  if not v_failed then raise exception 'TEST FAIL: P2A3-11 update allowed on cancelled case'; end if;
  perform test.reset();
end
$$;

\echo 'P2A3: ALL Phase 2A-3a employment/income tests passed'
