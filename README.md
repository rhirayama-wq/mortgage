# 住宅ローン検索・提案プラットフォーム (MVP)

不動産会社の営業担当者が、顧客属性・物件条件から住宅ローン商品の適合可能性を
検索・比較・保存できるプラットフォーム。最終ゴールは不動産事業者向け業務支援と
購入者向け診断・比較・申込支援の融合（docs/feature-map.md）。

**開発ルールの最上位は `CLAUDE.md`。作業開始時は必ず CLAUDE.md → README → /docs の順に読むこと。**

## 現在地（2026-07-25）
- **Phase 1 の機能実装・主要実機検証・CI 実走行は完了**（Phase 1 クローズ）。
- Mac 実機: `npm run verify`（typecheck / lint / Vitest 41/41 / production build）PASS、
  `npm run verify:supabase` 28/28 PASS、`npm run e2e:local` 7/7 PASS。
- GitHub Actions（commit `2bbae3b` / Run #4・全ジョブ green）: Node v22.23.1 / npm 11.12.1 で
  `npm ci` PASS、typecheck / lint / unit / build PASS、PostgreSQL harness は
  `FUNCTIONAL TESTS: ALL PASSED` / `SECURITY TESTS: ALL PASSED` / `PG HARNESS: ALL TESTS PASSED`。
- package-lock.json は npm **11.12.1** 固定でコミット済み。Linux クリーン環境での `npm ci` も CI で成立。
- DB 層: migration v6 相当を PGハーネス（PostgreSQL 16.13）で検証済み。
  実 Supabase local（PostgREST / GoTrue / Mailpit）でも検証済み → docs/phase1-validation.md。
- **既知残課題 4 分類（B10-refresh / B13-HTTP / AUTH-11 実機 / AUTH-12..16 の認証済みロール・状態別 E2E）は
  PENDING のまま**、Phase 1 完了を妨げない追加検証バックログとして継続管理 → docs/phase1-validation.md §2。
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
  e2e/               Playwright E2E（auth.spec.ts）
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
npm run e2e:local           # Playwright E2E（Supabase local 前提）
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
既知残課題 4 分類（docs/phase1-validation.md §2）に加え、npm audit の high severity 12 件と
GitHub Actions の `actions/checkout@v4` / `setup-node@v4` の Node 20 deprecation 警告を別枠で管理する。

## 禁止事項（抜粋・詳細は CLAUDE.md §32）
本番 Supabase への接続 / 本番 Magic Link 送信 / 実顧客データ・実在金融機関の
非公開条件の投入 / service role key の NEXT_PUBLIC_ 設定。
テストデータは必ず fictional / test only を明記。
