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
- user_profiles: 本人 / SYSTEM_ADMIN / 同一法人 active メンバー（definer helper 経由）
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
