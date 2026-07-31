-- ============================================================================
-- 0002_phase2a_customer_cases.sql
-- Phase 2A-1: customer cases / applicants (PII split) / invitations / participants
--   ・既存 Phase 1（identity / organizations / memberships / RLS / audit）を土台にする。
--   ・直接テーブル書込は禁止し、監査付き SECURITY DEFINER 業務関数（app_*）のみで変更する。
--   ・SECURITY DEFINER は search_path を固定し、EXECUTE を明示管理する（0001 と同一規約）。
--   ・診断値（融資承認確率・借入可能額）はモゲチェック側 API が算出する。本フェーズは扱わない。
--   ・PII（氏名・生年月日・連絡先・住所）は case_applicant_profiles に分離し、監査/URL/ログへ出さない。
--   ・金額列は BIGINT 円（*_yen）。
-- FICTIONAL / LOCAL ONLY / PRODUCTION USE PROHIBITED。
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. ENUMs（将来状態 consent_pending/assessing/... は本フェーズでは追加しない）
-- ---------------------------------------------------------------------------
create type public.customer_case_status as enum
  ('draft', 'invited', 'opened', 'inputting', 'cancelled', 'expired');

create type public.case_applicant_type as enum ('primary', 'co_applicant');

create type public.case_applicant_status as enum ('active', 'removed');

create type public.case_invitation_status as enum
  ('invited', 'accepted', 'expired', 'cancelled');

create type public.case_participant_role as enum ('primary_applicant', 'co_applicant');

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

-- 2.1 customer_cases: 顧客案件（テナント = organization_id・不変）
create table public.customer_cases (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations (id),
  assigned_membership_id uuid not null references public.organization_memberships (id),
  status                 public.customer_case_status not null default 'draft',
  case_name              text not null,
  desired_price_yen      bigint,
  created_by             uuid not null references public.user_profiles (id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  status_changed_at      timestamptz not null default now(),
  constraint customer_cases_case_name_len check (length(btrim(case_name)) between 1 and 200),
  constraint customer_cases_desired_price_nonneg
    check (desired_price_yen is null or desired_price_yen >= 0)
);
create index customer_cases_org_idx on public.customer_cases (organization_id, status);
create index customer_cases_assigned_idx on public.customer_cases (assigned_membership_id, status);

comment on table public.customer_cases is
  'Customer case. organization_id and assigned_membership_id are immutable (guard trigger). No hard delete; use status=cancelled. Diagnosis values come from Mogecheck API (later phases), not stored here.';

-- 2.2 case_applicants: 主申込者・共同申込者（同一テーブル。PII はここに置かない）
create table public.case_applicants (
  id                      uuid primary key default gen_random_uuid(),
  case_id                 uuid not null references public.customer_cases (id),
  applicant_type          public.case_applicant_type not null,
  relationship_to_primary text,
  status                  public.case_applicant_status not null default 'active',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint case_applicants_relationship_len
    check (relationship_to_primary is null or length(btrim(relationship_to_primary)) between 1 and 100)
);
create index case_applicants_case_idx on public.case_applicants (case_id, applicant_type);
-- 1 案件につき primary は最大 1 名。co_applicant は 0..n。
create unique index case_applicants_one_primary
  on public.case_applicants (case_id)
  where applicant_type = 'primary';

-- 2.3 case_applicant_profiles: PII をアクセス制御情報から分離（1:1）
create table public.case_applicant_profiles (
  applicant_id   uuid primary key references public.case_applicants (id),
  full_name      text,
  full_name_kana text,
  birth_date     date,
  email          text,
  phone          text,
  postal_code    text,
  address        text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint case_applicant_profiles_email_lower
    check (email is null or email = lower(btrim(email)))
);

comment on table public.case_applicant_profiles is
  'Applicant PII (name/kana/birth/email/phone/address). Never copied into audit metadata / URLs / logs. Written via business functions only.';

-- 2.4 case_invitations: 招待（token / Magic Link URL は保存しない）
create table public.case_invitations (
  id                  uuid primary key default gen_random_uuid(),
  case_id             uuid not null references public.customer_cases (id),
  applicant_id        uuid not null references public.case_applicants (id),
  invited_email       text not null,
  status              public.case_invitation_status not null default 'invited',
  expires_at          timestamptz not null,
  invited_by          uuid not null references public.user_profiles (id),
  invited_at          timestamptz not null default now(),
  accepted_at         timestamptz,
  accepted_by_user_id uuid references public.user_profiles (id),
  correlation_id      uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint case_invitations_invited_email_lower
    check (invited_email = lower(btrim(invited_email)))
);
create index case_invitations_case_idx on public.case_invitations (case_id, status);
create index case_invitations_email_idx on public.case_invitations (invited_email, status);
-- 同一 applicant への「有効（invited）」招待は最大 1 件。
create unique index case_invitations_one_active_per_applicant
  on public.case_invitations (applicant_id)
  where status = 'invited';
-- correlation_id による招待作成の冪等性（同一 correlation は1件）。
create unique index case_invitations_correlation_uniq
  on public.case_invitations (correlation_id)
  where correlation_id is not null;

comment on table public.case_invitations is
  'Case applicant invitation. No token / Magic Link URL stored (Supabase Auth owns the link). invited_email is normalized lower(btrim). Accepted/cancelled/expired are terminal.';

-- 2.5 case_participants: 認証済みユーザー ↔ 申込者 のアクセス関係（顧客は org 非所属でよい）
create table public.case_participants (
  id               uuid primary key default gen_random_uuid(),
  case_id          uuid not null references public.customer_cases (id),
  applicant_id     uuid not null references public.case_applicants (id),
  user_id          uuid not null references public.user_profiles (id),
  participant_role public.case_participant_role not null,
  invitation_id    uuid references public.case_invitations (id),
  added_by         uuid references public.user_profiles (id),
  added_at         timestamptz not null default now(),
  -- 1 申込者につき参加ユーザーは 1 人（付替え禁止）。user×applicant も一意。
  constraint case_participants_applicant_uniq unique (applicant_id),
  constraint case_participants_user_applicant_uniq unique (user_id, applicant_id)
);
create index case_participants_case_idx on public.case_participants (case_id);
create index case_participants_user_idx on public.case_participants (user_id);

comment on table public.case_participants is
  'Maps an authenticated (customer) user to a case applicant. Created only by app_accept_case_invitation. Immutable (guard forbids update/delete): no re-pointing to another case/applicant.';

-- ---------------------------------------------------------------------------
-- 3. updated_at トリガー（0001 の app_set_updated_at を再利用）
-- ---------------------------------------------------------------------------
create trigger set_updated_at before update on public.customer_cases
  for each row execute function public.app_set_updated_at();
create trigger set_updated_at before update on public.case_applicants
  for each row execute function public.app_set_updated_at();
create trigger set_updated_at before update on public.case_applicant_profiles
  for each row execute function public.app_set_updated_at();
create trigger set_updated_at before update on public.case_invitations
  for each row execute function public.app_set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. 状態遷移の許容表（guard と業務関数の双方で参照）
-- ---------------------------------------------------------------------------
create function public.app_customer_case_transition_allowed(
  p_old public.customer_case_status,
  p_new public.customer_case_status
) returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    (p_old = 'draft'     and p_new = 'invited')   or
    (p_old = 'invited'   and p_new = 'opened')    or
    (p_old = 'opened'    and p_new = 'inputting') or
    (p_old in ('draft','invited','opened','inputting') and p_new = 'cancelled') or
    (p_old = 'invited'   and p_new = 'expired');
$$;

-- ---------------------------------------------------------------------------
-- 5. 整合性トリガー（二重防御。主防御は業務関数の advisory lock + 再確認）
-- ---------------------------------------------------------------------------

-- 5.1 customer_cases: 不変列 / 許容遷移 / hard delete 禁止
create function public.app_customer_case_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'customer_case_delete_forbidden'
      using errcode = '42501',
            detail = 'customer_cases rows must never be deleted; use status=cancelled.';
  end if;
  if new.organization_id is distinct from old.organization_id then
    raise exception 'customer_case_org_immutable' using errcode = '42501';
  end if;
  if new.assigned_membership_id is distinct from old.assigned_membership_id then
    raise exception 'customer_case_assignment_immutable'
      using errcode = '42501',
            detail = 'reassignment is out of scope for Phase 2A-1.';
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'customer_case_created_by_immutable' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if not public.app_customer_case_transition_allowed(old.status, new.status) then
      raise exception 'customer_case_invalid_transition'
        using errcode = 'P0001',
              detail = format('transition %s -> %s is not allowed', old.status, new.status);
    end if;
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;
create trigger customer_case_guard
  before update or delete on public.customer_cases
  for each row execute function public.app_customer_case_guard();

-- 5.2 case_applicants: case_id / applicant_type 不変・hard delete 禁止
create function public.app_case_applicant_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'case_applicant_delete_forbidden'
      using errcode = '42501',
            detail = 'use status=removed instead of delete.';
  end if;
  if new.case_id is distinct from old.case_id then
    raise exception 'case_applicant_case_immutable' using errcode = '42501';
  end if;
  if new.applicant_type is distinct from old.applicant_type then
    raise exception 'case_applicant_type_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger case_applicant_guard
  before update or delete on public.case_applicants
  for each row execute function public.app_case_applicant_guard();

-- 5.3 case_invitations: 不変列 / 許容遷移 / hard delete 禁止（受諾/取消/期限後は終端）
create function public.app_case_invitation_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'case_invitation_delete_forbidden' using errcode = '42501';
  end if;
  if new.case_id is distinct from old.case_id
     or new.applicant_id is distinct from old.applicant_id
     or new.invited_email is distinct from old.invited_email then
    raise exception 'case_invitation_immutable_columns' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if old.status <> 'invited'
       or new.status not in ('accepted', 'cancelled', 'expired') then
      raise exception 'case_invitation_invalid_transition'
        using errcode = 'P0001',
              detail = format('transition %s -> %s is not allowed', old.status, new.status);
    end if;
  end if;
  return new;
end;
$$;
create trigger case_invitation_guard
  before update or delete on public.case_invitations
  for each row execute function public.app_case_invitation_guard();

-- 5.4 case_participants: 付替え禁止（immutable。作成のみ）
create function public.app_case_participant_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'case_participant_immutable'
    using errcode = '42501',
          detail = 'case_participants rows are immutable; no update/delete.';
end;
$$;
create trigger case_participant_guard
  before update or delete on public.case_participants
  for each row execute function public.app_case_participant_guard();

-- ---------------------------------------------------------------------------
-- 6. RLS 有効化
-- ---------------------------------------------------------------------------
alter table public.customer_cases          enable row level security;
alter table public.case_applicants         enable row level security;
alter table public.case_applicant_profiles enable row level security;
alter table public.case_invitations        enable row level security;
alter table public.case_participants       enable row level security;

-- ---------------------------------------------------------------------------
-- 7. RLS ヘルパー（SECURITY DEFINER・search_path 固定・STABLE。RLS を内部で回避して読む）
--    NULL 三値論理に注意（is not distinct from / 明示条件）。
-- ---------------------------------------------------------------------------

-- 顧客: 当該案件の participant か
create function public.app_is_case_participant(p_case_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.case_participants cp
     where cp.case_id = p_case_id and cp.user_id = auth.uid()
  );
$$;

-- スタッフ: 担当営業(active assigned) / 当該法人 ORGANIZATION_ADMIN / SYSTEM_ADMIN
create function public.app_can_staff_access_case(p_case_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select
    public.app_is_system_admin()
    or exists (
      select 1 from public.customer_cases c
       where c.id = p_case_id and public.app_is_org_admin(c.organization_id)
    )
    or exists (
      select 1
        from public.customer_cases c
        join public.organization_memberships m on m.id = c.assigned_membership_id
       where c.id = p_case_id
         and m.user_id = auth.uid()
         and m.status = 'active'
    );
$$;

-- 顧客 or スタッフ（案件全体の閲覧可否）
create function public.app_can_access_case(p_case_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.app_is_case_participant(p_case_id)
      or public.app_can_staff_access_case(p_case_id);
$$;

-- 顧客本人が「その申込者」に紐づく participant か（自分の申込者のみ）
create function public.app_participant_owns_applicant(p_applicant_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.case_participants cp
     where cp.applicant_id = p_applicant_id and cp.user_id = auth.uid()
  );
$$;

-- スタッフが「その申込者の案件」にアクセスできるか（申込者 PII 用）
create function public.app_staff_can_access_applicant(p_applicant_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.case_applicants a
     where a.id = p_applicant_id and public.app_can_staff_access_case(a.case_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- 8. RLS ポリシー（SELECT のみ。書込ポリシーは置かず業務関数のみ）
-- ---------------------------------------------------------------------------

-- customer_cases
create policy customer_cases_select_participant on public.customer_cases
  for select to authenticated using (public.app_is_case_participant(id));
create policy customer_cases_select_staff on public.customer_cases
  for select to authenticated using (public.app_can_staff_access_case(id));

-- case_applicants: 顧客は自分の申込者のみ / スタッフは案件の全申込者
create policy case_applicants_select_own on public.case_applicants
  for select to authenticated using (public.app_participant_owns_applicant(id));
create policy case_applicants_select_staff on public.case_applicants
  for select to authenticated using (public.app_can_staff_access_case(case_id));

-- case_applicant_profiles(PII): 顧客は自分の申込者のみ / スタッフは案件の全申込者
--   （顧客は他の共同申込者 PII を閲覧不可）
create policy case_applicant_profiles_select_own on public.case_applicant_profiles
  for select to authenticated using (public.app_participant_owns_applicant(applicant_id));
create policy case_applicant_profiles_select_staff on public.case_applicant_profiles
  for select to authenticated using (public.app_staff_can_access_applicant(applicant_id));

-- case_invitations: スタッフのみ
create policy case_invitations_select_staff on public.case_invitations
  for select to authenticated using (public.app_can_staff_access_case(case_id));

-- case_participants: 本人 / スタッフ
create policy case_participants_select_own on public.case_participants
  for select to authenticated using (user_id = auth.uid());
create policy case_participants_select_staff on public.case_participants
  for select to authenticated using (public.app_can_staff_access_case(case_id));

-- ---------------------------------------------------------------------------
-- 9. GRANT / REVOKE（テーブル）。SELECT のみ authenticated。書込は業務関数のみ。
-- ---------------------------------------------------------------------------
revoke all on table public.customer_cases          from anon, authenticated, service_role;
revoke all on table public.case_applicants         from anon, authenticated, service_role;
revoke all on table public.case_applicant_profiles from anon, authenticated, service_role;
revoke all on table public.case_invitations        from anon, authenticated, service_role;
revoke all on table public.case_participants       from anon, authenticated, service_role;

grant select on public.customer_cases          to authenticated;
grant select on public.case_applicants         to authenticated;
grant select on public.case_applicant_profiles to authenticated;
grant select on public.case_invitations        to authenticated;
grant select on public.case_participants       to authenticated;

-- ---------------------------------------------------------------------------
-- 10. 冪等性ヘルパー（内部専用）: 同一 correlation の成功監査から resource_id を返す
-- ---------------------------------------------------------------------------
create function public.app_prior_success_resource(
  p_action text,
  p_correlation_id uuid
) returns text
language sql
stable
security definer
set search_path = ''
as $$
  select resource_id
    from public.authoritative_audit_logs
   where p_correlation_id is not null
     and correlation_id = p_correlation_id
     and action = p_action
     and success = true
   limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 11. 業務関数（順序: lock -> 冪等短絡 -> 認可再確認 -> 検証 -> 更新 -> 監査）
--     advisory lock keys: 815002=法人単位 / 815003=案件単位
-- ---------------------------------------------------------------------------

-- 11.0 参加者追加（内部専用。app_accept_case_invitation からのみ呼ぶ）
create function public.app_add_case_participant(
  p_case_id uuid,
  p_applicant_id uuid,
  p_user_id uuid,
  p_participant_role public.case_participant_role,
  p_invitation_id uuid,
  p_added_by uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_existing_user uuid;
begin
  select id, user_id into v_id, v_existing_user
    from public.case_participants where applicant_id = p_applicant_id;
  if found then
    -- 冪等: 既存が同一ユーザーならそれを返す（重複作成しない）。別ユーザーは競合。
    if v_existing_user is distinct from p_user_id then
      raise exception 'participant_conflict' using errcode = 'P0001';
    end if;
    return v_id;
  end if;

  insert into public.case_participants
    (case_id, applicant_id, user_id, participant_role, invitation_id, added_by)
  values
    (p_case_id, p_applicant_id, p_user_id, p_participant_role, p_invitation_id, p_added_by)
  returning id into v_id;
  return v_id;
end;
$$;

-- 11.1 案件作成（当該法人の active SALES_USER / ORGANIZATION_ADMIN）
create function public.app_create_customer_case(
  p_organization_id uuid,
  p_assigned_membership_id uuid,
  p_case_name text,
  p_desired_price_yen bigint default null,
  p_correlation_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_case_id uuid;
  v_prior text;
  v_assigned public.organization_memberships%rowtype;
  v_actor_is_admin boolean;
begin
  perform pg_advisory_xact_lock(815002, hashtext(p_organization_id::text));

  if p_correlation_id is not null then
    v_prior := public.app_prior_success_resource('customer_case.created', p_correlation_id);
    if v_prior is not null then
      return v_prior::uuid;
    end if;
  end if;

  v_actor_is_admin := public.app_is_org_admin(p_organization_id);
  if not (v_actor_is_admin or exists (
      select 1 from public.organization_memberships m
       where m.organization_id = p_organization_id
         and m.user_id = v_actor
         and m.status = 'active'
         and m.role = 'SALES_USER'
    )) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_case_name is null or length(btrim(p_case_name)) not between 1 and 200 then
    raise exception 'invalid_case_name' using errcode = '22023';
  end if;
  if p_desired_price_yen is not null and p_desired_price_yen < 0 then
    raise exception 'invalid_desired_price' using errcode = '22023';
  end if;

  select * into v_assigned from public.organization_memberships
   where id = p_assigned_membership_id;
  if not found
     or v_assigned.organization_id is distinct from p_organization_id
     or v_assigned.status <> 'active'
     or v_assigned.role not in ('SALES_USER', 'ORGANIZATION_ADMIN') then
    raise exception 'invalid_assigned_membership' using errcode = '22023';
  end if;
  -- SALES_USER は自分の membership へのみ割当可。ORGANIZATION_ADMIN は任意の active 営業へ割当可。
  if not v_actor_is_admin and v_assigned.user_id is distinct from v_actor then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into public.customer_cases
    (organization_id, assigned_membership_id, status, case_name, desired_price_yen, created_by)
  values
    (p_organization_id, p_assigned_membership_id, 'draft', btrim(p_case_name),
     p_desired_price_yen, v_actor)
  returning id into v_case_id;

  perform public.app_write_audit(
    'customer_case.created', v_actor, p_organization_id, 'customer_case', v_case_id::text,
    true, null, p_correlation_id,
    jsonb_build_object('assigned_membership_id', p_assigned_membership_id::text));
  return v_case_id;
end;
$$;

-- 11.2 申込者招待（スタッフ。case_applicant + 空 PII プロフィール + case_invitation を作成）
create function public.app_invite_case_applicant(
  p_case_id uuid,
  p_applicant_type public.case_applicant_type,
  p_invited_email text,
  p_relationship_to_primary text default null,
  p_expires_at timestamptz default null,
  p_correlation_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_case public.customer_cases%rowtype;
  v_org uuid;
  v_email text := lower(btrim(coalesce(p_invited_email, '')));
  v_expires timestamptz := coalesce(p_expires_at, now() + interval '14 days');
  v_applicant_id uuid;
  v_invitation_id uuid;
  v_prior text;
begin
  select * into v_case from public.customer_cases where id = p_case_id;
  if not found then
    raise exception 'customer_case_not_found' using errcode = 'P0002';
  end if;
  v_org := v_case.organization_id;

  perform pg_advisory_xact_lock(815003, hashtext(p_case_id::text));

  if p_correlation_id is not null then
    v_prior := public.app_prior_success_resource('case_invitation.created', p_correlation_id);
    if v_prior is not null then
      return v_prior::uuid;
    end if;
  end if;

  if not public.app_can_staff_access_case(p_case_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_case.status in ('cancelled', 'expired') then
    raise exception 'customer_case_not_open' using errcode = 'P0001';
  end if;
  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if v_expires <= now() then
    raise exception 'invalid_expiry' using errcode = '22023';
  end if;
  if p_applicant_type = 'primary' and exists (
    select 1 from public.case_applicants a
     where a.case_id = p_case_id and a.applicant_type = 'primary'
  ) then
    raise exception 'primary_applicant_already_exists' using errcode = 'P0001';
  end if;

  insert into public.case_applicants (case_id, applicant_type, relationship_to_primary, status)
  values (
    p_case_id, p_applicant_type,
    case when p_applicant_type = 'co_applicant'
         then nullif(btrim(coalesce(p_relationship_to_primary, '')), '')
         else null end,
    'active')
  returning id into v_applicant_id;

  -- PII は入力フェーズ(2A-2)で書く。ここでは空プロフィール行のみ作成（email 等の PII を入れない）。
  insert into public.case_applicant_profiles (applicant_id) values (v_applicant_id);

  insert into public.case_invitations
    (case_id, applicant_id, invited_email, status, expires_at, invited_by, correlation_id)
  values
    (p_case_id, v_applicant_id, v_email, 'invited', v_expires, v_actor, p_correlation_id)
  returning id into v_invitation_id;

  if v_case.status = 'draft' then
    update public.customer_cases set status = 'invited' where id = p_case_id;
    perform public.app_write_audit(
      'customer_case.status_changed', v_actor, v_org, 'customer_case', p_case_id::text,
      true, null, null, jsonb_build_object('old_status', 'draft', 'new_status', 'invited'));
  end if;

  perform public.app_write_audit(
    'case_applicant.created', v_actor, v_org, 'case_applicant', v_applicant_id::text,
    true, null, null, jsonb_build_object('applicant_type', p_applicant_type::text));
  perform public.app_write_audit(
    'case_invitation.created', v_actor, v_org, 'case_invitation', v_invitation_id::text,
    true, null, p_correlation_id, '{}'::jsonb);
  return v_invitation_id;
end;
$$;

-- 11.3 招待受諾（顧客本人。organization membership を要求しない。本人メール一致必須）
create function public.app_accept_case_invitation(
  p_invitation_id uuid,
  p_correlation_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_inv public.case_invitations%rowtype;
  v_case public.customer_cases%rowtype;
  v_applicant public.case_applicants%rowtype;
  v_actor_email text;
  v_role public.case_participant_role;
  v_participant_id uuid;
  v_count int;
begin
  select * into v_inv from public.case_invitations where id = p_invitation_id;
  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(815003, hashtext(v_inv.case_id::text));

  select * into v_inv from public.case_invitations where id = p_invitation_id for update;
  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;

  -- 本人メール（auth 所有のミラー）と invited_email の一致（クライアント申告の email は信用しない）
  select lower(btrim(email)) into v_actor_email
    from public.user_profiles where id = v_actor;
  if v_actor_email is null or v_actor_email is distinct from v_inv.invited_email then
    raise exception 'invite_email_mismatch' using errcode = '42501';
  end if;

  -- 冪等: 既に受諾済み（同一本人）なら既存 participant を返す（二重受諾で重複を作らない）
  if v_inv.status = 'accepted' then
    if v_inv.accepted_by_user_id is distinct from v_actor then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
    select id into v_participant_id
      from public.case_participants where applicant_id = v_inv.applicant_id;
    return v_participant_id;
  end if;
  if v_inv.status <> 'invited' then
    raise exception 'invitation_not_open' using errcode = 'P0001';
  end if;
  if now() > v_inv.expires_at then
    raise exception 'invitation_expired' using errcode = 'P0001';
  end if;

  select * into v_applicant from public.case_applicants where id = v_inv.applicant_id;
  if not found then
    raise exception 'case_applicant_not_found' using errcode = 'P0002';
  end if;
  v_role := case when v_applicant.applicant_type = 'primary'
                 then 'primary_applicant'::public.case_participant_role
                 else 'co_applicant'::public.case_participant_role end;

  v_participant_id := public.app_add_case_participant(
    v_inv.case_id, v_inv.applicant_id, v_actor, v_role, p_invitation_id, v_actor);

  update public.case_invitations
     set status = 'accepted', accepted_at = now(), accepted_by_user_id = v_actor
   where id = p_invitation_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'unexpected_row_count' using errcode = 'P0001';
  end if;

  select * into v_case from public.customer_cases where id = v_inv.case_id for update;
  if v_case.status = 'invited' then
    update public.customer_cases set status = 'opened' where id = v_inv.case_id;
    perform public.app_write_audit(
      'customer_case.status_changed', v_actor, v_case.organization_id, 'customer_case',
      v_inv.case_id::text, true, null, null,
      jsonb_build_object('old_status', 'invited', 'new_status', 'opened'));
  end if;

  perform public.app_write_audit(
    'case_invitation.accepted', v_actor, v_case.organization_id, 'case_invitation',
    p_invitation_id::text, true, null, p_correlation_id, '{}'::jsonb);
  perform public.app_write_audit(
    'case_participant.added', v_actor, v_case.organization_id, 'case_participant',
    v_participant_id::text, true, null, null,
    jsonb_build_object('participant_role', v_role::text));
  return v_participant_id;
end;
$$;

-- 11.4 案件ステータス遷移（スタッフ。cancel 等）
create function public.app_transition_customer_case_status(
  p_case_id uuid,
  p_new_status public.customer_case_status,
  p_correlation_id uuid default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_case public.customer_cases%rowtype;
  v_old public.customer_case_status;
  v_count int;
  v_prior text;
begin
  select * into v_case from public.customer_cases where id = p_case_id;
  if not found then
    raise exception 'customer_case_not_found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(815003, hashtext(p_case_id::text));

  if p_correlation_id is not null then
    v_prior := public.app_prior_success_resource('customer_case.status_changed', p_correlation_id);
    if v_prior is not null then
      return;
    end if;
  end if;

  if not public.app_can_staff_access_case(p_case_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_case from public.customer_cases where id = p_case_id for update;
  v_old := v_case.status;
  if not public.app_customer_case_transition_allowed(v_old, p_new_status) then
    raise exception 'customer_case_invalid_transition'
      using errcode = 'P0001',
            detail = format('transition %s -> %s is not allowed', v_old, p_new_status);
  end if;

  update public.customer_cases set status = p_new_status where id = p_case_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'unexpected_row_count' using errcode = 'P0001';
  end if;

  perform public.app_write_audit(
    'customer_case.status_changed', v_actor, v_case.organization_id, 'customer_case',
    p_case_id::text, true, null, p_correlation_id,
    jsonb_build_object('old_status', v_old::text, 'new_status', p_new_status::text));
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. 関数 EXECUTE 権限（public から revoke し、必要最小限のみ grant）
-- ---------------------------------------------------------------------------
-- トリガー / 内部専用（誰にも grant しない。定義者コンテキストからのみ呼ばれる）
revoke execute on function public.app_customer_case_guard()   from public, anon, authenticated, service_role;
revoke execute on function public.app_case_applicant_guard()  from public, anon, authenticated, service_role;
revoke execute on function public.app_case_invitation_guard() from public, anon, authenticated, service_role;
revoke execute on function public.app_case_participant_guard() from public, anon, authenticated, service_role;
revoke execute on function public.app_customer_case_transition_allowed(public.customer_case_status, public.customer_case_status)
  from public, anon, authenticated, service_role;
revoke execute on function public.app_prior_success_resource(text, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.app_add_case_participant(uuid, uuid, uuid, public.case_participant_role, uuid, uuid)
  from public, anon, authenticated, service_role;

-- RLS ヘルパー（RLS ポリシーから authenticated として評価されるため grant 要）
revoke execute on function public.app_is_case_participant(uuid)        from public, anon;
revoke execute on function public.app_can_staff_access_case(uuid)      from public, anon;
revoke execute on function public.app_can_access_case(uuid)            from public, anon;
revoke execute on function public.app_participant_owns_applicant(uuid) from public, anon;
revoke execute on function public.app_staff_can_access_applicant(uuid) from public, anon;
grant  execute on function public.app_is_case_participant(uuid)        to authenticated;
grant  execute on function public.app_can_staff_access_case(uuid)      to authenticated;
grant  execute on function public.app_can_access_case(uuid)            to authenticated;
grant  execute on function public.app_participant_owns_applicant(uuid) to authenticated;
grant  execute on function public.app_staff_can_access_applicant(uuid) to authenticated;

-- 公開業務関数（内部で認可を自己検証する）
revoke execute on function public.app_create_customer_case(uuid, uuid, text, bigint, uuid) from public, anon;
revoke execute on function public.app_invite_case_applicant(uuid, public.case_applicant_type, text, text, timestamptz, uuid) from public, anon;
revoke execute on function public.app_accept_case_invitation(uuid, uuid) from public, anon;
revoke execute on function public.app_transition_customer_case_status(uuid, public.customer_case_status, uuid) from public, anon;
grant  execute on function public.app_create_customer_case(uuid, uuid, text, bigint, uuid) to authenticated;
grant  execute on function public.app_invite_case_applicant(uuid, public.case_applicant_type, text, text, timestamptz, uuid) to authenticated;
grant  execute on function public.app_accept_case_invitation(uuid, uuid) to authenticated;
grant  execute on function public.app_transition_customer_case_status(uuid, public.customer_case_status, uuid) to authenticated;

commit;
