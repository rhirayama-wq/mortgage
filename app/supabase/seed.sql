-- ============================================================================
-- seed.sql — ローカル開発 / テスト専用シード
-- FICTIONAL / TEST ONLY / PRODUCTION USE PROHIBITED
-- 実在の顧客・金融機関・個人情報を一切含まない架空データのみ。本番では実行しない。
-- 初回 SYSTEM_ADMIN の本番ブートストラップは docs/security.md 記載の運用手順に従う。
--
-- 架空の初回 SYSTEM_ADMIN を「GoTrue が認識できる正規ユーザー」として作成する。
--   背景: 旧 seed は auth.users への (id, email) のみの raw INSERT だったため、
--   aud/role が NULL・email 未確認・auth.identities 0 件の不完全行になり、
--   GoTrue の Admin API から不可視（listUsers / updateUserById 不能）だった。
--   本 seed は Supabase local の一般的な正規構造へ修正する:
--     - auth.users: instance_id / aud='authenticated' / role='authenticated' /
--       email_confirmed_at / raw_app_meta_data(provider=email) / token 列（空文字）
--     - auth.identities: email provider の identity（identity_data に sub/email/email_verified）
--     - password は seed しない（Magic Link 認証。検証スクリプトが実行時に一時値を設定）
--     - UUID 00000000-0000-4000-8000-000000000001 を維持し bootstrap で system_role 付与
--     - 冪等: `supabase db reset` を繰り返しても成功する
-- 注: これは local seed の修正であり、migration / RLS / GRANT は一切変更していない。
-- ============================================================================

-- 1. GoTrue 正規の auth.users 行（既存なら維持）。
--    auth.users への INSERT で migration のトリガーが user_profiles を自動作成する。
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'sysadmin.fictional@example.test',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  '',
  '',
  '',
  ''
)
on conflict (id) do nothing;

-- 2. email provider の identity（sub / email / email_verified=true を含む）。
--    provider_id は GoTrue の email 規約に合わせユーザー UUID（sub）を用いる。
--    冪等: 同一 (provider, provider_id) が無い場合のみ作成する。
insert into auth.identities (
  id,
  user_id,
  provider_id,
  provider,
  identity_data,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'email',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000001',
    'email', 'sysadmin.fictional@example.test',
    'email_verified', true
  ),
  now(),
  now(),
  now()
where not exists (
  select 1
    from auth.identities
   where provider = 'email'
     and provider_id = '00000000-0000-4000-8000-000000000001'
);

-- 3. 初回 SYSTEM_ADMIN bootstrap（冪等: 既に SYSTEM_ADMIN がいれば何もしない）。
--    auth.users トリガーが user_profiles を作成済み → system_role を付与する。
do $$
begin
  if not exists (
    select 1
      from public.user_profiles
     where system_role is not distinct from 'SYSTEM_ADMIN'::public.system_role
  ) then
    perform public.app_bootstrap_first_system_admin(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-00000000c0de'
    );
  end if;
end $$;
