# auth-flow.md — Phase 1 認証・招待の確定フロー

本書はレビュー指摘（招待フローの整合）に対する確定仕様。実装が正
（migration 0001 / `app/src/app/login|auth|pending-invitation` / `src/lib/auth`）。

## 1. ユーザー作成（auth.users）
- **auth.users を作成できるのは SYSTEM_ADMIN の管理操作のみ**（Supabase Admin API
  `auth.admin.createUser` / ローカルは seed・SQL）。
- `shouldCreateUser: false` のため、**Magic Link ログインでユーザーは自動作成されない**。
- Phase 1 にはユーザー作成 UI は無い。運用手順（ローカル/検証環境）:
  1. SYSTEM_ADMIN が Supabase 管理経路でユーザー作成（メールのみ・架空データ）
  2. `app_handle_new_auth_user` トリガーが user_profiles を自動作成
  3. 以後、本人は /login から Magic Link でログイン可能
- 本番の初回 SYSTEM_ADMIN は `app_bootstrap_first_system_admin`（EXECUTE 権限なし＝
  migration 管理経路のみ）を 1 回実行。2 回目は拒否される（FUNC-16 検証済み）。
- ユーザー作成管理画面は Post-Phase1（system console へ追加予定）。

## 2. Supabase Auth の invite 機能は使わない
- GoTrue の `inviteUserByEmail`（OTP type=invite）は**使用しない**。
- 通常ログイン callback は `email` / `magiclink` type のみ受理し、
  `invite` / `recovery` / `signup` を拒否する（otp.ts、AUTH-07）。
- 将来 invite type を使う場合は専用 callback ルートを別途設ける（現フェーズ対象外）。

## 3. 法人招待（membership invite）は独自 RPC
- 招待者: 当該法人の ORGANIZATION_ADMIN または SYSTEM_ADMIN が
  `app_invite_organization_member(org, email, role)` を実行。
- **前提: 招待先メールのユーザーが user_profiles に存在すること**（FK 制約）。
  未登録メールは `invited_user_not_found` で拒否（U9。未登録者の招待は MVP 非対応）。
  → 運用: 先に §1 の手順でユーザー作成 → その後に法人招待。
- 招待メールの自動送信は MVP では行わない（通知は運用で実施。Post-MVP でメール通知）。
  被招待者は通常の /login から Magic Link でログインし、/pending-invitation に招待が表示される。

## 4. メール一致の照合点
- invite 時: 正規化（lower/trim）した招待先メールを `invited_email` に保存。
- accept 時（`app_accept_invitation`）: DB 内で
  ①呼出者 = membership.user_id（本人のみ）
  ②status = 'invited'
  ③**user_profiles.email（auth.users のミラー）と invited_email の一致**
  を検証。不一致は `invite_email_mismatch` で拒否（FUNC-03 検証済み）。
- email ミラーは auth.users の INSERT/UPDATE トリガーで同期（FUNC-01 検証済み）。

## 5. フロー全体（確定）
```text
[SYSTEM_ADMIN] admin API でユーザー作成 ──> auth.users ──trigger──> user_profiles
[ORG_ADMIN]    app_invite_organization_member(email) ──> membership(invited, invited_email)
[本人]         /login で Magic Link 送信（Server Action, shouldCreateUser:false）
               ──> /auth/callback（token_hash + type∈{email,magiclink} 検証）
               ──> / ──> decideLanding ──> /pending-invitation
[本人]         受諾ボタン ──> Server Action ──> rpc app_accept_invitation
               （本人・invited・メール一致・法人非アーカイブを DB 内で再検証）
               成功: invited→active + 同一Tx監査 / 失敗: 別Tx失敗監査 + 汎用エラー表示
```

## 6. 既知の制約（assumptions 対応）
- U9: 未登録メール招待は不可（法人管理者にアカウント存在が伝わる点は内部ツールとして許容・要最終確認）
- U10: 同一法人で left 後の再招待は不可（unique(org,user) + left 終端）
- 招待メール通知・ユーザー作成 UI は Post-Phase1
