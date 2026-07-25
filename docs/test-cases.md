# test-cases.md — テスト定義と実行状態

状態区分（CLAUDE.md §24 をレビュー指示 2026-07-24 で拡張）:
`DEFINED` / `PG_HARNESS_PASS` / `OFFLINE_UNIT_PASS` / `SUPABASE_LOCAL_PASS` / `APP_PASS` / `SUPABASE_PENDING` / `APP_PENDING` / `PENDING` / `FAILED`
- `OFFLINE_UNIT_PASS` = `npm run test:offline`（node:test シム）で合格（Vitest 正式実行は Mac で 41/41 PASS 済み・§6）
- `APP_PENDING` = Next.js アプリ実行系（build / E2E / 実機挙動）が未検証

> 注: 前チャットの旧番号体系（SEC-01..64 等）は成果物喪失により失われた。
> 本書の ID が再構築後の正。旧 SEC-61..64（ロック後再認可）は CONC-01/02 と
> security.md §4 の実装規約に対応する。

## 1. UNIT
正式ランナー: **Vitest**（`npm run test` = `vitest run`。テストは `import { test } from "vitest"` ＋
`node:assert/strict`）。npm レジストリ不通環境向けフォールバック: `npm run test:offline`
（tsconfig.offline-test.json の paths で "vitest" をシムへ解決し node:test で実行。
アサーションが node:assert のため両ランナーで同一挙動）。
`test:offline` 41/41 PASS（サンドボックス）に加え、**Vitest 本体でも Mac で 41/41 PASS 済み**（`npm run verify` 内）。
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

## 5. AUTH（アプリ統合。大半は Mac 実機で SUPABASE_LOCAL_PASS。既知の残課題 4 分類 = B10-refresh(AUTH-10) / B13-HTTP / AUTH-11 実機 / AUTH-12..16 認証済みロール・状態別 E2E — §7 末尾参照）
| ID | 内容 | 状態 |
|---|---|---|
| AUTH-01 | 登録/未登録で応答差なし（Server Action 実装済み） | **SUPABASE_LOCAL_PASS**（e2e B6・共通応答を実機確認） |
| AUTH-02/03 | サーバー側メール検証・shouldCreateUser=false | 検証ロジック OFFLINE_UNIT_PASS / 送信経路は e2e B6 で実機確認（SUPABASE_LOCAL_PASS） |
| AUTH-04..06 | open redirect 防止・next 復元 | 純関数 OFFLINE_UNIT_PASS / E2E 実機 **SUPABASE_LOCAL_PASS**（AUTH-E2E-05, 3xx 厳格基準） |
| AUTH-07 | OTP type 実行時検証 | 純関数 OFFLINE_UNIT_PASS / callback 実機 **SUPABASE_LOCAL_PASS**（AUTH-E2E-04, 3xx 厳格基準） |
| AUTH-08 | 失効・使用済みリンクの汎用エラー | **SUPABASE_LOCAL_PASS**（e2e B8: 再利用 → /login?e=link） |
| AUTH-09/10 | Cookie 保存・middleware refresh・redirect 時維持 | Cookie 属性・redirect 後維持・セッション維持は **SUPABASE_LOCAL_PASS**（e2e B10/B11）/ **token refresh の強制（AUTH-10 核心）は PENDING**（B10-refresh 未実装） |
| AUTH-11 | DB エラーを所属なしと区別し /error | 実装済み / 実機は APP_PENDING |
| AUTH-12..16 | route 直アクセス・ロール別認可・他法人 ID 拒否 | 判定純関数は OFFLINE_UNIT_PASS。実機は**未認証の保護ルート拒否（/cases→/login, AUTH-E2E-02）のみ SUPABASE_LOCAL_PASS**。**ロール別認可・他法人 ID 拒否・invited/suspended/left 状態別の実機 E2E は APP_PENDING**（各ロールの認証済みセッションを跨ぐ E2E が未実装。過大申告しない） |
| AUTH-17 | signout POST のみ（GET 405） | **SUPABASE_LOCAL_PASS**（GET=405・未認証 POST=303・認証済み POST=303 / Cookie 無効化 / 以後 /cases→/login をすべて実機確認） |
| AUTH-18 | リンク再利用拒否 | **SUPABASE_LOCAL_PASS**（e2e B8: 実 token 1回目成功・2回目 /login?e=link） |
| AUTH-19 | 招待メール一致 | DB 層は PG_HARNESS_PASS (FUNC-03) / 実 Supabase 統合は SUPABASE_LOCAL_PASS（B9, Mac 2026-07-25）/ UI E2E は保留 |
| AUTH-20 | 複数法人所属の決定的処理 | OFFLINE_UNIT_PASS |

## 6. 品質ゲート
| 項目 | 状態 | 備考 |
|---|---|---|
| typecheck (全体) | APP_PASS | 本セッション追加ファイル（scripts/verify-supabase.ts・e2e 拡張）を含む最新コードで Mac PASS（2026-07-25, `npm run verify` 内・エラー0） |
| typecheck (純粋モジュール, strict) | 実行済み PASS | `npm run typecheck:pure` を tsc で実行（本セッション再実行 PASS） |
| lint | APP_PASS | 最新コードで Mac エラー0。`next-env.d.ts`（自動生成）の triple-slash-reference は**内容変更せず** eslint.config.mjs の global ignore で対応 |
| unit test (offline fallback) | OFFLINE_UNIT_PASS | 41/41（`npm run test:offline`、本セッションでも再実行 PASS） |
| unit test (Vitest 正式) | APP_PASS | Vitest 3.2.7 で 41/41 PASS（最新コード, Mac, 2026-07-25） |
| production build | APP_PASS | Next.js 15.5.21 build 成功（全10ルート生成, 最新コード, Mac, 2026-07-25） |
| E2E | **SUPABASE_LOCAL_PASS** | e2e/auth.spec.ts **7/7 PASS**（Mac 2026-07-25。§7 B6..B12/B14/B16） |
| CI (GitHub Actions) | **APP_PASS**（実走行） | Run #4 / commit `2bbae3b` 全ジョブ green（2026-07-25）。Linux / Node v22.23.1 / npm 11.12.1 で `npm ci` → typecheck / lint / unit / build PASS、PostgreSQL harness `PG HARNESS: ALL TESTS PASSED` |
| package-lock.json 生成 | 完了 | Mac で生成・コミット（8add410）。version 欠落 optional スタブを `2bbae3b` で修復し、Linux クリーン環境の `npm ci` 成立を CI で確認 |
| 正式 `npm run verify` | **APP_PASS（最新コード）** | 本セッション追加ファイルを含む状態で typecheck+lint+Vitest(41/41)+build(全10ルート) 全成功（Mac, 2026-07-25）。**verify:supabase 28/28・e2e:local 7/7 も PASS**（下記 §7） |

## 7. Supabase local 自動化（B1..B16 / runbook §B）
Docker + `supabase start` + `supabase db reset`（seed 適用）済みの **Mac ローカル**で実行する。
**実行済み（Mac 2026-07-25）: `verify:supabase` 28/28 全 PASS ＋ `e2e:local` 7/7 全 PASS。**
下表の「状態」列が正（B 表内の PENDING は B10-refresh / B13-HTTP。AUTH 側を含む既知の残課題の全体像は
本節末尾の 4 分類を参照）。**結果を捏造しない。**

実行コマンド:
- B1..B5 / B9 / B13-DB / B15: `cd app && npm run verify:supabase`（`scripts/verify-supabase.ts`）
- B6..B12 / B14 / B16: 初回のみ `npx playwright install chromium`（現行 playwright.config は Chromium のみ・
  全ブラウザ導入は不要）→ `cd app && npm run e2e:local`（`E2E_SUPABASE_LOCAL=1 playwright test`、`e2e/auth.spec.ts`）

| B# | 内容 | 検証手段 | 対応 DB/AUTH | 状態 |
|---|---|---|---|---|
| B1 | auth.users→user_profiles トリガー・email 小文字ミラー | verify-supabase B1-a/b | FUNC-01 | **SUPABASE_LOCAL_PASS**（Mac 2026-07-25） |
| B2 | PostgREST 経由 RLS（テナント越境不可） | verify-supabase B2-* | SEC-01/02/06 | **SUPABASE_LOCAL_PASS**（Mac 2026-07-25） |
| B3 | 列 GRANT（display_name のみ更新可） | verify-supabase B3-* | SEC-04/05 | **SUPABASE_LOCAL_PASS**（Mac 2026-07-25） |
| B4 | anon/authenticated/service_role の挙動差 | verify-supabase B4-* | SEC-01/03 | **SUPABASE_LOCAL_PASS**（Mac 2026-07-25） |
| B5 | 業務 RPC の認可・監査 | verify-supabase B5-* | SEC-07/13/15, FUNC-02 | **SUPABASE_LOCAL_PASS**（Mac 2026-07-25） |
| B6 | Magic Link 送信（共通応答・suite 内 1 通のみ送信） | e2e AUTH-E2E-06 | AUTH-01 | **SUPABASE_LOCAL_PASS**（Mac 2026-07-25, e2e 7/7） |
| B7 | Mailpit 受信: 件名=`ログイン用リンク`・テンプレ固定文言・callback が `token_hash&type=email` | e2e AUTH-E2E-06 | AUTH-07 | **SUPABASE_LOCAL_PASS**（Mac 2026-07-25） |
| B8 | 使用済みリンク再利用拒否（clean client で 2 回目→/login?e=link） | e2e AUTH-E2E-06 | AUTH-18 | **SUPABASE_LOCAL_PASS**（Mac 2026-07-25） |
| B9 | 招待先メール一致: 他人(B)は A の membership を accept 不可・状態/監査不変 | verify-supabase B9-reject/state-intact/no-forged-audit（実 Supabase）+ FUNC-03（DB） | AUTH-19 | DB=PG_HARNESS_PASS / 実 Supabase=**SUPABASE_LOCAL_PASS**（Mac 2026-07-25） |
| B10 | **セッション維持のみ**（別リクエストで未認証へ戻らない） | e2e AUTH-E2E-06 | AUTH-09 | **SUPABASE_LOCAL_PASS**（Mac 2026-07-25。セッション維持の範囲） |
| B10-refresh | middleware token refresh の強制検証（期限切れ/間近トークン） | 未実装 | AUTH-10 | **PENDING**（有効な強制手段が無く未検証。PASS 扱いにしない）|
| B11 | 認証 Cookie 属性（**部分検証**: httpOnly=true（U22 で強制）/ path=`/` / sameSite=Lax / callback redirect 後も存在）。secure はローカル HTTP で false のため固定 assert しない | e2e AUTH-E2E-06 | AUTH-09 | **SUPABASE_LOCAL_PASS**（Mac 2026-07-25。部分検証の範囲） |
| B12 | signout 契約（認証状態に依らず GET=405 / POST=303→/login、認証済み POST 後は auth-token Cookie 消滅、以後 /cases→/login）。**middleware が `/auth/signout` を未認証 redirect 対象から除外し handler へ到達させる修正込み** | e2e: 未認証GET=AUTH-E2E-03(405) / 未認証POST=AUTH-E2E-07(303) / 認証済みPOST・Cookie消滅・/cases→/login=AUTH-E2E-06 | AUTH-17 | **SUPABASE_LOCAL_PASS**（Mac 2026-07-25。全経路実機確認） |
| B13-DB | 失敗監査の別Tx（DB/PostgREST・service_role・correlation・SEC-83/86） | verify-supabase B13a/b/c | FUNC-15, SEC-83/86 | **SUPABASE_LOCAL_PASS**（Mac 2026-07-25） |
| B13-HTTP | Next.js Server Action / route handler 経由の実 HTTP 失敗監査経路 | 未実装 | AUTH-11 | **PENDING**（HTTP 統合 E2E 未実装。過大申告しない）|
| B14 | AUTH 対象テスト（実 Supabase 必要分） | e2e auth.spec.ts 全体 | AUTH-01..20 | **SUPABASE_LOCAL_PASS**（e2e 7/7。AUTH-10 refresh 強制・AUTH-11 実機・AUTH-12..16 実機 E2E のみ残） |
| B15 | SEC の PostgREST 再確認（直接書込拒否・監査保護） | verify-supabase B15-* | SEC-03/11 | **SUPABASE_LOCAL_PASS**（Mac 2026-07-25） |
| B16 | Playwright E2E | `npm run e2e:local` | AUTH E2E 全体 | **SUPABASE_LOCAL_PASS**（Mac 2026-07-25, **7/7 PASS**） |

SYSTEM_ADMIN セッションの経緯（Mac 確認）: 旧 `seed.sql` の raw INSERT（aud/role NULL・identity 0 件）は GoTrue から
不可視だったため、`supabase/seed.sql` を **GoTrue 正規 fixture** へ変更（UUID 維持・`instance_id`/`aud`/`role`/
`email_confirmed_at`/`raw_app_meta_data(provider=email)`/token 列、`auth.identities` に email identity(sub/email/
email_verified)、**password は seed しない**、冪等、`system_role` bootstrap 維持。migration/RLS/GRANT は不変）。
これで seeded user は Admin API から**可視**になったが、`updateUserById(seeded, {password})` は GoTrue validation で
**400 `validation_failed`** となる（実行履歴）。したがって **seeded SYSTEM_ADMIN は password を設定せず Magic Link**
（`generateLink(magiclink)` → `verifyOtp(email→magiclink)`）で実 JWT セッションを取得する。**password は新規 fixture
ユーザー（B1/B2/B4/B5/B9）の local-only セッション取得にのみ使用**（`createUser` + password sign-in、既存衝突時のみ
同一 run fixture に限定して `updateUserById`。seeded には使わない）。初期化は stage 記録＋安全な cause のみ表示＋
Admin API 初回アクセスに起動待ちリトライ（最大10回）。token/password/JWT/key/URL はログに出さない。
実行履歴（Mac 2026-07-25）: seeded は Magic Link で成立し `[B1]` まで到達 → fixture `createUser({password})` が
**bcrypt 72 バイト上限超過（一時 password 78 文字）→ 400 `validation_failed`** で停止 → 一時 password を
41 文字（≤72）へ短縮・`SafeError` 導入 → **再実行で `npm run verify:supabase` が 28/28 全 PASS**
（run=mrzjqtj7。B1-a/b, B4×3, B2×4, B3×4, B5×4, B9×3, B13a/b/c×4, B15×4。FAIL=0 SKIP=0）。

秘密情報の非露出: verify-supabase / e2e とも JWT・anon/service キー・token_hash・password・Cookie 値・DB URL・
メール本文を標準出力／アサーション差分へ出さない（B7 はリンク形状を boolean で assert、Cookie は属性のみ確認し値を読まない）。
fixture は `@example.test` の架空データのみ（CLAUDE.md §23）。`clearMailpit()` は DELETE 応答を確認し失敗時は
テスト失敗（過去メール偽陽性の防止）、メール取得は宛先＋テンプレ件名で一意識別。
verify-supabase は非ループバック URL への接続を拒否する（本番接続防止・CLAUDE.md §32）。

> **最終状態（2026-07-25 08:4x）**: **`npm run verify:supabase` 28/28 全 PASS**（B1..B5 / B9 / B13-DB / B15）、
> **`npm run e2e:local` 7/7 全 PASS**（B6..B8 / B10(session) / B11(部分検証) / B12 / B14 / B16）、
> **`npm run verify`（typecheck/lint/Vitest 41/41/build）最新コードで PASS** — いずれも Mac 実機。
> 途中で確定・修正した事項: seed の GoTrue 正規 fixture 化 / bcrypt 72 バイト上限 / stale dev サーバ起因の
> 500 / `[auth.email] enable_signup`=email プロバイダ無効化（422）→ true へ / 認証 Cookie httpOnly=true 強制（U22）。
> **既知の残課題（テスト PENDING）は 4 分類**:
> ① **B10-refresh**（middleware token refresh の強制検証・未実装）
> ② **B13-HTTP**（Next.js Server Action / route handler 経由の実 HTTP 失敗監査 E2E・未実装）
> ③ **AUTH-11 実機**（DB 障害を /error へ振り分ける経路の実機確認）
> ④ **AUTH-12..16 の認証済みロール・状態別 E2E**（ロール別認可 / 他法人 ID 拒否 / invited・suspended・left 状態別。
>   ※ **未認証の保護ルート拒否は E2E 実機 PASS 済み**）。
> **CI リモート実走行も完了**（GitHub Actions Run #4 / commit `2bbae3b`・全ジョブ green。テスト PENDING とは区別）。
> **結論: Phase 1 の機能実装・主要実機検証・CI 実走行は完了。上記 4 分類は Phase 1 完了を妨げない
> 追加検証バックログとして継続管理し、PASS 扱いにしない。Phase 2 は未着手。**
