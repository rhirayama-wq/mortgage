-- ============================================================================
-- 0005_phase2a3a_employment_income.sql
-- Phase 2A-3a: 申込者の勤務・収入情報（顧客本人が途中保存・オートセーブ）
--   ・既存 0001–0004 を土台にする（本ファイルは追記のみ。既存 migration は書き換えない）。
--   ・値テーブルの SELECT は「顧客本人のみ」。スタッフは safe progress RPC のみ（値は返さない）。
--   ・書込は監査付き SECURITY DEFINER 業務関数のみ。直接 INSERT/UPDATE/DELETE 禁止。
--   ・判定・承認確率・申込は本フェーズでは扱わない（Loan Checker はルール判定=将来 / 承認確率=モゲチェックAPI）。
--   ・PII/財務値（勤務先名・年収・入社年月・収入区分）は監査 metadata / URL / ログへ出さない。
--   ・金額は BIGINT 円（*_yen）。入社年月は date（月初へ正規化・未来日拒否は RPC 側／CHECK に current_date は使わない）。
--   ・雇用形態別の必須ルール（complete 判定）は本ファイルの純粋関数を唯一の正とする（TS へ重複させない）。
-- FICTIONAL / LOCAL ONLY / PRODUCTION USE PROHIBITED。
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. ENUMs
-- ---------------------------------------------------------------------------
create type public.applicant_employment_type as enum
  ('full_time', 'contract', 'part_time', 'self_employed', 'executive', 'pension', 'unemployed', 'other');
create type public.applicant_income_type as enum
  ('salary', 'business', 'pension', 'other');

-- ---------------------------------------------------------------------------
-- 2. Table（申込者と 1:1・全業務項目 nullable＝部分保存）
-- ---------------------------------------------------------------------------
create table public.case_applicant_employment_income (
  applicant_id            uuid primary key references public.case_applicants (id),
  employer_name           text,
  employment_type         public.applicant_employment_type,
  employment_started_on   date,
  annual_gross_income_yen bigint,
  income_type             public.applicant_income_type,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint caei_employer_name_len check (employer_name is null or length(btrim(employer_name)) between 1 and 200),
  constraint caei_income_nonneg check (annual_gross_income_yen is null or annual_gross_income_yen >= 0),
  -- 下限のみ CHECK（current_date は使わない＝未来日拒否は RPC/TS で行う）。
  constraint caei_started_on_min check (employment_started_on is null or employment_started_on >= date '1900-01-01')
);

comment on table public.case_applicant_employment_income is
  'Applicant employment/income (financial PII). SELECT only by the owning participant; staff use the safe progress RPC (flags only). Written via app_upsert_own_applicant_employment_income only. No version history. Values never enter audit/URL/logs.';

-- updated_at トリガー（0001 の app_set_updated_at を再利用）
create trigger set_updated_at before update on public.case_applicant_employment_income
  for each row execute function public.app_set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. 整合性トリガー（二重防御。applicant_id 不変・hard delete 禁止）
-- ---------------------------------------------------------------------------
create function public.app_case_applicant_employment_income_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'employment_income_delete_forbidden' using errcode = '42501';
  end if;
  if new.applicant_id is distinct from old.applicant_id then
    raise exception 'employment_income_applicant_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger case_applicant_employment_income_guard
  before update or delete on public.case_applicant_employment_income
  for each row execute function public.app_case_applicant_employment_income_guard();

-- ---------------------------------------------------------------------------
-- 4. RLS（値テーブルは顧客本人のみ。スタッフ・SYSTEM_ADMIN の直接 SELECT ポリシーは置かない）
-- ---------------------------------------------------------------------------
alter table public.case_applicant_employment_income enable row level security;

create policy caei_select_own on public.case_applicant_employment_income
  for select to authenticated using (public.app_participant_owns_applicant(applicant_id));

revoke all on table public.case_applicant_employment_income from anon, authenticated, service_role;
grant select on public.case_applicant_employment_income to authenticated;

-- ---------------------------------------------------------------------------
-- 5. complete 判定（唯一の正・純粋 IMMUTABLE）。雇用形態別 required ルール。
--    給与系(full_time/contract/part_time/executive): employer_name + started_on + income + income_type
--    self_employed / pension / other: income + income_type
--    unemployed: employment_type のみ
--    employment_type が null なら常に incomplete。
-- ---------------------------------------------------------------------------
create function public.app_employment_income_is_complete(
  p_employment_type public.applicant_employment_type,
  p_employer_name text,
  p_employment_started_on date,
  p_annual_gross_income_yen bigint,
  p_income_type public.applicant_income_type
) returns boolean language sql immutable set search_path = ''
as $$
  select case
    when p_employment_type is null then false
    when p_employment_type in ('full_time','contract','part_time','executive') then
      (p_employer_name is not null and btrim(p_employer_name) <> ''
       and p_employment_started_on is not null
       and p_annual_gross_income_yen is not null
       and p_income_type is not null)
    when p_employment_type in ('self_employed','pension','other') then
      (p_annual_gross_income_yen is not null and p_income_type is not null)
    when p_employment_type = 'unemployed' then true
    else false
  end;
$$;

create function public.app_employment_income_missing_fields(
  p_employment_type public.applicant_employment_type,
  p_employer_name text,
  p_employment_started_on date,
  p_annual_gross_income_yen bigint,
  p_income_type public.applicant_income_type
) returns text[] language sql immutable set search_path = ''
as $$
  select case
    when p_employment_type is null then array['employment_type']::text[]
    else array_remove(array[
      case when p_employment_type in ('full_time','contract','part_time','executive')
                and (p_employer_name is null or btrim(p_employer_name) = '') then 'employer_name' end,
      case when p_employment_type in ('full_time','contract','part_time','executive')
                and p_employment_started_on is null then 'employment_started_on' end,
      case when p_employment_type in ('full_time','contract','part_time','executive','self_employed','pension','other')
                and p_annual_gross_income_yen is null then 'annual_gross_income_yen' end,
      case when p_employment_type in ('full_time','contract','part_time','executive','self_employed','pension','other')
                and p_income_type is null then 'income_type' end
    ], null)
  end;
$$;

-- ---------------------------------------------------------------------------
-- 6. 顧客本人の upsert（オートセーブ）。0003 プロフィール RPC のパターンを踏襲。
--    順序: 解決 -> case lock(815003) -> 認可 -> 状態検証 -> 値検証/正規化 -> upsert
--          -> opened->inputting -> 監査（初回作成 or 完了状態遷移のみ・値なし）-> complete/missing 返却
-- ---------------------------------------------------------------------------
create function public.app_upsert_own_applicant_employment_income(
  p_applicant_id            uuid,
  p_employer_name           text,
  p_employment_type         text,
  p_employment_started_on   date,
  p_annual_gross_income_yen bigint,
  p_income_type             text,
  p_correlation_id          uuid default null
) returns table (updated_at timestamptz, is_complete boolean, missing_fields text[])
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor    uuid := auth.uid();
  v_applicant public.case_applicants%rowtype;
  v_case     public.customer_cases%rowtype;
  v_employer text;
  v_emp_txt  text;
  v_inc_txt  text;
  v_emp      public.applicant_employment_type;
  v_inc      public.applicant_income_type;
  v_started  date := p_employment_started_on;
  v_existed  boolean := false;
  v_before   boolean;
  v_after    boolean;
  v_updated  timestamptz;
  v_fields   text[] := array[]::text[];
begin
  select * into v_applicant from public.case_applicants where id = p_applicant_id;
  if not found then
    raise exception 'case_applicant_not_found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(815003, hashtext(v_applicant.case_id::text));

  if not public.app_participant_owns_applicant(p_applicant_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_applicant.status <> 'active' then
    raise exception 'applicant_not_active' using errcode = 'P0001';
  end if;

  select * into v_case from public.customer_cases where id = v_applicant.case_id for update;
  if not found then
    raise exception 'customer_case_not_found' using errcode = 'P0002';
  end if;
  if v_case.status not in ('opened', 'inputting') then
    raise exception 'customer_case_not_inputtable' using errcode = 'P0001';
  end if;

  -- 正規化・検証（空文字は NULL 扱い）
  v_employer := nullif(btrim(coalesce(p_employer_name, '')), '');
  if v_employer is not null and length(v_employer) > 200 then
    raise exception 'invalid_employment_income_field' using errcode = '22023';
  end if;

  v_emp_txt := nullif(btrim(coalesce(p_employment_type, '')), '');
  v_inc_txt := nullif(btrim(coalesce(p_income_type, '')), '');
  if v_emp_txt is not null and v_emp_txt not in
     ('full_time','contract','part_time','self_employed','executive','pension','unemployed','other') then
    raise exception 'invalid_employment_income_field' using errcode = '22023';
  end if;
  if v_inc_txt is not null and v_inc_txt not in ('salary','business','pension','other') then
    raise exception 'invalid_employment_income_field' using errcode = '22023';
  end if;
  v_emp := v_emp_txt::public.applicant_employment_type;
  v_inc := v_inc_txt::public.applicant_income_type;

  -- 入社年月: 月初へ正規化 + 未来日拒否 + 下限
  if v_started is not null then
    v_started := date_trunc('month', v_started)::date;
    if v_started > current_date or v_started < date '1900-01-01' then
      raise exception 'invalid_employment_started_on' using errcode = '22023';
    end if;
  end if;

  if p_annual_gross_income_yen is not null and p_annual_gross_income_yen < 0 then
    raise exception 'invalid_annual_income' using errcode = '22023';
  end if;

  -- 既存の完了状態（遷移判定用）
  select public.app_employment_income_is_complete(
           employment_type, employer_name, employment_started_on, annual_gross_income_yen, income_type)
    into v_before
    from public.case_applicant_employment_income where applicant_id = p_applicant_id;
  v_existed := found;

  insert into public.case_applicant_employment_income
    (applicant_id, employer_name, employment_type, employment_started_on, annual_gross_income_yen, income_type)
  values (p_applicant_id, v_employer, v_emp, v_started, p_annual_gross_income_yen, v_inc)
  on conflict (applicant_id) do update
    set employer_name           = excluded.employer_name,
        employment_type         = excluded.employment_type,
        employment_started_on   = excluded.employment_started_on,
        annual_gross_income_yen = excluded.annual_gross_income_yen,
        income_type             = excluded.income_type
  returning case_applicant_employment_income.updated_at into v_updated;

  v_after := public.app_employment_income_is_complete(v_emp, v_employer, v_started, p_annual_gross_income_yen, v_inc);

  -- 初回入力で opened -> inputting
  if v_case.status = 'opened' then
    update public.customer_cases set status = 'inputting' where id = v_case.id;
    perform public.app_write_audit(
      'customer_case.status_changed', v_actor, v_case.organization_id, 'customer_case',
      v_case.id::text, true, null, null,
      jsonb_build_object('old_status', 'opened', 'new_status', 'inputting'));
  end if;

  -- 監査: 初回作成 or 完了状態遷移のみ（毎回 autosave では書かない・値は入れない）
  if v_employer is not null then v_fields := array_append(v_fields, 'employer_name'); end if;
  if v_emp     is not null then v_fields := array_append(v_fields, 'employment_type'); end if;
  if v_started is not null then v_fields := array_append(v_fields, 'employment_started_on'); end if;
  if p_annual_gross_income_yen is not null then v_fields := array_append(v_fields, 'annual_gross_income_yen'); end if;
  if v_inc     is not null then v_fields := array_append(v_fields, 'income_type'); end if;

  if not v_existed then
    perform public.app_write_audit(
      'case_applicant_employment_income.created', v_actor, v_case.organization_id,
      'case_applicant_employment_income', p_applicant_id::text, true, null, p_correlation_id,
      jsonb_build_object('changed_field_names', to_jsonb(v_fields),
                         'completeness_transition', case when v_after then 'to_complete' else null end));
  elsif v_before is distinct from v_after then
    perform public.app_write_audit(
      'case_applicant_employment_income.updated', v_actor, v_case.organization_id,
      'case_applicant_employment_income', p_applicant_id::text, true, null, p_correlation_id,
      jsonb_build_object('changed_field_names', to_jsonb(v_fields),
                         'completeness_transition', case when v_after then 'to_complete' else 'to_incomplete' end));
  end if;

  updated_at     := v_updated;
  is_complete    := v_after;
  missing_fields := public.app_employment_income_missing_fields(v_emp, v_employer, v_started, p_annual_gross_income_yen, v_inc);
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. 顧客本人の進捗取得（画面初期表示用。owner のみ・値は返さない=完了/不足のみ）
-- ---------------------------------------------------------------------------
create function public.app_own_employment_income_progress(p_applicant_id uuid)
returns table (is_complete boolean, missing_fields text[])
language plpgsql stable security definer set search_path = ''
as $$
declare r public.case_applicant_employment_income%rowtype;
begin
  if not public.app_participant_owns_applicant(p_applicant_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into r from public.case_applicant_employment_income where applicant_id = p_applicant_id;
  is_complete := public.app_employment_income_is_complete(
                   r.employment_type, r.employer_name, r.employment_started_on, r.annual_gross_income_yen, r.income_type);
  missing_fields := public.app_employment_income_missing_fields(
                   r.employment_type, r.employer_name, r.employment_started_on, r.annual_gross_income_yen, r.income_type);
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. スタッフ向け進捗一覧（値は一切返さない＝フラグ + updated_at のみ）。
--    認可は「当該案件の org の active ORGANIZATION_ADMIN、または当該案件の active 担当営業」のみ。
--    ※ app_can_staff_access_case は SYSTEM_ADMIN も許可するため流用せず、SYSTEM_ADMIN を除外した
--      追加ガード（org-admin または担当営業）をインラインで用いる。非該当は 0 件（情報差を出さない）。
-- ---------------------------------------------------------------------------
create function public.app_list_case_employment_income_progress(p_case_id uuid)
returns table (
  applicant_id             uuid,
  has_employment_input     boolean,
  has_income_input         boolean,
  is_required_input_complete boolean,
  updated_at               timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select a.id,
         (ei.employer_name is not null or ei.employment_type is not null or ei.employment_started_on is not null),
         (ei.annual_gross_income_yen is not null or ei.income_type is not null),
         coalesce(public.app_employment_income_is_complete(
           ei.employment_type, ei.employer_name, ei.employment_started_on,
           ei.annual_gross_income_yen, ei.income_type), false),
         ei.updated_at
    from public.case_applicants a
    left join public.case_applicant_employment_income ei on ei.applicant_id = a.id
   where a.case_id = p_case_id
     and (
       exists (select 1 from public.customer_cases c
                where c.id = p_case_id and public.app_is_org_admin(c.organization_id))
       or exists (select 1 from public.customer_cases c
                    join public.organization_memberships m on m.id = c.assigned_membership_id
                   where c.id = p_case_id and m.user_id = auth.uid() and m.status = 'active')
     )
   order by a.applicant_type;
$$;

-- ---------------------------------------------------------------------------
-- 9. 関数 EXECUTE 権限
-- ---------------------------------------------------------------------------
-- トリガー / 純粋関数（内部専用。定義者コンテキストからのみ呼ぶ）
revoke execute on function public.app_case_applicant_employment_income_guard()
  from public, anon, authenticated, service_role;
revoke execute on function public.app_employment_income_is_complete(
    public.applicant_employment_type, text, date, bigint, public.applicant_income_type)
  from public, anon, authenticated, service_role;
revoke execute on function public.app_employment_income_missing_fields(
    public.applicant_employment_type, text, date, bigint, public.applicant_income_type)
  from public, anon, authenticated, service_role;

-- 公開業務関数（内部で認可を自己検証する）
revoke execute on function public.app_upsert_own_applicant_employment_income(uuid, text, text, date, bigint, text, uuid)
  from public, anon;
revoke execute on function public.app_own_employment_income_progress(uuid) from public, anon;
revoke execute on function public.app_list_case_employment_income_progress(uuid) from public, anon;
grant  execute on function public.app_upsert_own_applicant_employment_income(uuid, text, text, date, bigint, text, uuid)
  to authenticated;
grant  execute on function public.app_own_employment_income_progress(uuid) to authenticated;
grant  execute on function public.app_list_case_employment_income_progress(uuid) to authenticated;

commit;
