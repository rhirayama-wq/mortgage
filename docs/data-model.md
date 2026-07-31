# data-model.md — Phase 1 データモデル

基準: `app/supabase/migrations/0001_phase1_identity_org_rls.sql`（実ファイルが正）。
Phase 2 の案件・商品マスタ・検索テーブルは未実装（phase1-plan.md 参照）。

## ER 概要（Phase 1）

```text
auth.users 1 ──── 1 user_profiles ──── * organization_memberships * ──── 1 organizations
                        │
                        └ system_role (SYSTEM_ADMIN | null)   ※法人所属ロールではない

authoritative_audit_logs（追記専用・全業務関数から記録）
```

## テーブル

### user_profiles
| 列 | 型 | 説明 |
|---|---|---|
| id | uuid PK → auth.users(id) | 1:1 |
| email | text not null unique | auth 所有のミラー（小文字化 CHECK）。直接 UPDATE 不可 |
| display_name | text | 本人のみ更新可（列 GRANT） |
| system_role | system_role enum / null | SYSTEM_ADMIN のみ。業務関数でのみ変更 |
| created_at / updated_at | timestamptz | updated_at はトリガー |

auth.users とのミラー同期: `app_handle_new_auth_user`（INSERT）, `app_sync_auth_user_email`（email UPDATE）。

### organizations
| 列 | 型 | 説明 |
|---|---|---|
| id | uuid PK | gen_random_uuid |
| name | text not null (1..200) | |
| archived_at | timestamptz / null | null=稼働中。アーカイブ後は招待不可 |

### organization_memberships（user × org は unique）
| 列 | 型 | 説明 |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid FK | **不変**（法人移動は left→invite→accept） |
| user_id | uuid FK | 不変 |
| role | organization_role enum | ORGANIZATION_ADMIN / SALES_USER |
| status | membership_status enum | invited / active / suspended / left |
| invited_email | text not null | 招待時のメール（受諾時に本人メールと一致検証） |
| invited_by / invited_at / accepted_at / status_changed_at | | |

許容遷移: invited→active(本人acceptのみ) / active→suspended / suspended→active / invited・active・suspended→left / left=終端。role 変更は active のみ。トリガー `membership_guard` が全遷移を二重防御。

### authoritative_audit_logs（追記専用）
| 列 | 型 |
|---|---|
| id | bigint identity PK |
| occurred_at | timestamptz |
| actor_user_id | uuid / null（bootstrap は null） |
| action | text（例: membership.invite） |
| organization_id / resource_type / resource_id | |
| success | boolean |
| error_code / correlation_id / metadata(jsonb) | PII・財務・JWT・秘密を入れない |

UPDATE/DELETE はトリガーで全ロール拒否（superuser 含む）。

## enum
- `system_role`: SYSTEM_ADMIN
- `organization_role`: ORGANIZATION_ADMIN, SALES_USER
- `membership_status`: invited, active, suspended, left

## RLS（詳細は security.md）
- user_profiles: 本人 / SYSTEM_ADMIN / 当該法人の active ORGANIZATION_ADMIN（definer helper `app_can_administer_profile`。SALES_USER は他人の行を参照不可）
- organizations: 所属者（invited/active/suspended）と SYSTEM_ADMIN のみ SELECT
- organization_memberships: 本人 / 当該法人 ORGANIZATION_ADMIN / SYSTEM_ADMIN
- authoritative_audit_logs: SYSTEM_ADMIN 全件、ORGANIZATION_ADMIN 自法人分
- **書込ポリシーは全テーブルに存在しない**（業務関数のみ）

## Phase 2 予定（未実装・確定設計のみ記載）
共通マスタ: lenders / loan_products / loan_product_versions / product_rules（organization_id なし）。
法人オーバーレイ: organization_lender_settings / organization_product_settings / organization_product_overrides。
案件: customer_cases ＋子テーブル（全て organization_id ＋ RLS）。
検索: mortgage_searches / mortgage_search_results / mortgage_search_result_rules（スナップショット再現）。
単位: 金額=BIGINT 円 `*_yen` / 料率=整数 bps `*_bps`。

## Phase 2A-1（実装済み: 0002_phase2a_customer_cases.sql）— 顧客案件の土台
基準: `app/supabase/migrations/0002_phase2a_customer_cases.sql`（実ファイルが正）。診断値（融資承認確率・借入可能額）はモゲチェック側 API が算出し、本フェーズでは扱わない。

### enum
- `customer_case_status`: draft, invited, opened, inputting, cancelled, expired（将来状態は未追加）
- `case_applicant_type`: primary, co_applicant / `case_applicant_status`: active, removed
- `case_invitation_status`: invited, accepted, expired, cancelled
- `case_participant_role`: primary_applicant, co_applicant

### テーブル
- **customer_cases**: organization_id(不変・テナント) / assigned_membership_id(不変・当該org active SALES_USER|ORGANIZATION_ADMIN) / status / case_name / desired_price_yen(BIGINT円) / created_by。hard delete 禁止（status=cancelled）。guard `customer_case_guard` が不変列・許容遷移を二重防御。
- **case_applicants**: 主/共同を同一テーブル。case_id/applicant_type 不変。1案件 primary 最大1（partial unique index）。
- **case_applicant_profiles**: PII（氏名/カナ/生年月日/email/電話/郵便/住所）を分離（1:1）。監査/URL/ログへ複製しない。業務関数経由で書込。
- **case_invitations**: token/Magic Link URL は保存しない。invited_email は lower(btrim) 正規化。applicant ごと invited は1件（partial unique）。correlation_id 一意で冪等。accepted/cancelled/expired は終端。
- **case_participants**: 認証ユーザー↔申込者（顧客は org 非所属可）。applicant ごと1参加者（unique）。作成のみ（guard が update/delete 禁止＝付替え不可）。

### RLS（SELECT のみ・書込は業務関数のみ）
customer_cases: participant または staff(app_can_staff_access_case=assigned active agent / 当該org ORGANIZATION_ADMIN / SYSTEM_ADMIN)。case_applicants/PII: 顧客は自分の申込者のみ、スタッフは案件の全申込者（顧客は共同申込者PII不可視）。case_invitations: スタッフのみ。case_participants: 本人 or スタッフ。helper は SECURITY DEFINER・search_path 固定。

### 業務関数（SECURITY DEFINER・監査付き・advisory lock 815002=法人/815003=案件）
app_create_customer_case / app_invite_case_applicant / app_accept_case_invitation（本人メール一致必須・membership 非要求）/ app_add_case_participant（内部）/ app_transition_customer_case_status。監査 action: customer_case.created / case_applicant.created / case_invitation.created / case_invitation.accepted / case_participant.added / customer_case.status_changed（PII を metadata に入れない）。