-- ============================================================================
-- 00_shim_supabase.sql — PGハーネス用 擬似Supabase環境
-- FICTIONAL / TEST ONLY / PRODUCTION USE PROHIBITED
-- 実Supabase (PostgREST/GoTrue/Mailpit) の挙動は保証しない。
--
-- auth スキーマは GoTrue の「本ハーネスが必要とする列だけ」の部分再現である。
-- app/supabase/seed.sql は GoTrue が認識できる正規ユーザー
-- （instance_id / aud / role / email_confirmed_at / raw_*_meta_data / token 列 +
-- auth.identities 行）を作成するため、シム側も同じ列集合を持つ必要がある。
-- 不足すると harness は seed 適用時に
-- `column "..." of relation "users" does not exist` で失敗する。
-- **seed.sql が auth.users / auth.identities の列を増やしたら本ファイルも更新すること。**
-- ============================================================================

-- Supabase 相当ロール
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;

-- auth schema 擬似実装
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

-- auth.users: GoTrue の部分再現。
-- id / email 以外はすべて NULL 許容またはデフォルト付きのため、既存 fixture の
-- `insert into auth.users (id, email)` はそのまま動作する。
create table if not exists auth.users (
  id                     uuid primary key,
  email                  text unique,
  created_at             timestamptz not null default now(),
  -- 以下は seed.sql が使用する GoTrue 正規ユーザー用の列
  instance_id            uuid,
  aud                    text,
  role                   text,
  email_confirmed_at     timestamptz,
  raw_app_meta_data      jsonb not null default '{}'::jsonb,
  raw_user_meta_data     jsonb not null default '{}'::jsonb,
  updated_at             timestamptz not null default now(),
  confirmation_token     text not null default '',
  recovery_token         text not null default '',
  email_change_token_new text not null default '',
  email_change           text not null default ''
);

-- auth.identities: GoTrue の部分再現。実 GoTrue と同様に (provider, provider_id) を一意とする。
create table if not exists auth.identities (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  provider_id     text not null,
  provider        text not null,
  identity_data   jsonb not null default '{}'::jsonb,
  last_sign_in_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (provider, provider_id)
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'sub',
    '')::uuid
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.jwt() to anon, authenticated, service_role;

-- ============================================================================
-- Storage 擬似スキーマ（Phase 2A-W1 harness 用）。実 Supabase Storage の挙動は保証しない。
-- migration 0006 が storage.buckets への insert と storage.objects への RLS policy を作成するため、
-- ハーネスでも最小の storage スキーマを用意する。foldername(name) は末尾(ファイル名)を除く配列。
-- ============================================================================
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text,
  owner      uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata   jsonb
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text)
returns text[] language sql immutable
as $$
  select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1];
$$;

grant execute on function storage.foldername(text) to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
grant select, insert, update, delete on storage.buckets to service_role;
grant select on storage.buckets to authenticated, anon;
grant select on storage.objects to anon;
