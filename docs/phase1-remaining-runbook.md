# Phase 1 残作業ランブック（npm + Docker 利用可能環境で実施）

前提: Phase 1A DB 層はレビュー承認済み（phase1-validation.md 冒頭）。
本書の A・B が完了し結果を提示するまで **Phase 1 完了とは報告しない**。Phase 2 へ進まない。
**本番 Supabase へは接続しない。ローカルスタックのみ使用する。**

## 0. 前提ツール
- Node.js 22 系 / npm
- Docker Desktop（起動済み）
- Supabase CLI（`brew install supabase/tap/supabase`）

## A. 正式品質ゲート
```bash
cd app
npm install                  # package-lock.json が生成される
npm run verify               # typecheck + eslint + vitest + production build
git add package-lock.json
git commit -m "chore: add package-lock.json (first npm install)"
```
確認・報告事項:
1. `npm run typecheck`（全体 tsc）エラー0
2. `npm run lint`（eslint-config-next）エラー0
3. `npm run test`（**正式 Vitest**）41件 PASS（test:offline と同一ファイル・同一アサーション）
4. `npm run build`（production build）成功
   - build には `.env.local` が必要: `cp .env.example .env.local`（値は B の supabase start 出力で置換）
5. lockfile コミット後、CI（GitHub に push した場合）の `npm ci` が成立すること
> 依存解決で型エラー等が出た場合はバージョン調整が必要になり得る（package.json はレジストリ遮断環境で
> 未解決のまま宣言されているため）。修正した場合は変更点を記録すること。

## B. 実 Supabase local 検証
```bash
cd app
supabase init      # config.toml が無い場合のみ（既存 migrations/seed はそのまま認識される）
```
`supabase/config.toml` に以下を設定（init 生成物を編集）:
```toml
[auth]
site_url = "http://localhost:3000"
additional_redirect_urls = ["http://localhost:3000/auth/callback"]

[auth.email]
enable_signup = false          # shouldCreateUser:false と整合（自動サインアップ禁止）
enable_confirmations = false

# SSR token_hash フロー用テンプレート（AUTH-07: callback は token_hash + type のみ受理）
[auth.email.template.magic_link]
subject = "ログイン用リンク"
content_path = "./supabase/templates/magic_link.html"
```
```bash
supabase start
supabase db reset   # migrations + seed.sql 適用（架空データのみ）
cp .env.example .env.local
# supabase start の出力から NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY を設定
npm run dev
```

### 検証チェックリスト（結果を PASS / FAIL / 備考付きで記録）
| # | 確認対象 | 手順の要点 |
|---|---|---|
| B1 | 実 auth.users トリガー | Studio か SQL でユーザー作成 → user_profiles 自動作成・email 小文字ミラー |
| B2 | PostgREST 経由 RLS | anon/authenticated JWT で REST から各テーブル SELECT/INSERT を試行（SEC-01..09 相当） |
| B3 | 列 GRANT | authenticated で display_name 更新可・email/system_role 更新不可（PostgREST 経由） |
| B4 | 各ロール JWT | anon / authenticated / service_role それぞれの鍵で挙動差を確認 |
| B5 | 業務 RPC | rpc/app_invite_organization_member 等を PostgREST 経由で呼び、認可・監査を確認 |
| B6 | Magic Link | /login から送信（shouldCreateUser:false。未登録メールでも同一応答: AUTH-01） |
| B7 | Inbucket | http://127.0.0.1:54324 で受信。リンクが /auth/callback?token_hash=...&type=email 形式であること |
| B8 | 使用済みリンク再利用拒否 | 同一リンクを2回開く → 2回目は /login?e=link（AUTH-18） |
| B9 | 招待先メール一致 | FUNC-03 相当を実 GoTrue ユーザーで（メール変更→accept 拒否: AUTH-19） |
| B10 | middleware refresh Cookie | 期限切れ間際セッションでアクセスし Set-Cookie を確認（AUTH-09/10） |
| B11 | redirect 時 Cookie 属性維持 | 未認証で /cases → /login リダイレクトの Set-Cookie に httpOnly/path/sameSite 等が維持されること |
| B12 | signout POST | POST /auth/signout → 303。GET → 405（AUTH-17） |
| B13 | 失敗監査 別HTTP・別Tx | 他人の招待 accept を改変リクエストで試行 → RPC 失敗後、authoritative_audit_logs に success=false 行（service_role 経由・correlation 付き） |
| B14 | AUTH 対象テスト | AUTH-01..20 のうち SUPABASE_PENDING 項目（test-cases.md §5） |
| B15 | Supabase 対象 SEC | SEC の PostgREST 経由再確認（越境・直接書込・監査保護） |
| B16 | Playwright E2E | `E2E_SUPABASE_LOCAL=1 npm run e2e`（e2e/auth.spec.ts） |

### 完了報告に含めるもの
実行コマンドと終了コード / supabase CLI・スタックのバージョン / B1..B16 の PASS・FAIL 一覧 /
失敗があれば内容と原因分類（設計・実装・環境）/ test-cases.md と phase1-validation.md の状態更新 /
Phase 1 受入条件（要件定義書 12.2）との対応表。

## 実施環境の選択肢
- **推奨**: Claude デスクトップアプリで新しい Cowork タスクを「On your computer」で開始し、
  このリポジトリのフォルダを対象にする（npm・Docker はローカル環境のものを使用）。
- 手動: リポジトリ zip / git bundle を Mac に展開し、上記コマンドを自分で実行して結果を共有する。
- CI: GitHub へ push し、A は既存 workflow、B は DinD workflow を追加して実行する。
