# Phase 1 計画（再構築版 / v6 相当を新規実装）

基準日: 2026-07-24。前チャットのコードは喪失したため、要件定義書を正として Phase 1 を新規実装で再建する。
Phase 1 の目的は **認証・所属・ロール・RLS・監査を安全に完成させること**。案件・検索（Phase 2以降）は本フェーズでは実装しない。

## 1. Phase 1 で今回実装する範囲（IN SCOPE）
### Phase 1A — DB 層（migration v6 相当）
- `user_profiles` / `organizations` / `organization_memberships` / `authoritative_audit_logs`
- 3 enum: `system_role`(SYSTEM_ADMIN), `organization_role`(ORGANIZATION_ADMIN|SALES_USER), `membership_status`(invited|active|suspended|left)
- RLS ポリシー（テナント分離・最小SELECT）、列 GRANT（authenticated は user_profiles.display_name のみ UPDATE 可）
- 監査付き業務関数（SECURITY DEFINER, search_path 固定）:
  - `create_organization` / `rename_organization` / `archive_organization`（SYSTEM_ADMIN専用）
  - `invite_organization_member`（status=invited 固定）
  - `accept_invitation`（本人のみ invited→active）
  - `change_member_status`（許容遷移のみ）/ `change_member_role`（active時のみ）
  - `grant_system_admin` / `revoke_system_admin`
- 並行制御: SYSTEM_ADMIN 集合はグローバル advisory xact lock、法人管理者集合は org 単位 advisory xact lock。
  **複数ロックは必ず「グローバル → 法人」の固定順序**（SEC-81）。SYSTEM_ADMIN も実行し得る
  法人操作（invite / role / status 変更）は両ロックを取得（SEC-76..80）。
  ロック取得後に認可・人数・状態を再確認。SELECT FOR UPDATE・許容遷移・更新1件を検証。
  失敗監査は専用関数で actor 整合検証＋correlation 冪等（SEC-83..87）。
- 最後の管理者(0人化)保護: 業務関数の排他制御＋DBトリガー（二重防御）。
- 監査: 成功は業務変更と同一Tx。失敗は `record_failure_audit`（service-role別Tx）をアプリ層から呼ぶ。
- `seed.sql`: 初回 SYSTEM_ADMIN ブートストラップ手順（架空・test only 明記、本番シークレット不使用）。

### Phase 1B — 認証アプリ（6ブロッカーを最初から修正済みで実装）
- Supabase SSR クライアント: browser / server / middleware
- `access.ts`: 純粋なアクセス判定（membership/role/system_role → 遷移先）。unit test 対象。
- `membership.ts`: auth.getUser で認証検証 → profile/membership 取得。
  **DBエラーを「所属なし」にしない**。DB/RLS/Auth エラーは専用エラー型で /error(500系)へ。取得値は Zod/enum で実行時検証。
- Magic Link 送信: **Server Action / Route Handler へ集約**。Zod 検証・trim・小文字化・`shouldCreateUser:false`・
  登録/未登録を区別しない汎用応答・内部エラー非表示・再送クールダウン。
- `/auth/callback`: 許可 OTP type を実行時検証（通常ログインは email/magiclink のみ。recovery/invite/signup を混在させない）。
  `next` は同一origin安全相対パスのみ（middleware→login→callback で二重検証、open redirect 防止）。
- `middleware.ts`: Supabase SSR でセッション refresh。**redirect 時も refresh 済み Cookie を新 redirect response へコピー**。
- 認可の layout 分離: `(org-app)` layout=active membership 検証 / `(system)` layout=system_role 検証 /
  招待画面=本人の invited membership のみ / no-access=認証済み専用。middleware の認証チェックだけに依存しない。
- signout は **POST のみ**（GET で状態変更しない）。login はフォーム化。
- 画面: `/login` `/auth/callback` `/no-access` `/pending-invitation` `/cases`(仮) `/system-console`(仮) `/error`。UIは日本語（U4暫定）。

### Phase 0 相当（喪失分の再建）
- Next.js 15 App Router / TS strict / Tailwind / shadcn/ui / RHF / Zod / Vitest / Playwright / ESLint / CI / `.env.example`
- bps 変換ユーティリティ＋ unit test。

## 2. 今回実装しない範囲（OUT OF SCOPE — Phase 2 以降）
案件・顧客属性・収入・借入・物件・希望条件の入力／商品マスタ・バージョン・ルールエンジン・検索・比較・保存／
CSV アップロード確定フロー／提案書・資金計画書／確率モデル／本番申込連携。
（feature-map.md の Post-MVP / Final 参照）

## 3. 作成予定ファイル（Appendix B 準拠）
```
CLAUDE.md
docs/{assumptions,data-model,security,test-cases,phase1-plan,phase1-validation,feature-map}.md
app/supabase/migrations/0001_phase1_identity_org_rls.sql
app/supabase/seed.sql
app/src/lib/units/bps.ts                      (+ *.test.ts)
app/src/lib/auth/access.ts                    (+ *.test.ts)
app/src/lib/auth/membership.ts
app/src/lib/auth/errors.ts                    (DB/RLS/Auth 専用エラー型)
app/src/lib/supabase/{browser,server,middleware}.ts
app/src/middleware.ts
app/src/app/login/{page.tsx,actions.ts}       (Server Action で送信)
app/src/app/auth/callback/route.ts
app/src/app/auth/signout/route.ts             (POST)
app/src/app/(org-app)/layout.tsx  + cases/page.tsx
app/src/app/(system)/layout.tsx   + system-console/page.tsx
app/src/app/no-access/page.tsx
app/src/app/pending-invitation/{page.tsx,actions.ts}
app/src/app/error/page.tsx
app/tests/... (AUTH-*, SEC-* unit/integration where feasible)
scripts/pg-harness/... (psql による SQL レベル検証)
```

## 4. テスト計画（定義済み/実行済み/未実行を区別）
- **UNIT**: bps 変換、access.ts 純粋判定（active/invited/none/suspended/left × SYSTEM_ADMIN 有無 → 遷移先）、
  明示的実行時検証（email、OTP type、next 安全性、membership/profile 行）。→ 本環境で実行済み
  （ランナーは U13 確定で Vitest 正式・オフライン時は test:offline シム実行。Zod は U11 により Phase 2 導入）。
- **AUTH-01..20**: 応答差防止・email検証・shouldCreateUser=false・open redirect 防止・安全next復元・OTP type・
  失効リンク・Cookie保存/refresh・DBエラー・route直アクセス・ロール別認可・他法人ID・POST signout・リンク再利用・
  招待メール一致・複数法人。→ ロジック単体は本環境、Cookie/refresh/リンク再利用/メール送信は **SUPABASE_PENDING**。
- **SEC-52..64**: 列GRANT・RLS越境不可・業務関数のみ書込・最後の管理者0人化不可（並行）・成功/失敗監査Tx分離。
  → SQL レベルは PG ハーネスで実行、PostgREST/JWT 経由は **SUPABASE_PENDING**。
- **品質ゲート**: typecheck / lint / Vitest unit / production build を本環境で実行。E2E(Playwright) は実ブラウザ制約下で可能な範囲。

## 5. 実 Supabase 検証計画（Docker 前提）
本サンドボックスは Docker 不可のため **本環境では実行不可**。以下は Docker 可能環境で実施:
`supabase start` / `supabase db reset` → PostgREST 経由の RLS/GRANT/RPC、GoTrue Magic Link、Mailpit 受信、
使用済みリンク再利用不可、invite メール一致、middleware Cookie refresh、失敗監査の別Tx を検証。
候補環境: (a) ユーザーの Mac に Docker Desktop、(b) CI(GitHub Actions 等)。**本番Supabaseには接続しない**。

## 6. 次の停止点（要件定義書 §12）
以下完了で一度停止し報告する: 認証6ブロッカー修正 / Server Action 経由 Magic Link 送信 / callback 安全化 /
middleware Cookie 維持 / route group・layout 認可 / membership 取得エラー処理 / signout POST 化 /
AUTH テスト追加 / typecheck / lint / unit / production build / （Docker 環境が用意でき次第）実Supabase検証。
報告は「実装済み / PGハーネス検証済み / 実Supabaseローカル検証済み / 未検証 / 本番前残リスク」を明確に分ける。

## 追記: Phase 2A-1（顧客案件の DB 土台）実装
Phase 1（認証・法人・RLS・監査）は完了状態を維持する（本追記は Phase 2A-1 の追加）。
migration `0002_phase2a_customer_cases.sql`（append-only・local Supabase のみ）で customer_cases /
case_applicants / case_applicant_profiles(PII 分離) / case_invitations / case_participants と、
RLS・SECURITY DEFINER 業務関数・監査・PG harness テストを追加。UI・メール送信・Magic Link 発行・
入力フォームは 2A-2 で実装する。詳細は data-model.md / security.md §10 / test-cases.md Phase 2A-1。