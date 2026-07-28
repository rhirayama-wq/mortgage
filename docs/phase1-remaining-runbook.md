# Phase 1 検証ランブック（完了済み検証の再実行・回帰調査用 / npm + Docker 利用可能環境で実施）

**状態（2026-07-27）: 本書の A・B は Mac 実機で完了済み。CI 実走行も完了。**
**A 相当（typecheck / lint / unit / build / PostgreSQL harness）は既存 workflow の Run #10 / run ID `30205025559` / head commit `21bf31b`・success（初回確認は Run #4 / commit `2bbae3b`・全ジョブ green）。**
**B 相当（実 Supabase local の verify:supabase / e2e:local）は workflow `Supabase local E2E` の Run #1 / run ID `30205025523`・success。**
**本書は新規の残作業リストではない。** 完了済み検証の再実行手順、および回帰が疑われるときの
調査 runbook として維持する。各項目の現在の状態は test-cases.md §7（B1..B17）と
phase1-validation.md §1.4〜§1.7 を正とし、本書は手順のみを持つ。

完了済み（本書の手順は再実行・回帰調査用として残す）:
- **AUTH-12..16（認証済みロール・状態別 E2E）= SUPABASE_LOCAL_PASS**（B17 / AUTH-E2E-12..25 の 14 件。test-cases.md §5.1）
- **B13-HTTP（Next.js Server Action 経由の実 HTTP 失敗監査経路）= SUPABASE_LOCAL_PASS**
  （AUTH-E2E-26/27 の 2 件。phase1-validation.md §1.6）
- **B10-refresh（middleware token refresh の強制検証）= SUPABASE_LOCAL_PASS**
  （AUTH-E2E-28/29 の 2 件。Mac 2026-07-27。phase1-validation.md §1.7）

既知の主要残課題は次の 2 分類のみで、いずれも Phase 1 完了を妨げない追加検証バックログである
（phase1-validation.md §2）:

1. **AUTH-11 実機**
2. **Magic Link 有効期限の境界検証**

別枠のバックログ: npm audit high severity 12 件 / Phase 2。

**Phase 2 へは進まない。**
**本番 Supabase へは接続しない。ローカルスタックのみ使用する。**

## 0. 前提ツール
- Node.js 22 系以上（CI は Node 22 に固定。engines: `node >=22.9.0`）
- **npm 11 系必須**（package-lock.json は npm **11.12.1** で生成・CI も同版に固定・
  package.json の `packageManager` と一致）。
- 既知の lockfile 不具合（**2026-07-25 修正済み**）: npm 11.12.1 は
  `node_modules/unrs-resolver/node_modules/@unrs/resolver-binding-openharmony-arm64` を
  `version` / `resolved` / `integrity` を欠いた optional スタブとして書き出すことがある。
  この lockfile に対する `npm ci` は **npm のバージョンに関係なく**
  `npm error Invalid Version:` で失敗する（npm が `undefined` を semver として解決しようとし、
  空レンジで `SemVer('')` が throw するため。エラー末尾が空なのがこの経路の指紋）。
  Mac で成功していたのは warm な npm キャッシュが当該解決を回避していたためで、
  クリーン環境（CI・cold cache）でのみ再現する。
  当該エントリを健全な兄弟エントリと同一の形（version / resolved / integrity / cpu / dev /
  license / optional / os）へ補完して解消済み。**lockfile を再生成した場合は同じスタブが
  再発していないか確認すること**（`node -e "const l=require('./package-lock.json');
  console.log(Object.entries(l.packages).filter(([k,v])=>k&&v.link!==true&&typeof v.version!=='string'))"`）。
- Docker Desktop（起動済み）
- Supabase CLI（`brew install supabase/tap/supabase`）

## A. 正式品質ゲート
```bash
cd app
npm ci                       # lockfile 固定インストール（lockfile はコミット済み）
npm run verify               # typecheck + eslint + vitest + production build
```
確認・報告事項:
1. `npm run typecheck`（全体 tsc）エラー0
2. `npm run lint`（eslint-config-next）エラー0
3. `npm run test`（**正式 Vitest**）**55/55 PASS**（Mac 2026-07-26 実測。内訳 access 11 /
   audit 14 / otp 3 / safe-next 9 / validators 11 / bps 7）。
   `npm run test:offline` は **41/41** で、これは矛盾ではない。`test:offline` は
   `bps` / `safe-next` / `otp` / `validators` / `access` の明示列挙であり、`vi.mock` に依存する
   `audit.test.ts`（14 件）を含まないため。差 14 件はこの一点に起因する。
4. `npm run build`（production build）成功
   - build には `.env.local` が必要: `cp .env.example .env.local`（値は B の supabase start 出力で置換）
5. CI（GitHub Actions）で Linux クリーン環境の `npm ci` が成立すること → **Run #10 / run ID `30205025559` / `21bf31b`・success で確認済み**（初回確認は Run #4 / `2bbae3b`）
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
enable_signup = true           # 注意: false は email プロバイダ全体の無効化（GOTRUE_EXTERNAL_EMAIL_ENABLED）で、
                               # 既存ユーザーへの Magic Link 送信も 422 email_provider_disabled になる（2026-07-25 実測）。
                               # 自動サインアップ禁止は [auth] enable_signup=false + shouldCreateUser:false で担保する。
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
| B7 | Mailpit | http://127.0.0.1:54324 で受信。リンクが /auth/callback?token_hash=...&type=email 形式であること |
| B8 | 使用済みリンク再利用拒否 | 同一リンクを2回開く → 2回目は /login?e=link（AUTH-18） |
| B9 | 招待先メール一致 | FUNC-03 相当を実 GoTrue ユーザーで（メール変更→accept 拒否: AUTH-19） |
| B10 | middleware refresh Cookie | セッション維持は AUTH-E2E-06。**refresh の強制は B10-refresh = `npm run e2e:auth` の AUTH-E2E-28/29**: Cookie 内セッションの `expires_at` だけを過去へ書き換え（token 値は無傷）、正規 `getUser()` 経路での refresh（access token 更新・rotation・同一 user・httpOnly 維持・RLS 文脈維持・Server Action 実行可）と、refresh token 無効時の安全な失敗（Server Action POST への /login redirect 応答をサーバー応答で直接検証・保護ルートも /login）を確認する（AUTH-09/10） |
| B11 | redirect 時 Cookie 属性維持 | 未認証で /cases → /login リダイレクトの Set-Cookie に httpOnly/path/sameSite 等が維持されること |
| B12 | signout POST | POST /auth/signout → 303。GET → 405（AUTH-17） |
| B13-DB | 失敗監査の別Tx（DB / PostgREST 単体） | `npm run verify:supabase` の B13a/b/c。service_role で `app_record_membership_accept_failure` を直接呼び、別トランザクションでの記録・correlation 冪等性・SEC-83/86 のガードを確認する（**アプリの HTTP 経路は通らない**） |
| B13-HTTP | 失敗監査の別Tx（実 HTTP 経路） | `npm run e2e:auth` の AUTH-E2E-26/27。**正当な業務失敗**（26）は別 PostgREST リクエスト / 別 Tx で `success=false` 行が **1 件**記録される。**actor と membership 本人が一致しない偽造監査**（27）は SEC-83 が拒否し **監査行 0 件**（`failure-audit refused by actor/membership guard` の warn が出るのが正常であり、`failure-audit write failed` ではない）。監査行の読取は SYSTEM_ADMIN の認証済み session + RLS 経由（service_role にこのテーブルの SELECT 権限は無い） |
| B14 | AUTH 対象テスト | AUTH-01..20 の実 Supabase 必要分（test-cases.md §5）。**AUTH-12..16・AUTH-10 refresh 強制（B10-refresh）は SUPABASE_LOCAL_PASS 済み**。回帰調査時に残る点検対象は AUTH-11 実機のみ |
| B15 | Supabase 対象 SEC | SEC の PostgREST 経由再確認（越境・直接書込・監査保護） |
| B16 | Playwright E2E | `npm run e2e:local`（**26 件** = 既存 E2E 7 + auth setup 1 + 認証済み E2E 18）。認証済み分のみは `npm run e2e:auth`（**19 件** = auth setup 1 + 18） |
| B17 | 認証済みロール・状態別 E2E 基盤 | `auth-setup` project の storageState 再利用 + `e2e/authenticated/authz.spec.ts`（AUTH-E2E-12..25 の 14 件）+ `e2e/authenticated/audit-http.spec.ts`（AUTH-E2E-26/27 の 2 件）+ `e2e/authenticated/session-refresh.spec.ts`（AUTH-E2E-28/29 の 2 件）。**SUPABASE_LOCAL_PASS**（test-cases.md §5.1 / §7 B17） |

### 再実行・回帰調査時の報告に含めるもの
実行コマンドと終了コード / supabase CLI・スタックのバージョン / B1..B17 の PASS・FAIL 一覧 /
失敗があれば内容と原因分類（設計・実装・環境）/ test-cases.md と phase1-validation.md の状態更新 /
Phase 1 受入条件（要件定義書 12.2）との対応表。

直近の実測基準値（Mac 2026-07-27。B10-refresh = AUTH-E2E-28/29 追加後）は次のとおり。
回帰調査ではこの値と突き合わせる。

| ゲート | 基準値 |
|---|---|
| `npm run test`（Vitest） | **55/55 PASS** |
| `npm run verify:supabase` | **28/28 PASS** |
| `npm run e2e:auth` | **19/19 PASS** |
| `npm run e2e:local` | **26/26 PASS** |

（B10-refresh 追加前の 2026-07-26 実測は `e2e:auth` 17/17 / `e2e:local` 24/24 を 2 回連続。）
AUTH-E2E-29 実行時にサーバーログへ出る supabase-js 由来の
`AuthApiError: Refresh token is not valid`（class / status=400 / code=validation_failed のみ・秘密値なし）は正常。

同じ B 相当の検証は CI（GitHub Actions workflow `Supabase local E2E`）でも成立している。
Run #1 / run ID `30205025523`・success、Supabase CLI **2.109.1**、`npm run verify:supabase` **28/28 PASS**、
`npm run e2e:local` **24/24 PASS**（当時の全件。`Running 24 tests using 1 worker` / 実行時間 1.1 分）。
B10-refresh（`app/**` 変更）を含む push 後は同 workflow が新たな run（26 件想定）として起動する予定
（CI 実走行は未実施・結果は PENDING）。
失敗監査ログは `failure-audit refused by actor/membership guard` **2 件** / `failure-audit write failed` **0 件**。
job 4 分 47 秒 / run 全体 5 分 11 秒、artifact **0 件**。
CI では `npm run e2e:auth` を実行しない（`e2e:local` の真部分集合であり二重実行になるため）。Mac 実機では独立ゲートとして継続する。

ログ・報告に token / Cookie / Magic Link URL / anon key / service role key / `.env.local` の値を
出さないこと（出してよいのは correlation ID まで）。
retry 追加 / timeout 延長 / skip 追加 / 期待値の弱体化で PASS にしないこと。

## 実施環境の選択肢
- **推奨**: Claude デスクトップアプリで新しい Cowork タスクを「On your computer」で開始し、
  このリポジトリのフォルダを対象にする（npm・Docker はローカル環境のものを使用）。
- 手動: リポジトリ zip / git bundle を Mac に展開し、上記コマンドを自分で実行して結果を共有する。
- CI: GitHub へ push すれば自動実行される。A 相当は既存 workflow `.github/workflows/ci.yml`、
  B 相当は `.github/workflows/supabase-local-e2e.yml`（workflow 名 `Supabase local E2E`）が担う。
  後者は GitHub-hosted runner に既定で用意されている Docker daemon を直接利用しており、
  Docker-in-Docker 構成ではない。接続先はループバックのみで、Supabase の鍵をリポジトリ Secrets に置かない。
