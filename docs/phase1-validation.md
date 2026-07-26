# phase1-validation.md — Phase 1 検証実績（再構築版）

実施日: 2026-07-24〜25 / 環境: クラウドサンドボックス（静的検証）＋ **Mac 実機（正式 verify・実 Supabase・E2E）**

> **レビュー承認（2026-07-24）**: Phase 1A DB 層は
> 「PostgreSQL ハーネス上の静的・RLS・GRANT・状態遷移・監査・並行実行レビュー完了」として承認済み
> （migration の SHA-256 一致・終了コード0・SEC-62..87 を含む全テスト PASS をレビュアーが実ファイルで確認）。
> **これは Phase 1 全体の完了ではない。** 現時点の実績:
> **正式 `npm run verify`（typecheck/lint/Vitest 41/41/build 全10ルート）は、本セッション追加ファイル
> （scripts/verify-supabase.ts・e2e 拡張・signout middleware 修正）を含む最新コードで Mac PASS（2026-07-25）。**
> package-lock.json は 8add410 で完了。`next-env.d.ts`（自動生成）の triple-slash-reference lint は**内容変更せず**
> eslint.config.mjs の global ignore で対応。Supabase local `start` / migration 適用 / seed 適用 / `db reset` /
> Next.js `/login` 200 / Studio 307 / Mailpit 200 の **スモークは Mac で PASS**（§1.3）。
> **実 Supabase 検証・完了（2026-07-25, Mac）**:
> **`npm run verify:supabase` 28/28 全 PASS**（B1..B5 / B9 / B13-DB / B15: 実 PostgREST 経由の RLS・列 GRANT・
> 実 JWT 3 ロール・業務 RPC 認可/監査・招待メール一致・失敗監査別 Tx・直接書込拒否）。
> **`npm run e2e:local` 22/22 全 PASS を 2 回連続**（B6..B8 / B10(session) / B11(部分検証) / B12 / B14 / B16 / B17:
> Magic Link 送信→Mailpit 受信→単回使用→再利用拒否→Cookie 属性（httpOnly=true 強制, U22）→
> セッション維持→認証済み signout の全ライフサイクル ＋ 認証済みロール・状態別認可 14 件）。
> **22 件の内訳は 既存 E2E 7 件 + auth setup 1 件 + 認証済み E2E 14 件**。
> **`npm run e2e:auth` 15/15 全 PASS**（auth setup 1 + 認証済み 14）。
> **`npm run verify`（typecheck/lint/Vitest 41/41/build）最新コードで PASS**。
> **結論: Phase 1 の機能実装と主要実機検証は完了。** 既知の残課題（テスト PENDING）は次の 4 分類:
> ① **B10-refresh**（middleware token refresh の強制検証・未実装）
> ② **B13-HTTP**（Next.js 実 HTTP 失敗監査 E2E・未実装）
> ③ **AUTH-11 実機**（/error 振り分けの実機確認）
> ④ **Magic Link 有効期限の境界検証**（期限切れリンクの時間経過を伴う検証・未実施）。いずれも PASS 扱いにしない。
> **旧④の AUTH-12..16（認証済みロール・状態別 E2E）は、実 Supabase local / 実 HTTP / 実 Cookie で
> AUTH-E2E-12..25 の 14 件が PASS したため SUPABASE_LOCAL_PASS へ更新した**（§1.5 / test-cases.md §5.1・B17）。
> **CI リモート実走行も完了（2026-07-25）**: GitHub Actions Run #4 / commit `2bbae3b` で全ジョブ green
> （Linux クリーン環境 Node v22.23.1 / npm 11.12.1 で `npm ci` PASS、typecheck / lint / unit / build PASS、
> PostgreSQL harness `PG HARNESS: ALL TESTS PASSED`）。
> **結論: Phase 1 の機能実装・主要実機検証・CI 実走行は完了。上記 4 分類は Phase 1 完了を妨げない
> 追加検証バックログとして継続管理する（PASS 扱いにしない）。Phase 2 は未着手。**
> 非ブロッキングの将来課題は assumptions.md U18..U22 に記録。

## 1. 実行済み検証

### 1.1 PGハーネス（PostgreSQL 16.13 + 擬似 Supabase ロール/auth スキーマ）
- `scripts/pg-harness/run.sh` により migration `0001_phase1_identity_org_rls.sql` を
  `ON_ERROR_STOP` で適用 → 成功。
- seed.sql（架空ブートストラップ）適用 → 成功。
- **FUNC-01..16 / SEC-01..09,11..16 / SEC-62..87 / CONC-01..04: 全て PASS**（test-cases.md 参照）。
  - 2026-07-24 レビュー対応 r3 で追加: SEC-76..80（SYSTEM_ADMIN による法人操作と revoke の並行直列化。
    invite/role/status 変更はグローバル→法人の両ロック取得へ変更）、SEC-81（ロック取得順の静的検証）、
    SEC-82（timeout/lock_timeout によりデッドロック・無期限待機を PASS 扱いにしない）、
    SEC-83..85（失敗監査 actor の DB 側整合検証）、SEC-86..87（correlation ID 冪等 unique index）。
  - 2026-07-24 レビュー対応で追加: SEC-62..65（法人管理関数の SYSTEM_ADMIN 集合ロック＋ロック後再認可の並行検証）、
    SEC-66..70（user_profiles の SALES_USER 越権遮断）、SEC-71..75（専用失敗監査関数の DB 側制約）。
  - SEC-10（旧: 同一法人メンバー相互のプロフィール可視）は SALES_USER への email 露出のため**仕様ごと撤回**し、
    SEC-66..70 に置換。
- 実行コマンド: `PGHOST=/tmp PGPORT=5433 PGUSER=postgres bash scripts/pg-harness/run.sh`

### 1.2 アプリ純粋ロジック
- unit test 41/41 PASS（`npm run test:offline`。**正式ランナー Vitest でも Mac で 41/41 PASS 済み**）。
- 純粋モジュールの strict typecheck PASS（tsc, `tsconfig.pure.json`）。

### 1.3 Mac ローカルで確認済みの前提（スモーク・PASS）
2026-07-24 に Mac (~/mortgage, HEAD 70d605b) で確認済み（本セッションの新規テストとは別）:
Supabase local `supabase start` PASS / migration 適用 PASS / seed 適用 PASS / `supabase db reset` PASS /
Next.js `/login` 200 / Supabase Studio 307（`/project/default` へ）/ Mailpit (`127.0.0.1:54324`) 200。
`.env.local` に必要 4 変数設定済み（gitignore 対象）。**これは前提スタックの起動確認であり、下記 B テストの実行結果ではない。**

### 1.4 B1..B16 検証の自動化（実装済み・Mac 実機で PASS。経緯は §内の実行履歴参照）
2026-07-24 追加・レビュー反映。runbook §B の B1..B16 を自動・半自動化した（新機能追加なし・migration/RLS/GRANT 不変）。
- `app/scripts/verify-supabase.ts`（`npm run verify:supabase`）: **B1..B5 / B9 / B13(DB) / B15** を
  PostgREST + GoTrue admin API + service_role 経由で検証。ループバック URL 限定（本番接続拒否）、
  JWT/キー/token_hash/Cookie/DB URL を出力しない、fixture は `@example.test` の架空データのみ。
  - **B9（新規・実 Supabase 統合）**: 招待先ユーザー A・別メールユーザー B・A 向け membership・B の
    authenticated session を作り、B が A の membership を accept しようとして拒否され、membership 状態が
    `invited` のまま・不正な成功監査が残らないことを確認（`test.skip` に依存しない）。
  - **SYSTEM_ADMIN セッション失敗の根本原因（Mac の DB 確認で確定）**: 旧 `seed.sql` は
    `auth.users` への `(id, email)` のみの **raw INSERT** で、`aud=NULL / role=NULL / email 未確認 /
    auth.identities 0 件** の不完全行になっていた。この行は GoTrue の Admin API から**不可視**
    （`listUsers()` に出ず `updateUserById()` も開始不能）で、Magic Link / password いずれのセッションも発行できない。
  - **修正（migration ではなく local seed の修正）**: `app/supabase/seed.sql` を GoTrue 正規 fixture へ変更。
    UUID を維持し、`instance_id`（既定）/ `aud='authenticated'` / `role='authenticated'` / `email_confirmed_at` /
    `raw_app_meta_data(provider=email)` / token 列（空文字）を設定し、`auth.identities` に email provider の
    identity（`sub` / `email` / `email_verified=true`）を作成。**password は seed しない**（Magic Link 認証）。
    冪等（`supabase db reset` の反復で成功）で、`system_role` の bootstrap は維持。migration/RLS/GRANT は不変。
  - **実行履歴（Mac 2026-07-25）**:
    1. seed 修正後、seeded user は Admin API から可視化（`listUsers()` に出る）。
    2. `updateUserById(seeded, {password})` は **400 `validation_failed`**（`name=AuthApiError status=400 code=validation_failed`）。
       GoTrue health 200・接続は正常。→ seeded は password をやめ Magic Link へ（下記）。この修正で seeded セッションは
       成立し、検証は `[B1]` まで到達。
    3. 続いて fixture ユーザー作成（`createUser({password})`）が失敗し `test-setup` で停止（当初は `name=Error` のみ表示）。
       **根本原因: 一時 password が 78 文字で bcrypt の 72 バイト上限超過 → GoTrue が 400 `validation_failed`**。
       → 一時 password を 41 文字（UUID1個 + 文字種）に短縮し 72 以下へ。あわせて fixture/セッション失敗時に安全な
       cause を運ぶ `SafeError` を導入（message/token/password は非出力のまま、どの API がどの code で失敗したか判別可能に）。
    4. **再実行で `npm run verify:supabase` が 28/28 全 PASS**（run=mrzjqtj7、FAIL=0 SKIP=0）。
       B1..B5 / B9 / B13-DB / B15 を **SUPABASE_LOCAL_PASS** として記録（test-cases.md §7）。
    5. `e2e:local` 初回試行: `npx playwright install chromium` が行末コメントを引数と誤解釈して失敗し
       Chromium 未導入 → ブラウザ系（E2E-01/02/06）は browserType.launch エラーで未実行。
       request 系は **E2E-03（GET /auth/signout=405）PASS・E2E-07（未認証 POST=303→/login）PASS**
       — **middleware の signout 通過修正を実機確認**。E2E-04 は「status≥300 だが location 無し」で FAIL →
       アサーションを 3xx 範囲要求＋実 status 表示へ**厳格化**。
    6. Chromium 導入後の `e2e:local` 再実行（2026-07-25 08:06）: **5/7 PASS**（E2E-01 ログイン画面描画 /
       E2E-02 未認証 /cases→/login / E2E-03 GET=405 / E2E-05(旧基準) / E2E-07 未認証 POST=303）。
       **FAIL 2 件（未解決・調査中）**:
       - **E2E-04: `/auth/callback?type=recovery` が 500** — 「失敗は常に 3xx で /login?e=link」の契約違反。
         `npm run build` は成功しており dev サーバ固有の可能性（長時間稼働の stale 状態を含む）。
         dev サーバ再起動後の再現有無とサーバ側スタックトレースで切り分ける。E2E-05 も同一経路のため
         3xx 要求へ厳格化（旧基準では 500 でも見かけ PASS になり得た）。
       - **E2E-06: Magic Link メールが Mailpit に 15 秒以内に未着** — 送信失敗（dev サーバに
         `[login] magic link send failed` が出るはず）か件名不一致かをタイムアウトから判別できなかったため、
         メール検索を宛先のみに変更し件名は B7 の assert で検証（不一致なら期待/実際の件名が明示される）。
         タイムアウト時は宛先一致メール件数のみ表示（本文・token 非出力）。
       （当時この時点では E2E は未解決 — 最終結果は履歴 10 参照）
    7. stale dev サーバ（7/24 起動の PID が :3000 を占有）を kill し、Playwright 管理のクリーンな dev サーバで
       再実行（2026-07-25 08:2x）: **6/7 PASS**。**E2E-04 は 80ms で 3xx PASS — 前項の 500 は stale dev サーバ起因と
       確定（アプリのバグではない）**。E2E-05 も厳格化基準（3xx + /login fallback）で PASS。
       残る FAIL は **E2E-06 のみ**: `messages for recipient: 0` ＋ `[WebServer] [login] magic link send failed`
       → **GoTrue `/otp`（signInWithOtp）の送信自体が失敗**（Mailpit 未着はその結果）。admin `generateLink` は
       成功するため、差分の「メール送信」step が失敗している。有力候補: メールレート制限
       （config.toml `email_sent = 2`/時）または GoTrue→Mailpit SMTP 送信エラー。切り分けのため
       login Server Action の失敗ログへ安全な識別子（HTTP status / エラー code のみ・PII なし）を追加。
    8. スタック再起動後の再実行（08:3x）: 追加ログにより **`status=422 code=email_provider_disabled` と確定**。
       **根本原因: config.toml の `[auth.email] enable_signup = false`**。このキーは
       `GOTRUE_EXTERNAL_EMAIL_ENABLED` に対応し、false は「メール経由サインアップ禁止」ではなく
       **email プロバイダ全体の無効化**＝既存ユーザーへの Magic Link 送信（/otp）も 422 で拒否される
       （admin generateLink はプロバイダ判定を通らないため成功していた）。当初 runbook のサンプル設定に
       由来する設定ミス。**修正: `[auth.email] enable_signup = true`**（local 設定の修正。migration/RLS/GRANT/seed
       不変）。自動サインアップ禁止は `[auth] enable_signup = false`（グローバル）＋ アプリの
       `shouldCreateUser:false` ＋ 招待制 membership で引き続き三重に担保。runbook のサンプルも同時修正。
       反映には `supabase stop && supabase start` が必要（当時この時点では E2E-06 未解決 — 最終結果は履歴 10 参照）。
    9. config 修正後の再実行（08:4x）: **メール経路が開通** — B6（送信→初回ログイン成立）と B7（件名・
       テンプレ固定文言・token_hash&type=email 形状）の各アサーションを通過し、**B11 の Cookie 属性で停止**:
       `sb-*-auth-token` が **httpOnly=false**。これは @supabase/ssr の設計仕様（ブラウザ側クライアントが
       セッションを読む前提）でありバグではない。本アプリはクライアント側 Supabase 未使用のため、
       **ユーザー承認のうえ httpOnly=true を強制**（server.ts / middleware.ts の setAll で
       `{ ...options, httpOnly: true }`。assumptions.md U22 に記録。テスト側の期待は変更しない）。
       （当時この時点では E2E-06 は再実行待ち・B8 / B10(session) / B12 認証済み経路は未到達 — 最終結果は履歴 10 参照）
    10. httpOnly 強制後のラン（08:4x・当時の全件）: **`npm run verify` 全 PASS** ＋ **`npm run e2e:local` 7/7 全 PASS**
        （当時は認証済み E2E 未実装。最終結果は §1.5 の 22/22 を 2 回連続）。
        E2E-06 が B6→B7→ログイン成立→B11（httpOnly=true / path=/ / sameSite=Lax / redirect 後存在）→
        B10 セッション維持→B8 再利用拒否→B12 認証済み signout（303・Cookie 消滅・/cases→/login）まで完走。
        **B6..B8 / B10(session) / B11(部分) / B12 / B14 / B16 = SUPABASE_LOCAL_PASS 確定。**
  - **セッション取得方式（本セッションの修正）**:
    - **seeded SYSTEM_ADMIN は password を設定しない**。`generateLink({type:"magiclink"})` → `verifyOtp({type:"email"})`
      （必要なら `type:"magiclink"` フォールバック）で**実 JWT セッション**を取得する。`updateUserById`/password 更新は使わない。
      失敗時は安全な識別子のみ表示（generateLink / verifyOtp の name/status/code。message/token/password/URL/key は非出力）。
    - **新規 fixture ユーザー（B1/B2/B4/B5/B9 用）** は `admin.createUser` で正規作成し、実行ごとの一時 password で
      password sign-in。createUser 失敗かつ既存が見つかった場合のみ**同一 run の fixture に限定して**`updateUserById`。
      seeded にはこの repair/update 経路を使わない。password は seed/repo/docs/env に保存せずログにも出さない・loopback 限定。
  - **診断の改善**: 初期化を段階化（env-load / client-create / admin-list-users / seeded-magiclink / seeded-verify-otp /
    test-setup）し、失敗時に stage と安全な cause（name/status/code/cause.name/cause.code）のみ表示。初回 Admin API
    アクセスは起動待ちの短いリトライ付き（最大 10 回・~600ms・無限禁止）。
  - 400 validation_failed 等の失敗は原因分析として上記実行履歴に記録（**最終的に修正を経て 28/28 PASS — 履歴 4 参照**）。
- `app/e2e/auth.spec.ts` 拡張（`npm run e2e:local`）: **B6..B8 / B10(session) / B11 / B12 / B14 / B16**。
  初回のみ `npx playwright install chromium`（現行 config は Chromium のみ）。
  Magic Link 送信は suite 内 1 通のみ（rate limit 対策）。B7 は件名=`ログイン用リンク`・テンプレ固定文言・
  callback 形状を検証。B11 は Cookie 属性の**部分検証**（httpOnly / path=`/` / sameSite=Lax / redirect 後の存在。
  secure はローカル HTTP で false のため固定 assert しない）。
  - **signout 307 の修正（本セッション）**: 未認証の GET/POST `/auth/signout` が middleware に捕捉され
    307 で /login へ横取りされていた。`src/middleware.ts` の未認証 redirect 除外パスに `/auth/signout` を追加し
    route handler へ到達させ、**認証状態に依らず GET=405 / POST=303→/login** を成立させる（Cookie refresh・
    他の保護ルート判定は不変）。E2E で 未認証GET=405 / 未認証POST=303 / 認証済みPOST=303・auth-token Cookie 消滅・
    以後 /cases→/login を確認。
- **未検証を PASS 扱いしない**:
  - **B10-refresh（middleware token refresh の強制）**: 期限切れ/間近トークンを強制する確実な手段が無いため
    **PENDING**。E2E は「セッション維持のみ」に格下げ済み。
  - **B13-HTTP（Next.js 実 HTTP 失敗監査経路）**: **PENDING**。verify-supabase が確認するのは DB/PostgREST の
    別 Tx 経路（B13-DB）まで。Server Action / route handler を通す E2E は未実装。
  - B11 は部分検証（secure と真の refresh は未）。
- 本サンドボックスでの静的検証（本セッション実行済み）: `npm run typecheck:pure` PASS /
  `npm run test:offline` 41/41 PASS / 新規・変更 TS の隔離 tsc（ambient stub, strict）PASS / prettier 整形済み。
  さらに **Mac で正式 `npm run verify` が最新コードで PASS（§6）**。
- **最終実行結果（Mac 2026-07-25）**: `npm run verify:supabase` **28/28 全 PASS**（B1..B5 / B9 / B13-DB / B15 =
  SUPABASE_LOCAL_PASS）＋ `npm run e2e:local` **22/22 全 PASS を 2 回連続**（B6..B8 / B10(session) / B11(部分) /
  B12 / B14 / B16 / B17 = SUPABASE_LOCAL_PASS）。対応表は test-cases.md §7（B1..B17）。

### 1.5 認証済み E2E 基盤（AUTH-12..16 / B17）— 実装と実機検証（Mac 2026-07-25）

**目的**: 未認証の保護ルート拒否（AUTH-E2E-02）は既に PASS 済みのため、**認証済みセッションを跨ぐ**
ロール別認可 / 状態別拒否 / 他法人 ID 拒否のみを対象とする。Phase 2 の業務 E2E も同じ基盤を再利用する。

**構造**: Playwright を 3 project に分割した。`e2e`（既存 7 件・storageState 不使用）→
`auth-setup`（fixture 用意と storageState 生成・1 件）→ `authenticated`（AUTH-E2E-12..25 の 14 件・
`dependencies: ["auth-setup"]`）。auth-setup は公開業務関数のみで 2 法人 8 ユーザーの fixture を冪等に用意し、
GoTrue Admin API `generateLink({type:'magiclink'})`（**メール送信なし**）で得た token_hash を
**アプリの実 `/auth/callback` 経路**に通して実 Cookie を発行させ、`app/.auth/<key>.json` へ storageState を保存する。
`app/.auth/` は `.gitignore` 済みで毎回作り直す（stale session を使い回さない）。
法人 ID / membership ID は実行ごとに変わるため `app/.auth/fixtures.json` 経由で受け渡す（ハードコードしない）。
**この storageState / fixture 基盤は Phase 2 でもそのまま再利用できる。**

**不具合と原因（SYSTEM_ADMIN 関連のみ失敗した件）**: 全体実行で AUTH-E2E-14 / 17 だけが
`waitForURL("**/system-console")` で timeout していた。原因は **Magic Link ライフサイクル / signout 契約テスト
（AUTH-E2E-06）と systemAdmin の storageState fixture が同じ seeded ユーザー
（`sysadmin.fictional@example.test`）を共有していたこと**。`/auth/signout` は
`supabase.auth.signOut()` をオプション無しで呼び、auth-js の既定は **`{ scope: 'global' }`** であるため、
AUTH-E2E-06 の signout がそのユーザーの **GoTrue セッションを全て削除**する。結果として auth-setup が
発行済みだった systemAdmin の storageState が参照する session_id が消え、`getUser()` が 401 となり、
アプリは `/login` へ redirect していた（失敗時の page snapshot はログイン画面だった）。
`e2e:auth` 単独では signout テストが走らないため再現せず、全体実行でのみ失敗していた。

**修正（最小・テストユーザーの分離）**: `app/supabase/seed.sql` に **lifecycle 専用の架空ユーザー**
`magiclink-lifecycle.fictional@example.test`（GoTrue 正規構造・`system_role` なし・所属なし・冪等）を追加し、
AUTH-E2E-06 をそちらへ切り替えた。`app/e2e/fixtures/identities.ts` に、この email が storageState fixture と
共有された場合に即 throw するガードを置いている。**テスト順序への依存・retry・timeout 延長・期待値の弱体化・
signout テストの削除では解決していない。** また **production の `signOut()` は global scope のまま維持**する
（テスト都合で本番のセッション失効範囲を狭めない）。あわせて `expectLanding` を追加し、着地不一致時に
**pathname のみ**を使った原因説明付きで fail fast する（token / Cookie 値は出力しない）。
**migration / RLS / GRANT / `scripts/pg-harness/00_shim_supabase.sql` は変更していない。**

**環境不整合（記録）**: stale な `supabase_*_app` スタックが残っていると新しい seed と config が適用されず、
Magic Link 経路が `otp_disabled` になる。`supabase stop --project-id app` →
正しいリポジトリから `supabase start` → `supabase db reset` で解消する。

**実測結果（Mac 2026-07-25）**: `npm run typecheck` PASS / `npm run lint` PASS / `npm run test` PASS（Vitest 41/41）/
`npm run build` PASS / `npm run verify:supabase` 28/28 PASS / `npm run e2e:auth` **15/15 PASS**（auth setup 1 + 14）/
`npm run e2e:local` **22/22 PASS を 2 回連続**（既存 7 + auth setup 1 + 認証済み 14）。
2 回連続で確認した事項: auth setup が毎回 storageState を再生成すること / SYSTEM_ADMIN セッションが
signout テストに巻き込まれないこと / AUTH-E2E-14 / 17 が安定 PASS すること / 既存 AUTH-E2E-01..07 に退行が無いこと /
法人・membership fixture が冪等であること / 他法人 ID 差し替えの拒否が実 HTTP で成立すること /
invited・suspended・left の状態別拒否が成立すること。

**Phase 1 の限界（過大申告しない）**: Phase 1 には **ORGANIZATION_ADMIN 専用の HTTP ルートが存在しない**ため、
ORGANIZATION_ADMIN と SALES_USER の**管理操作差分は HTTP 層では未検証**である。
両者の DB 層のロール差分は既存の PG harness（業務関数テスト）で検証済みであり、
**HTTP 層で検証できるロール境界は SYSTEM_ADMIN 境界のみ**。この制約は解消されていない。

**範囲外（PENDING のまま）**: AUTH-E2E-25 の末尾に出力される
`[audit] failure-audit write failed correlation=...` は **B13-HTTP（Next.js 実 HTTP 失敗監査経路）の既知ログ**であり、
**AUTH-12..16 の FAIL ではない**。B13-HTTP は今回の対象外で PENDING を維持する。

## 2. 残る未検証（PENDING）と理由

かつて本節に列挙していた実 Supabase 検証（PostgREST 経由 RLS・列 GRANT・RPC・実 JWT 3 ロール・招待メール一致・
失敗監査別 Tx・Magic Link/Mailpit/再利用拒否/Cookie/signout のブラウザ E2E）は、**すべて Mac で実施済み・PASS**
（§1.4: verify:supabase 28/28 ＋ e2e:local 22/22 を 2 回連続）。
**AUTH-12..16 の認証済みロール・状態別 E2E は §1.5 の基盤により SUPABASE_LOCAL_PASS へ更新済み**（旧④）。
**残る既知の残課題（テスト PENDING）は以下の 4 分類**:

| # | 項目 | 内容 | 理由 / PASS 済みの範囲 |
|---|---|---|---|
| 1 | **B10-refresh** | 期限切れ/間近トークンを強制して middleware の token refresh を実機検証 | 確実な強制手段が未実装。E2E はセッション維持のみ確認（PASS 済み） |
| 2 | **B13-HTTP** | Next.js Server Action / route handler を通した実 HTTP 失敗監査 E2E | 未実装（DB/PostgREST 別 Tx 経路 B13-DB は PASS 済み） |
| 3 | **AUTH-11 実機** | DB/RLS 障害を「所属なし」と区別し /error へ振り分ける経路の実機確認 | 障害注入手段が未整備（判定ロジックは実装・unit 済み） |
| 4 | **Magic Link 有効期限の境界検証** | 期限切れリンクの時間経過を伴う検証 | 未実施（時間経過の強制手段が未整備。単回使用・使用済みリンクの再利用拒否は B8 で PASS 済み） |

**旧 ④「AUTH-12..16 の認証済みロール・状態別 E2E」は SUPABASE_LOCAL_PASS へ更新済み**
（AUTH-E2E-12..25 の 14 件を実 Supabase local / 実 HTTP / 実 Cookie で確認。§1.5 / test-cases.md §5.1・B17）。
なお **npm audit の high severity 12 件**は、テストの PENDING とは別枠のセキュリティ負債として管理する。

上記とは別枠だった **CI リモート実走行（GitHub Actions での npm ci + verify + pg-harness）は 2026-07-25 に完了**
（Run #4 / commit `2bbae3b`・全ジョブ green）。上記 4 分類は Phase 1 完了を妨げない追加検証バックログとして
継続管理し、**PASS 扱いにしない**。

### 2.2 本クラウドサンドボックス固有の制約（記録）
本サンドボックスは npm レジストリ遮断・Docker 不可のため、`npm run verify` / 実 Supabase 実行は不可能だった。
**いずれも Mac 実機で実施済み・PASS**（§1.4）。本節は環境制約の記録として残す。

## 3. ハーネスの限界（PG_HARNESS_PASS ≠ Phase 1 完了）
- 擬似 auth.uid()/JWT は GoTrue の実トークン検証を代替しない。
- PostgREST のスキーマキャッシュ・RPC 呼出規約・エラー変換は未検証。
- service_role の BYPASSRLS はハーネスで付与したが、実 Supabase の権限構成
  との差異があり得る。
- Magic Link の有効期限・ワンタイム性は GoTrue の挙動であり SQL 層では検証不能。

## 3.5 現在の状態一覧（レビュー項目5対応・正確な区分）
| 項目 | 状態 |
|---|---|
| Phase 0 コード | 再構築済み（成果物レビュー中） |
| pure typecheck | 実行済み PASS（tsc 6.0.3・本環境） |
| offline unit (41件) | 実行済み PASS（`npm run test:offline`・本環境） |
| 正式 `npm run verify`（typecheck/lint/Vitest/build） | **APP_PASS（最新コード）**（Mac 2026-07-25。追加スクリプト・e2e・middleware 修正込みで typecheck/lint/Vitest 41/41/build 全10ルート成功） |
| CI | **実走行 PASS**（GitHub Actions Run #4 / commit `2bbae3b`・全ジョブ green。Node v22.23.1 / npm 11.12.1 で `npm ci` → typecheck / lint / unit / build、PostgreSQL harness `PG HARNESS: ALL TESTS PASSED`） |
| package-lock.json 生成 | **完了**（8add410。2026-07-25 に version 欠落 optional スタブを `2bbae3b` で修復し、Linux クリーン環境の `npm ci` 成立を CI で確認） |
| 実 Supabase local: verify:supabase (B1..B5/B9/B13-DB/B15) | **SUPABASE_LOCAL_PASS**（Mac 2026-07-25, 28/28 PASS, run=mrzjqtj7） |
| 実 Supabase local: E2E 全体 (B6..B8/B10(session)/B11/B12/B14/B16/B17) | **SUPABASE_LOCAL_PASS**（Mac 2026-07-25, **22/22 PASS を 2 回連続**。内訳: 既存 E2E 7 + auth setup 1 + 認証済み E2E 14） |
| 実 Supabase local: 認証済み E2E (B17 / AUTH-E2E-12..25) | **SUPABASE_LOCAL_PASS**（Mac 2026-07-25, **14/14 PASS**。`npm run e2e:auth` は auth setup 1 件を含めて 15/15） |
| B10-refresh / B13-HTTP / AUTH-11 実機 / Magic Link 有効期限の境界検証 | **PENDING**（未実装・未検証。**既知の残課題 4 分類として明示** — §2） |

## 4. Phase 1 受入条件との対応（12.2）
| 受入条件 | 状態 |
|---|---|
| Magic Link ログイン成立・再利用不可 | **SUPABASE_LOCAL_PASS**（e2e B6..B8: 送信→受信→単回ログイン→再利用拒否のフルライフサイクル） |
| 未所属 / suspended / left の法人アプリ拒否 | 判定ロジック APP_PASS + layout 実装済み + 未認証拒否は E2E 実機確認 / **状態別（invited / suspended / left）の実機 E2E も SUPABASE_LOCAL_PASS**（AUTH-E2E-18..22） |
| 他法人データ越境不可（URL/payload 改変含む） | SQL 層 PG_HARNESS_PASS + **PostgREST 層 SUPABASE_LOCAL_PASS**（B2/B15）+ **HTTP 層 SUPABASE_LOCAL_PASS**（AUTH-E2E-23..25: URL/query の他法人 ID 差し替え・request body の membership ID 改竄をいずれも拒否） |
| SYSTEM_ADMIN 単独で法人アプリ・顧客案件へ入れない | 判定 APP_PASS + layout 実装済み + **実機 E2E SUPABASE_LOCAL_PASS**（AUTH-E2E-14 / 17: SYSTEM_ADMIN は /system-console へ着地し、/cases 直打ちは /system-console へ redirect。逆に一般ユーザーの /system-console 直打ちは /cases へ redirect = AUTH-E2E-15/16） |
| profile email/system_role 直接更新不可 | PG_HARNESS_PASS + **SUPABASE_LOCAL_PASS**（B3, PostgREST 経由） |
| 法人・membership 直接書込不可（業務関数のみ） | PG_HARNESS_PASS + **SUPABASE_LOCAL_PASS**（B15） |
| 最後の SYSTEM_ADMIN / ORGANIZATION_ADMIN の並行 0 人化不可 | PG_HARNESS_PASS (CONC-01/02) |
| 成功監査同一Tx / 失敗監査別Tx | PG_HARNESS_PASS (FUNC-02/15) + **DB/PostgREST 経路 SUPABASE_LOCAL_PASS**（B5/B13-DB）/ Next.js HTTP 経路（B13-HTTP）**PENDING** |
| middleware refresh 後 Cookie が redirect でも維持 | Cookie 属性・redirect 後維持・セッション維持は **SUPABASE_LOCAL_PASS**（B10/B11）/ **token refresh の強制（B10-refresh）は PENDING** |
| 全 typecheck/lint/unit/build/E2E + AUTH/SEC | **typecheck・lint・unit（Vitest 41/41）・build・DB系・verify:supabase 28/28・e2e:local 22/22（2 回連続）・e2e:auth 15/15 すべて PASS** |

**結論: Phase 1 の機能実装と主要実機検証は完了。**
**AUTH-12..16 の認証済みロール・状態別 E2E は SUPABASE_LOCAL_PASS**（AUTH-E2E-12..25 の 14 件。
`npm run e2e:auth` 15/15 ＝ auth setup 1 + 業務テスト 14、`npm run e2e:local` 22/22 を 2 回連続。§1.5）。
**B10-refresh・B13-HTTP・AUTH-11 実機・Magic Link 有効期限の境界検証は既知の残課題**として明示
（未実装・未検証であり PASS 扱いにしない。§2 参照）。npm audit の high severity 12 件は別枠で管理する。
**CI リモート実走行も完了**（GitHub Actions Run #4 / commit `2bbae3b`・全ジョブ green）。
**Phase 1 の機能実装・主要実機検証・CI 実走行は完了。既知残課題 4 分類は Phase 1 完了を妨げない
追加検証バックログとして継続管理する。Phase 2 は未着手。**
