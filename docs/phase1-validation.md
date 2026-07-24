# phase1-validation.md — Phase 1 検証実績（再構築版）

実施日: 2026-07-24 / 環境: クラウドサンドボックス（Docker 不可・npm レジストリ遮断）

> **レビュー承認（2026-07-24）**: Phase 1A DB 層は
> 「PostgreSQL ハーネス上の静的・RLS・GRANT・状態遷移・監査・並行実行レビュー完了」として承認済み
> （migration の SHA-256 一致・終了コード0・SEC-62..87 を含む全テスト PASS をレビュアーが実ファイルで確認）。
> **これは Phase 1 全体の完了ではない。** 正式 npm verify / lockfile / CI / 実 Supabase local /
> PostgREST / GoTrue / Inbucket / Magic Link 実環境 / Cookie 実機 / E2E は PENDING、Phase 1 は継続中、
> Phase 2 未着手。残作業の手順は docs/phase1-remaining-runbook.md。
> 非ブロッキングの将来課題は assumptions.md U18..U21 に記録。

## 1. 実行済み検証

### 1.1 PGハーネス（PostgreSQL 16.13 + 擬似 Supabase ロール/auth スキーマ）
- `scripts/pg-harness/run.sh` により migration `0001_phase1_identity_org_rls.sql` を
  `ON_ERROR_STOP` で適用 → 成功。
- seed.sql（架空ブートストラップ）適用 → 成功。
- **FUNC-01..16 / SEC-01..09,11..16 / SEC-62..87 / CONC-01..04: 全て PASS**（test-cases.md 参照）。
  - 2026-07-24 レビュー対応 r3 で追加: SEC-76..80（SYSTEM_ADMIN による法人操作と revoke の並行直列化。
    invite/role/status 変更はグローバル→法人の両ロック取得へ変更）、SEC-81（ロック取得順の静的検証）、
    SEC-82（timeout/lock_timeout によりデッドロック・無期限待機を PASS 扱いにしない）、
    SEC-83..85（失敗監査 actor の DB 側整合検証）、SEC-86..87（correlation ID 冪等 unique index）。
  - 2026-07-24 レビュー対応で追加: SEC-62..65（法人管理関数の SYSTEM_ADMIN 集合ロック＋ロック後再認可の並行検証）、
    SEC-66..70（user_profiles の SALES_USER 越権遮断）、SEC-71..75（専用失敗監査関数の DB 側制約）。
  - SEC-10（旧: 同一法人メンバー相互のプロフィール可視）は SALES_USER への email 露出のため**仕様ごと撤回**し、
    SEC-66..70 に置換。
- 実行コマンド: `PGHOST=/tmp PGPORT=5433 PGUSER=postgres bash scripts/pg-harness/run.sh`

### 1.2 アプリ純粋ロジック
- unit test 41/41 PASS（`npm run test:offline` 相当: tsx v4.21 / Node v22.22。正式ランナー Vitest での再実行は npm ci 後に CI で実施）。
- 純粋モジュールの strict typecheck PASS（tsc 6.0.3, `tsconfig.pure.json`）。

## 2. 未検証（PENDING）と理由

### 2.1 SUPABASE_PENDING（Docker 必須 — 本サンドボックスでは実行不可）
supabase start / db reset、PostgREST 経由の RLS・列GRANT・RPC、実 JWT
（anon/authenticated/service_role）、GoTrue Magic Link 発行・有効期限・
**使用済みリンク再利用拒否**、Inbucket 受信、招待メール一致 E2E、
middleware Cookie refresh の実機確認、失敗監査別 Tx の実機確認、AUTH-01..19 の E2E。

実施先候補: (a) ユーザーの Mac + Docker Desktop + Supabase CLI、(b) CI（DinD 構成 workflow を追加）。
`.github/workflows/ci.yml` の pg-harness ジョブは GitHub Actions 上で再現可能。

### 2.2 レジストリ遮断による PENDING（本サンドボックス固有）
`npm run typecheck` / `lint` / `build`（node_modules 未取得のため）。
`npm install` 可能な環境で `npm run verify` を実行すること。
unit test は依存ゼロ構成のため本環境でも実行済み（1.2）。

## 3. ハーネスの限界（PG_HARNESS_PASS ≠ Phase 1 完了）
- 擬似 auth.uid()/JWT は GoTrue の実トークン検証を代替しない。
- PostgREST のスキーマキャッシュ・RPC 呼出規約・エラー変換は未検証。
- service_role の BYPASSRLS はハーネスで付与したが、実 Supabase の権限構成
  との差異があり得る。
- Magic Link の有効期限・ワンタイム性は GoTrue の挙動であり SQL 層では検証不能。

## 3.5 現在の状態一覧（レビュー項目5対応・正確な区分）
| 項目 | 状態 |
|---|---|
| Phase 0 コード | 再構築済み（成果物レビュー中） |
| pure typecheck | 実行済み PASS（tsc 6.0.3・本環境） |
| offline unit (41件) | 実行済み PASS（`npm run test:offline`・本環境） |
| 正式 `npm run verify`（typecheck/lint/Vitest/build） | **PENDING**（npm 利用可能環境で実行） |
| CI | **定義済みだが未成立**（package-lock.json 未生成のため npm ci が失敗） |
| package-lock.json 生成 | **PENDING** |
| 実 Supabase local | **PENDING**（Docker 必須） |

## 4. Phase 1 受入条件との対応（12.2）
| 受入条件 | 状態 |
|---|---|
| Magic Link ログイン成立・再利用不可 | SUPABASE_PENDING |
| 未所属 / suspended / left の法人アプリ拒否 | 判定ロジック APP_PASS + layout 実装済み / E2E PENDING |
| 他法人データ越境不可（URL/payload 改変含む） | SQL 層 PG_HARNESS_PASS / PostgREST 層 PENDING |
| SYSTEM_ADMIN 単独で法人アプリ・顧客案件へ入れない | 判定 APP_PASS + layout 実装済み |
| profile email/system_role 直接更新不可 | PG_HARNESS_PASS |
| 法人・membership 直接書込不可（業務関数のみ） | PG_HARNESS_PASS |
| 最後の SYSTEM_ADMIN / ORGANIZATION_ADMIN の並行 0 人化不可 | PG_HARNESS_PASS (CONC-01/02) |
| 成功監査同一Tx / 失敗監査別Tx | PG_HARNESS_PASS (FUNC-02/15) / アプリ経路実機 PENDING |
| middleware refresh 後 Cookie が redirect でも維持 | 実装済み / 実機 PENDING |
| 全 typecheck/lint/unit/build/E2E + AUTH/SEC | unit・pure typecheck・DB系 PASS / 残り PENDING |

**結論: Phase 1 は「継続中」。** DB 層と純粋ロジックは検証済みだが、
実 Supabase ローカル検証と `npm run verify` が完了するまで Phase 1 完了と
みなさない（CLAUDE.md §24, §27）。
