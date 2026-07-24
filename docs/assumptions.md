# assumptions.md — 確定事項・未確定事項・変更履歴

基準日: 2026-07-24 / 本書は要件定義書と実ファイルを正とする。矛盾時は実ファイルを確認して解消する。

## 0. セッション状況（重要・2026-07-24 再開時）
- **前チャットの実コードは失われた**（ユーザー確認済み）。前セッションはエフェメラルなクラウドコンテナで動作し、
  成果物が Project・ユーザー端末・git のいずれにも永続化されていなかった。
- したがって現在の正は **要件定義書 docx（引継ぎ資料）** と、本再開セッションで再構築する実ファイルである。
- 再発防止として、設計文書は本 Project（claude.ai Project）へ永続化する。コードは git 初期化のうえ、
  可能ならユーザーの端末フォルダまたは git リモートへ保存する（未確定: 保存先）。

## 1. 環境制約（本クラウドサンドボックス）
- Node v22 / npm 10 / psql 16.13 / PostgreSQL 16.13 サーバ（ローカル起動）/ tsc 6.0.3 / eslint 10 / tsx 4.21 利用可。
- **npm・PyPI・apt レジストリへのエグレスが遮断**（host_not_allowed）。`npm install` 不可
  → next/@supabase 等の node_modules を要する typecheck・lint・build は本環境で実行不能。
  依存ゼロの純粋モジュール検証（tsc + `npm run test:offline` シム）と PostgreSQL ハーネスで代替し、
  残りは `npm run verify` を npm 取得可能環境で実行する。
- **Docker は利用不可**（デーモン未起動）。**Supabase CLI 未導入**。
  → `supabase start` に依存する **PostgREST / GoTrue / Inbucket / Magic Link / 実JWT 検証は本環境では実行不可**。
  → 実Supabaseローカル検証は Docker 可能環境（ユーザーの Mac に Docker Desktop、または CI）で行う必要がある。
- ローカル PostgreSQL サーバは要インストール（psql クライアントのみ既存）。SQLレベルのハーネス検証は再現可能。
- 本番Supabaseへは接続しない。本番Magic Link送信・本番ユーザー作成・本番シークレット設定を行わない。

## 2. 確定要件（勝手に変更しない。変更には理由・影響範囲・本書更新が必要）

### 2.1 ロール
- `SYSTEM_ADMIN`（`user_profiles.system_role`。法人所属ロールではない）
- 法人所属ロールは `ORGANIZATION_ADMIN` と `SALES_USER` の2種のみ（`organization_memberships.role`）。

### 2.2 ユーザーと所属
- `user_profiles`（auth.users と1対1、email は auth 所有のミラー、system_role を保持）
- `organization_memberships`（user と organization を N:N、unique(org,user)、role/status を保持）
- 一人のユーザーが複数法人へ所属できる構造を維持する。

### 2.3 共通商品マスタ（原則 organization_id を持たない・法人ごとに複製しない）
- `lenders` / `loan_products` / `loan_product_versions` / `product_rules`

### 2.4 法人固有オーバーレイ（organization_id を持つ）
- `organization_lender_settings` / `organization_product_settings` / `organization_product_overrides`

### 2.5 商品バージョン
- `loan_products`=論理商品、`loan_product_versions`=時点別条件、`product_rules`=商品バージョンに紐付く
  （ルール単独の valid_from/valid_to は持たない）。
- 公開(published)バージョンの有効期間重複は禁止。draft 同士は重複許可。公開時に重複検証。暗黙優先で1版を選ばない。

### 2.6 検索結果の再現性
- 検索時点の 商品バージョン / 適用ルール / 閾値 / 適用金利 / 適用手数料 / 入力 / 判定 / 理由 / 実行日時 を保存。
- 複数ルール評価履歴は `mortgage_search_result_rules` で保持。マスタ変更後も過去結果を不変に再現。

### 2.7 判定区分と集約
- 区分: `MATCH` / `POSSIBLE` / `REVIEW_REQUIRED` / `NOT_ELIGIBLE` / `INSUFFICIENT_DATA`
- 集約優先度: `NOT_ELIGIBLE > REVIEW_REQUIRED > POSSIBLE > INSUFFICIENT_DATA > MATCH`
- 情報不足のみを理由に NOT_ELIGIBLE と推定しない。未評価の必須ルールが残る場合 MATCH を返さない。
- MATCH は reasonCode 0件可。他ステータスは1件以上。表示ステータスには customerMessage 必須。
- 決定性: 同一入力・同一商品version・同一ルールversion なら同一結果。

### 2.8 単位
- 金額=整数円（`*_yen`）。金利・料率=整数bps（`*_bps`、100bps=1.00%）。
- 計算では bps 整数を維持し、表示時のみ % 変換。表示値を金融計算へ再利用しない。

### 2.9 セキュリティ確定原則（security.md に詳細）
- 認証と認可を分離。UI状態を認可根拠にしない。重要認可はサーバー側＋RLS。
- クライアント送信の organizationId/role を信頼しない。RLS を最終防御線に。列GRANT を明示。
- 直接テーブル書込でなく監査付き業務関数を使用。監査は `authoritative_audit_logs`。
  成功監査は業務変更と同一Tx、失敗監査はサーバーが例外捕捉し別Txで記録。
- SYSTEM_ADMIN でも顧客案件を当然には閲覧できない（業務理由・追加確認・監査が必要）。
- membership / system admin 集合の並行更新はアドバイザリロックで直列化。
- SECURITY DEFINER は search_path 固定。不要な EXECUTE を public/anon/authenticated へ付与しない。
- PII・財務情報・JWT・秘密情報をログ/監査metadata へ出さない。本番相当個人情報をシード/テストに入れない。

## 3. 未確定事項（仮定で実装しない。決まり次第ここを更新）
| # | 論点 | 暫定方針（実装をブロックしない範囲） |
|---|---|---|
| U1 | Magic Link 有効期限の具体値 | Supabase 既定を採用し、値は環境設定で外出し。確定後に設定 |
| U2 | 複数 active 法人所属時の organization 選択・デフォルト保持方式 | データ構造は複数所属可のまま。MVP UI は「単一 active のみ自動遷移、複数は選択画面（暫定）」 |
| U3 | SYSTEM_ADMIN かつ invited のみの場合、system console と招待画面のどちらを優先するか | 暫定: system console 優先（招待は保留表示）。要決定 |
| U4 | UI 言語（日本語推奨） | **推奨: 日本語へ統一**。新規UIは日本語で実装。最終決定は要確認 |
| U5 | SALES_USER の案件ソフト削除可否 | 暫定: 不可（Post-MVP で検討）。案件はソフト削除カラムを構造として確保 |
| U6 | 案件・結果 CSV 出力を MVP に含めるか | 暫定: 含めない（Post-MVP） |
| U7 | CSV 更新照合の自然キー | 未定。商品CSVは Phase 2 で設計。lender_code + product_code + version_effective_from を候補 |
| U8 | 法人がルール閾値自体を override する要件の有無 | 暫定: 無し（表示可否・推奨順位・金利等の表層オーバーレイのみ）。閾値overrideは要件確認後 |
| U9 | 招待は既存 auth ユーザーのみ対象（shouldCreateUser=false 前提。ユーザー作成は SYSTEM_ADMIN が admin API で実施） | invite 関数は未登録メールへ invited_user_not_found を返す。法人管理者へアカウント存在が伝わるが、内部業務ツールとして許容。要最終確認 |
| U10 | 同一法人からの left 後の再招待 | unique(org,user) + left 終端のため MVP では不可。要件が出たら遷移設計を再検討 |
| U11 | Zod の導入時期 | CLAUDE.md §7 は「Zodまたは明示的実行時検証」を許容。Phase 1 は依存ゼロの明示検証（validators.ts）で実装（レジストリ遮断下でも実テスト可能なため）。Phase 2 のフォーム実装時に Zod + RHF を導入 |
| U12 | ORGANIZATION_ADMIN の監査ログ閲覧範囲 | 暫定: 自法人分のみ閲覧可（RLS で制限）。要プロダクト確認 |
| U13 | unit test ランナー | **確定（レビュー指摘反映）: 正式ランナーは Vitest**（`npm run test`）。テストは `import {test} from "vitest"` + node:assert/strict で記述。レジストリ不通環境用に `npm run test:offline`（tsconfig paths で vitest→node:test シム解決）を併設。シムは node_modules 存在時には使用されない |
| U15 | Magic Link 再送クールダウンの実効性 | Cookie ベース（httpOnly, 60秒, タイムスタンプのみ保存・メールアドレスは保存もログもしない）。**クライアント協調型でありサーバー側レート制限ではない**（Cookie 破棄で回避可能・複数インスタンス非共有）。実防御は GoTrue 側のメール送信レート制限に依存。サーバー側レート制限（正規化メールの HMAC キー等）は Post-MVP 課題 |
| U16 | package-lock.json | 本サンドボックスはレジストリ不通のため**生成不能・未コミット**。最初に `npm install` 可能な環境で lockfile を生成しコミットすること。それまで CI の `npm ci` ジョブは失敗する（既知・意図的に隠さない） |
| U17 | SALES_USER への同僚表示名の開示 | 2026-07-24 レビューで user_profiles の同一法人相互可視を撤回（SALES_USER に email 等を露出するため）。現行: 本人＋ORGANIZATION_ADMIN＋SYSTEM_ADMIN のみ。案件担当者名表示等で SALES_USER に表示名が必要になった場合は、user_id と display_name のみを返す専用ビュー/関数を追加する（user_profiles 全体は開けない） |
| U14 | shadcn/ui の導入時期 | Phase 1 画面は素の Tailwind（CLI がレジストリ遮断で実行不可、かつ §5「不要な依存追加禁止」）。Phase 2 フォーム群から導入 |

## 3.1 CLAUDE.md 内の既知の不整合（CLAUDE.md §1 に基づく記録）
| # | 箇所 | 問題 | 扱い |
|---|---|---|---|
| D1 | CLAUDE.md §36「現在地」 | 「Phase 0 概ね完了」「Phase 1 DB設計 PGハーネス予備検証済み」「Magic Link UI 途中」は**前チャット時点の状態**。実際にはその成果物（コード・SQL・テスト）は喪失済みで、2026-07-24 から要件定義書を正として再構築中。 | §36 はユーザー指定の原文のまま維持。実際の現在地は本ファイル §0 と phase1-validation.md を正とする。再構築で同状態へ到達し次第、乖離は解消される |
| D2 | CLAUDE.md §38「直近の停止点」の Supabase local / PostgREST / JWT / Inbucket 項目 | 本クラウドサンドボックスは Docker 不可のため、これらは本環境では実行不能（§1 環境制約）。 | Docker 可能環境（ユーザーMac の Docker Desktop または CI）で実施。実施までは Phase 1 を「継続中」とし完了扱いにしない |

## 4. 変更履歴
- 2026-07-24: 前チャット成果の喪失を確認。要件定義書を正として Phase 1 を再構築する方針を確定。
  環境制約（Docker不可 → 実Supabase検証は別環境）を記録。feature-map.md を新規作成。
- 2026-07-24: ユーザー指定の CLAUDE.md（38章構成）を作成。§36 の「現在地」記述と実状態の乖離を D1、
  §38 停止点の実Supabase項目の環境制約を D2 として記録。
- 2026-07-24 (レビュー対応 r2): ①法人管理3関数（create/rename/archive）に SYSTEM_ADMIN 集合
  グローバルロックを追加しロック後認可へ統一（SEC-62..65 追加・PASS）。②user_profiles の
  同一法人相互可視ポリシーを撤回し ORGANIZATION_ADMIN 限定へ（app_can_administer_profile、
  SEC-66..70 追加・PASS、U17）。③汎用失敗監査 RPC を廃止し専用関数
  app_record_membership_accept_failure へ（DB側で action/resource/success/metadata 固定・
  error_code 許可リスト、SEC-71..75 追加・PASS）。④テストランナー表記を Vitest 正式へ統一（U13）。
  migration 0001 は未適用・未共有のため直接修正（CLAUDE.md §33 の条件確認済み）。
