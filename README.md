# 住宅ローン検索・提案プラットフォーム (MVP)

不動産会社の営業担当者が、顧客属性・物件条件から住宅ローン商品の適合可能性を
検索・比較・保存できるプラットフォーム。最終ゴールは不動産事業者向け業務支援と
購入者向け診断・比較・申込支援の融合（docs/feature-map.md）。

**開発ルールの最上位は `CLAUDE.md`。作業開始時は必ず CLAUDE.md → README → /docs の順に読むこと。**

## 現在地（2026-07-25）
- **Phase 1 の機能実装・主要実機検証・CI 実走行は完了**（Phase 1 クローズ）。
- Mac 実機: `npm run verify`（typecheck / lint / Vitest 41/41 / production build）PASS、
  `npm run verify:supabase` 28/28 PASS、`npm run e2e:local` **22/22 PASS を 2 回連続**、
  `npm run e2e:auth` **15/15 PASS**。
- **認証済み E2E 基盤（AUTH-12..16）は実装・実機検証済み**: Playwright の `auth-setup` project が
  架空 fixture の storageState を生成し、`e2e/authenticated/authz.spec.ts` の 14 件（AUTH-E2E-12..25）が
  実 HTTP・実 Cookie でロール別認可 / invited・suspended・left 拒否 / 他法人 ID 拒否 /
  SYSTEM_ADMIN 境界を検証する。**AUTH-12..16 は SUPABASE_LOCAL_PASS** → docs/test-cases.md §5.1。
  storageState と fixture 定義は **Phase 2 の業務 E2E でもそのまま再利用できる**。
- GitHub Actions（commit `2bbae3b` / Run #4・全ジョブ green）: Node v22.23.1 / npm 11.12.1 で
  `npm ci` PASS、typecheck / lint / unit / build PASS、PostgreSQL harness は
  `FUNCTIONAL TESTS: ALL PASSED` / `SECURITY TESTS: ALL PASSED` / `PG HARNESS: ALL TESTS PASSED`。
- package-lock.json は npm **11.12.1** 固定でコミット済み。Linux クリーン環境での `npm ci` も CI で成立。
- DB 層: migration v6 相当を PGハーネス（PostgreSQL 16.13）で検証済み。
  実 Supabase local（PostgREST / GoTrue / Mailpit）でも検証済み → docs/phase1-validation.md。
- **既知残課題 4 分類（B10-refresh / B13-HTTP / AUTH-11 実機 / Magic Link 有効期限の境界検証）は
  PENDING のまま**、Phase 1 完了を妨げない追加検証バックログとして継続管理 → docs/phase1-validation.md §2。
  （旧④の AUTH-12..16 は上記のとおり PASS へ更新済み。）
- **Phase 2 は未着手**（着手しない）。

## 構成
```text
app/                 Next.js 15 (App Router, TS strict)
  src/lib/auth/      アクセス判定・検証・safe-next・OTP・監査（純粋ロジック中心）
  src/lib/supabase/  browser / server / middleware / service クライアント
  src/app/           login, auth/callback, auth/signout(POST),
                     (org-app)/cases, (system)/system-console,
                     no-access, pending-invitation, error
  scripts/           verify-supabase.ts（実 Supabase local 検証）
  e2e/               Playwright E2E
    auth.spec.ts     未認証・Magic Link ライフサイクル・signout 契約（既存 7 件）
    setup/           auth-setup project（fixture 用意 + storageState 生成・1 件）
    fixtures/        fixture 定義 / .env.local 読込 / manifest / ロール別 page fixture
    authenticated/   認証済みロール・状態別認可（AUTH-E2E-12..25 の 14 件）
  supabase/          migrations/0001_phase1_identity_org_rls.sql, seed.sql
docs/                設計文書（assumptions が未確定事項の正）
scripts/pg-harness/  PostgreSQL 単体での DB 検証ハーネス
```

## 開発コマンド
```bash
cd app
npm ci                      # lockfile 固定インストール（Node 22 系 / npm 11 系）
npm run verify              # typecheck + lint + Vitest + production build
npm run verify:supabase     # 実 Supabase local 検証（B1..B5 / B9 / B13-DB / B15）
npm run e2e:local           # Playwright E2E 全体 22 件（既存 7 + auth setup 1 + 認証済み 14）
npm run e2e:auth            # 認証済み認可テストのみ 15 件（auth-setup に依存し自動実行）
```
`npm run verify:supabase` と `npm run e2e:local` の前提:
**Docker Desktop 起動済み / Supabase local 稼働中 / `.env.local` 設定済み /
fixture は `@example.test` の架空データのみ**（実在データ禁止・CLAUDE.md §23）。

補助コマンド:
```bash
cp .env.example .env.local  # supabase start の出力値を設定（build にも必要）
npm run test                # unit（正式: Vitest）
npm run test:offline        # npm不通環境用フォールバック（同一テストを node:test で実行）
npm run test:db             # PostgreSQL ハーネス（要ローカルPG）
npm run typecheck:pure      # 純粋モジュールのみの strict typecheck
```

## DB ハーネス（Docker 不要）
```bash
PGHOST=/tmp PGPORT=5433 PGUSER=postgres bash scripts/pg-harness/run.sh
```

## 実 Supabase ローカル検証（Docker 必須）
```bash
supabase start        # 本番プロジェクトには絶対にリンクしない
supabase db reset     # migrations + seed 適用
# Mailpit: http://127.0.0.1:54324 で Magic Link を受信
cd app && npm run verify:supabase && npm run e2e:local
```

## 将来課題（Phase 1 完了を妨げないバックログ）
- **B10-refresh**: middleware token refresh の強制検証（期限切れ／間近トークンの強制手段が未整備）。
- **B13-HTTP**: Next.js Server Action / route handler 経由の実 HTTP 失敗監査 E2E。
- **AUTH-11 実機**: DB/RLS 障害を「所属なし」と区別し `/error` へ振り分ける経路の実機確認。
- **Magic Link 有効期限の境界検証**: 期限切れリンクの時間経過を伴う検証（単回使用・再利用拒否は PASS 済み）。
- **npm audit の high severity 12 件**（上記テスト PENDING とは別枠で管理）。

詳細は docs/phase1-validation.md §2。

## 禁止事項（抜粋・詳細は CLAUDE.md §32）
本番 Supabase への接続 / 本番 Magic Link 送信 / 実顧客データ・実在金融機関の
非公開条件の投入 / service role key の NEXT_PUBLIC_ 設定。
テストデータは必ず fictional / test only を明記。
