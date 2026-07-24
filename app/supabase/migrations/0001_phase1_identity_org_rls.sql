-- ============================================================================
-- 0001_phase1_identity_org_rls.sql
-- Phase 1: identity / organizations / memberships / RLS / audit (rebuild v6-eq r1)
--
-- 前提:
--  * Supabase (auth schema, roles anon/authenticated/service_role) 上で動作する。
--  * PGハーネスでは scripts/pg-harness/00_shim_supabase.sql が同等物を提供する。
--  * 直接テーブル書込は行わず、監査付き業務関数 (app_*) のみで変更する。
--  * SECURITY DEFINER は search_path を固定し、EXECUTE を明示管理する。
--  * 金額/料率カラムは本フェーズには存在しない (Phase 2 で *_yen / *_bps)。
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. ENUMs
-- ---------------------------------------------------------------------------
create type public.system_role as enum ('SYSTEM_ADMIN');

create type public.organization_role as enum ('ORGANIZATION_ADMIN', 'SALES_USER');

create type public.membership_status as enum ('invited', 'active', 'suspended', 'left');

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

-- 2.1 user_profiles: auth.users と 1:1。email は auth 所有のミラー。
create table public.user_profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null unique,
  display_name text,
  system_role  public.system_role,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint user_profiles_email_lower check (email = lower(btrim(email)))
);

comment on table public.user_profiles is
  'auth.users 1:1 profile. email is a mirror owned by auth. system_role holds platform-level SYSTEM_ADMIN (not an organization role).';

-- 2.2 organizations
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint organizations_name_len check (length(btrim(name)) between 1 and 200)
);

-- 2.3 organization_memberships: user_profiles と organizations の N:N
create table public.organization_memberships (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id),
  user_id           uuid not null references public.user_profiles (id),
  role              public.organization_role not null,
  status            public.membership_status not null default 'invited',
  invited_email     text not null,
  invited_by        uuid references public.user_profiles (id),
  invited_at        timestamptz not null default now(),
  accepted_at       timestamptz,
  status_changed_at timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint organization_memberships_org_user_uniq unique (organization_id, user_id),
  constraint organization_memberships_invited_email_lower
    check (invited_email = lower(btrim(invited_email)))
);

create index organization_memberships_user_idx
  on public.organization_memberships (user_id, status);
create index organization_memberships_org_idx
  on public.organization_memberships (organization_id, status);

-- 2.4 authoritative_audit_logs: 追記専用の権威監査ログ
create table public.authoritative_audit_logs (
  id             bigint generated always as identity primary key,
  occurred_at    timestamptz not null default now(),
  actor_user_id  uuid,
  action         text not null,
  organization_id uuid,
  resource_type  text,
  resource_id    text,
  success        boolean not null,
  error_code     text,
  correlation_id uuid,
  metadata       jsonb not null default '{}'::jsonb,
  constraint audit_action_len check (length(action) between 1 and 200)
);

create index authoritative_audit_logs_org_idx
  on public.authoritative_audit_logs (organization_id, occurred_at desc);

comment on table public.authoritative_audit_logs is
  'Append-only authoritative audit. Success rows are written inside business functions (same tx). Failure rows are written by the server via dedicated per-action functions (e.g. app_record_membership_accept_failure; separate tx, service_role only). No PII bodies / financial details / JWT / secrets in metadata.';

-- ---------------------------------------------------------------------------
-- 3. auth.users -> user_profiles 同期トリガー
-- ---------------------------------------------------------------------------
create function public.app_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (id, email)
  values (new.id, lower(btrim(new.email)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create function public.app_sync_auth_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.user_profiles
       set email = lower(btrim(new.email))
     where id = new.id;
  end if;
  return new;
end;
$$;

create trigger app_on_auth_user_created
  after insert on auth.users
  for each row execute function public.app_handle_new_auth_user();

create trigger app_on_auth_user_email_updated
  after update on auth.users
  for each row execute function public.app_sync_auth_user_email();

-- ---------------------------------------------------------------------------
-- 4. updated_at トリガー
-- ---------------------------------------------------------------------------
create function public.app_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.user_profiles
  for each row execute function public.app_set_updated_at();
create trigger set_updated_at before update on public.organizations
  for each row execute function public.app_set_updated_at();
create trigger set_updated_at before update on public.organization_memberships
  for each row execute function public.app_set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. 整合性トリガー（二重防御。並行競合の主防御は業務関数の advisory lock）
-- ---------------------------------------------------------------------------

-- 5.1 membership の不変列・許容遷移
create function public.app_membership_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'membership_delete_forbidden'
      using errcode = '42501',
            detail = 'organization_memberships rows must never be deleted; use status=left.';
  end if;

  if new.organization_id is distinct from old.organization_id then
    raise exception 'membership_org_immutable'
      using errcode = '42501',
            detail = 'organization_id must not change; move = left old + invite new + accept.';
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'membership_user_immutable' using errcode = '42501';
  end if;

  if old.status = 'left' then
    raise exception 'membership_left_terminal'
      using errcode = 'P0001',
            detail = 'left is terminal; no further changes allowed.';
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'invited'   and new.status in ('active', 'left')) or
      (old.status = 'active'    and new.status in ('suspended', 'left')) or
      (old.status = 'suspended' and new.status in ('active', 'left'))
    ) then
      raise exception 'membership_invalid_transition'
        using errcode = 'P0001',
              detail = format('transition %s -> %s is not allowed', old.status, new.status);
    end if;
    new.status_changed_at := now();
  end if;

  if new.role is distinct from old.role then
    if old.status <> 'active' or new.status <> 'active' then
      raise exception 'membership_role_change_requires_active' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

create trigger membership_guard
  before update or delete on public.organization_memberships
  for each row execute function public.app_membership_guard();

-- 5.2 最後の ORGANIZATION_ADMIN 保護（バックストップ）
create function public.app_org_last_admin_backstop()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'active' and old.role = 'ORGANIZATION_ADMIN'
     and (new.status <> 'active' or new.role <> 'ORGANIZATION_ADMIN') then
    if not exists (
      select 1
        from public.organization_memberships m
       where m.organization_id = old.organization_id
         and m.id <> old.id
         and m.status = 'active'
         and m.role = 'ORGANIZATION_ADMIN'
    ) then
      raise exception 'last_organization_admin_protected'
        using errcode = 'P0001',
              detail = 'operation would leave the organization with zero active ORGANIZATION_ADMIN.';
    end if;
  end if;
  return new;
end;
$$;

create trigger org_last_admin_backstop
  before update on public.organization_memberships
  for each row execute function public.app_org_last_admin_backstop();

-- 5.3 最後の SYSTEM_ADMIN 保護（バックストップ）
create function public.app_last_system_admin_backstop()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.system_role is not distinct from 'SYSTEM_ADMIN'::public.system_role
     and new.system_role is distinct from 'SYSTEM_ADMIN'::public.system_role then
    if not exists (
      select 1
        from public.user_profiles p
       where p.id <> old.id
         and p.system_role is not distinct from 'SYSTEM_ADMIN'::public.system_role
    ) then
      raise exception 'last_system_admin_protected'
        using errcode = 'P0001',
              detail = 'operation would leave the platform with zero SYSTEM_ADMIN.';
    end if;
  end if;
  return new;
end;
$$;

create trigger last_system_admin_backstop
  before update on public.user_profiles
  for each row execute function public.app_last_system_admin_backstop();

-- 5.4 監査ログ追記専用
create function public.app_audit_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log_append_only'
    using errcode = '42501',
          detail = 'authoritative_audit_logs is append-only.';
end;
$$;

create trigger audit_append_only
  before update or delete on public.authoritative_audit_logs
  for each row execute function public.app_audit_append_only();

-- ---------------------------------------------------------------------------
-- 6. RLS ヘルパー（SECURITY DEFINER, search_path 固定, STABLE）
--    NULL 三値論理に注意: is not distinct from を使用。
-- ---------------------------------------------------------------------------
create function public.app_is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.user_profiles p
     where p.id = auth.uid()
       and p.system_role is not distinct from 'SYSTEM_ADMIN'::public.system_role
  );
$$;

create function public.app_is_org_admin(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.organization_memberships m
     where m.organization_id = p_organization_id
       and m.user_id = auth.uid()
       and m.status = 'active'
       and m.role = 'ORGANIZATION_ADMIN'
  );
$$;

create function public.app_is_active_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.organization_memberships m
     where m.organization_id = p_organization_id
       and m.user_id = auth.uid()
       and m.status = 'active'
  );
$$;

-- invited/active/suspended は自分の所属先 organization の存在（名称）を知る必要がある
create function public.app_is_member_any_live_status(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.organization_memberships m
     where m.organization_id = p_organization_id
       and m.user_id = auth.uid()
       and m.status in ('invited', 'active', 'suspended')
  );
$$;

-- 閲覧者が対象ユーザーの所属法人の active ORGANIZATION_ADMIN である場合のみ true。
-- SALES_USER には他ユーザーの user_profiles 行（email 等）を開示しない（SEC-66..70）。
create function public.app_can_administer_profile(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.organization_memberships admin_m
      join public.organization_memberships target_m
        on target_m.organization_id = admin_m.organization_id
     where admin_m.user_id = auth.uid()
       and admin_m.status = 'active'
       and admin_m.role = 'ORGANIZATION_ADMIN'
       and target_m.user_id = p_user_id
       and target_m.status in ('invited', 'active', 'suspended')
  );
$$;

-- ---------------------------------------------------------------------------
-- 7. RLS ポリシー
-- ---------------------------------------------------------------------------
alter table public.user_profiles            enable row level security;
alter table public.organizations            enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.authoritative_audit_logs enable row level security;

-- user_profiles
create policy user_profiles_select_own on public.user_profiles
  for select to authenticated
  using (id = auth.uid());

create policy user_profiles_select_system_admin on public.user_profiles
  for select to authenticated
  using (public.app_is_system_admin());

-- ORGANIZATION_ADMIN のみ自法人メンバーの profile を閲覧可（SALES_USER は本人分のみ）
create policy user_profiles_select_org_admin on public.user_profiles
  for select to authenticated
  using (public.app_can_administer_profile(id));

create policy user_profiles_update_own on public.user_profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- organizations（書込ポリシーなし: 業務関数のみ）
create policy organizations_select_member on public.organizations
  for select to authenticated
  using (public.app_is_member_any_live_status(id) or public.app_is_system_admin());

-- organization_memberships（書込ポリシーなし: 業務関数のみ）
create policy memberships_select_own on public.organization_memberships
  for select to authenticated
  using (user_id = auth.uid());

create policy memberships_select_org_admin on public.organization_memberships
  for select to authenticated
  using (public.app_is_org_admin(organization_id));

create policy memberships_select_system_admin on public.organization_memberships
  for select to authenticated
  using (public.app_is_system_admin());

-- authoritative_audit_logs（クライアント書込ポリシーなし）
create policy audit_select_system_admin on public.authoritative_audit_logs
  for select to authenticated
  using (public.app_is_system_admin());

create policy audit_select_org_admin on public.authoritative_audit_logs
  for select to authenticated
  using (organization_id is not null and public.app_is_org_admin(organization_id));

-- ---------------------------------------------------------------------------
-- 8. GRANT / REVOKE（Supabase 既定権限に依存しない）
-- ---------------------------------------------------------------------------
revoke all on table public.user_profiles            from anon, authenticated, service_role;
revoke all on table public.organizations            from anon, authenticated, service_role;
revoke all on table public.organization_memberships from anon, authenticated, service_role;
revoke all on table public.authoritative_audit_logs from anon, authenticated, service_role;

grant select on public.user_profiles            to authenticated;
grant select on public.organizations            to authenticated;
grant select on public.organization_memberships to authenticated;
grant select on public.authoritative_audit_logs to authenticated;

-- user_profiles は display_name 列のみ更新可（email / system_role は列GRANTなし）
grant update (display_name) on public.user_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 9. 監査書込（内部専用）
-- ---------------------------------------------------------------------------
create function public.app_write_audit(
  p_action          text,
  p_actor_user_id   uuid,
  p_organization_id uuid,
  p_resource_type   text,
  p_resource_id     text,
  p_success         boolean,
  p_error_code      text,
  p_correlation_id  uuid,
  p_metadata        jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.authoritative_audit_logs
    (action, actor_user_id, organization_id, resource_type, resource_id,
     success, error_code, correlation_id, metadata)
  values
    (p_action, p_actor_user_id, p_organization_id, p_resource_type, p_resource_id,
     p_success, p_error_code, p_correlation_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

-- 失敗監査: サーバー(service_role)が例外捕捉後、別トランザクションで記録する。
-- Phase 1 で必要な失敗監査は membership.accept のみのため、汎用関数は置かず
-- 専用関数とする（action / resource_type / success はDB側で固定、error_code は
-- 許可リスト検証、metadata は受け付けない。SEC-71..75）。
create function public.app_record_membership_accept_failure(
  p_actor_user_id  uuid,
  p_membership_id  uuid,
  p_error_code     text,
  p_correlation_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_allowed_error_codes constant text[] := array[
    'not_authorized',
    'invite_email_mismatch',
    'membership_not_found',
    'membership_invalid_transition',
    'membership_left_terminal',
    'organization_not_found_or_archived',
    'unexpected_error'
  ];
  v_organization_id uuid;
begin
  if p_actor_user_id is null then
    raise exception 'audit_actor_required' using errcode = '22023';
  end if;
  if p_membership_id is null then
    raise exception 'audit_membership_id_required' using errcode = '22023';
  end if;
  if p_correlation_id is null then
    raise exception 'audit_correlation_required' using errcode = '22023';
  end if;
  if p_error_code is null
     or length(p_error_code) > 64
     or not (p_error_code = any (c_allowed_error_codes)) then
    raise exception 'audit_error_code_not_allowed' using errcode = '22023';
  end if;

  -- organization_id はクライアント申告ではなく DB 側で解決（存在しない場合は null）
  select organization_id into v_organization_id
    from public.organization_memberships
   where id = p_membership_id;

  -- action / resource_type / success / metadata は呼出し側から変更不能（固定値）
  perform public.app_write_audit(
    'membership.accept',
    p_actor_user_id,
    v_organization_id,
    'organization_membership',
    p_membership_id::text,
    false,
    p_error_code,
    p_correlation_id,
    '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. 業務関数
--     原則順序: advisory lock -> 認可再確認 -> FOR UPDATE -> 状態再確認
--               -> 更新 -> 行数確認 -> 成功監査（同一トランザクション）
--     advisory lock keys:
--       (815001, 1)                  : SYSTEM_ADMIN 集合（グローバル）
--       (815002, hashtext(org_id))   : 法人管理者集合（法人単位）
-- ---------------------------------------------------------------------------

-- 10.1 法人作成（SYSTEM_ADMIN 専用）
create function public.app_create_organization(
  p_name text,
  p_correlation_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_org_id uuid;
begin
  -- SYSTEM_ADMIN 集合ロックを先に取得し、取得後に認可を再確認する（SEC-62）
  perform pg_advisory_xact_lock(815001, 1);

  if not public.app_is_system_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 200 then
    raise exception 'invalid_organization_name' using errcode = '22023';
  end if;

  insert into public.organizations (name)
  values (btrim(p_name))
  returning id into v_org_id;

  perform public.app_write_audit(
    'organization.create', v_actor, v_org_id, 'organization', v_org_id::text,
    true, null, p_correlation_id, '{}'::jsonb);
  return v_org_id;
end;
$$;

-- 10.2 法人名変更（SYSTEM_ADMIN 専用）
create function public.app_rename_organization(
  p_organization_id uuid,
  p_name text,
  p_correlation_id uuid default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_count int;
begin
  -- SYSTEM_ADMIN 集合ロックを先に取得し、取得後に認可を再確認する（SEC-63）
  perform pg_advisory_xact_lock(815001, 1);

  if not public.app_is_system_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 200 then
    raise exception 'invalid_organization_name' using errcode = '22023';
  end if;

  perform 1 from public.organizations
   where id = p_organization_id and archived_at is null
     for update;
  if not found then
    raise exception 'organization_not_found_or_archived' using errcode = 'P0002';
  end if;

  update public.organizations set name = btrim(p_name)
   where id = p_organization_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'unexpected_row_count' using errcode = 'P0001';
  end if;

  perform public.app_write_audit(
    'organization.rename', v_actor, p_organization_id, 'organization',
    p_organization_id::text, true, null, p_correlation_id, '{}'::jsonb);
end;
$$;

-- 10.3 法人アーカイブ（SYSTEM_ADMIN 専用）
create function public.app_archive_organization(
  p_organization_id uuid,
  p_correlation_id uuid default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_count int;
begin
  -- SYSTEM_ADMIN 集合ロックを先に取得し、取得後に認可を再確認する（SEC-64）
  perform pg_advisory_xact_lock(815001, 1);

  if not public.app_is_system_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  perform 1 from public.organizations
   where id = p_organization_id and archived_at is null
     for update;
  if not found then
    raise exception 'organization_not_found_or_archived' using errcode = 'P0002';
  end if;

  update public.organizations set archived_at = now()
   where id = p_organization_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'unexpected_row_count' using errcode = 'P0001';
  end if;

  perform public.app_write_audit(
    'organization.archive', v_actor, p_organization_id, 'organization',
    p_organization_id::text, true, null, p_correlation_id, '{}'::jsonb);
end;
$$;

-- 10.4 メンバー招待（当該法人の ORGANIZATION_ADMIN または SYSTEM_ADMIN）
create function public.app_invite_organization_member(
  p_organization_id uuid,
  p_email text,
  p_role public.organization_role,
  p_correlation_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_target uuid;
  v_membership uuid;
begin
  -- lock first, then authorize (SEC-61..64)
  perform pg_advisory_xact_lock(815002, hashtext(p_organization_id::text));

  if not (public.app_is_org_admin(p_organization_id) or public.app_is_system_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  perform 1 from public.organizations
   where id = p_organization_id and archived_at is null;
  if not found then
    raise exception 'organization_not_found_or_archived' using errcode = 'P0002';
  end if;

  select id into v_target from public.user_profiles where email = v_email;
  if v_target is null then
    raise exception 'invited_user_not_found' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.organization_memberships
     where organization_id = p_organization_id and user_id = v_target
  ) then
    raise exception 'membership_already_exists' using errcode = 'P0001';
  end if;

  insert into public.organization_memberships
    (organization_id, user_id, role, status, invited_email, invited_by)
  values
    (p_organization_id, v_target, p_role, 'invited', v_email, v_actor)
  returning id into v_membership;

  perform public.app_write_audit(
    'membership.invite', v_actor, p_organization_id, 'organization_membership',
    v_membership::text, true, null, p_correlation_id,
    jsonb_build_object('role', p_role::text));
  return v_membership;
end;
$$;

-- 10.5 招待受諾（本人のみ、invited -> active、招待メール一致必須）
create function public.app_accept_invitation(
  p_membership_id uuid,
  p_correlation_id uuid default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_org uuid;
  v_row public.organization_memberships%rowtype;
  v_actor_email text;
  v_count int;
begin
  select organization_id into v_org
    from public.organization_memberships where id = p_membership_id;
  if v_org is null then
    raise exception 'membership_not_found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(815002, hashtext(v_org::text));

  select * into v_row
    from public.organization_memberships
   where id = p_membership_id
     for update;
  if not found then
    raise exception 'membership_not_found' using errcode = 'P0002';
  end if;

  -- 認可: 本人の accept のみが invited -> active を行う
  if v_row.user_id is distinct from v_actor then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_row.status <> 'invited' then
    raise exception 'membership_invalid_transition' using errcode = 'P0001';
  end if;

  select email into v_actor_email from public.user_profiles where id = v_actor;
  if v_actor_email is null
     or lower(btrim(v_actor_email)) is distinct from v_row.invited_email then
    raise exception 'invite_email_mismatch' using errcode = '42501';
  end if;

  perform 1 from public.organizations
   where id = v_row.organization_id and archived_at is null;
  if not found then
    raise exception 'organization_not_found_or_archived' using errcode = 'P0002';
  end if;

  update public.organization_memberships
     set status = 'active', accepted_at = now()
   where id = p_membership_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'unexpected_row_count' using errcode = 'P0001';
  end if;

  perform public.app_write_audit(
    'membership.accept', v_actor, v_row.organization_id, 'organization_membership',
    p_membership_id::text, true, null, p_correlation_id, '{}'::jsonb);
end;
$$;

-- 10.6 ロール変更（active のみ / 最後の管理者保護）
create function public.app_change_member_role(
  p_membership_id uuid,
  p_new_role public.organization_role,
  p_correlation_id uuid default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_org uuid;
  v_row public.organization_memberships%rowtype;
  v_count int;
begin
  select organization_id into v_org
    from public.organization_memberships where id = p_membership_id;
  if v_org is null then
    raise exception 'membership_not_found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(815002, hashtext(v_org::text));

  if not (public.app_is_org_admin(v_org) or public.app_is_system_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_row
    from public.organization_memberships
   where id = p_membership_id
     for update;
  if not found then
    raise exception 'membership_not_found' using errcode = 'P0002';
  end if;
  if v_row.status <> 'active' then
    raise exception 'membership_role_change_requires_active' using errcode = 'P0001';
  end if;
  if v_row.role = p_new_role then
    raise exception 'role_unchanged' using errcode = 'P0001';
  end if;

  if v_row.role = 'ORGANIZATION_ADMIN' and p_new_role <> 'ORGANIZATION_ADMIN' then
    if not exists (
      select 1 from public.organization_memberships m
       where m.organization_id = v_org
         and m.id <> v_row.id
         and m.status = 'active'
         and m.role = 'ORGANIZATION_ADMIN'
    ) then
      raise exception 'last_organization_admin_protected' using errcode = 'P0001';
    end if;
  end if;

  update public.organization_memberships
     set role = p_new_role
   where id = p_membership_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'unexpected_row_count' using errcode = 'P0001';
  end if;

  perform public.app_write_audit(
    'membership.change_role', v_actor, v_org, 'organization_membership',
    p_membership_id::text, true, null, p_correlation_id,
    jsonb_build_object('new_role', p_new_role::text));
end;
$$;

-- 10.7 停止 / 再開 / 終了（共通実装）
create function public.app_change_member_status(
  p_membership_id uuid,
  p_new_status public.membership_status,
  p_action text,
  p_correlation_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_org uuid;
  v_row public.organization_memberships%rowtype;
  v_count int;
  v_allowed boolean;
begin
  select organization_id into v_org
    from public.organization_memberships where id = p_membership_id;
  if v_org is null then
    raise exception 'membership_not_found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(815002, hashtext(v_org::text));

  if not (public.app_is_org_admin(v_org) or public.app_is_system_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_row
    from public.organization_memberships
   where id = p_membership_id
     for update;
  if not found then
    raise exception 'membership_not_found' using errcode = 'P0002';
  end if;

  v_allowed :=
    (v_row.status = 'active'    and p_new_status = 'suspended') or
    (v_row.status = 'suspended' and p_new_status = 'active')    or
    (v_row.status in ('invited', 'active', 'suspended') and p_new_status = 'left');
  if not v_allowed then
    raise exception 'membership_invalid_transition'
      using errcode = 'P0001',
            detail = format('transition %s -> %s is not allowed', v_row.status, p_new_status);
  end if;

  -- 最後の active ORGANIZATION_ADMIN を無効化しない
  if v_row.status = 'active' and v_row.role = 'ORGANIZATION_ADMIN'
     and p_new_status in ('suspended', 'left') then
    if not exists (
      select 1 from public.organization_memberships m
       where m.organization_id = v_org
         and m.id <> v_row.id
         and m.status = 'active'
         and m.role = 'ORGANIZATION_ADMIN'
    ) then
      raise exception 'last_organization_admin_protected' using errcode = 'P0001';
    end if;
  end if;

  update public.organization_memberships
     set status = p_new_status
   where id = p_membership_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'unexpected_row_count' using errcode = 'P0001';
  end if;

  perform public.app_write_audit(
    p_action, v_actor, v_org, 'organization_membership',
    p_membership_id::text, true, null, p_correlation_id,
    jsonb_build_object('new_status', p_new_status::text));
end;
$$;

create function public.app_suspend_member(
  p_membership_id uuid, p_correlation_id uuid default null
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.app_change_member_status(
    p_membership_id, 'suspended', 'membership.suspend', p_correlation_id);
end;
$$;

create function public.app_reactivate_member(
  p_membership_id uuid, p_correlation_id uuid default null
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.app_change_member_status(
    p_membership_id, 'active', 'membership.reactivate', p_correlation_id);
end;
$$;

create function public.app_end_membership(
  p_membership_id uuid, p_correlation_id uuid default null
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.app_change_member_status(
    p_membership_id, 'left', 'membership.end', p_correlation_id);
end;
$$;

-- 10.8 SYSTEM_ADMIN 付与 / 剥奪（グローバル advisory lock）
create function public.app_grant_system_admin(
  p_user_id uuid,
  p_correlation_id uuid default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_current public.system_role;
  v_count int;
begin
  perform pg_advisory_xact_lock(815001, 1);

  if not public.app_is_system_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select system_role into v_current
    from public.user_profiles where id = p_user_id
    for update;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  if v_current is not distinct from 'SYSTEM_ADMIN'::public.system_role then
    raise exception 'already_system_admin' using errcode = 'P0001';
  end if;

  update public.user_profiles
     set system_role = 'SYSTEM_ADMIN'
   where id = p_user_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'unexpected_row_count' using errcode = 'P0001';
  end if;

  perform public.app_write_audit(
    'system_admin.grant', v_actor, null, 'user_profile', p_user_id::text,
    true, null, p_correlation_id, '{}'::jsonb);
end;
$$;

create function public.app_revoke_system_admin(
  p_user_id uuid,
  p_correlation_id uuid default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_current public.system_role;
  v_count int;
begin
  perform pg_advisory_xact_lock(815001, 1);

  if not public.app_is_system_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select system_role into v_current
    from public.user_profiles where id = p_user_id
    for update;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  if v_current is distinct from 'SYSTEM_ADMIN'::public.system_role then
    raise exception 'not_system_admin' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.user_profiles p
     where p.id <> p_user_id
       and p.system_role is not distinct from 'SYSTEM_ADMIN'::public.system_role
  ) then
    raise exception 'last_system_admin_protected' using errcode = 'P0001';
  end if;

  update public.user_profiles
     set system_role = null
   where id = p_user_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'unexpected_row_count' using errcode = 'P0001';
  end if;

  perform public.app_write_audit(
    'system_admin.revoke', v_actor, null, 'user_profile', p_user_id::text,
    true, null, p_correlation_id, '{}'::jsonb);
end;
$$;

-- 10.9 初回 SYSTEM_ADMIN ブートストラップ
--      EXECUTE は誰にも付与しない（superuser / migration 管理経路のみが呼べる）。
create function public.app_bootstrap_first_system_admin(
  p_user_id uuid,
  p_correlation_id uuid default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  perform pg_advisory_xact_lock(815001, 1);

  if exists (
    select 1 from public.user_profiles
     where system_role is not distinct from 'SYSTEM_ADMIN'::public.system_role
  ) then
    raise exception 'system_admin_already_exists' using errcode = 'P0001';
  end if;

  update public.user_profiles
     set system_role = 'SYSTEM_ADMIN'
   where id = p_user_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  perform public.app_write_audit(
    'system_admin.bootstrap', null, null, 'user_profile', p_user_id::text,
    true, null, p_correlation_id, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. 関数 EXECUTE 権限（public から revoke し、必要最小限のみ grant）
-- ---------------------------------------------------------------------------
revoke execute on function public.app_handle_new_auth_user()                          from public, anon, authenticated, service_role;
revoke execute on function public.app_sync_auth_user_email()                          from public, anon, authenticated, service_role;
revoke execute on function public.app_set_updated_at()                                from public, anon, authenticated, service_role;
revoke execute on function public.app_membership_guard()                              from public, anon, authenticated, service_role;
revoke execute on function public.app_org_last_admin_backstop()                       from public, anon, authenticated, service_role;
revoke execute on function public.app_last_system_admin_backstop()                    from public, anon, authenticated, service_role;
revoke execute on function public.app_audit_append_only()                             from public, anon, authenticated, service_role;
revoke execute on function public.app_write_audit(text, uuid, uuid, text, text, boolean, text, uuid, jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.app_record_membership_accept_failure(uuid, uuid, text, uuid) from public, anon, authenticated, service_role;
revoke execute on function public.app_is_system_admin()                               from public, anon;
revoke execute on function public.app_is_org_admin(uuid)                              from public, anon;
revoke execute on function public.app_is_active_member(uuid)                          from public, anon;
revoke execute on function public.app_is_member_any_live_status(uuid)                 from public, anon;
revoke execute on function public.app_can_administer_profile(uuid)                    from public, anon;
revoke execute on function public.app_create_organization(text, uuid)                 from public, anon;
revoke execute on function public.app_rename_organization(uuid, text, uuid)           from public, anon;
revoke execute on function public.app_archive_organization(uuid, uuid)                from public, anon;
revoke execute on function public.app_invite_organization_member(uuid, text, public.organization_role, uuid) from public, anon;
revoke execute on function public.app_accept_invitation(uuid, uuid)                   from public, anon;
revoke execute on function public.app_change_member_role(uuid, public.organization_role, uuid) from public, anon;
revoke execute on function public.app_change_member_status(uuid, public.membership_status, text, uuid) from public, anon, authenticated, service_role;
revoke execute on function public.app_suspend_member(uuid, uuid)                      from public, anon;
revoke execute on function public.app_reactivate_member(uuid, uuid)                   from public, anon;
revoke execute on function public.app_end_membership(uuid, uuid)                      from public, anon;
revoke execute on function public.app_grant_system_admin(uuid, uuid)                  from public, anon;
revoke execute on function public.app_revoke_system_admin(uuid, uuid)                 from public, anon;
revoke execute on function public.app_bootstrap_first_system_admin(uuid, uuid)        from public, anon, authenticated, service_role;

-- RLS ポリシーから参照されるヘルパーは authenticated に必要
grant execute on function public.app_is_system_admin()               to authenticated;
grant execute on function public.app_is_org_admin(uuid)              to authenticated;
grant execute on function public.app_is_active_member(uuid)          to authenticated;
grant execute on function public.app_is_member_any_live_status(uuid) to authenticated;
grant execute on function public.app_can_administer_profile(uuid)    to authenticated;

-- 公開業務関数（内部で認可を自己検証する）
grant execute on function public.app_create_organization(text, uuid)                 to authenticated;
grant execute on function public.app_rename_organization(uuid, text, uuid)           to authenticated;
grant execute on function public.app_archive_organization(uuid, uuid)                to authenticated;
grant execute on function public.app_invite_organization_member(uuid, text, public.organization_role, uuid) to authenticated;
grant execute on function public.app_accept_invitation(uuid, uuid)                   to authenticated;
grant execute on function public.app_change_member_role(uuid, public.organization_role, uuid) to authenticated;
grant execute on function public.app_suspend_member(uuid, uuid)                      to authenticated;
grant execute on function public.app_reactivate_member(uuid, uuid)                   to authenticated;
grant execute on function public.app_end_membership(uuid, uuid)                      to authenticated;
grant execute on function public.app_grant_system_admin(uuid, uuid)                  to authenticated;
grant execute on function public.app_revoke_system_admin(uuid, uuid)                 to authenticated;

-- 失敗監査はサーバー(service_role)のみ
grant execute on function public.app_record_membership_accept_failure(uuid, uuid, text, uuid) to service_role;

commit;
