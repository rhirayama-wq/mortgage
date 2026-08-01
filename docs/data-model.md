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
## Phase 2A-2a 追記（0003_phase2a2_applicant_profile.sql）

基準: `app/supabase/migrations/0003_phase2a2_applicant_profile.sql`（実ファイルが正）。
本フェーズは新規テーブルを追加しない。既存 `case_applicant_profiles`(PII, 0002) を顧客本人が
更新できる業務関数と、被招待者による自招待の可視化のみを追加する。

### 追加関数
- `app_current_user_email()`: RLS 用に現在ユーザーの正規化メールを返す（SECURITY DEFINER・STABLE）。
- `app_update_own_applicant_profile(applicant_id, full_name, full_name_kana, birth_date, email, phone, postal_code, address, correlation_id)`: 顧客本人が基本情報(PII)を保存（オートセーブ、last-write-wins）。opened→inputting 遷移。認可は `app_participant_owns_applicant`。監査は変更フィールド名のみ。

### 追加 RLS ポリシー
- `case_invitations_select_invitee`: 被招待者本人（status='invited' かつ invited_email = app_current_user_email()）が自分宛招待を SELECT 可。案件本文は participant になるまで不可視。

### 書込経路
- `case_applicant_profiles` への直接 UPDATE 権限は authenticated に付与しない。更新は業務関数のみ。
- PII は監査 metadata / URL / ログへ出さない（監査は {"fields":[...変更列名]}）。

## 標準ローンと organization 提携ローンの概念分離（Phase 2A-2b で実装・本フェーズ未実装）

| 種別 | 管理主体 | テナント可視性 | 編集 |
|---|---|---|---|
| MFS 標準ローン | MFS / モゲチェック | 全 org 共有（読取） | org は編集不可 |
| organization 提携ローン | 各不動産会社(org 管理者) | org 固有・他 org 不可視 | 当該 org 管理者のみ |

標準ローンは CLAUDE.md §12 の共通マスタ（lenders / loan_products / loan_product_versions / product_rules、organization_id なし）に対応。提携ローンは organization_id ＋ RLS でテナント分離。

想定テーブル（Phase 2A-2b で定義・概念のみ）: lending_institutions / loan_products / organization_partner_loans(organization_id) / organization_partner_loan_versions / partner_loan_eligibility_rules。

責任分界: 融資承認確率・借入可能額はモゲチェック API が算出し、ローンチェッカーは登録・管理・表示のみ（標準・提携で共通）。診断結果は標準/提携を区別せず公平に統合表示する。

バージョン/スナップショット/分離: 提携ローン条件は版管理し、診断実行時点の条件を固定保存して過去診断を再現（§13/§15 に整合）。org 提携ローンは organization_id ＋ RLS で他社の商用条件が越境しないことを保証。

## Phase 2A-2b 追記（0004_phase2b_partner_loans.sql・提携ローン基盤）

基準: `app/supabase/migrations/0004_phase2b_partner_loans.sql`（実ファイルが正）。

### テーブル
- `lending_institutions`（金融機関マスタ・共有参照・organization_id なし）: id, stable_key(unique), display_name, status。架空データのみ。find-or-create（stable_key で冪等）。
- `organization_partner_loans`（org 固有の論理エンティティ）: organization_id(不変), lending_institution_id(不変), stable_key(org内 unique), display_name, status(draft/active/inactive), current_version_id, last_confirmed_at, created_by/updated_by_membership_id。hard delete 禁止（inactive 化）。
- `organization_partner_loan_versions`（append-only・完全 immutable）: version_number(単調増加, unique(loan,version)), 商品条件一式（金利=bps・金額=円・LTV=bps・物件/雇用種別=text[]・団信/開示/内部メモ=text・application_url=https・valid_from/until・confirmed_at）。UPDATE/DELETE 禁止。

### enum
partner_loan_status(draft/active/inactive), lending_institution_status(active/inactive), partner_interest_rate_type(variable/fixed/fixed_period), partner_handling_fee_type(fixed_yen/rate_bps)。

### RLS（テナント分離）
- lending_institutions: 何らかの active メンバーのみ SELECT（顧客・非メンバー不可視）。
- organization_partner_loans: 自 org ORG_ADMIN=全 status / SALES=active のみ。
- versions: 親ローンが admin 可視のときのみ（内部メモを含むため管理者限定）。SALES/顧客向けの安全な列は定義者関数 app_list_org_active_partner_loans（内部メモ非含有・有効期間内のみ）で提供。
- 他 org は全テーブル不可視（0 件・not found と not authorized の情報差を漏らさない）。

### version 方針・診断スナップショット（将来）
- 条件変更は新 version を append し過去 version を上書きしない。current_version_id で現行を明示。更新 RPC は expected_current_version_id を取り、不一致で partner_loan_version_conflict。
- 将来の診断結果保存（本フェーズ未実装・YAGNI により空テーブルは追加しない）: case_id, applicant_id, partner_loan_id, partner_loan_version_id, correlation_id, モゲチェック商品識別子, 診断日時, 承認確率, 借入可能見込み額, 想定金利, 結果有効期限, scoring model version, response status。診断時点の version を参照して当時条件で再現する。

### 標準ローンとの概念分離
- 標準ローン=MFS/モゲチェック管理（共通マスタ §12）、提携ローン=organization 管理。両方の承認確率をモゲチェック API が算出し、ローンチェッカーは結果を表示のみ（算出しない）。提携だからと上位固定しない。将来の表示順は承認確率・金利・費用・借入可能額・条件適合性等を総合。顧客向けに商品区分を明示。最終審査は金融機関。診断結果は保証ではない。
- 今回未実装: 診断 API 実接続・承認確率計算・標準ローン商品マスタ本格実装・統合診断画面。

## Phase 2A-3a 追記（0005_phase2a3a_employment_income.sql・申込者の勤務・収入情報）

基準: `app/supabase/migrations/0005_phase2a3a_employment_income.sql`（実ファイルが正）。

### テーブル
- `case_applicant_employment_income`（申込者と 1:1・財務 PII）: applicant_id(PK/FK→case_applicants), employer_name(text ≤200), employment_type(enum), employment_started_on(date・月初正規化), annual_gross_income_yen(bigint 円 ≥0), income_type(enum), created_at, updated_at。全業務列 nullable（部分保存）。version 履歴なし。hard delete 禁止（ガード）。applicant_id 不変（ガード）。
- 保存 5 項目のみ。勤務先電話番号・業種・職種・見込/手取り年収・複数収入源・既存借入・購入物件・希望借入条件は本フェーズ対象外（2A-3b/2A-3c 以降）。
- CHECK: employer_name 長さ 1..200、annual_gross_income_yen ≥0、employment_started_on ≥ '1900-01-01'。※ 未来日拒否は CHECK に `current_date` を使わず（IMMUTABLE 前提のため）RPC/TS 側で行う。

### enum
- applicant_employment_type: full_time / contract / part_time / self_employed / executive / pension / unemployed / other。
- applicant_income_type: salary / business / pension / other。

### 完了(complete)判定 — 唯一の正は DB 純粋関数
- `app_employment_income_is_complete(...)` / `app_employment_income_missing_fields(...)`（IMMUTABLE）。雇用形態別の条件付き必須ルールはこの純粋関数のみが持つ（TS へ重複させない）。
  - 給与系(full_time/contract/part_time/executive): employment_type + employer_name + employment_started_on + annual_gross_income_yen + income_type。
  - self_employed / pension / other: employment_type + annual_gross_income_yen + income_type。
  - unemployed: employment_type のみ。
  - employment_type が null なら常に incomplete。
- TS(`src/lib/customer-cases/employment-income.ts`)は形式・型・長さ・日付範囲のみ検証し、完了判定は行わない。

### RPC
- `app_upsert_own_applicant_employment_income(...)` returns table(updated_at, is_complete, missing_fields)。順序は 0003 プロフィール RPC を踏襲（解決→case advisory lock 815003→本人認可→状態検証(opened/inputting)→値検証/正規化→UPSERT→opened→inputting→監査→完了返却）。
- `app_own_employment_income_progress(applicant_id)`（本人のみ・値は返さず完了/不足のみ）。
- `app_list_case_employment_income_progress(case_id)`（スタッフ向け・値なし＝applicant_id, has_employment_input, has_income_input, is_required_input_complete, updated_at のみ。SYSTEM_ADMIN 除外）。
