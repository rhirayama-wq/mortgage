# security.md — Phase 1 セキュリティ設計

基準: migration 0001 と `app/src/lib/auth/*`, `app/src/middleware.ts`（実ファイルが正）。

## 1. 権限モデル
| ロール | 保持場所 | Phase 1 での権限 |
|---|---|---|
| SYSTEM_ADMIN | user_profiles.system_role | 法人作成・名称変更・アーカイブ、招待、SYSTEM_ADMIN 付与/剥奪、全監査閲覧。**顧客案件の当然閲覧は不可（Phase 2 で専用フロー）** |
| ORGANIZATION_ADMIN | memberships.role | 自法人の招待・role変更・停止/再開/終了、自法人監査閲覧 |
| SALES_USER | memberships.role | 自分の membership/profile 閲覧のみ（案件は Phase 2）。監査閲覧不可 |

認証≠認可。UI 状態を認可根拠にしない。クライアント送信の organizationId / role を信頼しない（受諾 RPC は membership ID のみ受け取り、DB 側で本人・状態・メール一致を再検証）。

## 2. テーブル権限（明示 GRANT / REVOKE）
全テーブルで `revoke all ... from anon, authenticated, service_role` 後に:
- authenticated: SELECT（RLS 適用）＋ user_profiles.display_name の列 UPDATE のみ
- anon: なし
- service_role: 直接テーブル権限なし（`app_record_membership_accept_failure` の EXECUTE のみ）

## 3. RLS ポリシー一覧（計10本・SELECT 9 / UPDATE 1）
| テーブル | SELECT | 書込 |
|---|---|---|
| user_profiles | 本人 or SYSTEM_ADMIN or **当該法人の active ORGANIZATION_ADMIN**（`app_can_administer_profile`。SALES_USER は他人の行＝email 等を取得不可: SEC-66..70） | UPDATE 本人のみ（display_name 列 GRANT と併用） |
| organizations | invited/active/suspended 所属者 or SYSTEM_ADMIN | ポリシーなし（業務関数のみ） |
| organization_memberships | 本人 or 当該法人 org admin or SYSTEM_ADMIN | ポリシーなし |
| authoritative_audit_logs | SYSTEM_ADMIN 全件 / org admin 自法人 | ポリシーなし（追記は definer 関数内） |

ヘルパー（app_is_system_admin 等）は SECURITY DEFINER・search_path='' で RLS 再帰を回避。
NULL 三値論理: system_role 比較は `is not distinct from` を使用。

## 4. 業務関数の並行制御（SEC-62..65, 76..82 / CONC-01..04 で検証済み）
実行順序:
1. `pg_advisory_xact_lock`（下表のロック種別）
2. **ロック取得後に認可を確認**（認可確認後にロック待ちしない）
3. 対象行がある操作は `SELECT ... FOR UPDATE`
4. 状態・遷移・人数の再確認（最後の管理者保護）
5. 更新 → `GET DIAGNOSTICS row_count = 1` 検証
6. 成功監査を同一トランザクションで記録

| ロック | キー | 対象関数 |
|---|---|---|
| グローバルのみ | (815001, 1) | app_create_organization / app_rename_organization / app_archive_organization / app_grant_system_admin / app_revoke_system_admin / app_bootstrap_first_system_admin |
| **グローバル → 法人（両方・この順）** | (815001,1) → (815002, hashtext(org_id)) | app_invite_organization_member / app_change_member_role / app_change_member_status（app_suspend_member / app_reactivate_member / app_end_membership の実体） |
| 法人のみ | (815002, hashtext(org_id)) | app_accept_invitation（本人のみ実行可・SYSTEM_ADMIN 経路なし） |

**複数ロックの固定順序（SEC-81）**: 必ず「SYSTEM_ADMIN グローバル (815001) → 法人 (815002)」。
逆順は作らない（デッドロック要因）。SEC-81 が pg_get_functiondef で取得順を静的検証する。

**SYSTEM_ADMIN も実行し得る法人操作（invite / role / status 変更）は両ロックを取得する。**
これによりグローバルロックを取る grant/revoke と直列化され、ロック待機中に SYSTEM_ADMIN を
取り消された actor は再認可で拒否される（SEC-76..80 並行検証済み。デッドロック・無期限待機は
timeout / lock_timeout により PASS 扱いにしない: SEC-82）。ORGANIZATION_ADMIN の操作も一時的に
グローバルロックを取得するが、Phase 1 は安全性と単純なロック順序を優先する（性能課題が出た場合の
分岐設計は U18）。

ロックを取らない関数: RLSヘルパー（読取のみ）・トリガー関数・app_write_audit（呼出し元業務関数のロック内で実行）・app_record_membership_accept_failure（追記専用・競合対象なし）。

トリガー（membership_guard / last-admin backstops / audit append-only）は二重防御であり、並行競合の主防御ではない。

## 5. 監査
- 成功: 業務関数内で同一 Tx（`app_write_audit`）。actor は auth.uid() から決定。クライアントは actor/success/action を指定できない。
- 失敗: DB 例外で Tx ごとロールバック → **サーバー（Server Action）が例外捕捉し、service_role で専用関数 `app_record_membership_accept_failure` を別 Tx 実行**（実装: `src/lib/auth/audit.ts`, 呼出: `pending-invitation/actions.ts`）。汎用の失敗監査 RPC は置かない（Phase 1 の失敗監査対象は membership.accept のみ）。
- 専用関数の DB 側制約（SEC-71..75, 83..87 で検証済み）: action='membership.accept'・resource_type='organization_membership'・success=false・metadata='{}' を固定（パラメータ自体が存在しない）／error_code は許可リスト7種のみ／actor・membership・correlation は必須／organization_id は membership から DB 側で解決（クライアント申告不可）。
- **actor 整合（SEC-83..85）**: membership が存在する場合、p_actor_user_id は membership 本人と一致しなければ `audit_actor_membership_mismatch` で拒否。membership_not_found の場合のみサーバーが認証済みユーザーから決定した actor をそのまま記録。
- **correlation ID 冪等性（SEC-86..87）**: unique partial index `(correlation_id, action, success) where correlation_id is not null` ＋ 専用関数の `on conflict do nothing` により、Server Action / HTTP リトライによる同一失敗監査の重複を1件に抑止。success を含むため、同一 correlation の成功監査と失敗監査は別イベントとして共存できる。
- metadata に PII 本文・財務情報・JWT・秘密情報を入れない。error_code はアプリ側でも同一許可リストへ正規化（`toSafeErrorCode`）。
- **実 HTTP 経路の検証（B13-HTTP・2026-07-26 SUPABASE_LOCAL_PASS）**: 上記の失敗監査経路を、実ブラウザ・実 Cookie・実 Server Action・実 Supabase local を通して検証済み（AUTH-E2E-26/27。test-cases.md §5.1 / §7）。確認した性質:
  - 正当な業務失敗が **別 PostgREST リクエスト / 別トランザクション**で `success=false` の失敗監査 **1 件**として記録される。
  - actor は**認証済み session の `getUser()` 由来**であり、**request body の actor ID は信用しない**。
  - membership ID は request body 由来でも、**SEC-83 が membership 本人との一致を検証**して不一致を拒否する（監査行 0 件）。
  - correlation ID は **1 リクエスト 1 個**。業務失敗と監査で同一 correlation を共有し、**同一 correlation を再送しても監査は 1 件のまま**。
  - **service_role の用途は監査 RPC の実行に限定**。**監査ログの読取は SYSTEM_ADMIN の認証済み session + RLS 経由**で行う。migration 0001 が `authoritative_audit_logs` の権限を revoke しているため **service_role にはこのテーブルの SELECT 権限が無く**、**BYPASSRLS はテーブル GRANT を代替しない**。
  - この検証にあたり **migration / RLS / GRANT / RPC 定義は一切変更していない**。
- **失敗監査ログの 3 分類（ガード拒否と書込み失敗を混同しない）**:
  - `recorded` — 失敗監査が 1 件書かれた（AUTH-E2E-26）。
  - `refused_by_guard` — `failure-audit refused by actor/membership guard` の **warn**。**設計どおりの拒否であって監査経路の障害ではない**。監査行は書かれず、出力は correlation ID のみ（AUTH-E2E-25 / 27）。
  - `write_failed` — `failure-audit write failed`。**本物の監査経路障害**。判別できない error shape は安全側に倒して `write_failed` として扱う。

## 6. SECURITY DEFINER 規律
全 definer 関数: `set search_path = ''`・完全修飾参照・動的 SQL なし。
EXECUTE は public/anon から revoke。トリガー関数・内部関数（app_write_audit, app_change_member_status, bootstrap）は authenticated/service_role からも revoke。公開業務関数のみ authenticated へ、失敗監査のみ service_role へ grant。

## 7. 認証アプリ層
- Magic Link 送信は Server Action のみ（`login/actions.ts`）。Zod 相当の明示検証・trim/小文字化・`shouldCreateUser:false`・登録有無を区別しない共通応答・内部エラー非表示・60秒クールダウン。
- callback は token_hash + type の検証フローのみ。type は実行時検証（email/magiclink のみ、recovery/invite/signup は拒否）。
- `next` は middleware / login / callback の全経路で `getSafeInternalPath` により二重検証（open redirect / CRLF / backslash / 資格情報 URL を拒否）。
- middleware は getUser() で refresh し、**redirect 時も `redirectWithAuthCookies` で Cookie を引き継ぐ**。
- 認可は route group layout でサーバー実施: `(org-app)`=active membership、`(system)`=system_role、招待画面=本人 invited のみ、no-access=認証済み専用。
- DB/RLS/Auth 障害は専用エラー型で `/error`（500系扱い）へ。「所属なし」(no-access) と混同しない。fail closed。
- signout は POST のみ（GET は 405）。
- service role key はサーバー専用（`NEXT_PUBLIC_` 禁止、browser アクセスで throw）。

## 7.1 認証済み E2E 基盤のセキュリティ姿勢（AUTH-12..16 / B17）
- 認証済みセッションは Playwright の `auth-setup` project が **storageState** として生成し、各テストは fixture 経由で再利用する。**Cookie / token を手動注入しない**（`/auth/callback?token_hash=...&type=email` を開き、アプリの実 verifyOtp 経路に実 Cookie を発行させる）。token_hash は GoTrue Admin API `generateLink` から取得し、**メールは送信しない**。
- storageState は `app/.auth/` に置き、**Git 管理対象外**（`app/.gitignore`）。実行のたびに作り直し、stale session を使わない。実行時に変わる法人 ID / membership ID は `app/.auth/fixtures.json` へ書き出して参照する（ハードコードしない）。
- Cookie 値・auth token・token_hash・Magic Link URL・anon key・service role key・`.env.local` の内容は、標準出力にもアサーション差分にも出さない。着地の診断は **pathname のみ**を使う（`expectLanding`）。
- fixture ユーザー 8 種類はすべて架空で **`@example.test`** のみ。法人名も `E2E検証法人A（架空）` / `E2E検証法人B（架空）`。パスワードや共通秘密値をコードへ埋め込まない。
- **lifecycle 専用ユーザーの分離**: `/auth/signout` は `supabase.auth.signOut()` を既定の `scope: "global"` で呼び、そのユーザーの GoTrue セッションを全て失効させる。signout を伴う Magic Link ライフサイクルテスト（AUTH-E2E-06）が SYSTEM_ADMIN fixture と同一ユーザーだったため storageState が巻き添え失効していた。seed レベルで `magiclink-lifecycle.fictional@example.test` へ分離し、`identities.ts` に共有検出の throw ガードを置いた。**production の signOut は global scope のまま維持する**（テストの都合でセッション破棄の意味論を弱めない）。順序変更 / retry / timeout 延長 / skip / 期待値の弱体化では解決していない。
- 実 Supabase local に対する実 HTTP で、SYSTEM_ADMIN 境界・ORGANIZATION_ADMIN / SALES_USER の着地・invited / suspended / left の状態別拒否・他法人 ID 差し替え拒否（URL / query / request body）を確認済み。拒否の形は **403 ではなく redirect**（fail closed の設計どおり）。
- fixture の用意は公開業務関数のみを使い、**migration / RLS / GRANT / `scripts/pg-harness/00_shim_supabase.sql` は一切変更していない**。接続先はループバックのみ（本番接続禁止・CLAUDE.md §32）。
- **監査ログの読取（B13-HTTP / AUTH-E2E-26/27）も同じ姿勢**: 読取は `app/e2e/fixtures/audit-reader.ts` が **SYSTEM_ADMIN の認証済み session + RLS 経由**で行い、**service role key を browser へ渡さない**。ログ・アサーション差分へ token / Cookie / Magic Link URL / anon key / service role key / DB 生エラー全文を出さず、出すのは correlation ID のみ。timeout 延長 / retry 追加 / skip 追加 / 期待値の弱体化は行っていない。
- **セッション refresh 検証（B10-refresh / AUTH-E2E-28/29・2026-07-27）も同じ姿勢**:
  - `app/e2e/fixtures/session-cookie.ts` が認証 Cookie（`sb-*-auth-token`・チャンク対応）を復号し、**セッション JSON の `expires_at` だけを過去へ書き換えて**期限切れ相当を再現する。**JWT の偽造・署名改変・GoTrue 設定変更・admin API によるセッション操作はしない**。refresh は middleware の正規 `getUser()` 経路で GoTrue に対して実際に行われる。
  - **token / Cookie 値 / storageState 内容 / JWT はログにもアサーション差分にも出さない**。access token 更新・refresh token rotation・user ID 一致・expiry の前後・httpOnly 維持は、**すべて boolean へ畳んでから** assert する。ヘルパーのエラーも固定文言と件数のみ。
  - 失敗経路（AUTH-E2E-29）では refresh token を**実在しない固定文字列**に置き換える。**実在した refresh token を GoTrue へ再送しない**ため、rotation の reuse 検知による既存セッションファミリーの失効を誘発しない。Server Action POST は middleware により /login への redirect 応答となる。Next.js クライアントがその応答を画面遷移へ変換しない場合があるため、E2E ではサーバー応答を直接検証し、続く保護ルートアクセスが /login へ誘導されることを確認した。画面へ JWT 断片・例外詳細を出さないことも assert する。
  - この際サーバーログに出る supabase-js 由来の `AuthApiError: Refresh token is not valid`（class / status=400 / code=validation_failed）は**秘密値を含まない安全な識別子のみ**であり、許容する。
  - trace / artifact のアップロードはしない。timeout 延長 / retry 追加 / skip 追加 / 期待値の弱体化 / application code・middleware・Supabase config の変更は行っていない。

## 7.2 CI（GitHub Actions）での実 Supabase local 検証のセキュリティ設計
- 実 Supabase local 検証は workflow **`Supabase local E2E`**（`.github/workflows/supabase-local-e2e.yml`・commit `21bf31b` で追加）として CI 化済み。**Run #1 / run ID `30205025523`・success**（Supabase CLI **2.109.1** を `version` で pin）。GitHub-hosted runner に既定で用意されている Docker daemon をそのまま利用しており、**Docker-in-Docker 構成ではない**。B10-refresh（AUTH-E2E-28/29）を含む **Run #2 / run ID `30349565674` / commit `6cbe362` も success**（2026-07-28・artifact 0 件。run / job conclusion と artifact 件数は API 実測。**Run #2 の CI ログ本文は未取得**のため、ログ出力内容の確認は Run #1 の抜粋と workflow の静的設計 + ローカル実測に基づく）。
- **接続先はループバックのみ**。`NEXT_PUBLIC_SUPABASE_URL` = `http://127.0.0.1:54321` / `MAILPIT_URL` = `http://127.0.0.1:54324` / `APP_ORIGIN` = `http://localhost:3000` を job env で固定し、さらに URL が `http://127.0.0.1:*` / `http://localhost:*` / `http://[::1]:*` のいずれかであることを workflow 内で検査する。**本番 Supabase へは接続しない**（CLAUDE.md §32）。
- **独自のリポジトリ Secrets を参照しない**。参照するのは Supabase CLI 取得のために `supabase/setup-cli` へ渡す `secrets.GITHUB_TOKEN`（GitHub が run ごとに自動発行するトークン）のみで、Supabase の鍵をリポジトリ Secrets に置いていない。
- **鍵は run 内で生成し、標準出力へ流さない**。`supabase start` が生成した anon key / service role key は標準出力へ出さずに取り出し、**即座に `::add-mask::` へ登録**したうえで `>> "$GITHUB_ENV"` で後続ステップへ受け渡す。
- fixture は Mac 実機と同一で、**法人 2 / ユーザー 8・すべて架空の `@example.test`**。パスワードや共通秘密値を workflow へ埋め込まない。
- **artifact は 0 件**。trace / screenshot / storageState が秘密値を含まないことを確証できないため、artifact アップロードのステップ自体を実装していない（workflow 下部 NOTE に理由を明記）。storageState は run のたびに生成され、run 終了とともに破棄される。
- 失敗監査ログの実測は Mac 実機と一致し、`failure-audit refused by actor/membership guard` の warn **2 件** / `failure-audit write failed` **0 件**。correlation ID は実ログに存在するが、**本書を含む文書へは転記しない**。
- `npm run e2e:auth` は `npm run e2e:local` の真部分集合であるため、CI では重複実行しない（auth setup 1 件と authenticated 18 件が二重に走るため）。Mac 実機では独立ゲートとして継続する。
- **本節の評価範囲**: 上記は **共有されたログ抜粋と workflow の静的設計から確認できた範囲**の記載である。**ログ全文に対する秘密値の網羅検索は実施していない**。

## 8. PII・秘密
ログ・URL・監査 metadata へメールアドレス等の PII を出さない（login 失敗ログはアドレス自体を抑制）。シード・テストは架空データのみ（fictional / test only 明記）。本番 Supabase 接続・本番 Magic Link 送信・本番シークレット設定は禁止。

## 9. 本番前の残リスク（phase1-validation.md と対応）
- PostgREST / GoTrue / Mailpit / 実 JWT による主要検証は完了（Mac 実機 2026-07-27: `npm run verify:supabase` **28/28 PASS** / `npm run e2e:local` **26/26 PASS** / `npm run e2e:auth` **19/19 PASS** / Vitest **55/55 PASS**。B10-refresh 追加前の 2026-07-26 実測は e2e:local 24/24 を 2 回連続 / e2e:auth 17/17）。26 件の内訳は **既存 E2E 7 + auth setup 1 + 認証済み E2E 18（AUTH-E2E-12..29）**で、auth setup は業務テスト 18 件とは別に数える。**同一の検証は CI でも成立**（GitHub Actions `Supabase local E2E`: B10-refresh 込みの最新 **Run #2 / run ID `30349565674` / commit `6cbe362`・success**（2026-07-28・artifact 0 件）、初回 Run #1 / run ID `30205025523`・success（`verify:supabase` **28/28 PASS** / `e2e:local` **24/24 PASS**・当時の全件）。§7.2。Run #2 の run / job conclusion・artifact 0 件は API 実測だが、**CI ログ本文は未取得**であり件数の文言レベルは job success + workflow 定義 + ローカル実測からの判断 — 確認範囲の区別は test-cases.md §7.1）。
- **AUTH-12..16（ロール別認可 / 他法人 ID 拒否 / invited・suspended・left 状態別拒否の認証済みセッション E2E）は SUPABASE_LOCAL_PASS**（§7.1 / test-cases.md §5.1・B17）。**限界: Phase 1 に ORGANIZATION_ADMIN 専用の HTTP ルートが無いため、ORGANIZATION_ADMIN と SALES_USER の管理操作差分は HTTP 層では未検証。DB 層のロール差分は PG harness で検証済みであり、HTTP 層で検証できるロール境界は SYSTEM_ADMIN 境界のみ。**
- **B13-HTTP（Next.js Server Action 経由の実 HTTP 失敗監査経路）は SUPABASE_LOCAL_PASS**（§5・AUTH-E2E-26/27）。旧記述にあった「`failure-audit write failed` は B13-HTTP の既知ログ」という注記は、実装により解消したため削除した。実測（2026-07-26）では AUTH-E2E-25 / 27 とも `refused_by_guard` の warn のみで、`failure-audit write failed` は出力されない。
- **B10-refresh（middleware token refresh の強制検証）は SUPABASE_LOCAL_PASS**（§7.1 / test-cases.md §7 B10-refresh・AUTH-E2E-28/29。Mac 2026-07-27）。
- ただし以下 2 分類は **PENDING**（PASS 扱いにしない・Phase 1 完了を妨げない追加検証バックログ / phase1-validation.md §2）:
  - AUTH-11 実機（DB/RLS 障害を「所属なし」と区別し /error へ振り分ける経路の実機確認。判定ロジックは実装・unit 検証済み）
  - Magic Link 有効期限の境界検証（期限切れリンクの時間経過を伴う検証。強制手段が未整備）
- npm audit の high severity 12 件は、上記テストの PENDING とは**別枠**のセキュリティ負債として管理する（`npm audit fix` / `--force` / `--legacy-peer-deps` は使わない）。
- Magic Link の受信および使用済みリンクの再利用拒否は GoTrue local で確認済み（`npm run e2e:local` B8 PASS）。有効期限の境界値・期限切れリンクの時間経過を伴う追加検証は未実施
- 初回 SYSTEM_ADMIN の本番ブートストラップ手順は運用手順書化が必要（app_bootstrap_first_system_admin を migration 管理経路で1回実行）

## 10. Phase 2A-1 顧客案件のセキュリティ（追加 — 0002 migration）
本節は Phase 2A-1（顧客案件・申込者・招待・参加者）の追加であり、§1–§9（Phase 1）を変更しない。
- **テナント/顧客/営業の三層境界**: RLS は organization_id（テナント）＋ case_participants（顧客本人）＋ assigned active membership（担当営業）で制御。ORGANIZATION_ADMIN は自 org 全案件、SYSTEM_ADMIN は既存判定。SELECT のみ RLS で許可し、**書込ポリシーは置かず SECURITY DEFINER 業務関数のみ**。
- **PII 分離**: 氏名・生年月日・連絡先・住所は case_applicant_profiles に分離。顧客は自分の申込者 PII のみ可視、共同申込者 PII は不可視。**監査 metadata / URL / ログへ PII・token・Magic Link URL を出さない**。
- **顧客認証**: 顧客は organization membership を持たなくてよい。招待受諾は Supabase Auth が所有するミラー email（user_profiles.email）と invited_email(lower(btrim)) の一致でのみ成立（クライアント申告 email は信用しない）。token は DB に保存しない。
- **冪等性・並行**: advisory lock（815002 法人 / 815003 案件）→ 冪等短絡（correlation の成功監査 / participant unique）→ 認可再確認 → FOR UPDATE → 更新 → 行数確認 → 監査。二重受諾は重複 participant を作らない。
- **fail closed / 二重防御**: guard トリガが hard delete・不変列変更・未許可遷移を拒否。EXECUTE は public から revoke し、RLS helper と公開業務関数のみ authenticated へ grant、内部関数（app_add_case_participant / app_prior_success_resource）は誰にも grant しない。service role へ広範 GRANT を追加しない。
## Phase 2A-2a 追記（顧客基本情報の保存 / 被招待者の招待可視化）

基準: 0003_phase2a2_applicant_profile.sql / (customer-app) 配下の画面・Server Action。

### 認証・認可
- 顧客は auth.users だが organization_memberships を持たない。案件アクセスは case_participants 経由（RLS）。
- 顧客ポータル layout は「認証のみ」を要求（requireAuthenticatedUser）。membership 不要。
- 案件単位の本人性は requireCustomerCaseParticipant（自分の participant 行から申込者特定）。未参加/不存在は notFound、DB/整合性障害は /error（fail closed。未参加と混同しない）。
- 基本情報の書込は app_update_own_applicant_profile のみ。app_participant_owns_applicant で本人のみ許可。

### PII 保護
- PII は URL・ログ・監査 metadata に出さない。オートセーブは Server Action 引数(POST body)で送信しクエリ文字列に載せない。監査は変更フィールド名のみ。エラーログは分類コードのみ（値なし）。

### 被招待者の招待可視化（RLS）
- case_invitations_select_invitee: 被招待者本人が status='invited' かつ invited_email 一致の自分宛招待のみ SELECT 可。案件本文は participant になるまで不可視のため案件内容は漏れない。

### 提携ローンのテナント分離方針（Phase 2A-2b・設計方針）
- organization 提携ローンは org 固有の商用条件（機微データ）。organization_id ＋ RLS で他 org から不可視。
- 承認確率はモゲチェック API が算出しローンチェッカーは算出しない（標準・提携で共通）。
- 診断時点の商品条件をスナップショット保存し、過去診断を当時条件で再現する。

## Phase 2A-2b 追記（提携ローンのテナント分離・権限・監査）

- テナント分離: organization 固有の商用条件。他 org から存在確認不可（RLS 0 件・情報差なし）。organization_id はクライアント任せにせず RPC/認証から導出。
- 権限: ORG_ADMIN のみ作成/更新(新version)/有効化/無効化/確認。SALES は自 org の有効かつ有効期間内の商品の安全列のみ閲覧（内部メモ不可視）。顧客は管理テーブル不可。suspended/left は不可（app_require_org_admin_membership が status='active' 必須）。SYSTEM_ADMIN は既存 Phase 1 権限モデルに従い新 bypass を作らない。
- 書込: 直接 INSERT/UPDATE/DELETE 禁止（テーブルへ DML GRANT なし）。SECURITY DEFINER 業務関数のみ・search_path 固定・public execute 剥奪・authenticated へ最小 GRANT。service role は一般画面で不使用。advisory lock 815004(org)/815005(loan)。
- version 競合: expected_current_version_id で楽観ロック（同一 tx）。外部 URL: application_url は https のみ（CHECK + RPC 再検証）。
- 監査: partner_loan.created / version_created / activated / deactivated / confirmed。metadata は entity/org/actor/membership/version_number/status 遷移のみ。内部審査メモ・顧客向け注意事項・商品条件全文・外部 API 本文は入れない。
- エラー: 安全コードへ写像（partner_loan_not_found/inactive/version_conflict/invalid_period/invalid_url/duplicate_key ほか）。SQLSTATE/SQL/テーブル名/RPC 内部名/stack を画面へ出さない。
- 既知の UX 割り切り（セキュリティ・整合性の問題ではない）: 提携ローン登録/更新フォームは validation エラー時に入力値を保持せず ?e=validation / ?e=save で戻す。URL query に入力値・内部メモは載せない。

## Phase 2A-3a 追記（勤務・収入情報＝財務 PII の可視性・権限・監査）

- 値の可視性: `case_applicant_employment_income` の SELECT は「顧客本人(participant)」のみ（RLS `caei_select_own` = app_participant_owns_applicant）。スタッフ(SALES_USER/ORGANIZATION_ADMIN)・SYSTEM_ADMIN への直接 SELECT ポリシーは置かない。authenticated への GRANT は SELECT のみ（INSERT/UPDATE/DELETE は付与しない）。
- スタッフ進捗: 値を返さない safe RPC `app_list_case_employment_income_progress` のみ（フラグ + updated_at）。認可は「当該案件 org の active ORGANIZATION_ADMIN、または当該案件の active 担当営業」。`app_can_staff_access_case` は SYSTEM_ADMIN も許可するため流用せず、SYSTEM_ADMIN を除外したガードをインラインで用いる。非該当は 0 件（情報差を出さない）。
- SYSTEM_ADMIN: 値テーブル・進捗 RPC のいずれも不可（意図的に除外）。
- 書込: 直接 DML 禁止。SECURITY DEFINER 業務関数のみ・search_path 固定・public/anon execute 剥奪・authenticated へ最小 GRANT。純粋関数・ガード関数は public/anon/authenticated/service_role から execute 剥奪（定義者コンテキスト専用）。service role は一般画面で不使用。
- 案件状態: opened/inputting 以外は更新不可（customer_case_not_inputtable）。申込者 active 必須。初回入力で opened→inputting。
- 日付: 入社年月は月初へ正規化。未来日は RPC + TS で拒否（CHECK は下限のみ・current_date 不使用）。
- 監査: `case_applicant_employment_income.created`(初回作成) と `.updated`(完了状態の遷移 incomplete↔complete)のみ記録し、毎回の autosave では書かない。metadata は applicant_id(resource_id)/changed_field_names/completeness_transition/correlation_id のみ。入力値/財務/PII は一切入れない。
- エラー: 安全コード（invalid_employment_income_field / invalid_employment_started_on / invalid_annual_income / customer_case_not_inputtable / applicant_not_active / not_authorized 等）へ写像。SQLSTATE/SQL/テーブル名/RPC 内部名は画面へ出さない。財務値はログ/URL/エラーメッセージへ出さない。
