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

## 8. PII・秘密
ログ・URL・監査 metadata へメールアドレス等の PII を出さない（login 失敗ログはアドレス自体を抑制）。シード・テストは架空データのみ（fictional / test only 明記）。本番 Supabase 接続・本番 Magic Link 送信・本番シークレット設定は禁止。

## 9. 本番前の残リスク（phase1-validation.md と対応）
- PostgREST / GoTrue / Mailpit / 実 JWT による主要検証は完了（Mac 実機 2026-07-26: `npm run verify:supabase` **28/28 PASS** / `npm run e2e:local` **24/24 PASS を 2 回連続** / `npm run e2e:auth` **17/17 PASS** / Vitest **55/55 PASS**）。24 件の内訳は **既存 E2E 7 + auth setup 1 + 認証済み E2E 16（AUTH-E2E-12..27）**で、auth setup は業務テスト 16 件とは別に数える。
- **AUTH-12..16（ロール別認可 / 他法人 ID 拒否 / invited・suspended・left 状態別拒否の認証済みセッション E2E）は SUPABASE_LOCAL_PASS**（§7.1 / test-cases.md §5.1・B17）。**限界: Phase 1 に ORGANIZATION_ADMIN 専用の HTTP ルートが無いため、ORGANIZATION_ADMIN と SALES_USER の管理操作差分は HTTP 層では未検証。DB 層のロール差分は PG harness で検証済みであり、HTTP 層で検証できるロール境界は SYSTEM_ADMIN 境界のみ。**
- **B13-HTTP（Next.js Server Action 経由の実 HTTP 失敗監査経路）は SUPABASE_LOCAL_PASS**（§5・AUTH-E2E-26/27）。旧記述にあった「`failure-audit write failed` は B13-HTTP の既知ログ」という注記は、実装により解消したため削除した。実測（2026-07-26）では AUTH-E2E-25 / 27 とも `refused_by_guard` の warn のみで、`failure-audit write failed` は出力されない。
- ただし以下 3 分類は **PENDING**（PASS 扱いにしない・Phase 1 完了を妨げない追加検証バックログ / phase1-validation.md §2）:
  - B10-refresh（middleware token refresh の強制。期限切れ/間近トークンの強制手段が未整備）
  - AUTH-11 実機（DB/RLS 障害を「所属なし」と区別し /error へ振り分ける経路の実機確認。判定ロジックは実装・unit 検証済み）
  - Magic Link 有効期限の境界検証（期限切れリンクの時間経過を伴う検証。強制手段が未整備）
- npm audit の high severity 12 件は、上記テストの PENDING とは**別枠**のセキュリティ負債として管理する（`npm audit fix` / `--force` / `--legacy-peer-deps` は使わない）。
- 実 Supabase local 検証（`verify:supabase` / `e2e:local`）の **CI 化**も別枠バックログ（現状は Mac 実機のみ）。
- Magic Link の受信および使用済みリンクの再利用拒否は GoTrue local で確認済み（`npm run e2e:local` B8 PASS）。有効期限の境界値・期限切れリンクの時間経過を伴う追加検証は未実施
- 初回 SYSTEM_ADMIN の本番ブートストラップ手順は運用手順書化が必要（app_bootstrap_first_system_admin を migration 管理経路で1回実行）
