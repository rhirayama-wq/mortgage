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
- service_role: 直接テーブル権限なし（`app_record_failure_audit` の EXECUTE のみ）

## 3. RLS ポリシー一覧
| テーブル | SELECT | 書込 |
|---|---|---|
| user_profiles | 本人 or SYSTEM_ADMIN or 同一法人メンバー | UPDATE 本人のみ（display_name 列 GRANT と併用） |
| organizations | invited/active/suspended 所属者 or SYSTEM_ADMIN | ポリシーなし（業務関数のみ） |
| organization_memberships | 本人 or 当該法人 org admin or SYSTEM_ADMIN | ポリシーなし |
| authoritative_audit_logs | SYSTEM_ADMIN 全件 / org admin 自法人 | ポリシーなし（追記は definer 関数内） |

ヘルパー（app_is_system_admin 等）は SECURITY DEFINER・search_path='' で RLS 再帰を回避。
NULL 三値論理: system_role 比較は `is not distinct from` を使用。

## 4. 業務関数の並行制御（SEC-61..64 対応）
実行順序（全書込関数で統一）:
1. `pg_advisory_xact_lock`（SYSTEM_ADMIN 集合=グローバル (815001,1) / 法人=(815002, hashtext(org_id))）
2. **ロック取得後に認可を再確認**（認可確認後にロック待ちしない）
3. 対象行 `SELECT ... FOR UPDATE`
4. 状態・遷移・人数の再確認（最後の管理者保護）
5. 更新 → `GET DIAGNOSTICS row_count = 1` 検証
6. 成功監査を同一トランザクションで記録

トリガー（membership_guard / last-admin backstops / audit append-only）は二重防御であり、並行競合の主防御ではない。

## 5. 監査
- 成功: 業務関数内で同一 Tx（`app_write_audit`）。actor は auth.uid() から決定。クライアントは actor/success/action を指定できない。
- 失敗: DB 例外で Tx ごとロールバック → **サーバー（Server Action）が例外捕捉し、service_role で `app_record_failure_audit` を別 Tx 実行**（実装: `src/lib/auth/audit.ts`, 呼出: `pending-invitation/actions.ts`）。
- metadata に PII 本文・財務情報・JWT・秘密情報を入れない。error_code は既知の短いコードへ正規化（`toSafeErrorCode`）。

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
- PostgREST / GoTrue / Inbucket / 実 JWT での検証未了（SUPABASE_PENDING）
- Magic Link 有効期限・再利用拒否は GoTrue 実環境でのみ最終確認可能
- 初回 SYSTEM_ADMIN の本番ブートストラップ手順は運用手順書化が必要（app_bootstrap_first_system_admin を migration 管理経路で1回実行）
