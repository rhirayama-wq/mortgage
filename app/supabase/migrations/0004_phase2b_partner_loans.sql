-- ============================================================================
-- 0004_phase2b_partner_loans.sql
-- Phase 2A-2b: 不動産会社の提携ローン管理基盤（organization 固有・厳格なテナント分離）
--   ・提携ローンは organization 固有の商用条件。他 organization から一切不可視。
--   ・条件は append-only の version で保持し、過去 version を上書きしない（診断再現の基盤）。
--   ・書込は監査付き SECURITY DEFINER 業務関数のみ。直接 INSERT/UPDATE/DELETE 禁止。
--   ・SECURITY DEFINER は search_path 固定・EXECUTE 明示管理（0001..0003 と同一規約）。
--   ・承認確率はモゲチェック API が算出する。本フェーズは登録・管理のみ（算出しない）。
--   ・内部審査メモ・商品条件全文は監査 metadata / ログへ入れない。
--   ・金額は BIGINT 円(*_yen)、料率は整数 bps(*_bps)（CLAUDE.md §11）。
-- FICTIONAL / LOCAL ONLY / PRODUCTION USE PROHIBITED。
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. ENUMs
-- ---------------------------------------------------------------------------
create type public.lending_institution_status as enum ('active', 'inactive');
create type public.partner_loan_status        as enum ('draft', 'active', 'inactive');
create type public.partner_interest_rate_type as enum ('variable', 'fixed', 'fixed_period');
create type public.partner_handling_fee_type  as enum ('fixed_yen', 'rate_bps');

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

-- 2.1 lending_institutions: 金融機関マスタ（共有参照。organization_id を持たない）
--     架空データのみ。実在金融機関の非公開条件は保持しない。
create table public.lending_institutions (
  id           uuid primary key default gen_random_uuid(),
  stable_key   text not null unique,
  display_name text not null,
  status       public.lending_institution_status not null default 'active',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint lending_institutions_key_len check (length(btrim(stable_key)) between 1 and 100),
  constraint lending_institutions_name_len check (length(btrim(display_name)) between 1 and 200)
);

-- 2.2 organization_partner_loans: organization が管理する提携ローンの論理エンティティ
create table public.organization_partner_loans (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations (id),
  lending_institution_id  uuid not null references public.lending_institutions (id),
  stable_key              text not null,
  display_name            text not null,
  status                  public.partner_loan_status not null default 'draft',
  current_version_id      uuid,
  last_confirmed_at       timestamptz,
  created_by_membership_id uuid not null references public.organization_memberships (id),
  updated_by_membership_id uuid not null references public.organization_memberships (id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint org_partner_loans_key_len  check (length(btrim(stable_key)) between 1 and 100),
  constraint org_partner_loans_name_len check (length(btrim(display_name)) between 1 and 200),
  -- 提携ローンの stable_key は organization 内で一意
  constraint org_partner_loans_org_key_uniq unique (organization_id, stable_key)
);
create index org_partner_loans_org_idx on public.organization_partner_loans (organization_id, status);

comment on table public.organization_partner_loans is
  'Organization-owned partner loan (logical entity). organization_id/lending_institution_id/created_by immutable. No hard delete; use status=inactive. Strictly tenant-isolated by RLS.';

-- 2.3 organization_partner_loan_versions: 変更不能な条件 version（append-only）
create table public.organization_partner_loan_versions (
  id                           uuid primary key default gen_random_uuid(),
  partner_loan_id              uuid not null references public.organization_partner_loans (id),
  version_number               int  not null,
  product_name                 text not null,
  product_type                 text,
  description                  text,
  interest_rate_type           public.partner_interest_rate_type not null,
  base_rate_bps                int,
  preferential_rate_reduction_bps int,
  indicative_rate_bps          int,
  minimum_loan_amount_yen      bigint,
  maximum_loan_amount_yen      bigint,
  minimum_term_years           int,
  maximum_term_years           int,
  maximum_ltv_bps              int,
  handling_fee_type            public.partner_handling_fee_type,
  handling_fee_yen             bigint,
  handling_fee_bps             int,
  guarantee_fee_description    text,
  other_fees_description       text,
  eligible_property_types      text[],
  eligible_areas               text[],
  minimum_annual_income_yen    bigint,
  minimum_employment_months    int,
  eligible_employment_types    text[],
  minimum_age                  int,
  maximum_application_age      int,
  maximum_age_at_maturity      int,
  group_credit_life_insurance_summary text,
  customer_disclosure          text,
  internal_underwriting_notes  text,
  application_url              text,
  external_product_key         text,
  inquiry_contact              text,
  valid_from                   date,
  valid_until                  date,
  confirmed_at                 timestamptz,
  created_by_membership_id     uuid not null references public.organization_memberships (id),
  created_at                   timestamptz not null default now(),
  constraint oplv_version_uniq unique (partner_loan_id, version_number),
  constraint oplv_version_pos check (version_number >= 1),
  constraint oplv_product_name_len check (length(btrim(product_name)) between 1 and 200),
  constraint oplv_base_rate_nonneg check (base_rate_bps is null or base_rate_bps >= 0),
  constraint oplv_pref_rate_nonneg check (preferential_rate_reduction_bps is null or preferential_rate_reduction_bps >= 0),
  constraint oplv_indic_rate_nonneg check (indicative_rate_bps is null or indicative_rate_bps >= 0),
  constraint oplv_min_amount_nonneg check (minimum_loan_amount_yen is null or minimum_loan_amount_yen >= 0),
  constraint oplv_max_amount_nonneg check (maximum_loan_amount_yen is null or maximum_loan_amount_yen >= 0),
  constraint oplv_amount_range check (
    minimum_loan_amount_yen is null or maximum_loan_amount_yen is null
    or minimum_loan_amount_yen <= maximum_loan_amount_yen),
  constraint oplv_term_nonneg check (
    (minimum_term_years is null or minimum_term_years >= 0)
    and (maximum_term_years is null or maximum_term_years >= 0)),
  constraint oplv_term_range check (
    minimum_term_years is null or maximum_term_years is null
    or minimum_term_years <= maximum_term_years),
  constraint oplv_ltv_nonneg check (maximum_ltv_bps is null or maximum_ltv_bps >= 0),
  constraint oplv_handling_fee_yen_nonneg check (handling_fee_yen is null or handling_fee_yen >= 0),
  constraint oplv_handling_fee_bps_nonneg check (handling_fee_bps is null or handling_fee_bps >= 0),
  constraint oplv_income_nonneg check (minimum_annual_income_yen is null or minimum_annual_income_yen >= 0),
  constraint oplv_emp_months_nonneg check (minimum_employment_months is null or minimum_employment_months >= 0),
  constraint oplv_period_range check (valid_from is null or valid_until is null or valid_from <= valid_until),
  constraint oplv_property_types_subset check (
    eligible_property_types is null
    or eligible_property_types <@ array['new','used','condo','house']::text[]),
  constraint oplv_employment_types_subset check (
    eligible_employment_types is null
    or eligible_employment_types <@ array['full_time','contract','self_employed','part_time','executive','other']::text[]),
  -- application_url は https のみ（外部 URL validation。詳細は業務関数でも再検証）
  constraint oplv_application_url_https check (
    application_url is null or application_url ~ '^https://[^[:space:]]+$')
);
create index oplv_loan_idx on public.organization_partner_loan_versions (partner_loan_id, version_number desc);

comment on table public.organization_partner_loan_versions is
  'Immutable append-only partner-loan condition version. No UPDATE/DELETE. internal_underwriting_notes is admin-only (never exposed to sales/customer or audit).';

-- current_version_id の参照整合（version 作成後に設定）
alter table public.organization_partner_loans
  add constraint org_partner_loans_current_version_fk
  foreign key (current_version_id) references public.organization_partner_loan_versions (id);

-- ---------------------------------------------------------------------------
-- 3. updated_at トリガー（0001 の app_set_updated_at を再利用）
-- ---------------------------------------------------------------------------
create trigger set_updated_at before update on public.lending_institutions
  for each row execute function public.app_set_updated_at();
create trigger set_updated_at before update on public.organization_partner_loans
  for each row execute function public.app_set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. 整合性トリガー（二重防御。主防御は業務関数の advisory lock + 再確認）
-- ---------------------------------------------------------------------------

-- 4.1 organization_partner_loans: 不変列 / 許容遷移 / hard delete 禁止
create function public.app_org_partner_loan_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'partner_loan_delete_forbidden'
      using errcode = '42501', detail = 'use status=inactive instead of delete.';
  end if;
  if new.organization_id is distinct from old.organization_id
     or new.lending_institution_id is distinct from old.lending_institution_id
     or new.stable_key is distinct from old.stable_key
     or new.created_by_membership_id is distinct from old.created_by_membership_id then
    raise exception 'partner_loan_immutable_columns' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if not (
      (old.status = 'draft'    and new.status in ('active','inactive')) or
      (old.status = 'active'   and new.status = 'inactive') or
      (old.status = 'inactive' and new.status = 'active')
    ) then
      raise exception 'partner_loan_invalid_transition'
        using errcode = 'P0001',
              detail = format('transition %s -> %s is not allowed', old.status, new.status);
    end if;
  end if;
  return new;
end;
$$;
create trigger org_partner_loan_guard
  before update or delete on public.organization_partner_loans
  for each row execute function public.app_org_partner_loan_guard();

-- 4.2 organization_partner_loan_versions: 完全 immutable（UPDATE/DELETE 禁止）
create function public.app_org_partner_loan_version_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  raise exception 'partner_loan_version_immutable'
    using errcode = '42501',
          detail = 'partner-loan versions are append-only; no update/delete.';
end;
$$;
create trigger org_partner_loan_version_guard
  before update or delete on public.organization_partner_loan_versions
  for each row execute function public.app_org_partner_loan_version_guard();

-- ---------------------------------------------------------------------------
-- 5. RLS 有効化
-- ---------------------------------------------------------------------------
alter table public.lending_institutions                enable row level security;
alter table public.organization_partner_loans          enable row level security;
alter table public.organization_partner_loan_versions  enable row level security;

-- ---------------------------------------------------------------------------
-- 6. RLS ヘルパー（SECURITY DEFINER・search_path 固定・STABLE）
-- ---------------------------------------------------------------------------

-- 現在ユーザーがいずれかの organization の active メンバーか
create function public.app_has_active_membership()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.organization_memberships m
     where m.user_id = auth.uid() and m.status = 'active'
  );
$$;

-- 現在ユーザーが当該提携ローンを「管理者として」読めるか（自 org の ORG_ADMIN）
create function public.app_can_admin_partner_loan(p_partner_loan_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.organization_partner_loans l
     where l.id = p_partner_loan_id
       and public.app_is_org_admin(l.organization_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- 7. RLS ポリシー（SELECT のみ。書込は業務関数のみ）
--    ・lending_institutions: 何らかの active メンバーのみ（顧客・非メンバーは不可視）
--    ・organization_partner_loans: 自 org の ORG_ADMIN は全 status。SALES は active のみ。
--    ・versions: 親ローンが admin 可視のときのみ（内部メモを含むため管理者限定）。
--      SALES/顧客向けの安全な列は定義者関数 app_list_org_active_partner_loans で提供する。
-- ---------------------------------------------------------------------------
create policy lending_institutions_select_member on public.lending_institutions
  for select to authenticated using (public.app_has_active_membership());

create policy org_partner_loans_select_admin on public.organization_partner_loans
  for select to authenticated using (public.app_is_org_admin(organization_id));
create policy org_partner_loans_select_sales_active on public.organization_partner_loans
  for select to authenticated
  using (status = 'active' and public.app_is_active_member(organization_id));

create policy oplv_select_admin on public.organization_partner_loan_versions
  for select to authenticated using (public.app_can_admin_partner_loan(partner_loan_id));

-- ---------------------------------------------------------------------------
-- 8. GRANT / REVOKE（テーブル）。SELECT のみ authenticated。書込は業務関数のみ。
-- ---------------------------------------------------------------------------
revoke all on table public.lending_institutions               from anon, authenticated, service_role;
revoke all on table public.organization_partner_loans         from anon, authenticated, service_role;
revoke all on table public.organization_partner_loan_versions from anon, authenticated, service_role;

grant select on public.lending_institutions               to authenticated;
grant select on public.organization_partner_loans         to authenticated;
grant select on public.organization_partner_loan_versions to authenticated;

-- ---------------------------------------------------------------------------
-- 9. 内部ヘルパー: 金融機関の find-or-create（stable_key で冪等）
-- ---------------------------------------------------------------------------
create function public.app_find_or_create_lending_institution(p_display_name text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_display_name, ''));
  v_key  text;
  v_id   uuid;
begin
  if length(v_name) not between 1 and 200 then
    raise exception 'partner_loan_invalid_institution' using errcode = '22023';
  end if;
  -- stable_key: 小文字化 + 連続空白の圧縮
  v_key := lower(regexp_replace(v_name, '\s+', ' ', 'g'));
  insert into public.lending_institutions (stable_key, display_name)
  values (v_key, v_name)
  on conflict (stable_key) do nothing;
  select id into v_id from public.lending_institutions where stable_key = v_key;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. 業務関数（lock -> 冪等短絡 -> 認可再確認 -> 検証 -> 書込 -> 監査）
--     advisory lock keys: 815004=提携ローン org 単位 / 815005=提携ローン id 単位
-- ---------------------------------------------------------------------------

-- 10.1 内部: version 挿入（条件を 1 version として append）。認可は呼出側で確認済み前提。
create function public.app_insert_partner_loan_version(
  p_partner_loan_id uuid,
  p_membership_id   uuid,
  p_version         jsonb
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_next int;
  v_id uuid;
  v_url text := nullif(btrim(coalesce(p_version->>'application_url','')), '');
begin
  if v_url is not null and v_url !~ '^https://[^[:space:]]+$' then
    raise exception 'partner_loan_invalid_url' using errcode = '22023';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next
    from public.organization_partner_loan_versions where partner_loan_id = p_partner_loan_id;

  insert into public.organization_partner_loan_versions (
    partner_loan_id, version_number, product_name, product_type, description,
    interest_rate_type, base_rate_bps, preferential_rate_reduction_bps, indicative_rate_bps,
    minimum_loan_amount_yen, maximum_loan_amount_yen, minimum_term_years, maximum_term_years,
    maximum_ltv_bps, handling_fee_type, handling_fee_yen, handling_fee_bps,
    guarantee_fee_description, other_fees_description, eligible_property_types, eligible_areas,
    minimum_annual_income_yen, minimum_employment_months, eligible_employment_types,
    minimum_age, maximum_application_age, maximum_age_at_maturity,
    group_credit_life_insurance_summary, customer_disclosure, internal_underwriting_notes,
    application_url, external_product_key, inquiry_contact, valid_from, valid_until, confirmed_at,
    created_by_membership_id)
  values (
    p_partner_loan_id, v_next,
    btrim(p_version->>'product_name'),
    nullif(btrim(coalesce(p_version->>'product_type','')), ''),
    nullif(btrim(coalesce(p_version->>'description','')), ''),
    (p_version->>'interest_rate_type')::public.partner_interest_rate_type,
    (p_version->>'base_rate_bps')::int,
    (p_version->>'preferential_rate_reduction_bps')::int,
    (p_version->>'indicative_rate_bps')::int,
    (p_version->>'minimum_loan_amount_yen')::bigint,
    (p_version->>'maximum_loan_amount_yen')::bigint,
    (p_version->>'minimum_term_years')::int,
    (p_version->>'maximum_term_years')::int,
    (p_version->>'maximum_ltv_bps')::int,
    nullif(p_version->>'handling_fee_type','')::public.partner_handling_fee_type,
    (p_version->>'handling_fee_yen')::bigint,
    (p_version->>'handling_fee_bps')::int,
    nullif(btrim(coalesce(p_version->>'guarantee_fee_description','')), ''),
    nullif(btrim(coalesce(p_version->>'other_fees_description','')), ''),
    case when p_version ? 'eligible_property_types'
         then array(select jsonb_array_elements_text(p_version->'eligible_property_types')) end,
    case when p_version ? 'eligible_areas'
         then array(select jsonb_array_elements_text(p_version->'eligible_areas')) end,
    (p_version->>'minimum_annual_income_yen')::bigint,
    (p_version->>'minimum_employment_months')::int,
    case when p_version ? 'eligible_employment_types'
         then array(select jsonb_array_elements_text(p_version->'eligible_employment_types')) end,
    (p_version->>'minimum_age')::int,
    (p_version->>'maximum_application_age')::int,
    (p_version->>'maximum_age_at_maturity')::int,
    nullif(btrim(coalesce(p_version->>'group_credit_life_insurance_summary','')), ''),
    nullif(btrim(coalesce(p_version->>'customer_disclosure','')), ''),
    nullif(btrim(coalesce(p_version->>'internal_underwriting_notes','')), ''),
    v_url,
    nullif(btrim(coalesce(p_version->>'external_product_key','')), ''),
    nullif(btrim(coalesce(p_version->>'inquiry_contact','')), ''),
    (p_version->>'valid_from')::date,
    (p_version->>'valid_until')::date,
    (p_version->>'confirmed_at')::timestamptz,
    p_membership_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- 認可: 当該 org の active ORGANIZATION_ADMIN の membership を取得（無ければ not_authorized）
create function public.app_require_org_admin_membership(p_organization_id uuid)
returns uuid language plpgsql stable security definer set search_path = ''
as $$
declare v_mid uuid;
begin
  select m.id into v_mid from public.organization_memberships m
   where m.organization_id = p_organization_id
     and m.user_id = auth.uid()
     and m.status = 'active'
     and m.role = 'ORGANIZATION_ADMIN'
   limit 1;
  if v_mid is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return v_mid;
end;
$$;

-- 10.2 作成（ORG_ADMIN のみ）: institution 解決 + loan(draft) + version1 + current 設定
create function public.app_create_organization_partner_loan(
  p_organization_id uuid,
  p_institution_name text,
  p_display_name text,
  p_version jsonb,
  p_correlation_id uuid default null
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_mid uuid;
  v_prior text;
  v_inst uuid;
  v_loan uuid;
  v_ver uuid;
  v_name text := btrim(coalesce(p_display_name, ''));
  v_key text;
begin
  perform pg_advisory_xact_lock(815004, hashtext(p_organization_id::text));

  if p_correlation_id is not null then
    v_prior := public.app_prior_success_resource('partner_loan.created', p_correlation_id);
    if v_prior is not null then return v_prior::uuid; end if;
  end if;

  v_mid := public.app_require_org_admin_membership(p_organization_id);

  if length(v_name) not between 1 and 200 then
    raise exception 'validation_error' using errcode = '22023', detail = 'display_name';
  end if;
  v_key := lower(regexp_replace(v_name, '\s+', ' ', 'g'));

  v_inst := public.app_find_or_create_lending_institution(p_institution_name);

  insert into public.organization_partner_loans (
    organization_id, lending_institution_id, stable_key, display_name, status,
    created_by_membership_id, updated_by_membership_id)
  values (p_organization_id, v_inst, v_key, v_name, 'draft', v_mid, v_mid)
  returning id into v_loan;

  v_ver := public.app_insert_partner_loan_version(v_loan, v_mid, p_version);
  update public.organization_partner_loans
     set current_version_id = v_ver, updated_by_membership_id = v_mid
   where id = v_loan;

  perform public.app_write_audit(
    'partner_loan.created', v_actor, p_organization_id, 'organization_partner_loan',
    v_loan::text, true, null, p_correlation_id,
    jsonb_build_object('membership_id', v_mid::text, 'version_number', 1));
  perform public.app_write_audit(
    'partner_loan.version_created', v_actor, p_organization_id, 'organization_partner_loan_version',
    v_ver::text, true, null, null,
    jsonb_build_object('partner_loan_id', v_loan::text, 'version_number', 1));
  return v_loan;
end;
$$;

-- 10.3 更新（ORG_ADMIN のみ）: 新 version を append し current を切替（version conflict 検知）
create function public.app_update_organization_partner_loan(
  p_partner_loan_id uuid,
  p_expected_current_version_id uuid,
  p_display_name text,
  p_version jsonb,
  p_correlation_id uuid default null
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_loan public.organization_partner_loans%rowtype;
  v_mid uuid;
  v_prior text;
  v_ver uuid;
  v_name text := btrim(coalesce(p_display_name, ''));
  v_new_version int;
begin
  select * into v_loan from public.organization_partner_loans where id = p_partner_loan_id;
  if not found then
    raise exception 'partner_loan_not_found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(815005, hashtext(p_partner_loan_id::text));

  if p_correlation_id is not null then
    v_prior := public.app_prior_success_resource('partner_loan.version_created', p_correlation_id);
    if v_prior is not null then return v_prior::uuid; end if;
  end if;

  v_mid := public.app_require_org_admin_membership(v_loan.organization_id);

  select * into v_loan from public.organization_partner_loans where id = p_partner_loan_id for update;
  if v_loan.current_version_id is distinct from p_expected_current_version_id then
    raise exception 'partner_loan_version_conflict' using errcode = 'P0001';
  end if;
  if length(v_name) not between 1 and 200 then
    raise exception 'validation_error' using errcode = '22023', detail = 'display_name';
  end if;

  v_ver := public.app_insert_partner_loan_version(p_partner_loan_id, v_mid, p_version);
  select version_number into v_new_version
    from public.organization_partner_loan_versions where id = v_ver;

  update public.organization_partner_loans
     set current_version_id = v_ver, display_name = v_name, updated_by_membership_id = v_mid
   where id = p_partner_loan_id;

  perform public.app_write_audit(
    'partner_loan.version_created', v_actor, v_loan.organization_id,
    'organization_partner_loan_version', v_ver::text, true, null, p_correlation_id,
    jsonb_build_object('partner_loan_id', p_partner_loan_id::text, 'version_number', v_new_version));
  return v_ver;
end;
$$;

-- 10.4 有効化（ORG_ADMIN のみ・current version 必須）
create function public.app_activate_organization_partner_loan(
  p_partner_loan_id uuid,
  p_correlation_id uuid default null
) returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_loan public.organization_partner_loans%rowtype;
  v_mid uuid;
  v_count int;
begin
  select * into v_loan from public.organization_partner_loans where id = p_partner_loan_id;
  if not found then raise exception 'partner_loan_not_found' using errcode = 'P0002'; end if;

  perform pg_advisory_xact_lock(815005, hashtext(p_partner_loan_id::text));
  v_mid := public.app_require_org_admin_membership(v_loan.organization_id);

  select * into v_loan from public.organization_partner_loans where id = p_partner_loan_id for update;
  if v_loan.current_version_id is null then
    raise exception 'validation_error' using errcode = 'P0001', detail = 'no current version';
  end if;
  if v_loan.status = 'active' then return; end if; -- 冪等
  if v_loan.status not in ('draft','inactive') then
    raise exception 'partner_loan_invalid_transition' using errcode = 'P0001';
  end if;

  update public.organization_partner_loans
     set status = 'active', updated_by_membership_id = v_mid where id = p_partner_loan_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'unexpected_row_count' using errcode = 'P0001'; end if;

  perform public.app_write_audit(
    'partner_loan.activated', v_actor, v_loan.organization_id, 'organization_partner_loan',
    p_partner_loan_id::text, true, null, p_correlation_id,
    jsonb_build_object('old_status', v_loan.status::text, 'new_status', 'active'));
end;
$$;

-- 10.5 無効化（ORG_ADMIN のみ）
create function public.app_deactivate_organization_partner_loan(
  p_partner_loan_id uuid,
  p_correlation_id uuid default null
) returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_loan public.organization_partner_loans%rowtype;
  v_mid uuid;
  v_count int;
begin
  select * into v_loan from public.organization_partner_loans where id = p_partner_loan_id;
  if not found then raise exception 'partner_loan_not_found' using errcode = 'P0002'; end if;

  perform pg_advisory_xact_lock(815005, hashtext(p_partner_loan_id::text));
  v_mid := public.app_require_org_admin_membership(v_loan.organization_id);

  select * into v_loan from public.organization_partner_loans where id = p_partner_loan_id for update;
  if v_loan.status = 'inactive' then return; end if; -- 冪等
  if v_loan.status not in ('draft','active') then
    raise exception 'partner_loan_invalid_transition' using errcode = 'P0001';
  end if;

  update public.organization_partner_loans
     set status = 'inactive', updated_by_membership_id = v_mid where id = p_partner_loan_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'unexpected_row_count' using errcode = 'P0001'; end if;

  perform public.app_write_audit(
    'partner_loan.deactivated', v_actor, v_loan.organization_id, 'organization_partner_loan',
    p_partner_loan_id::text, true, null, p_correlation_id,
    jsonb_build_object('old_status', v_loan.status::text, 'new_status', 'inactive'));
end;
$$;

-- 10.6 確認（ORG_ADMIN のみ・変更なしで最終確認日を更新）
create function public.app_confirm_organization_partner_loan(
  p_partner_loan_id uuid,
  p_correlation_id uuid default null
) returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_loan public.organization_partner_loans%rowtype;
  v_mid uuid;
  v_count int;
begin
  select * into v_loan from public.organization_partner_loans where id = p_partner_loan_id;
  if not found then raise exception 'partner_loan_not_found' using errcode = 'P0002'; end if;

  perform pg_advisory_xact_lock(815005, hashtext(p_partner_loan_id::text));
  v_mid := public.app_require_org_admin_membership(v_loan.organization_id);

  update public.organization_partner_loans
     set last_confirmed_at = now(), updated_by_membership_id = v_mid
   where id = p_partner_loan_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'unexpected_row_count' using errcode = 'P0001'; end if;

  perform public.app_write_audit(
    'partner_loan.confirmed', v_actor, v_loan.organization_id, 'organization_partner_loan',
    p_partner_loan_id::text, true, null, p_correlation_id, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. 定義者読み取り: SALES 向け「自 org の有効商品」（内部メモを含めない安全な列のみ）
--     ・承認確率は算出しない（本フェーズ）。表示専用の商品条件のみ返す。
-- ---------------------------------------------------------------------------
create function public.app_list_org_active_partner_loans(p_organization_id uuid)
returns table (
  partner_loan_id     uuid,
  display_name        text,
  institution_name    text,
  product_name        text,
  interest_rate_type  public.partner_interest_rate_type,
  indicative_rate_bps int,
  maximum_loan_amount_yen bigint,
  valid_from          date,
  valid_until         date,
  customer_disclosure text
)
language sql stable security definer set search_path = ''
as $$
  select l.id, l.display_name, i.display_name, v.product_name, v.interest_rate_type,
         v.indicative_rate_bps, v.maximum_loan_amount_yen, v.valid_from, v.valid_until,
         v.customer_disclosure
    from public.organization_partner_loans l
    join public.lending_institutions i on i.id = l.lending_institution_id
    join public.organization_partner_loan_versions v on v.id = l.current_version_id
   where l.organization_id = p_organization_id
     and l.status = 'active'
     and (v.valid_from  is null or v.valid_from  <= current_date)
     and (v.valid_until is null or v.valid_until >= current_date)
     and public.app_is_active_member(p_organization_id)
   order by l.display_name;
$$;

-- ---------------------------------------------------------------------------
-- 12. 関数 EXECUTE 権限
-- ---------------------------------------------------------------------------
-- 内部専用（誰にも grant しない）
revoke execute on function public.app_org_partner_loan_guard()         from public, anon, authenticated, service_role;
revoke execute on function public.app_org_partner_loan_version_guard() from public, anon, authenticated, service_role;
revoke execute on function public.app_insert_partner_loan_version(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.app_find_or_create_lending_institution(text) from public, anon, authenticated, service_role;
revoke execute on function public.app_require_org_admin_membership(uuid) from public, anon, authenticated, service_role;

-- RLS ヘルパー（authenticated として評価されるため grant 要）
revoke execute on function public.app_has_active_membership()        from public, anon;
revoke execute on function public.app_can_admin_partner_loan(uuid)   from public, anon;
grant  execute on function public.app_has_active_membership()        to authenticated;
grant  execute on function public.app_can_admin_partner_loan(uuid)   to authenticated;

-- 公開業務関数（内部で認可を自己検証する）
revoke execute on function public.app_create_organization_partner_loan(uuid, text, text, jsonb, uuid) from public, anon;
revoke execute on function public.app_update_organization_partner_loan(uuid, uuid, text, jsonb, uuid) from public, anon;
revoke execute on function public.app_activate_organization_partner_loan(uuid, uuid)   from public, anon;
revoke execute on function public.app_deactivate_organization_partner_loan(uuid, uuid) from public, anon;
revoke execute on function public.app_confirm_organization_partner_loan(uuid, uuid)    from public, anon;
revoke execute on function public.app_list_org_active_partner_loans(uuid)              from public, anon;
grant  execute on function public.app_create_organization_partner_loan(uuid, text, text, jsonb, uuid) to authenticated;
grant  execute on function public.app_update_organization_partner_loan(uuid, uuid, text, jsonb, uuid) to authenticated;
grant  execute on function public.app_activate_organization_partner_loan(uuid, uuid)   to authenticated;
grant  execute on function public.app_deactivate_organization_partner_loan(uuid, uuid) to authenticated;
grant  execute on function public.app_confirm_organization_partner_loan(uuid, uuid)    to authenticated;
grant  execute on function public.app_list_org_active_partner_loans(uuid)              to authenticated;

commit;
