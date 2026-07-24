# test-cases.md — テスト定義と実行状態

状態区分（CLAUDE.md §24 をレビュー指示 2026-07-24 で拡張）:
`DEFINED` / `PG_HARNESS_PASS` / `OFFLINE_UNIT_PASS` / `SUPABASE_LOCAL_PASS` / `APP_PASS` / `SUPABASE_PENDING` / `APP_PENDING` / `PENDING` / `FAILED`
- `OFFLINE_UNIT_PASS` = `npm run test:offline`（node:test シム）で合格。Vitest 正式実行は npm ci 後
- `APP_PENDING` = Next.js アプリ実行系（build / E2E / 実機挙動）が未検証

> 注: 前チャットの旧番号体系（SEC-01..64 等）は成果物喪失により失われた。
> 本書の ID が再構築後の正。旧 SEC-61..64（ロック後再認可）は CONC-01/02 と
> security.md §4 の実装規約に対応する。

## 1. UNIT
正式ランナー: **Vitest**（`npm run test` = `vitest run`。テストは `import { test } from "vitest"` ＋
`node:assert/strict`）。npm レジストリ不通環境向けフォールバック: `npm run test:offline`
（tsconfig.offline-test.json の paths で "vitest" をシムへ解決し node:test で実行。
アサーションが node:assert のため両ランナーで同一挙動）。
本環境では `test:offline` で 41/41 実行済み。Vitest 本体での実行は `npm ci` 後に CI で行う。
| ID | 内容 | 状態 |
|---|---|---|
| UNIT-BPS-01..07 | bps 変換・整数保持・丸め・表示・ラウンドトリップ | OFFLINE_UNIT_PASS |
| RUNTIME-01..08 | uuid / enum / membership行 / profile行 の実行時検証（fail closed） | OFFLINE_UNIT_PASS |
| AUTH-02a..c | メール正規化・形式検証 | OFFLINE_UNIT_PASS |
| AUTH-04a..06d | open redirect 防止（絶対URL/プロトコル相対/バックスラッシュ/scheme/制御文字/資格情報/長さ） | OFFLINE_UNIT_PASS |
| AUTH-07a..c | OTP type 許可リスト（email/magiclink のみ。recovery/invite/signup 拒否） | OFFLINE_UNIT_PASS |
| AUTH-12a..13c, 20a..b | access 判定（未所属/招待中/停止/終了/SYSTEM_ADMIN優先/複数法人の決定的選択） | OFFLINE_UNIT_PASS |

## 2. DB: 機能（PGハーネス = PostgreSQL 16.13 + 擬似 Supabase ロール。実行済み）
| ID | 内容 | 状態 |
|---|---|---|
| FUNC-01 | auth.users → profile 自動作成・email 小文字ミラー | PG_HARNESS_PASS |
| FUNC-02 | create/invite/accept の成功監査が同一Txで残存 | PG_HARNESS_PASS |
| FUNC-03 | 招待メール不一致 accept 拒否 | PG_HARNESS_PASS |
| FUNC-04 | 他人の招待 accept 拒否 (42501) | PG_HARNESS_PASS |
| FUNC-05 | 本人 accept 成功 + 監査 | PG_HARNESS_PASS |
| FUNC-06/07 | role 変更は active のみ / active への変更成功 | PG_HARNESS_PASS |
| FUNC-08 | suspend→reactivate→end、left 終端 | PG_HARNESS_PASS |
| FUNC-09/10 | 最後の管理者 demote/suspend/end 拒否 / 2人目がいれば成功 | PG_HARNESS_PASS |
| FUNC-11/12/13 | 重複招待・未登録メール・アーカイブ法人への招待拒否 | PG_HARNESS_PASS |
| FUNC-14 | SYSTEM_ADMIN grant/revoke、最後の1人 revoke 拒否 | PG_HARNESS_PASS |
| FUNC-15 | 失敗監査を service_role 別Txで記録 | PG_HARNESS_PASS |
| FUNC-16 | bootstrap 2回目拒否 | PG_HARNESS_PASS |

## 3. DB: セキュリティ（PGハーネス。実行済み）
| ID | 内容 | 状態 |
|---|---|---|
| SEC-01 | anon の全テーブルアクセス拒否 | PG_HARNESS_PASS |
| SEC-02 | JWT なし authenticated は RLS で 0 行 | PG_HARNESS_PASS |
| SEC-03 | 直接 INSERT/UPDATE/DELETE 全拒否（6経路） | PG_HARNESS_PASS |
| SEC-04 | display_name のみ更新可、email/system_role 列 GRANT なし | PG_HARNESS_PASS |
| SEC-05 | 他人 profile 更新は 0 行 | PG_HARNESS_PASS |
| SEC-06 | テナント越境 SELECT 不可（org/membership/profile/audit） | PG_HARNESS_PASS |
| SEC-07/08 | SALES は監査 0 行 / org admin 自法人のみ / SYSTEM_ADMIN 全件 | PG_HARNESS_PASS |
| SEC-09 | invited は法人名のみ・他 membership 不可視 | PG_HARNESS_PASS |
| SEC-10 | （廃止→SEC-66..70 へ置換。旧仕様「同一法人メンバー相互可視」は SALES への email 露出のため撤回） | - |
| SEC-11 | 監査 UPDATE/DELETE は superuser でも拒否 | PG_HARNESS_PASS |
| SEC-12 | membership.organization_id 不変 | PG_HARNESS_PASS |
| SEC-13 | 業務関数の認可 5 経路拒否（sales招待/他法人admin/一般のorg作成/一般のSA付与/他法人停止） | PG_HARNESS_PASS |
| SEC-14 | 内部専用関数の EXECUTE 拒否（SYSTEM_ADMIN でも不可、4関数） | PG_HARNESS_PASS |
| SEC-15 | anon の業務関数 EXECUTE 拒否 | PG_HARNESS_PASS |
| SEC-16 | 認可失敗時に in-band 監査が残らない・対象データ不変 | PG_HARNESS_PASS |
| SEC-66/67 | SALES_USER は同一法人他人の profile 行（email / system_role）取得不可 | PG_HARNESS_PASS |
| SEC-68 | ORGANIZATION_ADMIN は自法人ユーザー profile を SELECT 可 | PG_HARNESS_PASS |
| SEC-69 | ORGANIZATION_ADMIN は他法人ユーザー profile 取得不可 | PG_HARNESS_PASS |
| SEC-70 | 本人は自分の profile を SELECT 可 | PG_HARNESS_PASS |
| SEC-71 | 失敗監査: 許可リスト外 error_code / null actor 等は拒否 | PG_HARNESS_PASS |
| SEC-72 | 失敗監査: action を指定できるシグネチャが存在しない | PG_HARNESS_PASS |
| SEC-73 | 失敗監査: metadata を受け付けるシグネチャが存在しない | PG_HARNESS_PASS |
| SEC-74 | 許可された membership.accept 失敗監査は成功し固定値・org解決が正しい | PG_HARNESS_PASS |
| SEC-75 | success=true を作る失敗監査経路が存在しない（旧汎用関数の不存在含む） | PG_HARNESS_PASS |
| SEC-81 | 複数ロック関数の取得順が global(815001)→org(815002) で統一（pg_get_functiondef 静的検証） | PG_HARNESS_PASS |
| SEC-83 | 失敗監査: membership 本人と異なる actor 指定 → audit_actor_membership_mismatch 拒否（行も残らない） | PG_HARNESS_PASS |
| SEC-84 | 失敗監査: membership 本人の actor 指定 → 成功 | PG_HARNESS_PASS |
| SEC-85 | membership_not_found はサーバー決定 actor で記録（org は null） | PG_HARNESS_PASS |
| SEC-86 | 同一 correlation の同一失敗監査 2 回呼出し → 監査行 1 件（unique index + on conflict do nothing） | PG_HARNESS_PASS |
| SEC-87 | 同一 correlation の success=true / false は別イベントとして共存 | PG_HARNESS_PASS |

## 4. DB: 並行実行（PGハーネス。実行済み）
| ID | 内容 | 状態 |
|---|---|---|
| CONC-01 | 2管理者の並行 end → advisory lock 直列化、後続は last_organization_admin_protected、active 管理者1名残存 | PG_HARNESS_PASS |
| CONC-02 | 2 SYSTEM_ADMIN の相互 revoke → 後続はロック後再認可で拒否、SYSTEM_ADMIN 1名残存 | PG_HARNESS_PASS |
| SEC-62 (CONC-03) | 法人作成のロック待機中に実行者の SYSTEM_ADMIN 取消 → 作成拒否 (not_authorized) | PG_HARNESS_PASS |
| SEC-63 (CONC-03) | rename のロック待機中に実行者取消 → 変更拒否 | PG_HARNESS_PASS |
| SEC-64 (CONC-03) | archive のロック待機中に実行者取消 → 変更拒否 | PG_HARNESS_PASS |
| SEC-65 | 上記拒否操作に success=true 監査が残らず、対象データ不変 | PG_HARNESS_PASS |
| SEC-76 (CONC-04) | SYSTEM_ADMIN が invite のロック待機中に revoke → invite 拒否 | PG_HARNESS_PASS |
| SEC-77 (CONC-04) | 同 role change 待機中に revoke → 変更拒否 | PG_HARNESS_PASS |
| SEC-78 (CONC-04) | 同 suspend 待機中に revoke → suspend 拒否 | PG_HARNESS_PASS |
| SEC-79 (CONC-04) | 同 end 待機中に revoke → end 拒否 | PG_HARNESS_PASS |
| SEC-80 | 拒否された各操作に success=true 監査が残らず membership 不変 | PG_HARNESS_PASS |
| SEC-82 | 並行テストがデッドロックせず所定時間内に終了（timeout 45s + lock_timeout 20s。タイムアウトは FAIL 扱い） | PG_HARNESS_PASS |

## 5. AUTH（アプリ統合。実Supabase 必要分は SUPABASE_PENDING）
| ID | 内容 | 状態 |
|---|---|---|
| AUTH-01 | 登録/未登録で応答差なし（Server Action 実装済み） | DEFINED / SUPABASE_PENDING |
| AUTH-02/03 | サーバー側メール検証・shouldCreateUser=false | 検証ロジックは OFFLINE_UNIT_PASS / 送信経路は SUPABASE_PENDING |
| AUTH-04..06 | open redirect 防止・next 復元 | 純関数 OFFLINE_UNIT_PASS / E2E は SUPABASE_PENDING |
| AUTH-07 | OTP type 実行時検証 | 純関数 OFFLINE_UNIT_PASS / callback 実機は SUPABASE_PENDING |
| AUTH-08 | 失効・使用済みリンクの汎用エラー | DEFINED / SUPABASE_PENDING（GoTrue 必須） |
| AUTH-09/10 | Cookie 保存・middleware refresh・redirect 時維持 | 実装済み / 実機は SUPABASE_PENDING・APP_PENDING |
| AUTH-11 | DB エラーを所属なしと区別し /error | 実装済み / 実機は APP_PENDING |
| AUTH-12..16 | route 直アクセス・ロール別認可・他法人 ID 拒否 | 判定純関数 OFFLINE_UNIT_PASS / E2E・実機は APP_PENDING |
| AUTH-17 | signout POST のみ（GET 405） | 実装済み / E2E は DEFINED・APP_PENDING (auth.spec.ts) |
| AUTH-18 | リンク再利用拒否 | DEFINED / SUPABASE_PENDING（GoTrue 必須） |
| AUTH-19 | 招待メール一致 | DB 層は PG_HARNESS_PASS (FUNC-03) / E2E は SUPABASE_PENDING |
| AUTH-20 | 複数法人所属の決定的処理 | OFFLINE_UNIT_PASS |

## 6. 品質ゲート
| 項目 | 状態 | 備考 |
|---|---|---|
| typecheck (全体) | PENDING | npm レジストリ遮断により node_modules 未取得。`npm run typecheck` で実行 |
| typecheck (純粋モジュール, strict) | 実行済み PASS | `npm run typecheck:pure` を tsc 6.0.3 で本環境実行 |
| lint | PENDING | eslint-config-next 未取得 |
| unit test (offline fallback) | OFFLINE_UNIT_PASS | 41/41（`npm run test:offline`、本環境で実行） |
| unit test (Vitest 正式) | PENDING | `npm ci` 後に `npm run test`（同一ファイル・同一アサーション） |
| production build | PENDING | next 未取得 |
| E2E | DEFINED / APP_PENDING | e2e/auth.spec.ts（実Supabase 環境で実行） |
| CI (GitHub Actions) | 定義済み・**未成立** | package-lock.json 未生成（U16）のため npm ci が失敗する。lockfile コミットまで CI PASS と報告しない |
| package-lock.json 生成 | PENDING | npm 利用可能環境で `npm install` → コミット |
| 正式 `npm run verify` | PENDING | 同上環境で実行 |
