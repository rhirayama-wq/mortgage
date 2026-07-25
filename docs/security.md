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

## 8. PII・秘密
ログ・URL・監査 metadata へメールアドレス等の PII を出さない（login 失敗ログはアドレス自体を抑制）。シード・テストは架空データのみ（fictional / test only 明記）。本番 Supabase 接続・本番 Magic Link 送信・本番シークレット設定は禁止。

## 9. 本番前の残リスク（phase1-validation.md と対応）
- PostgREST / GoTrue / Mailpit / 実 JWT による主要検証は完了（Mac 実機 `npm run verify:supabase` 28/28 PASS / `npm run e2e:local` 7/7 PASS）。
- ただし以下 4 分類は **PENDING**（PASS 扱いにしない・Phase 1 完了を妨げない追加検証バックログ / phase1-validation.md §2）:
  - B10-refresh（middleware token refresh の強制。期限切れ/間近トークンの強制手段が未整備）
  - B13-HTTP（Next.js Server Action / route handler 経由の実 HTTP 失敗監査経路。HTTP 統合 E2E 未実装）
  - AUTH-11 実機（DB/RLS 障害を「所属なし」と区別し /error へ振り分ける経路の実機確認。判定ロジックは実装・unit 検証済み）
  - AUTH-12..16（ロール別認可 / 他法人 ID 拒否 / invited・suspended・left 状態別拒否の認証済みセッション E2E。判定純関数は OFFLINE_UNIT_PASS）
- Magic Link の受信および使用済みリンクの再利用拒否は GoTrue local で確認済み（`npm run e2e:local` B8 PASS）。有効期限の境界値・期限切れリンクの時間経過を伴う追加検証は未実施
- 初回 SYSTEM_ADMIN の本番ブートストラップ手順は運用手順書化が必要（app_bootstrap_first_system_admin を migration 管理経路で1回実行）
