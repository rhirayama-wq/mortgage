-- ============================================================================
-- 0003_phase2a2_applicant_profile.sql
-- Phase 2A-2a: 顧客本人による基本情報(PII)の途中保存 + 被招待者による自招待の可視化
--   ・既存 0001 / 0002 を土台にする（本ファイルは追記のみ。0001/0002 は書き換えない）。
--   ・直接テーブル書込は禁止し、監査付き SECURITY DEFINER 業務関数のみで PII を更新する。
--   ・SECURITY DEFINER は search_path を固定し、EXECUTE を明示管理する（0001/0002 と同一規約）。
--   ・診断値（融資承認確率・借入可能額）はモゲチェック側 API が算出する。本フェーズは扱わない。
--   ・提携ローン（organization 提携ローン）は本フェーズでは扱わない（Phase 2A-2b）。
--   ・PII（氏名・生年月日・連絡先・住所）は監査 metadata / URL / ログへ出さない。
-- FICTIONAL / LOCAL ONLY / PRODUCTION USE PROHIBITED。
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. 現在の認証ユーザーの正規化メール（RLS ポリシー用の内部ヘルパー）
--    NULL 三値論理に注意（プロフィール欠落時は NULL を返し、比較は fail closed）。
-- ---------------------------------------------------------------------------
create function public.app_current_user_email()
returns text language sql stable security definer set search_path = ''
as $$
  select lower(btrim(email)) from public.user_profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- 2. case_invitations: 被招待者本人（invited かつ email 一致）の SELECT を許可
--    ・スタッフ用ポリシーは 0002 で既存（case_invitations_select_staff）。
--    ・顧客は「自分宛の invited 招待」のみ可視。他案件・他人宛は不可視のまま。
--    ・案件本文(customer_cases)は participant になるまで不可視のため、招待行の可視化だけでは
--      案件内容は漏れない（受諾後に participant となり案件が見える）。
-- ---------------------------------------------------------------------------
create policy case_invitations_select_invitee on public.case_invitations
  for select to authenticated
  using (
    status = 'invited'
    and invited_email is not distinct from public.app_current_user_email()
  );

-- ---------------------------------------------------------------------------
-- 3. 顧客本人による基本情報(PII)保存（オートセーブ）
--    順序: 申込者/案件解決 -> case 単位 advisory lock -> 認可再確認 -> 状態検証
--          -> 値検証/正規化 -> UPDATE(行数確認) -> opened->inputting 遷移 -> 監査
--    ・書込はこの業務関数のみ（case_applicant_profiles への直接 UPDATE 権限は付与しない）。
--    ・プロフィール行は招待時(app_invite_case_applicant)に空で作成済みのため UPDATE。
--    ・監査 metadata には「変更されたフィールド名」のみ（PII 値は入れない）。
-- ---------------------------------------------------------------------------
create function public.app_update_own_applicant_profile(
  p_applicant_id   uuid,
  p_full_name      text,
  p_full_name_kana text,
  p_birth_date     date,
  p_email          text,
  p_phone          text,
  p_postal_code    text,
  p_address        text,
  p_correlation_id uuid default null
) returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor          uuid := auth.uid();
  v_applicant      public.case_applicants%rowtype;
  v_case           public.customer_cases%rowtype;
  v_full_name      text;
  v_full_name_kana text;
  v_email          text;
  v_phone          text;
  v_postal         text;
  v_address        text;
  v_updated        timestamptz;
  v_count          int;
  v_fields         text[] := array[]::text[];
begin
  select * into v_applicant from public.case_applicants where id = p_applicant_id;
  if not found then
    raise exception 'case_applicant_not_found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(815003, hashtext(v_applicant.case_id::text));

  -- 認可: 当該申込者に紐づく participant 本人のみ（スタッフはこの関数を使わない）。
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

  -- 検証・正規化（提供された値のみ。空文字は NULL 扱い＝クリア）。
  v_full_name      := nullif(btrim(coalesce(p_full_name, '')), '');
  v_full_name_kana := nullif(btrim(coalesce(p_full_name_kana, '')), '');
  v_phone          := nullif(btrim(coalesce(p_phone, '')), '');
  v_postal         := nullif(btrim(coalesce(p_postal_code, '')), '');
  v_address        := nullif(btrim(coalesce(p_address, '')), '');
  v_email          := nullif(lower(btrim(coalesce(p_email, ''))), '');

  if v_email is not null
     and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid_profile_email' using errcode = '22023';
  end if;
  if p_birth_date is not null
     and (p_birth_date > current_date or p_birth_date < date '1900-01-01') then
    raise exception 'invalid_profile_birth_date' using errcode = '22023';
  end if;
  if v_full_name is not null and length(v_full_name) > 200 then
    raise exception 'invalid_profile_field' using errcode = '22023';
  end if;
  if v_full_name_kana is not null and length(v_full_name_kana) > 200 then
    raise exception 'invalid_profile_field' using errcode = '22023';
  end if;
  if v_phone is not null and length(v_phone) > 50 then
    raise exception 'invalid_profile_field' using errcode = '22023';
  end if;
  if v_postal is not null and length(v_postal) > 20 then
    raise exception 'invalid_profile_field' using errcode = '22023';
  end if;
  if v_address is not null and length(v_address) > 500 then
    raise exception 'invalid_profile_field' using errcode = '22023';
  end if;

  update public.case_applicant_profiles
     set full_name      = v_full_name,
         full_name_kana = v_full_name_kana,
         birth_date     = p_birth_date,
         email          = v_email,
         phone          = v_phone,
         postal_code    = v_postal,
         address        = v_address
   where applicant_id = p_applicant_id
  returning updated_at into v_updated;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'unexpected_row_count' using errcode = 'P0001';
  end if;

  -- 初回入力で opened -> inputting（許容遷移は 0002 の transition 表に一致）。
  if v_case.status = 'opened' then
    update public.customer_cases set status = 'inputting' where id = v_case.id;
    perform public.app_write_audit(
      'customer_case.status_changed', v_actor, v_case.organization_id, 'customer_case',
      v_case.id::text, true, null, null,
      jsonb_build_object('old_status', 'opened', 'new_status', 'inputting'));
  end if;

  -- 監査: 変更フィールド名のみ（PII 値は入れない）。
  if v_full_name      is not null then v_fields := array_append(v_fields, 'full_name'); end if;
  if v_full_name_kana is not null then v_fields := array_append(v_fields, 'full_name_kana'); end if;
  if p_birth_date     is not null then v_fields := array_append(v_fields, 'birth_date'); end if;
  if v_email          is not null then v_fields := array_append(v_fields, 'email'); end if;
  if v_phone          is not null then v_fields := array_append(v_fields, 'phone'); end if;
  if v_postal         is not null then v_fields := array_append(v_fields, 'postal_code'); end if;
  if v_address        is not null then v_fields := array_append(v_fields, 'address'); end if;

  perform public.app_write_audit(
    'case_applicant_profile.updated', v_actor, v_case.organization_id,
    'case_applicant_profile', p_applicant_id::text, true, null, p_correlation_id,
    jsonb_build_object('fields', to_jsonb(v_fields)));

  return v_updated;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3b. 顧客ポータル用の読み取り関数（顧客は organizations / memberships を RLS で読めないため、
--     自分が participant の案件に限り、法人名・担当営業名を安全に返す）。
--     ・返すのは案件レベル情報 + 法人名 + 担当営業表示名のみ（他申込者の PII は返さない）。
--     ・担当営業のメールは返さない（display_name 欠落時は汎用ラベル）。
-- ---------------------------------------------------------------------------
create function public.app_customer_portal_cases()
returns table (
  case_id             uuid,
  case_name           text,
  status              public.customer_case_status,
  organization_name   text,
  assigned_sales_name text,
  updated_at          timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.case_name, c.status, o.name,
         coalesce(up.display_name, '担当者'),
         c.updated_at
    from public.customer_cases c
    join public.case_participants cp
      on cp.case_id = c.id and cp.user_id = auth.uid()
    join public.organizations o on o.id = c.organization_id
    join public.organization_memberships m on m.id = c.assigned_membership_id
    join public.user_profiles up on up.id = m.user_id
   order by c.updated_at desc;
$$;

-- ---------------------------------------------------------------------------
-- 4. 関数 EXECUTE 権限（public から revoke し、必要最小限のみ grant）
-- ---------------------------------------------------------------------------
revoke execute on function public.app_current_user_email() from public, anon;
grant  execute on function public.app_current_user_email() to authenticated;

revoke execute on function public.app_customer_portal_cases() from public, anon;
grant  execute on function public.app_customer_portal_cases() to authenticated;

revoke execute on function public.app_update_own_applicant_profile(uuid, text, text, date, text, text, text, text, uuid)
  from public, anon;
grant  execute on function public.app_update_own_applicant_profile(uuid, text, text, date, text, text, text, text, uuid)
  to authenticated;

commit;
