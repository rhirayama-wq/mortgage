# 住宅ローン検索・提案プラットフォーム (MVP)

不動産会社の営業担当者が、顧客属性・物件条件から住宅ローン商品の適合可能性を
検索・比較・保存できるプラットフォーム。最終ゴールは不動産事業者向け業務支援と
購入者向け診断・比較・申込支援の融合（docs/feature-map.md）。

**開発ルールの最上位は `CLAUDE.md`。作業開始時は必ず CLAUDE.md → README → /docs の順に読むこと。**

## 現在地（2026-07-27）
- **Phase 1 の機能実装・主要実機検証・CI 実走行は完了**（Phase 1 クローズ）。
- Mac 実機: `npm run verify`（typecheck / lint / Vitest **55/55** / production build）PASS、
  `npm run verify:supabase` **28/28 PASS**、`npm run e2e:local` **26/26 PASS**、
  `npm run e2e:auth` **19/19 PASS**（2026-07-27。B10-refresh 追加前の 2026-07-26 実測は
  e2e:local 24/24 PASS を 2 回連続 / e2e:auth 17/17 PASS）。
- **認証済み E2E 基盤（AUTH-12..16）は実装・実機検証済み**: Playwright の `auth-setup` project が
  架空 fixture の storageState を生成し、認証済み E2E **18 件（AUTH-E2E-12..29）**が
  実 HTTP・実 Cookie でロール別認可 / invited・suspended・left 拒否 / 他法人 ID 拒否 /
  SYSTEM_ADMIN 境界 / セッション refresh を検証する（`authenticated/authz.spec.ts` 14 件 +
  `authenticated/audit-http.spec.ts` 2 件 + `authenticated/session-refresh.spec.ts` 2 件）。
  **AUTH-12..16 は SUPABASE_LOCAL_PASS** → docs/test-cases.md §5.1。
  storageState と fixture 定義は **Phase 2 の業務 E2E でもそのまま再利用できる**。
- **B13-HTTP（実 HTTP 失敗監査経路）も実機検証済み → SUPABASE_LOCAL_PASS**: AUTH-E2E-26/27 が
  実ブラウザ・実 Cookie・実 Server Action・実 Supabase local を通し、正当な業務失敗が
  **別 PostgREST リクエスト / 別トランザクション**で `success=false` の失敗監査 1 件として記録されること、
  actor と membership が不一致の偽造失敗監査は SEC-83 が拒否し監査行 0 件になることを検証する
  → docs/test-cases.md §5.1 / §7 B13-HTTP。
- **B10-refresh（middleware token refresh の強制検証）も実機検証済み → SUPABASE_LOCAL_PASS**（2026-07-27）:
  AUTH-E2E-28 は Cookie 内セッションの `expires_at` だけを過去へ書き換えて期限切れ相当とし、
  middleware の正規 `getUser()` 経路で refresh が発生すること（access token 更新・refresh token
  rotation・同一 user ID・Cookie httpOnly 維持・RLS / テナント文脈維持・protected Server Action
  実行可・membership 状態不変）を検証。AUTH-E2E-29 は refresh token も無効な場合の安全な失敗を検証:
  Server Action POST は middleware により /login への redirect 応答となる。Next.js クライアントが
  その応答を画面遷移へ変換しない場合があるため、E2E ではサーバー応答を直接検証し、続く保護ルート
  アクセスが /login へ誘導されることを確認した → docs/test-cases.md §7 B10-refresh。
- **CI は 2 本立てで、いずれも実走行済み**。
  - 既存 CI（`.github/workflows/ci.yml`・高速 quality gate: typecheck / lint / unit / build /
    PostgreSQL harness）: **Run #10 / run ID `30205025559` / commit `21bf31b`・success**。
    初回の実走行確認は Run #4 / commit `2bbae3b`（2026-07-25・Node v22.23.1 / npm 11.12.1 で `npm ci` PASS、
    PostgreSQL harness `PG HARNESS: ALL TESTS PASSED`）。
  - **実 Supabase local 検証の CI 化も完了**（`.github/workflows/supabase-local-e2e.yml` /
    workflow 名 `Supabase local E2E` / 追加 commit `21bf31b`）: **Run #1 / run ID `30205025523`・success**。
    Supabase CLI **2.109.1** で `supabase start` → `supabase db reset` → `npm run verify:supabase` **28/28 PASS** →
    `npm run e2e:local` **24/24 PASS**（1 worker・E2E 実行 1.1 分）。job 4 分 47 秒 / run 全体 5 分 11 秒。
    接続先は loopback のみで、Supabase の鍵をリポジトリ Secrets に置かない
    → docs/security.md §7.2 / docs/test-cases.md §7.1。
    **B10-refresh（AUTH-E2E-28/29・`app/**` 変更）を含む push 後は、この workflow が
    新たな run として起動する予定（CI 実走行は未実施・結果は PENDING）。**
- package-lock.json は npm **11.12.1** 固定でコミット済み。Linux クリーン環境での `npm ci` も CI で成立。
- DB 層: migration v6 相当を PGハーネス（PostgreSQL 16.13）で検証済み。
  実 Supabase local（PostgREST / GoTrue / Mailpit）でも検証済み → docs/phase1-validation.md。
- **既知残課題 2 分類（AUTH-11 実機 / Magic Link 有効期限の境界検証）は
  PENDING のまま**、Phase 1 完了を妨げない追加検証バックログとして継続管理 → docs/phase1-validation.md §2。
  （AUTH-12..16・B13-HTTP に続き、B10-refresh も 2026-07-27 に AUTH-E2E-28/29 として PASS へ更新済み。）
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
    authenticated/   authz.spec.ts: ロール・状態別認可（AUTH-E2E-12..25 の 14 件）
                     audit-http.spec.ts: 実 HTTP 失敗監査（AUTH-E2E-26/27 の 2 件・B13-HTTP）
                     session-refresh.spec.ts: セッション refresh（AUTH-E2E-28/29 の 2 件・B10-refresh）
  supabase/          migrations/0001_phase1_identity_org_rls.sql, seed.sql
docs/                設計文書（assumptions が未確定事項の正）
scripts/pg-harness/  PostgreSQL 単体での DB 検証ハーネス
```

## 開発コマンド
```bash
cd app
npm ci                      # lockfile 固定インストール（Node 22 系 / npm 11 系）
npm run verify              # typecheck + lint + Vitest + production build
npm run verify:supabase     # 実 Supabase local 検証（B1..B5 / B9 / B13-DB / B15）。B13-HTTP は e2e 側
npm run e2e:local           # Playwright E2E 全体 26 件（既存 7 + auth setup 1 + 認証済み 18）
npm run e2e:auth            # 認証済み E2E のみ 19 件（auth-setup に依存し自動実行）
```
`npm run verify:supabase` と `npm run e2e:local` の前提:
**Docker Desktop 起動済み / Supabase local 稼働中 / `.env.local` 設定済み /
fixture は `@example.test` の架空データのみ**（実在データ禁止・CLAUDE.md §23）。

この 2 コマンドは **CI（`.github/workflows/supabase-local-e2e.yml`）でも実行される**。
`npm run e2e:auth`（19 件）は `npm run e2e:local`（26 件）の**真部分集合**なので
**CI では重複実行しない**。Mac では従来どおり独立ゲートとして実行できる。

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
同じ検証は CI でも実行される（`Supabase local E2E` workflow）。GitHub-hosted runner の Docker daemon を
直接利用し（Docker-in-Docker 構成ではない）、接続先は loopback のみで、
Supabase の鍵をリポジトリ Secrets に置かない。

## 将来課題（Phase 1 完了を妨げないバックログ）
（**B13-HTTP は 2026-07-26 に AUTH-E2E-26/27 として、B10-refresh は 2026-07-27 に AUTH-E2E-28/29 として
実装・実機検証し SUPABASE_LOCAL_PASS へ更新したため、本リストから外した。**）

- **AUTH-11 実機**: DB/RLS 障害を「所属なし」と区別し `/error` へ振り分ける経路の実機確認。
- **Magic Link 有効期限の境界検証**: 期限切れリンクの時間経過を伴う検証（単回使用・再利用拒否は PASS 済み）。
- **npm audit の high severity 12 件**（上記テスト PENDING とは別枠で管理）。

詳細は docs/phase1-validation.md §2。

## 禁止事項（抜粋・詳細は CLAUDE.md §32）
本番 Supabase への接続 / 本番 Magic Link 送信 / 実顧客データ・実在金融機関の
非公開条件の投入 / service role key の NEXT_PUBLIC_ 設定。
テストデータは必ず fictional / test only を明記。
