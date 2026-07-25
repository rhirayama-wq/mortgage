# CLAUDE.md

## 1. このファイルの位置付け

このファイルは、本プロジェクトにおけるClaudeの最上位の開発ルールである。
Claudeは、コード、SQL、設計書、テスト、README、設定ファイルを変更する前に、必ず本ファイルを確認すること。
他の文書や既存コードと本ファイルが矛盾する場合は、原則として本ファイルを優先する。
ただし、本ファイル自体に矛盾、古い仕様、実装不能な記述がある場合は、勝手に解釈して実装せず、問題点を報告し、`docs/assumptions.md`へ記録すること。

## 2. プロジェクト概要

本プロジェクトは、不動産会社向けの住宅ローン検索・比較・提案支援プラットフォームである。
最終ゴールは、以下を融合した独自の住宅ローンプラットフォームを構築することである。

* TERASS「Loan Checker」が解決している、不動産事業者向け住宅ローン検索・比較・提案・案件支援領域
* MFS「モゲチェック」が提供する、住宅ローン診断・ランキング・比較・シミュレーション・申込支援領域

ただし、他社製品の画面、文章、ソースコード、内部仕様、営業秘密、非公開条件を複製・推測してはならない。
公開情報、ユーザーから適法に提供された情報、MFSが正当に保有する情報を基に、独自のUI、データモデル、ルール、ワークフローとして設計すること。

## 3. 最終ゴール

最終的には、以下を一気通貫で実現する。

1. 不動産会社が顧客案件を登録する
2. 顧客または営業担当者が属性・収入・借入・希望条件を入力する
3. 購入予定物件の情報を入力する
4. 複数金融機関の住宅ローンを検索する
5. 商品ごとに適合性、審査可能性、理由、要確認事項、不足情報を表示する
6. 金利、団信、手数料、月返済額、総返済額等を比較する
7. 提案書・資金計画書を作成する
8. 顧客が申込候補を選択する
9. 事前審査・正式審査へ接続する
10. 必要書類、申込、審査、承認、契約、融資実行を管理する
11. 審査結果をルール・モデル改善へ利用する
12. 融資実行後も金利変動・借り換え機会を案内する

理想状態は、顧客・物件情報を一度入力すれば、住宅ローン候補の探索、比較、説明、申込、進捗管理まで完結することである。

## 4. 最終ゴールから逆算したMVP方針

最終ゴールを一度に実装してはならない。
最終ゴールへ拡張可能な構造を維持しながら、最初に以下の仮説を検証するMVPを作る。

不動産会社の営業担当者が、顧客属性と購入予定物件の情報を入力すると、検討可能な住宅ローン、対象外商品、要確認商品を理由付きで短時間に把握でき、物件提案・資金計画・住宅ローン案内の質と速度が向上する。

### 4.1 MVPの中核体験

1. 不動産会社ユーザーが安全にログインする
2. 法人所属とロールに応じた画面へ入る
3. 匿名または仮名の顧客案件を作成する
4. 顧客属性、収入、勤務状況、既存借入、希望条件を入力する
5. 物件情報を入力する
6. 住宅ローン商品を検索する
7. 商品ごとに判定区分と理由を表示する
8. 金利、手数料、月返済額、総返済額等を比較する
9. 検索結果を保存する
10. 過去結果を当時の条件で再現する

### 4.2 MVPに含めるもの

* Magic Link認証
* 法人所属
* ロール管理
* RLSによるテナント分離
* 招待・受諾
* ユーザー無効化・所属終了
* 監査ログ
* 匿名案件
* 顧客条件
* 勤務・収入
* 既存借入
* 希望借入条件
* 物件情報
* 共通金融機関マスタ
* 共通住宅ローン商品マスタ
* 商品バージョン
* 商品ルール
* 法人固有設定
* ルールベース検索
* 判定理由
* 情報不足判定
* 商品比較
* 返済額計算
* 検索結果保存
* 過去結果再現
* CSVプレビュー・明示確定
* ユーザー管理
* 監査ログ閲覧

### 4.3 初期MVPに含めないもの

* 機械学習による実際の融資承認確率
* 本番プレ審査連携
* 金融機関API
* 正式審査申込
* 書類OCR
* 電子契約
* 融資実行管理
* 高度な提案書自動生成
* 完全な顧客セルフサービス
* AI住宅ローンアドバイザー
* 審査結果学習モデル
* 借り換え継続監視
* 金利通知
* CAPS等との本番連携
* 信用情報機関由来データ
* 実在金融機関の非公開条件

### 4.4 スコープ判断

新機能を発見しても直ちに実装しない。
以下の順で判断する。

1. MVPの中核仮説に必要か
2. 現フェーズの受入条件に必要か
3. セキュリティやデータ整合性に必須か
4. 今実装しないと大きな手戻りになるか
5. 後続フェーズへ送れるか

後から安全に追加できる機能は`Post-MVP`へ送ること。

## 5. 技術構成

原則として以下を使用する。

* Next.js
* App Router
* TypeScript strict
* Tailwind CSS
* shadcn/ui
* Supabase
* PostgreSQL
* Supabase Auth
* PostgreSQL RLS
* React Hook Form
* Zod
* Vitest
* Playwright
* ESLint

新しいフレームワーク、ORM、認証基盤、状態管理ライブラリ、UIライブラリ、監視サービス等を、技術的必要性なく追加してはならない。
依存関係を追加する場合は以下を報告する。

* 追加理由
* 既存機能で代替できない理由
* セキュリティ影響
* バンドルサイズ・運用影響
* ライセンス
* 削除可能性

## 6. ディレクトリと責務

推奨構成：

```text
app/
  src/
    app/
    components/
    lib/
      auth/
      authorization/
      rule-engine/
      supabase/
      units/
    server/
      services/
      repositories/
    types/
  e2e/
  supabase/
    migrations/
    seed.sql
docs/
.github/
CLAUDE.md
README.md
```

責務を分離する。

* UIに業務ロジックを書かない
* 認可判断をUIへ置かない
* DBアクセスをコンポーネントへ散在させない
* ルールエンジンは純粋関数を中心にする
* サーバー処理はServer ActionまたはRoute Handlerへ置く
* DBの重要更新は監査付き業務関数へ集約する

## 7. 型安全

TypeScriptはstrictを維持する。

原則禁止：

* `any`
* 根拠のない型キャスト
* API・DB値の未検証利用
* nullable値の暗黙処理
* enum相当文字列の無検証利用

Supabaseから取得した値も、必要に応じてZodまたは明示的な実行時検証を行う。

SQLではNULL三値論理を考慮する。
特に認可判定で以下を安易に使用しない。

```sql
role = 'ORGANIZATION_ADMIN'
```

NULLを返し得る場合は、`is not distinct from`または明示的な`coalesce`を利用する。

## 8. ロールと認可

### 8.1 ロール

プラットフォーム全体では以下を扱う。

* `SYSTEM_ADMIN`
* `ORGANIZATION_ADMIN`
* `SALES_USER`

法人所属ロールは以下の2つのみ。

* `ORGANIZATION_ADMIN`
* `SALES_USER`

`SYSTEM_ADMIN`は法人所属ロールではない。
`user_profiles.system_role`で管理する。

### 8.2 認証と認可

認証は認可ではない。
ログイン済みでも、以下を毎回確認する。

* user
* system_role
* membership
* membership status
* organization
* resource ownership
* operation permission

UIの表示・非表示は認可根拠にならない。
重要認可は必ず以下で行う。

* サーバー側
* PostgreSQL RLS
* 必要に応じ業務関数内部

### 8.3 SYSTEM_ADMIN

SYSTEM_ADMINは以下を行える。

* 法人管理
* ユーザー管理
* 共通マスタ管理
* システム運用

ただし、顧客案件や財務情報を当然には閲覧できない。
顧客案件を閲覧する場合は以下が必要。

* 業務理由
* 追加の権限確認または再認証
* 時限的アクセス
* authoritative audit
* actor
* organization
* resource
* timestamp
* success
* correlation ID

## 9. マルチテナント

方式：

* 共有DB
* `organization_id`
* PostgreSQL RLS

すべての法人所有テーブルに`organization_id`を持たせる。
ただし、共通マスタは持たない。

共通マスタ：

* `lenders`
* `loan_products`
* `loan_product_versions`
* `product_rules`

クライアント送信の`organizationId`を信頼しない。
現在の認証ユーザーとactive membershipから導出する。
URL変更、ペイロード変更、ID推測、API直接実行、ブラウザ状態変更による越境を防ぐ。

## 10. ユーザーと所属

認証ユーザーと法人所属を分離する。

* `user_profiles`
* `organization_memberships`

1ユーザーが複数法人に所属できる構造を維持する。

membership status：

* `invited`
* `active`
* `suspended`
* `left`

許容遷移：

* 新規招待：なし → invited
* 受諾：invited → active
* 停止：active → suspended
* 再開：suspended → active
* 終了：invited / active / suspended → left
* role変更：activeのみ
* leftは原則終端

法人移動は`organization_id`のUPDATEでは行わない。
以下の順で行う。

1. 旧membershipをleft
2. 新法人からinvite
3. 本人がaccept

直接INSERT・UPDATEではなく、監査付き業務関数を使用する。

## 11. 金額・年率・料率

金額：

* 円単位の整数
* `BIGINT`
* カラム名は`*_yen`

金利・料率：

* basis pointsの整数
* 100bps = 1.00%
* カラム名は`*_bps`

異なる単位を同一カラムへ保存しない。
変換は共通関数のみ使用する。

* `bpsToPercent`
* `percentToBps`
* `formatPercentFromBps`

計算ではbps整数を保持する。
表示時のみ%へ変換する。
表示用の値を金融計算へ再利用しない。

## 12. 商品マスタと法人固有設定

### 12.1 共通マスタ

* `lenders`
* `loan_products`
* `loan_product_versions`
* `product_rules`

共通マスタは原則`organization_id`を持たない。

### 12.2 法人固有オーバーレイ

* `organization_lender_settings`
* `organization_product_settings`
* `organization_product_overrides`

法人別に以下を保持できる。

* 提携有無
* 表示可否
* 推奨順位
* 特別金利
* 特別手数料
* 内部メモ
* 独自表示名称

共通商品を法人ごとに複製してはならない。

## 13. 商品バージョニング

`loan_products`は論理商品。
`loan_product_versions`は時点別の商品条件。
`product_rules`は`loan_product_version_id`へ紐付く。

公開バージョン同士の有効期間重複は禁止する。

* draft同士の重複：許可
* draft→published：重複検証
* 重複あり：公開拒否
* 暗黙の優先順位：禁止
* 評価時に複数publishedが見つかった場合：整合性エラー

過去結果は、当時の商品バージョンで再現可能にする。

## 14. ルールエンジン

判定区分：

* `MATCH`
* `POSSIBLE`
* `REVIEW_REQUIRED`
* `NOT_ELIGIBLE`
* `INSUFFICIENT_DATA`

集約優先度：

```text
NOT_ELIGIBLE
> REVIEW_REQUIRED
> POSSIBLE
> INSUFFICIENT_DATA
> MATCH
```

ルール：

* 情報不足だけで対象外と推測しない
* 評価可能なhard rule違反があればNOT_ELIGIBLEを優先
* 未評価ルールが残る状態でMATCHを返さない
* MATCHはreasonCode 0件でも可
* MATCH以外はreasonCode 1件以上
* 表示対象ステータスにはcustomerMessageを持たせる
* internalMessageは任意
* 同一入力・同一バージョンでは同一結果を返す

実在金融機関の具体的閾値は、提供されていない限り仮定しない。
テスト用閾値は必ず以下を明記する。

* fictional
* test only
* production use prohibited

## 15. 検索結果の再現性

検索時点の以下を保存する。

* 入力
* 商品バージョン
* 適用ルール
* ルールバージョン
* 閾値スナップショット
* 適用金利
* 適用手数料
* 判定
* 理由
* 実行時刻
* organization
* actor

複数ルール履歴は`mortgage_search_result_rules`に保存する。
単一の`rule_version_id`だけで済ませてはならない。

## 16. CSVインポート

CSV対象：

* 金融機関
* 商品
* 商品バージョン
* 商品ルール

顧客案件CSVはMVP対象外。

処理順：

1. アップロード
2. 全行検証
3. 新規・更新候補・エラー・重複へ分類
4. プレビュー
5. 管理者確認
6. 明示確定
7. 監査ログ

禁止：

* 自動upsert
* 無言の部分取込
* エラー行だけを勝手にスキップ
* CSV内のorganization_idを信用
* 数式の実行
* 未知enumの受入れ

## 17. 認証

MVPの認証方式はSupabase AuthのMagic Link。

要件：

* 有効期限
* 使用済みリンク再利用不可
* メール確認
* 招待先メールとログインメール一致
* 未所属ユーザー拒否
* 将来MFAを追加可能
* `shouldCreateUser: false`
* 本番でない限り本番メールを送らない

Magic Link送信はブラウザから直接実行せず、Server ActionまたはRoute Handlerへ集約する。
メール送信画面では、登録済み・未登録の違いを推測できない共通応答にする。
Supabaseの内部エラーを画面へそのまま出さない。
callbackでは許可されたOTP typeを実行時検証する。
open redirectを防止する。
signoutはPOSTで行う。

## 18. Route単位の認可

middlewareは主に以下を担当する。

* セッション更新
* 認証有無確認
* Cookie反映
* 未認証リダイレクト

middlewareだけで業務認可を完了させない。

法人アプリのlayoutでは以下を確認する。

* 認証済み
* active membershipあり
* 対象organizationへのactive membership
* 必要なrole

SYSTEM_ADMIN画面では以下を確認する。

* `system_role = SYSTEM_ADMIN`

招待画面では以下を確認する。

* 本人のinvited membership
* 対象メール一致
* 遷移元がinvited

DB・RLS・Authエラーを「所属なし」と同一扱いにしない。

## 19. 監査

権威ある監査ログは`authoritative_audit_logs`。
クライアントから直接INSERTしてはならない。

成功監査：

* 業務操作と同一トランザクション
* 変更成功後に記録
* actor_idは認証コンテキストから決定
* successはクライアント指定不可

失敗監査：

* DB関数内でINSERT後に例外を投げない
* 例外で同一トランザクションがロールバックされるため
* サーバーが例外を捕捉
* service-role監査サービスが別トランザクションで記録

ログへPII本文、財務情報全文、JWT、秘密情報を入れない。

## 20. 並行実行

SYSTEM_ADMIN集合の変更はグローバルなトランザクションアドバイザリロックを使用する。

対象：

* bootstrap
* grant
* revoke

法人管理者集合に影響する操作は、法人単位アドバイザリロックを使用する。

対象例：

* invite
* accept
* role change
* suspend
* reactivate
* end

原則順序：

1. アドバイザリロック
2. ロック取得後に再認可
3. 対象行の`FOR UPDATE`
4. 状態再確認
5. 更新
6. 行数確認
7. 成功監査

トリガーは二重防御として残すが、トリガー単独で並行競合を防げると考えない。

## 21. SECURITY DEFINER

すべての`SECURITY DEFINER`関数で以下を行う。

* `search_path`固定
* publicからEXECUTE revoke
* anonから不要なEXECUTE revoke
* authenticatedへの付与は必要な公開業務関数だけ
* service_roleへの付与も必要最小限
* 動的SQLへユーザー入力を渡さない
* `current_user`が関数所有者になることを考慮する
* `current_user`だけで実呼出者を判断しない

## 22. GRANT / REVOKE

Supabaseの既定権限に依存しない。
各テーブルについて、最初に明示的にrevokeする。

```sql
revoke all on table ... from anon, authenticated, service_role;
```

その後、必要な権限だけgrantする。

例：

* authenticated：SELECT
* user_profiles：UPDATE(display_name)のみ
* email/system_role：UPDATE不可
* service_role：直接テーブル権限は原則付与せず、必要な関数のみ

関数も全件、publicからrevokeしたことを確認する。

## 23. 個人情報・金融情報

以下を機微情報として扱う。

* 氏名
* メール
* 電話
* 住所
* 生年月日
* 年収
* 勤務先
* 雇用形態
* 既存借入
* 返済額
* 物件情報
* 申込情報
* 審査情報
* 書類
* トークン
* セッション
* 金融機関の非公開条件

禁止：

* ログへの全文出力
* URLへの埋込み
* スクリーンショットへの露出
* シードへの実データ
* テストへの実顧客データ
* コミットへの秘密情報
* `NEXT_PUBLIC_`へのservice role key設定

## 24. テスト

最低限実行する。

* typecheck
* lint
* unit test
* production build
* RLSテスト
* GRANTテスト
* 認証テスト
* 越境テスト
* 監査テスト
* 並行実行テスト
* Playwright E2E

テストは以下を区別する。

* `DEFINED`
* `PG_HARNESS_PASS`
* `SUPABASE_LOCAL_PASS`
* `APP_PASS`
* `PENDING`
* `FAILED`

PostgreSQLハーネスで通っても、実Supabase、PostgREST、GoTrue、Mailpitの検証が必要な項目は完了扱いにしない。
失敗テストを隠さない。
テストを通すために期待結果を弱めない。

## 25. ドキュメント

以下を常に最新に保つ。

* `CLAUDE.md`
* `README.md`
* `docs/assumptions.md`
* `docs/data-model.md`
* `docs/security.md`
* `docs/rule-engine.md`
* `docs/screens.md`
* `docs/test-cases.md`
* `docs/implementation-plan.md`
* `docs/phase1-plan.md`
* `docs/phase1-validation.md`

仕様・DB・認可・挙動を変更した場合は、コードだけでなく関連文書を同時更新する。
古い設計を変更履歴以外へ残さない。

## 26. assumptions.md

未確定事項を推測して実装しない。

以下は`docs/assumptions.md`へ記録する。

* 未確定な業務ルール
* 閾値
* 審査条件
* 外部連携仕様
* 運用ルール
* 保存期間
* CSV一意キー
* 例外権限
* 将来機能
* 法的確認事項

各項目に以下を記載する。

* ID
* 内容
* 現在の仮置き
* 確定／未確定
* 判断者
* 影響範囲
* 決定日

## 27. フェーズ制御

一度に複数フェーズを進めない。

各フェーズで以下を明示する。

* 目的
* 対象
* 対象外
* 変更ファイル
* 受入条件
* テスト
* 停止点

受入条件が満たされない場合、次フェーズへ進まない。

Phase 0

* プロジェクト初期化
* strict設定
* lint
* unit test
* build
* units共通関数
* CI

Phase 1

* Supabase Auth
* Magic Link
* user_profiles
* organizations
* organization_memberships
* system role
* RLS
* GRANT
* authoritative audit
* 招待・受諾
* route認可
* 実Supabaseローカル検証

Phase 1は以下が通るまで完了扱いにしない。

* Magic Link
* Mailpit
* 使用済みリンク再利用拒否
* PostgREST
* anon/authenticated/service_role
* RLS
* 列GRANT
* middleware Cookie refresh
* route layout認可
* membershipエラー処理
* signout POST
* AUTHテスト
* SEC対象テスト

## 28. 作業開始時のルール

新しいチャット・新しい作業セッションでは、最初に以下を行う。

1. `CLAUDE.md`を読む
2. `README.md`を読む
3. `/docs`を読む
4. 現在のgit statusを確認
5. 現在のブランチを確認
6. 未コミット差分を確認
7. 直前の完了報告を確認
8. 実装済み・未検証・未実装を分離
9. 現フェーズを特定
10. 作業計画と停止点を提示

確認前に大量のコードを書かない。

## 29. 変更前のルール

変更前に以下を整理する。

* 変更目的
* 変更対象
* 変更しないもの
* セキュリティ影響
* データ移行影響
* テスト計画
* ドキュメント更新
* 停止点

重大な設計変更を無断で行わない。

以下は重大変更とする。

* 認証方式
* ロール
* RLS
* テーブル構造
* 商品バージョン
* ルールエンジン
* 監査方式
* 単位
* 外部API
* 個人情報保存
* 本番接続
* 新規依存
* MVPスコープ

## 30. 完了報告

各作業の完了報告は以下の形式とする。

Implemented

* 実装したもの
* ユーザー可視挙動
* 主要設計判断

Files changed

* ファイル
* 変更理由

Validation performed

* typecheck
* lint
* unit
* build
* DB
* RLS
* E2E
* 実行結果

Security review

* 認証
* 認可
* テナント分離
* ログ
* PII
* secrets
* export
* concurrency

Documentation

* 更新した文書
* assumptions追加

Remaining risks

* 未実装
* 未検証
* 実Supabase待ち
* 本番前確認

Phase status

* 完了
* 継続中
* ブロック中

テスト未完了の場合、完了と報告しない。

## 31. 停止点

以下の場合は一度停止して報告する。

* フェーズ受入条件まで完了した
* DBマイグレーションを作成した
* 実Supabaseへ適用する直前
* 本番環境操作が必要になった
* 重大な未確定事項が見つかった
* セキュリティ設計変更が必要になった
* 外部API・有料サービス追加が必要になった
* 実在金融機関の非公開条件が必要になった
* テストが失敗し原因が設計にある
* ユーザー判断が必要なスコープ変更がある

ただし、既に承認済みのフェーズ内で、軽微なバグ修正・テスト修正・文書整合を行うたびに停止する必要はない。

## 32. 本番操作の禁止

明示的な許可がない限り、以下を行わない。

* 本番Supabaseへ接続
* 本番DBマイグレーション
* 本番ユーザー作成
* 本番Magic Link送信
* 本番メール送信
* 本番シークレット設定
* 実顧客データ登録
* 実金融機関の非公開条件登録
* 本番データ削除
* 外部金融機関API呼出し
* 課金サービス契約
* ドメイン・DNS変更

## 33. Git・ファイル操作

* ユーザーの既存変更を消さない
* 不明なファイルを削除しない
* `git reset --hard`を使用しない
* 未コミット差分を上書きしない
* 秘密情報をコミットしない
* 自動生成物を必要なくコミットしない
* マイグレーションを過去改変する場合は、まだ共有・適用前か確認する
* 適用済みマイグレーションは原則新規マイグレーションで修正する

## 34. 品質原則

* 小さく実装する
* 既存設計を尊重する
* 重複を増やさない
* 過度に抽象化しない
* 将来要件を推測して複雑化しない
* 金融計算をUIへ置かない
* 認可をフロントエンドへ置かない
* 不明な値を勝手に補完しない
* エラーを握りつぶさない
* 障害を権限なしとして処理しない
* fail closedを維持する
* ただし障害と正常な拒否を区別する
* 説明可能性を維持する
* 過去結果の再現性を壊さない

## 35. Loan Checker・モゲチェック調査

最終ゴール設計のため、公開情報を調査して機能マップを維持する。

分類：

* 公開情報で確認済み
* ユーザー提供資料で確認済み
* 推測
* MVP採用
* Post-MVP
* Final Goal
* 不採用
* 法的・契約確認必要

「全機能」を、未確認情報で埋めてはならない。
公開されていない内部仕様を推測しない。
他社のUI、文章、コードをコピーしない。

## 36. 現在地

現時点では以下の状態である。

* Phase 0：完了
* Phase 1 DB設計：PostgreSQLハーネス（PostgreSQL 16.13）で検証済み
* 実Supabase local：検証済み（Mac実機 `npm run verify:supabase` 28/28 PASS）
* PostgREST：検証済み
* GoTrue：検証済み
* Mailpit：検証済み（Magic Link受信・使用済みリンク再利用拒否）
* Magic Link UI・サーバ実装：完了
* 認証関連コード：修正完了（`npm run verify` PASS / Vitest 41/41 / `npm run e2e:local` 7/7 PASS）
* CI（GitHub Actions）：実走行PASS（Run #4 / commit `2bbae3b`・全ジョブgreen）
* Phase 1：機能実装・主要実機検証・CI実走行は完了（Phase 1クローズ）
* 既知残課題4分類（B10-refresh / B13-HTTP / AUTH-11実機 / AUTH-12..16）：PENDING。Phase 1完了を妨げない追加検証バックログとして継続管理し、PASS扱いにしない
* Phase 2：未着手（着手しない）
* 顧客案件機能：未着手
* 商品検索：未着手
* 最終ゴール：Loan Checker＋モゲチェック融合
* 直近目標：Phase 1は安全に完了済み。以後は既知残課題4分類の追加検証
* その後の目標：MVP完成

## 37. 現在のPhase 1で優先する事項

**状態（2026-07-25）: 以下の優先事項は実装・主要実機検証が完了している**（Mac実機 `npm run verify` / `npm run verify:supabase` 28/28 / `npm run e2e:local` 7/7、CI Run #4・commit `2bbae3b` 全ジョブgreen）。既知残課題4分類（B10-refresh / B13-HTTP / AUTH-11実機 / AUTH-12..16）はPENDINGのままであり、PASS扱いにしない。本リストは再検証時のチェックリストとして維持する。

1. Magic Link送信のサーバー化
2. callbackの安全化
3. middlewareのCookie維持
4. membership/profile取得エラー処理
5. runtime型検証
6. open redirect防止
7. OTP type検証
8. route group/layout認可
9. 招待受諾
10. no-access処理
11. signout POST
12. AUTHテスト
13. Supabase local
14. PostgREST
15. JWT
16. RLS
17. column GRANT
18. Mailpit
19. 使用済みリンク再利用拒否
20. 失敗監査の別トランザクション実装

## 38. 直近の停止点

以下が完了した時点で停止して報告する。

**状態（2026-07-25）: 以下はすべて完了し、報告済み（Phase 1クローズ）。** 既知残課題4分類（B10-refresh / B13-HTTP / AUTH-11実機 / AUTH-12..16）はPENDINGのままで、PASS扱いにしない。Phase 2は未着手。本リストは再実行時のチェックリストとして維持する。

* 認証コード修正
* Server ActionまたはRoute HandlerによるMagic Link送信
* callback安全化
* middleware Cookie維持
* layout単位認可
* membership取得エラー処理
* signout POST
* AUTHテスト
* typecheck
* lint
* unit test
* build
* Supabase local
* PostgREST
* JWT
* Mailpit
* Magic Link
* 使用済みリンク再利用拒否

本番Supabaseには接続しない。
