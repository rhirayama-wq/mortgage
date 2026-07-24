-- ============================================================================
-- seed.sql — ローカル開発 / テスト専用シード
-- FICTIONAL / TEST ONLY / PRODUCTION USE PROHIBITED
-- 実在の顧客・金融機関・個人情報を一切含まない架空データのみ。
-- 本番環境では実行しない。初回 SYSTEM_ADMIN の本番ブートストラップは
-- docs/security.md 記載の運用手順（migration 管理経路で
-- app_bootstrap_first_system_admin を実行）に従う。
-- ============================================================================

-- 架空の初回 SYSTEM_ADMIN ユーザー（ローカル GoTrue では Inbucket で受信する）
insert into auth.users (id, email)
values ('00000000-0000-4000-8000-000000000001', 'sysadmin.fictional@example.test')
on conflict (id) do nothing;

-- auth.users トリガーが user_profiles を作成済み。初回 SYSTEM_ADMIN を昇格。
select public.app_bootstrap_first_system_admin(
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-00000000c0de'
);
