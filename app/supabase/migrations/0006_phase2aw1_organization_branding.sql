-- ============================================================================
-- 0006_phase2aw1_organization_branding.sql
-- Phase 2A-W1: 法人別ブランディング基盤（表示名・ロゴ・メインカラー1色）
--   ・既存 0001–0005 を土台にする（本ファイルは追記のみ。既存 migration は書き換えない）。
--   ・organization と 1:1 の override テーブル。未設定はアプリ定数へフォールバック（行複製しない）。
--   ・書込は監査付き SECURITY DEFINER 業務関数のみ。直接 INSERT/UPDATE/DELETE 禁止。
--   ・値テーブル SELECT は「自 org の active メンバー」のみ（顧客・SYSTEM_ADMIN・他 org 不可）。
--     顧客は case-scoped safe RPC 経由で公開3項目のみ取得（内部列は返さない）。
--   ・ロゴはサービス管理 Storage（public read bucket `org-branding`）。書込は Storage RLS で
--     active ORG_ADMIN の自 org フォルダのみ。SVG 禁止。バイナリ/URL/token は DB/監査へ入れない。
--   ・楽観的並行制御: expected_updated_at 不一致で branding_stale_update。
-- FICTIONAL / LOCAL ONLY / PRODUCTION USE PROHIBITED。
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Table（organization と 1:1・override のみ保存）
-- ---------------------------------------------------------------------------
create table public.organization_branding (
  organization_id          uuid primary key references public.organizations (id),
  display_name             text,
  logo_storage_path        text,
  primary_color_hex        text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  updated_by_membership_id uuid references public.organization_memberships (id),
  -- 表示名: trim 後 1..100（空文字は業務関数側で NULL 正規化）。
  constraint orgbrand_display_name_len
    check (display_name is null or length(btrim(display_name)) between 1 and 100),
  -- メインカラー: 6桁 HEX のみ（小文字固定）。alpha/3桁/関数/var/url を排除。
  constraint orgbrand_primary_color_hex
    check (primary_color_hex is null or primary_color_hex ~ '^#[0-9a-f]{6}$'),
  -- ロゴ path: 先頭 = organization_id、ファイル名は乱数 UUID、拡張子は png/jpg/jpeg/webp のみ。
  --   先頭 slash・`..`・SVG 等を CHECK でも排除（正本は業務関数/アプリ）。
  constraint orgbrand_logo_path_shape
    check (
      logo_storage_path is null
      or logo_storage_path ~ ('^' || organization_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp)$')
    )
);

comment on table public.organization_branding is
  'Per-organization white-label overrides (display name, logo path, primary color). 1:1 with organizations. Unset columns fall back to app defaults (no row duplication). SELECT only by active members of the org; customers use app_get_customer_case_public_branding. Written via SECURITY DEFINER RPCs only. Binary/URL/token never stored here or in audit.';

-- updated_at トリガー（0001 の app_set_updated_at を再利用）
create trigger set_updated_at before update on public.organization_branding
  for each row execute function public.app_set_updated_at();

-- 整合性トリガー（二重防御。organization_id 不変・hard delete 禁止）
create function public.app_organization_branding_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'organization_branding_delete_forbidden' using errcode = '42501';
  end if;
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_branding_org_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger organization_branding_guard
  before update or delete on public.organization_branding
  for each row execute function public.app_organization_branding_guard();

-- ---------------------------------------------------------------------------
-- 2. RLS（値テーブルは自 org の active メンバーのみ SELECT。顧客・SYSTEM_ADMIN・他 org 不可）
-- ---------------------------------------------------------------------------
alter table public.organization_branding enable row level security;

create policy orgbrand_select_member on public.organization_branding
  for select to authenticated
  using (public.app_is_active_member(organization_id));

revoke all on table public.organization_branding from anon, authenticated, service_role;
grant select on public.organization_branding to authenticated;

-- ---------------------------------------------------------------------------
-- 3. 共通: 業務関数内の楽観ロック検証ヘルパー（inline 展開のため関数化しない）
--    ・expected が渡され、既存行があり、updated_at と不一致なら stale。
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 4. 表示名・色の更新（ORG_ADMIN）。0004 提携ローン RPC のパターンを踏襲。
--    順序: lock(815006) -> active ORG_ADMIN 認可 -> 楽観ロック -> 検証/正規化
--          -> upsert -> 監査（created / updated）-> updated_at 返却
-- ---------------------------------------------------------------------------
create function public.app_update_organization_branding(
  p_organization_id   uuid,
  p_display_name      text,
  p_primary_color_hex text,
  p_expected_updated_at timestamptz default null,
  p_correlation_id    uuid default null
) returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor    uuid := auth.uid();
  v_mid      uuid;
  v_existing public.organization_branding%rowtype;
  v_name     text;
  v_color    text;
  v_updated  timestamptz;
  v_created  boolean;
  v_fields   text[] := array[]::text[];
begin
  perform pg_advisory_xact_lock(815006, hashtext(p_organization_id::text));

  -- active ORGANIZATION_ADMIN のみ（他 org / SALES / SYSTEM_ADMIN / invited / suspended / left は not_authorized）。
  v_mid := public.app_require_org_admin_membership(p_organization_id);

  select * into v_existing from public.organization_branding
   where organization_id = p_organization_id for update;
  v_created := not found;

  if not v_created and p_expected_updated_at is not null
     and v_existing.updated_at is distinct from p_expected_updated_at then
    raise exception 'branding_stale_update' using errcode = '40001';
  end if;

  -- 検証・正規化（空文字は NULL）。色は小文字へ固定。
  v_name  := nullif(btrim(coalesce(p_display_name, '')), '');
  if v_name is not null and length(v_name) > 100 then
    raise exception 'invalid_branding_display_name' using errcode = '22023';
  end if;
  v_color := nullif(lower(btrim(coalesce(p_primary_color_hex, ''))), '');
  if v_color is not null and v_color !~ '^#[0-9a-f]{6}$' then
    raise exception 'invalid_branding_color' using errcode = '22023';
  end if;

  insert into public.organization_branding
    (organization_id, display_name, primary_color_hex, updated_by_membership_id)
  values (p_organization_id, v_name, v_color, v_mid)
  on conflict (organization_id) do update
    set display_name             = excluded.display_name,
        primary_color_hex        = excluded.primary_color_hex,
        updated_by_membership_id = excluded.updated_by_membership_id
  returning updated_at into v_updated;

  if v_name  is not null then v_fields := array_append(v_fields, 'display_name'); end if;
  if v_color is not null then v_fields := array_append(v_fields, 'primary_color_hex'); end if;

  perform public.app_write_audit(
    case when v_created then 'organization_branding.created' else 'organization_branding.updated' end,
    v_actor, p_organization_id, 'organization_branding', p_organization_id::text,
    true, null, p_correlation_id,
    jsonb_build_object('changed_field_names', to_jsonb(v_fields), 'logo_changed', false));

  return v_updated;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. ロゴ path 登録（アップロード後）。旧 path を返す（呼出側が best-effort delete）。
-- ---------------------------------------------------------------------------
create function public.app_set_organization_branding_logo(
  p_organization_id     uuid,
  p_logo_path           text,
  p_expected_updated_at timestamptz default null,
  p_correlation_id      uuid default null
) returns table (updated_at timestamptz, old_logo_path text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor    uuid := auth.uid();
  v_mid      uuid;
  v_existing public.organization_branding%rowtype;
  v_path     text;
  v_old      text;
  v_updated  timestamptz;
  v_created  boolean;
begin
  perform pg_advisory_xact_lock(815006, hashtext(p_organization_id::text));
  v_mid := public.app_require_org_admin_membership(p_organization_id);

  select * into v_existing from public.organization_branding
   where organization_id = p_organization_id for update;
  v_created := not found;
  v_old := case when v_created then null else v_existing.logo_storage_path end;

  if not v_created and p_expected_updated_at is not null
     and v_existing.updated_at is distinct from p_expected_updated_at then
    raise exception 'branding_stale_update' using errcode = '40001';
  end if;

  v_path := nullif(btrim(coalesce(p_logo_path, '')), '');
  if v_path is null then
    raise exception 'invalid_branding_logo_path' using errcode = '22023';
  end if;
  -- 先頭 = 当該 org、乱数 UUID、拡張子 png/jpg/jpeg/webp のみ（SVG/`..`/先頭 slash を排除）。
  if v_path !~ ('^' || p_organization_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp)$') then
    raise exception 'invalid_branding_logo_path' using errcode = '22023';
  end if;

  insert into public.organization_branding
    (organization_id, logo_storage_path, updated_by_membership_id)
  values (p_organization_id, v_path, v_mid)
  on conflict (organization_id) do update
    set logo_storage_path        = excluded.logo_storage_path,
        updated_by_membership_id = excluded.updated_by_membership_id
  returning organization_branding.updated_at into v_updated;

  perform public.app_write_audit(
    'organization_branding.logo_uploaded', v_actor, p_organization_id,
    'organization_branding', p_organization_id::text, true, null, p_correlation_id,
    jsonb_build_object('changed_field_names', to_jsonb(array['logo_storage_path']),
                       'logo_changed', true));

  updated_at := v_updated; old_logo_path := v_old; return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. ロゴ削除（path を null 化）。旧 path を返す。
-- ---------------------------------------------------------------------------
create function public.app_remove_organization_branding_logo(
  p_organization_id     uuid,
  p_expected_updated_at timestamptz default null,
  p_correlation_id      uuid default null
) returns table (updated_at timestamptz, old_logo_path text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor    uuid := auth.uid();
  v_mid      uuid;
  v_existing public.organization_branding%rowtype;
  v_updated  timestamptz;
begin
  perform pg_advisory_xact_lock(815006, hashtext(p_organization_id::text));
  v_mid := public.app_require_org_admin_membership(p_organization_id);

  select * into v_existing from public.organization_branding
   where organization_id = p_organization_id for update;
  if not found then
    -- 何もない（既にデフォルト）。冪等に扱う。
    updated_at := null; old_logo_path := null; return next; return;
  end if;
  if p_expected_updated_at is not null
     and v_existing.updated_at is distinct from p_expected_updated_at then
    raise exception 'branding_stale_update' using errcode = '40001';
  end if;

  update public.organization_branding
     set logo_storage_path = null, updated_by_membership_id = v_mid
   where organization_id = p_organization_id
  returning organization_branding.updated_at into v_updated;

  perform public.app_write_audit(
    'organization_branding.logo_removed', v_actor, p_organization_id,
    'organization_branding', p_organization_id::text, true, null, p_correlation_id,
    jsonb_build_object('changed_field_names', to_jsonb(array['logo_storage_path']),
                       'logo_changed', true));

  updated_at := v_updated; old_logo_path := v_existing.logo_storage_path; return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. 標準へリセット（override 3 列を null 化）。旧ロゴ path を返す。
-- ---------------------------------------------------------------------------
create function public.app_reset_organization_branding(
  p_organization_id uuid,
  p_correlation_id  uuid default null
) returns table (updated_at timestamptz, old_logo_path text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor    uuid := auth.uid();
  v_mid      uuid;
  v_existing public.organization_branding%rowtype;
  v_updated  timestamptz;
begin
  perform pg_advisory_xact_lock(815006, hashtext(p_organization_id::text));
  v_mid := public.app_require_org_admin_membership(p_organization_id);

  select * into v_existing from public.organization_branding
   where organization_id = p_organization_id for update;
  if not found then
    updated_at := null; old_logo_path := null; return next; return;
  end if;

  update public.organization_branding
     set display_name = null, logo_storage_path = null, primary_color_hex = null,
         updated_by_membership_id = v_mid
   where organization_id = p_organization_id
  returning organization_branding.updated_at into v_updated;

  perform public.app_write_audit(
    'organization_branding.reset', v_actor, p_organization_id,
    'organization_branding', p_organization_id::text, true, null, p_correlation_id,
    jsonb_build_object('changed_field_names',
                       to_jsonb(array['display_name','logo_storage_path','primary_color_hex']),
                       'logo_changed', true));

  updated_at := v_updated; old_logo_path := v_existing.logo_storage_path; return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. 顧客向け case-scoped 公開ブランディング（本人が participant の案件の org のみ）。
--    公開3項目 + logo path（server-side TS が public URL を生成）。内部列は返さない。
-- ---------------------------------------------------------------------------
create function public.app_get_customer_case_public_branding(p_case_id uuid)
returns table (display_name text, logo_storage_path text, primary_color_hex text)
language sql stable security definer set search_path = ''
as $$
  select b.display_name, b.logo_storage_path, b.primary_color_hex
    from public.customer_cases c
    left join public.organization_branding b on b.organization_id = c.organization_id
   where c.id = p_case_id
     and public.app_is_case_participant(p_case_id);
$$;

-- ---------------------------------------------------------------------------
-- 9. Storage: bucket `org-branding`（public read）+ storage.objects 書込ポリシー
--    ・real Supabase / harness shim いずれも storage スキーマ存在前提（run.sh は 00_shim を先に適用）。
--    ・public read のため SELECT ポリシーは置かない（公開 URL 配信）。
--    ・書込(INSERT/UPDATE/DELETE)は active ORG_ADMIN の自 org フォルダのみ。
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-branding', 'org-branding', true, 2097152,
        array['image/png','image/jpeg','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy orgbrand_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'org-branding'
    and public.app_is_org_admin( ((storage.foldername(name))[1])::uuid )
  );

create policy orgbrand_objects_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'org-branding'
    and public.app_is_org_admin( ((storage.foldername(name))[1])::uuid )
  )
  with check (
    bucket_id = 'org-branding'
    and public.app_is_org_admin( ((storage.foldername(name))[1])::uuid )
  );

create policy orgbrand_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'org-branding'
    and public.app_is_org_admin( ((storage.foldername(name))[1])::uuid )
  );

-- ---------------------------------------------------------------------------
-- 10. 関数 EXECUTE 権限
-- ---------------------------------------------------------------------------
revoke execute on function public.app_organization_branding_guard()
  from public, anon, authenticated, service_role;

revoke execute on function public.app_update_organization_branding(uuid, text, text, timestamptz, uuid)
  from public, anon;
revoke execute on function public.app_set_organization_branding_logo(uuid, text, timestamptz, uuid)
  from public, anon;
revoke execute on function public.app_remove_organization_branding_logo(uuid, timestamptz, uuid)
  from public, anon;
revoke execute on function public.app_reset_organization_branding(uuid, uuid)
  from public, anon;
revoke execute on function public.app_get_customer_case_public_branding(uuid)
  from public, anon;

grant execute on function public.app_update_organization_branding(uuid, text, text, timestamptz, uuid) to authenticated;
grant execute on function public.app_set_organization_branding_logo(uuid, text, timestamptz, uuid) to authenticated;
grant execute on function public.app_remove_organization_branding_logo(uuid, timestamptz, uuid) to authenticated;
grant execute on function public.app_reset_organization_branding(uuid, uuid) to authenticated;
grant execute on function public.app_get_customer_case_public_branding(uuid) to authenticated;

commit;
