# test-cases.md — テスト定義と実行状態

状態区分（CLAUDE.md §24 をレビュー指示 2026-07-24 で拡張）:
`DEFINED` / `PG_HARNESS_PASS` / `OFFLINE_UNIT_PASS` / `SUPABASE_LOCAL_PASS` / `APP_PASS` / `SUPABASE_PENDING` / `APP_PENDING` / `PENDING` / `FAILED`
- `OFFLINE_UNIT_PASS` = `npm run test:offline`（node:test シム）で 41/41 合格。正式ランナー Vitest は Mac で **55/55 PASS**（§6）。`test:offline` は対象ファイルを明示列挙するため `vi.mock` 依存の `src/lib/auth/audit.test.ts`（14 件）を含まず、41 と 55 の差はこの一点に起因する（矛盾ではない）
- `APP_PENDING` = Next.js アプリ実行系（build / E2E / 実機挙動）が未検証

> 注: 前チャットの旧番号体系（SEC-01..64 等）は成果物喪失により失われた。
> 本書の ID が再構築後の正。旧 SEC-61..64（ロック後再認可）は CONC-01/02 と
> security.md §4 の実装規約に対応する。

## 1. UNIT
正式ランナー: **Vitest**（`npm run test` = `vitest run`。テストは `import { test } from "vitest"` ＋
`node:assert/strict`）。npm レジストリ不通環境向けフォールバック: `npm run test:offline`
（tsconfig.offline-test.json の paths で "vitest" をシムへ解決し node:test で実行。
アサーションが node:assert のため両ランナーで同一挙動）。
`test:offline` 41/41 PASS（サンドボックス）に加え、**Vitest 本体は Mac で 55/55 PASS 済み**（`npm run verify` 内・2026-07-26）。
`test:offline` は明示ファイル列挙のため `src/lib/auth/audit.test.ts`（`vi.mock` 依存・14 件）を含まない。
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

## 5. AUTH（アプリ統合。大半は Mac 実機で SUPABASE_LOCAL_PASS。既知の残課題 2 分類 = AUTH-11 実機 / Magic Link 有効期限の境界検証 — §7 末尾参照。B10-refresh(AUTH-10) は 2026-07-27 に AUTH-E2E-28/29 で SUPABASE_LOCAL_PASS へ更新済み）
**AUTH-12..16 は §5.1 の認証済み E2E 基盤により SUPABASE_LOCAL_PASS へ更新済み**（修正前は APP_PENDING）。
| ID | 内容 | 状態 |
|---|---|---|
| AUTH-01 | 登録/未登録で応答差なし（Server Action 実装済み） | **SUPABASE_LOCAL_PASS**（e2e B6・共通応答を実機確認） |
| AUTH-02/03 | サーバー側メール検証・shouldCreateUser=false | 検証ロジック OFFLINE_UNIT_PASS / 送信経路は e2e B6 で実機確認（SUPABASE_LOCAL_PASS） |
| AUTH-04..06 | open redirect 防止・next 復元 | 純関数 OFFLINE_UNIT_PASS / E2E 実機 **SUPABASE_LOCAL_PASS**（AUTH-E2E-05, 3xx 厳格基準） |
| AUTH-07 | OTP type 実行時検証 | 純関数 OFFLINE_UNIT_PASS / callback 実機 **SUPABASE_LOCAL_PASS**（AUTH-E2E-04, 3xx 厳格基準） |
| AUTH-08 | 失効・使用済みリンクの汎用エラー | **SUPABASE_LOCAL_PASS**（e2e B8: 再利用 → /login?e=link） |
| AUTH-09/10 | Cookie 保存・middleware refresh・redirect 時維持 | Cookie 属性・redirect 後維持・セッション維持は **SUPABASE_LOCAL_PASS**（e2e B10/B11）/ **token refresh の強制（AUTH-10 核心）も SUPABASE_LOCAL_PASS**（B10-refresh = AUTH-E2E-28/29、Mac 2026-07-27。§7 B10-refresh） |
| AUTH-11 | DB エラーを所属なしと区別し /error | 実装済み / 実機は APP_PENDING |
| AUTH-12..16 | route 直アクセス・ロール別認可・他法人 ID 拒否 | 判定純関数は OFFLINE_UNIT_PASS。実機は **SUPABASE_LOCAL_PASS**（未認証の保護ルート拒否 AUTH-E2E-02 に加え、**ロール別認可・他法人 ID 拒否・invited/suspended/left 状態別を認証済みセッションで実機確認 = AUTH-E2E-12..27 の 16 件**。Mac 2026-07-26・`npm run e2e:local` 24/24 を 2 回連続 PASS。
2026-07-27 に AUTH-E2E-28/29 を加えた認証済み E2E 18 件 / `e2e:local` 26/26 でも全 PASS。§5.1 / B17）。**限界（過大申告しない）: Phase 1 に ORGANIZATION_ADMIN 専用の HTTP ルートが無いため、ORGANIZATION_ADMIN と SALES_USER のルート単位の差は HTTP 層では検証できない。両者の差は DB 層（PG harness の業務関数テスト）で検証済みであり、HTTP 層で検証できるロール境界は SYSTEM_ADMIN 境界のみ** |
| AUTH-17 | signout POST のみ（GET 405） | **SUPABASE_LOCAL_PASS**（GET=405・未認証 POST=303・認証済み POST=303 / Cookie 無効化 / 以後 /cases→/login をすべて実機確認） |
| AUTH-18 | リンク再利用拒否 | **SUPABASE_LOCAL_PASS**（e2e B8: 実 token 1回目成功・2回目 /login?e=link） |
| AUTH-19 | 招待メール一致 | DB 層は PG_HARNESS_PASS (FUNC-03) / 実 Supabase 統合は SUPABASE_LOCAL_PASS（B9, Mac 2026-07-25）/ UI E2E は保留 |
| AUTH-20 | 複数法人所属の決定的処理 | OFFLINE_UNIT_PASS |

### 5.1 認証済み E2E 基盤（AUTH-12..16 / B17）— **SUPABASE_LOCAL_PASS**

未認証の保護ルート拒否（AUTH-E2E-02）は既に SUPABASE_LOCAL_PASS 済みのため重複実装しない。
本基盤は **認証済みセッションを跨ぐ** 認可・状態別拒否・他法人 ID 拒否のみを対象とする。
Phase 2 の案件・商品検索 E2E も、同じ fixture 定義と storageState をそのまま流用できる。

構成:
- `app/e2e/fixtures/identities.ts` — fixture 定義の唯一の定義元（秘密値を持たない）
- `app/e2e/fixtures/env.ts` — `.env.local` 読み込み・ループバック強制・安全なエラー整形
- `app/e2e/fixtures/manifest.ts` — 実行時の法人 ID / membership ID の受け渡し
- `app/e2e/setup/auth.setup.ts` — Playwright `auth-setup` project（fixture 用意 + storageState 生成）
- `app/e2e/authenticated/authz.spec.ts` — 認可テスト本体（AUTH-E2E-12..25）
- `app/e2e/authenticated/audit-http.spec.ts` — 実 HTTP 失敗監査テスト本体（AUTH-E2E-26/27・B13-HTTP）
- `app/e2e/authenticated/session-refresh.spec.ts` — セッション refresh テスト本体（AUTH-E2E-28/29・B10-refresh）
- `app/e2e/fixtures/session-cookie.ts` — Supabase SSR 認証 Cookie の安全な読み書きヘルパ（チャンク対応・値を出力しない）
- `app/e2e/fixtures/audit-reader.ts` — 監査ログ読取ヘルパ（**SYSTEM_ADMIN の認証済み session + RLS 経由**。service_role は監査テーブルの SELECT に使わない／使えない）
- `app/e2e/fixtures/authenticated-test.ts` — ロール別ページ fixture と `expectLanding`（Cookie の手動注入をしない）

fixture ユーザー（すべて架空 / `@example.test` のみ / パスワードや token をコードへ埋め込まない）:

| key | email | system role | 法人 | 法人ロール | membership 状態 | E2E 上の用途 |
|---|---|---|---|---|---|---|
| systemAdmin | sysadmin.fictional@example.test（seed 済み） | SYSTEM_ADMIN | なし | なし | none | SYSTEM_ADMIN 境界（/system-console 許可・/cases 不可） |
| orgAAdmin | e2e.org-a-admin@example.test | なし | A | ORGANIZATION_ADMIN | active | 正常系 + SYSTEM_ADMIN 領域からの締め出し |
| orgAMember | e2e.org-a-member@example.test | なし | A | SALES_USER | active | 正常系 + ロール別拒否 + 他法人 ID 拒否 |
| orgBAdmin | e2e.org-b-admin@example.test | なし | B | ORGANIZATION_ADMIN | active | テナント境界の対向側 |
| orgBInvitee | e2e.org-b-invitee@example.test | なし | B | SALES_USER | invited | 他法人 ID 拒否テストの標的 |
| invited | e2e.invited@example.test | なし | A | SALES_USER | invited | invited 拒否 + IDOR 実行者 |
| suspended | e2e.suspended@example.test | なし | A | SALES_USER | suspended | suspended 拒否 |
| left | e2e.left@example.test | なし | A | SALES_USER | left | left 拒否 |

**lifecycle 専用ユーザー（storageState を持たない・上表と分離）**:
`magiclink-lifecycle.fictional@example.test`（seed 済み・system_role なし・所属なし）は
Magic Link ライフサイクル / signout 契約テスト（AUTH-E2E-06）専用。
`/auth/signout` は `supabase.auth.signOut()` を既定の `scope: "global"` で呼ぶため、
そのユーザーの GoTrue セッションが**全て**失効する。上表の fixture と email を共有すると
auth-setup が発行済みの storageState まで巻き添えで無効化されるため、seed レベルで分離した
（詳細と実際の障害は phase1-validation.md §1.5）。`identities.ts` に共有を検出して即 throw する
ガードを置いている。**production の signOut は global scope のまま維持する。**

法人は `E2E検証法人A（架空）` / `E2E検証法人B（架空）` の 2 法人を冪等に用意する。
法人 ID・membership ID は実行のたびに変わるため、`auth-setup` が `app/.auth/fixtures.json`
（Git 管理対象外）へ書き出し、テスト側は fixture 経由で参照する（ハードコードしない）。

storageState 生成フロー（各テストで Magic Link を開かない）:
1. `auth-setup` が `app/.auth/` を毎回作り直す（stale session を使わない）
2. GoTrue Admin API `generateLink({ type: 'magiclink' })` で token_hash を取得（**メール送信なし**）
3. Playwright で `/auth/callback?token_hash=...&type=email` を開き、**アプリの実 verifyOtp 経路**で
   実 Cookie を発行させる
4. `context.storageState({ path: 'app/.auth/<key>.json' })` で保存
5. 最終状態（role / membership 状態）を検証し、不一致なら throw して FAIL させる

fixture の用意は公開業務関数（`app_create_organization` / `app_invite_organization_member` /
`app_accept_invitation` / `app_suspend_member` / `app_end_membership`）のみを使う。
**migration / RLS / GRANT / `scripts/pg-harness/00_shim_supabase.sql` は一切変更していない。**
`supabase/seed.sql` への追加は上記 lifecycle 専用ユーザー 1 件のみ（冪等・GoTrue 正規構造・
`@example.test`）で、既存 fixture・PG harness の件数アサーションには影響しない。

拒否の形は **403 ではなく redirect**（`src/lib/auth/require.ts` は `routeForDecision(decideLanding(ctx))`
へ redirect する）。期待結果は既存コード・unit test（`src/lib/auth/access.test.ts` AUTH-12a..13c）から確定した。
着地不一致時は `expectLanding` が **pathname のみ**を使った診断（何が起きたかの説明付き）で fail fast する
（token / Cookie 値は出力しない）。

| ID | 内容 | 期待結果 | 状態 |
|---|---|---|---|
| AUTH-E2E-12 | active な SALES_USER が自法人 /cases | /cases 表示・法人 A 名が見える | **SUPABASE_LOCAL_PASS** |
| AUTH-E2E-13 | active な ORGANIZATION_ADMIN が / から着地 | /cases | **SUPABASE_LOCAL_PASS** |
| AUTH-E2E-14 | SYSTEM_ADMIN が / から着地 | /system-console | **SUPABASE_LOCAL_PASS** |
| AUTH-E2E-15 | SALES_USER が /system-console 直打ち | /cases へ redirect | **SUPABASE_LOCAL_PASS** |
| AUTH-E2E-16 | ORGANIZATION_ADMIN が /system-console 直打ち | /cases へ redirect（法人管理者 ≠ 全体管理者） | **SUPABASE_LOCAL_PASS** |
| AUTH-E2E-17 | SYSTEM_ADMIN が /cases 直打ち | /system-console へ redirect（境界の逆方向） | **SUPABASE_LOCAL_PASS** |
| AUTH-E2E-18 | invited が /cases | /pending-invitation へ redirect | **SUPABASE_LOCAL_PASS** |
| AUTH-E2E-19 | invited が /system-console | /pending-invitation へ redirect | **SUPABASE_LOCAL_PASS** |
| AUTH-E2E-20 | suspended が /cases | /no-access へ redirect | **SUPABASE_LOCAL_PASS** |
| AUTH-E2E-21 | left が /cases | /no-access へ redirect（membership 問い合わせから除外） | **SUPABASE_LOCAL_PASS** |
| AUTH-E2E-22 | suspended / left が /system-console | /no-access へ redirect | **SUPABASE_LOCAL_PASS** |
| AUTH-E2E-23 | 法人 B メンバーの文脈 | 法人 B 名のみ表示・法人 A 名は 0 件 | **SUPABASE_LOCAL_PASS** |
| AUTH-E2E-24 | URL / query に他法人 ID を差し替え | 文脈は切り替わらない（法人 A のまま） | **SUPABASE_LOCAL_PASS** |
| AUTH-E2E-25 | request body の membership ID を他法人へ改竄して実 POST | 受諾されず `?e=1` の共通エラー・双方の状態不変・他法人名を漏らさない | **SUPABASE_LOCAL_PASS** |
| AUTH-E2E-26 | 実ブラウザ・実 Cookie・実 Server Action で**正当な業務失敗**を発生させる（B13-HTTP） | 業務失敗が `?e=1` で返り、**別 PostgREST リクエスト / 別トランザクション**で `success=false` の失敗監査が **1 件**記録される。業務失敗と監査は同一 correlation ID（1 リクエスト 1 個）で、同一 correlation を再送しても 1 件のまま | **SUPABASE_LOCAL_PASS** |
| AUTH-E2E-27 | actor と membership 本人が一致しない**偽造失敗監査**を実 HTTP 経路で試みる（B13-HTTP） | SEC-83 のガードが拒否し **監査行 0 件**。ログは `failure-audit refused by actor/membership guard` の warn（correlation ID のみ）で、`failure-audit write failed` ではない | **SUPABASE_LOCAL_PASS** |
| AUTH-E2E-28 | 認証済み Cookie 内セッションの `expires_at` だけを過去へ書き換え（token 値は無傷）、通常のページ遷移で middleware の正規 `getUser()` 経路を通す（B10-refresh 成功経路） | 再ログインへ飛ばず refresh が発生: **access token 更新・refresh token rotation・同一 user ID・Cookie httpOnly 維持・新 expiry が未来**（いずれも値を出力せず boolean で検証）。自法人 A のみ可視・他法人 B 不可視（RLS / テナント文脈維持）。refresh 済みセッションで protected Server Action を実行でき、実在しない membership UUID は `membership_not_found` で安全拒否・invited 状態不変 | **SUPABASE_LOCAL_PASS** |
| AUTH-E2E-29 | access token 期限切れ相当 + refresh token 無効（実在しない固定文字列。実在した token は再送しない）で Server Action POST と保護ルートアクセス（B10-refresh 失敗経路） | Server Action POST は middleware により /login への redirect 応答となる。Next.js クライアントがその応答を画面遷移へ変換しない場合があるため、E2E ではサーバー応答（3xx + `Location` pathname = /login）を直接検証し、続く保護ルートアクセスが /login へ誘導されることを確認した。/login は安定表示（無限 redirect なし）・画面へ JWT 断片や例外詳細を出さない。サーバーログは `AuthApiError`（class / status=400 / code=validation_failed のみ・秘密値なし） | **SUPABASE_LOCAL_PASS** |

実測（Mac 2026-07-27）: `npm run e2e:auth` **19/19 PASS**（auth setup 1 件 + 上表 18 件）、
`npm run e2e:local` **26/26 PASS**（既存 E2E 7 件 + auth setup 1 件 + 上表 18 件）、
対象 spec 単体（AUTH-E2E-28/29）は **2 回独立実行でいずれも PASS**（retry / skip なし）。
B10-refresh 追加前の実測（Mac 2026-07-26）: `e2e:auth` 17/17 PASS / `e2e:local` 24/24 PASS を 2 回連続。
同日の他ゲート実測: Vitest **55/55 PASS** / `npm run verify:supabase` **28/28 PASS**（2026-07-27 も同値で PASS）。

CI 実測（Supabase local E2E Run #1 / run ID `30205025523`・commit `21bf31b`・success）: `npm run e2e:local` は
`Running 24 tests using 1 worker` で **24 passed（1.1 分）**。AUTH-E2E-26 / 27 を含む現行 24 件が全件 PASS。
`npm run verify:supabase` は **PASS 28 / FAIL 0 / SKIP 0**。詳細は §7.1。

**Phase 1 の限界（過大申告しない）**: Phase 1 には ORGANIZATION_ADMIN 専用の HTTP ルートが存在しないため、
ORGANIZATION_ADMIN と SALES_USER の**ルート単位の差**は現時点で検証できない。両者の差は DB 層
（PG harness の業務関数テスト）で検証済みであり、HTTP 層で検証できるロール境界は **SYSTEM_ADMIN 境界のみ**。

**AUTH-E2E-25 / 26 / 27 の役割分担（混同しない）**:
- **AUTH-E2E-25** — 他法人 membership ID への**書換えが拒否される**こと・双方の**状態が不変**であること・**文脈が切り替わらない**こと。失敗監査の記録内容そのものは主張しない。
- **AUTH-E2E-26** — **正当な業務失敗**が実 HTTP 経路で **失敗監査 1 件**として記録されること。
- **AUTH-E2E-27** — actor と membership 本人が**不一致の偽造失敗監査**を SEC-83 が拒否し、**監査行 0 件**であること。

**失敗監査ログの 3 分類（ガード拒否と書込み失敗を混同しない）**:
- `recorded` — 失敗監査が実際に 1 件書かれた（AUTH-E2E-26）。
- `refused_by_guard` — `failure-audit refused by actor/membership guard` の warn。**設計どおりの拒否であって監査経路の障害ではない**。監査行は書かれず、出力は correlation ID のみ（AUTH-E2E-25 / 27）。
- `write_failed` — `failure-audit write failed`。**本物の監査経路障害**。判別できない error shape は安全側に倒して `write_failed` として扱う。

旧記述にあった「AUTH-E2E-25 の末尾に出る `failure-audit write failed` は B13-HTTP の既知ログ」という注記は、
B13-HTTP の実装により**解消したため削除**した。実測（Mac 2026-07-26）では AUTH-E2E-25 / 27 とも
`refused_by_guard` の warn のみが出力され、`failure-audit write failed` は出ていない。
CI（Supabase local E2E Run #1）でも同様に `failure-audit refused by actor/membership guard` の warn が **2 件**、
`failure-audit write failed` は **0 件**だった（§7.1）。

## 6. 品質ゲート
| 項目 | 状態 | 備考 |
|---|---|---|
| typecheck (全体) | APP_PASS | 本セッション追加ファイル（scripts/verify-supabase.ts・e2e 拡張）を含む最新コードで Mac PASS（2026-07-25, `npm run verify` 内・エラー0） |
| typecheck (純粋モジュール, strict) | 実行済み PASS | `npm run typecheck:pure` を tsc で実行（本セッション再実行 PASS） |
| lint | APP_PASS | 最新コードで Mac エラー0。`next-env.d.ts`（自動生成）の triple-slash-reference は**内容変更せず** eslint.config.mjs の global ignore で対応 |
| unit test (offline fallback) | OFFLINE_UNIT_PASS | 41/41（`npm run test:offline`）。明示ファイル列挙のため `vi.mock` 依存の `src/lib/auth/audit.test.ts` を含まない。Vitest 正式は 55/55 |
| unit test (Vitest 正式) | APP_PASS | Vitest 3.2.7 で **55/55 PASS**（最新コード, Mac, 2026-07-26。B13-HTTP の `audit.test.ts` 14 件を含む） |
| production build | APP_PASS | Next.js 15.5.21 build 成功（全10ルート生成, 最新コード, Mac, 2026-07-25） |
| E2E | **SUPABASE_LOCAL_PASS** | `npm run e2e:local` **26/26 PASS**（Mac 2026-07-27）。内訳は **既存 E2E 7 件（e2e/auth.spec.ts）＋ auth setup 1 件 ＋ 認証済み E2E 18 件（authenticated/authz.spec.ts 14 + authenticated/audit-http.spec.ts 2 + authenticated/session-refresh.spec.ts 2）**。`npm run e2e:auth` は **19/19 PASS**（auth setup 1 + 18）。B10-refresh 追加前（2026-07-26）は 24/24 を 2 回連続 / 17/17。§7 B6..B12/B10-refresh/B13-HTTP/B14/B16/B17 |
| CI (GitHub Actions / 既存 quality gate) | **APP_PASS**（実走行） | `.github/workflows/ci.yml`。最新は **Run #12 / run ID `30349567309` / commit `6cbe362`・success**（2026-07-28。typecheck / lint / unit / build 約53秒・PostgreSQL harness 約39秒・run 全体 約58秒）。過去: Run #10 / run ID `30205025559` / commit `21bf31b`・success。Linux クリーン環境で `npm ci` → typecheck / lint / unit / build、PostgreSQL harness。初回の実走行確認は Run #4 / commit `2bbae3b`（2026-07-25・Node v22.23.1 / npm 11.12.1・`PG HARNESS: ALL TESTS PASSED`） |
| CI (GitHub Actions / Supabase local E2E) | **SUPABASE_LOCAL_PASS**（実走行） | `.github/workflows/supabase-local-e2e.yml`（workflow 名 `Supabase local E2E`）。**Run #1 / run ID `30205025523` / commit `21bf31b`・success**。Supabase CLI 2.109.1 で `supabase start` → `supabase db reset` → `npm run verify:supabase` **28/28**（FAIL 0 / SKIP 0）→ `npm run e2e:local` **24/24**（当時の全件・1 worker・1.1 分）。job 4 分 47 秒 / run 全体 5 分 11 秒。§7.1。**B10-refresh（AUTH-E2E-28/29）を含む最新は Run #2 / run ID `30349565674` / commit `6cbe362`・success**（2026-07-28。job 約5分00秒 / run 全体 約5分09秒 / artifact 0 件。§7.1 の確認範囲の区別を参照） |
| package-lock.json 生成 | 完了 | Mac で生成・コミット（8add410）。version 欠落 optional スタブを `2bbae3b` で修復し、Linux クリーン環境の `npm ci` 成立を CI で確認 |
| 正式 `npm run verify` | **APP_PASS（最新コード）** | B10-refresh 差分（e2e 配下のみ）を含む状態で typecheck+lint+Vitest(55/55)+build(全10ルート) 全成功（Mac, 2026-07-27）。**verify:supabase 28/28・e2e:local 26/26・e2e:auth 19/19 も PASS**（下記 §7。2026-07-26 実測は e2e:local 24/24 を 2 回連続 / e2e:auth 17/17） |

## 7. Supabase local 自動化（B1..B17 / runbook §B）
Docker + `supabase start` + `supabase db reset`（seed 適用）済みの **Mac ローカル**で実行する。
**実行済み（Mac 2026-07-27）: `verify:supabase` 28/28 全 PASS ＋ `e2e:local` 26/26 全 PASS。**
（B10-refresh 追加前の 2026-07-26 実測は `e2e:local` 24/24 全 PASS を 2 回連続。）
`e2e:local` の 26 件は **既存 E2E 7 件 ＋ auth setup 1 件 ＋ 認証済み E2E 18 件**。
auth setup は storageState を生成する準備 project であり、**業務テスト 18 件とは別に数える**。
`npm run e2e:auth` は auth setup 1 件 + 認証済み 18 件 = **19/19**。
下表の「状態」列が正（B 表内の PENDING は解消済み。AUTH 側を含む既知の残課題の全体像は
本節末尾の 2 分類を参照）。**結果を捏造しない。**

実行コマンド:
- B1..B5 / B9 / B13-DB / B15: `cd app && npm run verify:supabase`（`scripts/verify-supabase.ts`）
- B6..B12 / B10-refresh / B13-HTTP / B14 / B16 / B17: 初回のみ `npx playwright install chromium`（現行 playwright.config は Chromium のみ・
  全ブラウザ導入は不要）→ `cd app && npm run e2e:local`（`E2E_SUPABASE_LOCAL=1 playwright test`）
- `npm run e2e:local` は 3 つの Playwright project を順に実行する: `e2e`（既存 7 件・storageState 不使用）→
  `auth-setup`（fixture 用意と storageState 生成・1 件）→ `authenticated`（AUTH-E2E-12..29 の 18 件 =
  `authz.spec.ts` 14 件 + `audit-http.spec.ts` 2 件 + `session-refresh.spec.ts` 2 件）＝ 合計 26 件
- 認可テストのみは `cd app && npm run e2e:auth`（`auth-setup` に依存するため自動実行され 19 件）

| B# | 内容 | 検証手段 | 対応 DB/AUTH | 状態 |
|---|---|---|---|---|
| B1 | auth.users→user_profiles トリガー・email 小文字ミラー | verify-supabase B1-a/b | FUNC-01 | **SUPABASE_LOCAL_PASS**（Mac 2026-07-25） |
| B2 | PostgREST 経由 RLS（テナント越境不可） | verify-supabase B2-* | SEC-01/02/06 | **SUPABASE_LOCAL_PASS**（Mac 2026-07-25） |
| B3 | 列 GRANT（display_name のみ更新可） | verify-supabase B3-* | SEC-04/05 | **SUPABASE_LOCAL_PASS**（Mac 2026-07-25） |
| B4 | anon/authenticated/service_role の挙動差 | verify-supabase B4-* | SEC-01/03 | **SUPABASE_LOCAL_PASS**（Mac 2026-07-25） |
| B5 | 業務 RPC の認可・監査 | verify-supabase B5-* | SEC-07/13/15, FUNC-02 | **SUPABASE_LOCAL_PASS**（Mac 2026-07-25） |
| B6 | Magic Link 送信（共通応答・suite 内 1 通のみ送信） | e2e AUTH-E2E-06 | AUTH-01 | **SUPABASE_LOCAL_PASS**（Mac 2026-07-26, e2e:local 24/24） |
| B7 | Mailpit 受信: 件名=`ログイン用リンク`・テンプレ固定文言・callback が `token_hash&type=email` | e2e AUTH-E2E-06 | AUTH-07 | **SUPABASE_LOCAL_PASS**（Mac 2026-07-25） |
| B8 | 使用済みリンク再利用拒否（clean client で 2 回目→/login?e=link） | e2e AUTH-E2E-06 | AUTH-18 | **SUPABASE_LOCAL_PASS**（Mac 2026-07-25） |
| B9 | 招待先メール一致: 他人(B)は A の membership を accept 不可・状態/監査不変 | verify-supabase B9-reject/state-intact/no-forged-audit（実 Supabase）+ FUNC-03（DB） | AUTH-19 | DB=PG_HARNESS_PASS / 実 Supabase=**SUPABASE_LOCAL_PASS**（Mac 2026-07-25） |
| B10 | **セッション維持のみ**（別リクエストで未認証へ戻らない） | e2e AUTH-E2E-06 | AUTH-09 | **SUPABASE_LOCAL_PASS**（Mac 2026-07-25。セッション維持の範囲） |
| B10-refresh | middleware token refresh の強制検証: Cookie 内セッションの `expires_at` だけを過去へ書き換えて期限切れ相当とし（token 値・JWT は改変しない）、正規 `getUser()` 経路の refresh（成功経路）と refresh token 無効時の安全な失敗（失敗経路）を実機確認 | e2e AUTH-E2E-28/29（`session-refresh.spec.ts` + `fixtures/session-cookie.ts`） | AUTH-10 | **SUPABASE_LOCAL_PASS**（Mac 2026-07-27。対象 spec 単体 2 回独立実行 + e2e:auth 19/19 + e2e:local 26/26 で全 PASS。CI でも `Supabase local E2E` Run #2 / commit `6cbe362`・success で実走行済み — 2026-07-28・§7.1）|
| B11 | 認証 Cookie 属性（**部分検証**: httpOnly=true（U22 で強制）/ path=`/` / sameSite=Lax / callback redirect 後も存在）。secure はローカル HTTP で false のため固定 assert しない | e2e AUTH-E2E-06 | AUTH-09 | **SUPABASE_LOCAL_PASS**（Mac 2026-07-25。部分検証の範囲） |
| B12 | signout 契約（認証状態に依らず GET=405 / POST=303→/login、認証済み POST 後は auth-token Cookie 消滅、以後 /cases→/login）。**middleware が `/auth/signout` を未認証 redirect 対象から除外し handler へ到達させる修正込み** | e2e: 未認証GET=AUTH-E2E-03(405) / 未認証POST=AUTH-E2E-07(303) / 認証済みPOST・Cookie消滅・/cases→/login=AUTH-E2E-06 | AUTH-17 | **SUPABASE_LOCAL_PASS**（Mac 2026-07-25。全経路実機確認） |
| B13-DB | 失敗監査の別Tx（DB/PostgREST・service_role・correlation・SEC-83/86） | verify-supabase B13a/b/c | FUNC-15, SEC-83/86 | **SUPABASE_LOCAL_PASS**（Mac 2026-07-25） |
| B13-HTTP | Next.js Server Action / route handler 経由の実 HTTP 失敗監査経路（実ブラウザ・実 Cookie・実 Server Action・実 Supabase local） | e2e AUTH-E2E-26/27 | FUNC-15, SEC-83/85/86 | **SUPABASE_LOCAL_PASS**（Mac 2026-07-26。CI の Supabase local E2E Run #1 でも PASS・§7.1）|
| B14 | AUTH 対象テスト（実 Supabase 必要分） | e2e 全体（auth.spec.ts + authenticated/authz.spec.ts + authenticated/audit-http.spec.ts + authenticated/session-refresh.spec.ts） | AUTH-01..20 | **SUPABASE_LOCAL_PASS**（e2e 26/26・Mac 2026-07-27。**AUTH-12..16 / AUTH-10 refresh 強制も PASS 済み**。残は AUTH-11 実機のみ） |
| B15 | SEC の PostgREST 再確認（直接書込拒否・監査保護） | verify-supabase B15-* | SEC-03/11 | **SUPABASE_LOCAL_PASS**（Mac 2026-07-25） |
| B16 | Playwright E2E | `npm run e2e:local` | AUTH E2E 全体 | **SUPABASE_LOCAL_PASS**（Mac 2026-07-27, **26/26 PASS**。既存 7 + auth setup 1 + 認証済み 18。2026-07-26 は 24/24 を 2 回連続。CI の Supabase local E2E Run #1 でも当時の全件 **24/24 PASS**・1 worker・1.1 分・§7.1） |
| B17 | 認証済みロール・状態別 E2E 基盤（storageState 再利用 / ロール別認可 / 状態別拒否 / 他法人 ID 拒否 / SYSTEM_ADMIN 境界 / セッション refresh） | Playwright `auth-setup` + `e2e/authenticated/authz.spec.ts`（AUTH-E2E-12..25 の 14 件）+ `e2e/authenticated/audit-http.spec.ts`（AUTH-E2E-26/27 の 2 件）+ `e2e/authenticated/session-refresh.spec.ts`（AUTH-E2E-28/29 の 2 件） | AUTH-12..16 | **SUPABASE_LOCAL_PASS**（Mac 2026-07-27, **18/18 PASS**。`npm run e2e:auth` 19/19・`npm run e2e:local` 26/26 を確認。2026-07-26 は 16/16 / 17/17 / 24/24 をいずれも 2 回連続で確認。§5.1） |

**B13-DB と B13-HTTP の違い（混同しない）**:
- **B13-DB** — RPC / PostgREST の**単体検証**。`verify-supabase` の B13a/b/c が service_role で `app_record_membership_accept_failure` を直接叩き、別トランザクションでの記録・correlation 冪等性・SEC-83/86 のガードを確認する。**アプリの HTTP 経路は通らない**。
- **B13-HTTP** — **実ブラウザ・実 Cookie・実 Server Action・実 Supabase local** を通した経路の検証（AUTH-E2E-26/27）。正当な業務失敗が **別 PostgREST リクエスト / 別トランザクション**で `success=false` の失敗監査 **1 件**として記録されることを確認する。
  - actor は**認証済み session の `getUser()` 由来**。**request body の actor ID は信用しない**。
  - membership ID は body 由来でも構わないが、**SEC-83 が membership の本人一致を検証**して不一致を拒否する。
  - correlation ID は **1 リクエスト 1 個**。業務失敗と監査で同一 correlation を共有し、**同一 correlation を再送しても監査は 1 件のまま**（unique partial index + `on conflict do nothing`）。
  - service_role の用途は**監査 RPC の実行に限定**。**監査ログの読取は SYSTEM_ADMIN の認証済み session + RLS 経由**で行う。migration 0001 が `authoritative_audit_logs` の権限を revoke しているため **service_role にはこのテーブルの SELECT 権限が無く**、**BYPASSRLS は GRANT を代替しない**。
  - B13-HTTP の実装で **migration / RLS / GRANT / RPC 定義は一切変更していない**。

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

### 7.1 CI（GitHub Actions）での実 Supabase local 検証

同じ検証を GitHub-hosted runner 上で実行する workflow を追加済み:
`.github/workflows/supabase-local-e2e.yml`（workflow 名 `Supabase local E2E` / 追加 commit `21bf31b` / branch `main`）。
**Run #1 / run ID `30205025523`・success（2026-07-26）。**

- Supabase CLI **2.109.1**（`supabase/setup-cli` の version pin）で `supabase start` → `supabase db reset`
- `npm run verify:supabase` → **PASS 28 / FAIL 0 / SKIP 0**（B1 / B2 / B3 / B4 / B5 / B9 / B13-DB / B15）
- `npm run e2e:local` → `Running 24 tests using 1 worker` / **24 passed（1.1 分）**。
  B13-HTTP の **AUTH-E2E-26 / 27 を含む当時の全 24 件が PASS**（B10-refresh 追加後の現行 26 件は Run #2 で実走行済み — 下記）
- 失敗監査ログは `failure-audit refused by actor/membership guard` の warn が **2 件**、
  `failure-audit write failed` は **0 件**（3 分類のうち `refused_by_guard` のみで `write_failed` なし）
- fixture は **法人 2 / ユーザー 8**、すべて架空の **`@example.test`** のみ
- **artifact は 0 件**（Playwright の trace に Cookie / token / Magic Link URL / anon key が入り得るため
  意図的にアップロードしない）
- job **4 分 47 秒** / run 全体 **5 分 11 秒**
- 接続先は loopback のみで本番 Supabase へは接続しない。CI 側のセキュリティ設計は security.md §7.2

**`npm run e2e:auth` を CI で重複実行しない理由**: `e2e:auth`（auth setup 1 + 認証済み 18 = 19 件）は
`e2e:local`（既存 7 + auth setup 1 + 認証済み 18 = 26 件）の**真部分集合**であり、CI で別途走らせても
新たに検証される項目が無いため。Mac では従来どおり**独立ゲート**として単独実行できる。

**B10-refresh（AUTH-E2E-28/29）を含む Run #2 の実走行結果（2026-07-28）**:
**Run #2 / run ID `30349565674` / commit `6cbe362` / trigger push / branch main・success**。
job `Supabase local stack (verify:supabase + e2e:local)` = success（約5分00秒）/ run 全体 約5分09秒 /
**artifact 0 件**（Run #1 と同水準の所要時間でテスト 2 件増を吸収）。

**Run #2 の確認範囲の区別（過大申告しない）**:
- **API 実測で直接確認済み**: run の存在 / run ID / head commit / trigger / branch / run・job の
  conclusion（success）/ 所要時間 / artifact 0 件。
- **workflow 定義・job success・ローカル実測から判断**: `verify:supabase` と `e2e:local` は独立 step で、
  いずれかが非0終了すれば job は failure になるため、**job success = 両 step の成功終了**。workflow は
  `E2E_SUPABASE_LOCAL=1` を設定するため AUTH-E2E-28/29 は skip されず、Playwright は失敗時に非0終了する
  ことから **AUTH-E2E-28/29 を含む全件の成功終了**と判断できる。Supabase CLI は workflow 定義上 2.109.1 pin・
  1 worker 実行。
- **CI ログ本文は未取得のため文言レベルでは未確認**: `PASS=28 / FAIL=0 / SKIP=0` や
  `Running 26 tests using 1 worker` / `26 passed` という実ログ文字列、AuthApiError の CI 出力、
  ログ全文に秘密値が無いことの網羅確認（Run #1 と同じ留保。security.md §7.2）。

**役割分担**:

| 実行環境 | 担当範囲 |
|---|---|
| 既存 CI（`.github/workflows/ci.yml`） | typecheck / lint / unit / build / PostgreSQL harness の高速 quality gate（最新 Run #12 / run ID `30349567309`。過去 Run #10 / run ID `30205025559`） |
| CI Supabase local E2E（`Supabase local E2E`） | 実 Supabase（PostgREST / GoTrue / Mailpit）を伴う統合検証。最新 Run #2 / run ID `30349565674`（B10-refresh 込み）。過去 Run #1 / run ID `30205025523`（`verify:supabase` 28/28 + `e2e:local` 24/24・当時の全件） |
| Mac 実機 | 2 回連続実行・`e2e:auth` 単独実行など、CI では行わない追加確認 |

> **最終状態（2026-07-28）**: **`npm run verify:supabase` 28/28 全 PASS**（B1..B5 / B9 / B13-DB / B15）、
> **`npm run e2e:local` 26/26 全 PASS**（B6..B8 / B10(session) / B10-refresh / B11(部分検証) / B12 / B13-HTTP / B14 / B16 / B17）、
> **`npm run e2e:auth` 19/19 全 PASS**、**対象 spec（AUTH-E2E-28/29）単体 2 回独立実行いずれも PASS**、
> **`npm run verify`（typecheck/lint/Vitest 55/55/build）最新コードで PASS** — いずれも Mac 実機。
> 26 件の内訳: **既存 E2E 7 件 + auth setup 1 件 + 認証済み E2E 18 件（AUTH-E2E-12..29）**。
> （B10-refresh 追加前の 2026-07-26 実測: `e2e:local` 24/24 を 2 回連続 / `e2e:auth` 17/17。）
> 途中で確定・修正した事項: seed の GoTrue 正規 fixture 化 / bcrypt 72 バイト上限 / stale dev サーバ起因の
> 500 / `[auth.email] enable_signup`=email プロバイダ無効化（422）→ true へ / 認証 Cookie httpOnly=true 強制（U22）/
> **Magic Link ライフサイクル用ユーザーを SYSTEM_ADMIN fixture から分離**（global signOut による storageState の
> 巻き添え失効を回避。§5.1 / phase1-validation.md §1.5）/ stale な `supabase_*_app` スタックの停止と
> 正しいリポジトリからの `supabase start` → `supabase db reset`。
> **AUTH-12..16 は §5.1 / B17 として実装・実機検証し SUPABASE_LOCAL_PASS へ更新した。**
> **B13-HTTP も AUTH-E2E-26/27 として実装・実機検証し SUPABASE_LOCAL_PASS へ更新した**（PENDING から除外）。
> **B10-refresh も AUTH-E2E-28/29 として実装・実機検証し SUPABASE_LOCAL_PASS へ更新した**（2026-07-27・PENDING から除外。
> CI でも 2026-07-28 に `Supabase local E2E` Run #2 / commit `6cbe362`・success で実走行済み — §7.1）。
> **既知の残課題（テスト PENDING）は 2 分類**:
> ① **AUTH-11 実機**（DB 障害を /error へ振り分ける経路の実機確認）
> ② **Magic Link 有効期限の境界検証**（期限切れリンクの時間経過を伴う検証。単回使用・再利用拒否は PASS 済み）。
> このほか **npm audit の high severity 12 件** は運用側バックログとして継続管理する。
> **CI リモート実走行も完了**（既存 CI: 最新は B10-refresh 込みの Run #12 / run ID `30349567309` / commit `6cbe362`・success
>（2026-07-28。2 job とも success・run 全体 約58秒）。過去: Run #10 / run ID `30205025559` / commit `21bf31b`・success、
> docs 反映 commit `eac56e7` に対する Run #11 も success。テスト PENDING とは区別）。
> **実 Supabase local 検証の CI 化も完了**（最新は B10-refresh 込みの `Supabase local E2E` Run #2 / run ID `30349565674` /
> commit `6cbe362`・success（2026-07-28・artifact 0 件・確認範囲は §7.1）。初回は Run #1 / run ID `30205025523` /
> commit `21bf31b`・success。`verify:supabase` 28/28・`e2e:local` 24/24（当時の全件）。§7.1）。
> **結論: Phase 1 の機能実装・主要実機検証・CI 実走行（既存 CI と Supabase local E2E の両方）は完了。
> 上記 2 分類は Phase 1 完了を妨げない追加検証バックログとして継続管理し、PASS 扱いにしない。Phase 2 は未着手。**

## Phase 2A-1 テスト（PG_HARNESS — Mac 実機 PENDING / 本環境は DB 未起動）
PG harness（`scripts/pg-harness/40_phase2a_customer_cases.sql`、run.sh 末尾に配線）:
- RLS: P2A-RLS-01 顧客は自案件のみ・他 org 不可視 / -02 顧客は自分の申込者 PII のみ（共同申込者 PII 不可視） / -03 assigned 営業可視・未担当営業不可視 / -04 ORG_ADMIN 自 org 可視・他 org 不可視 / -05 suspended 営業は担当案件を失う / -06 anon・JWTなしは不可視。
- 業務関数: P2A-FN-01 他 org 作成拒否 / -02 無効 assigned membership 拒否 / -03 非スタッフ招待拒否 / -04 メール不一致受諾拒否 / -05 二重受諾の冪等（重複 participant なし） / -06 期限切れ招待拒否 / -07 未許可遷移拒否・許可遷移成功 / -08 直接 INSERT/UPDATE/DELETE 拒否。
- 監査/テナント: P2A-AUD-01 成功操作で監査作成・metadata に PII なし / P2A-TEN-01 同名 case_name でも org 越境なし。
- unit（Vitest, `src/lib/customer-cases/status.test.ts`）: P2A-UNIT-01/02/03 状態遷移・guard・エラー分類。
実行: Mac で `supabase db reset`（local）＋ `npm run test:db`（PG harness）＋ `npm run test`（Vitest）。**本クラウド環境は Docker/Supabase/psql 不在のため DB 実行は PENDING。**
## Phase 2A-2a テストケース

### PG ハーネス（scripts/pg-harness/50_phase2a2_profile.sql・run.sh 組込・PENDING(Mac): docker/psql 必要）
- P2A2-01: 本人(primary)が基本情報保存でき opened→inputting 遷移／値保存
- P2A2-02: 共同申込者は主申込者 PII を更新不可（not_authorized）
- P2A2-03: 非 participant 顧客は更新不可（not_authorized）
- P2A2-04: 不正メール / 未来生年月日は拒否（invalid_profile_email / invalid_profile_birth_date）
- P2A2-05: 監査に PII が入らない（フィールド名のみ）
- P2A2-06: 認証済みユーザーの直接 UPDATE/INSERT 拒否（insufficient_privilege）
- P2A2-07: 被招待者本人は自分の invited 招待を SELECT 可・他人/受諾済みは不可視
- P2A2-08: cancelled 案件では更新不可（customer_case_not_inputtable）

### Unit（app/src/lib/customer-cases/profile.test.ts・PENDING(Mac): vitest は darwin バイナリ）
- P2A2-UNIT-01..04: 基本情報バリデーション（空欄可・形式/長さ・DB 行マッピング・入力開始判定）

### E2E（app/e2e/authenticated/customer-case.spec.ts・SUPABASE_PENDING）
- P2A2-E2E-01: 営業が案件作成→顧客招待→顧客受諾→基本情報オートセーブ→再読込で保持
- P2A2-E2E-02: 顧客(membership なし)は /cases 不可(/no-access)・ポータルは開ける

### 実行状況
- typecheck: PASS（Mac VM tsc --noEmit EXIT=0）
- vitest / next build / PG harness / supabase db reset / e2e / verify:supabase: PENDING(Mac 実機)

## Phase 2A-2b テストケース

### PG ハーネス（scripts/pg-harness/60_phase2b_partner_loans.sql・PENDING(Mac)）
- P2B-01 作成(draft/version1/current) / P2B-02 SALES 作成不可 / P2B-03 SALES draft 不可視・有効化後可視 / P2B-04 他org 不可視・更新不可 / P2B-05 顧客は全テーブル不可視 / P2B-06 直接 DML 拒否 / P2B-07 version 競合検知・新version append・過去保持 / P2B-08 監査に内部メモ非含有 / P2B-09 無効化で有効一覧から除外 / P2B-10 確認で last_confirmed_at 更新。

### Unit（partner-loans/validation.test.ts, errors.test.ts・PENDING(Mac)）
- P2B-UNIT-01..04 バリデーション（bps/円変換・必須・範囲・URL）、P2B-UNIT-ERR-01..02 エラー写像。

### E2E（app/e2e/authenticated/partner-loans.spec.ts・SUPABASE_PENDING）
- P2B-E2E-01 ORG_ADMIN 登録→有効化→新version、SALES 閲覧のみ（登録画面不可）、他org 不可視。

## Phase 2A-3a テストケース

### PG ハーネス（scripts/pg-harness/70_phase2a3a_employment_income.sql）
- P2A3-01 本人が給与系フル入力で complete=true・opened→inputting / P2A3-02 完了判定が雇用形態別ルールに従う（full_time 勤務先欠落=incomplete、self_employed=income+区分で complete、unemployed=種別のみで complete、null 種別=incomplete） / P2A3-03 共同申込者・無関係顧客は他人の勤務収入を更新不可(not_authorized) / P2A3-04 不正入力を種別別安全コードで拒否(enum/未来入社年月/負年収) / P2A3-05 入社年月は月初へ正規化 / P2A3-06 スタッフ(担当営業/org admin)は safe RPC で進捗のみ・値テーブル直接 SELECT は 0 件 / P2A3-07 SYSTEM_ADMIN は進捗 0 件・値も不可視 / P2A3-08 他 org admin は進捗 0 件・値も不可視 / P2A3-09 直接 INSERT/UPDATE/DELETE 拒否 / P2A3-10 監査は初回作成+完了遷移のみ・毎回 autosave では書かず・財務値非含有 / P2A3-11 cancelled 案件では本人でも更新不可。

### Unit（src/lib/customer-cases/employment-income.test.ts）
- P2A3-UNIT-01..11 形式バリデーション（enum 所属・入社年月 YYYY-MM/未来/1900、年収 非負整数/範囲、勤務先名長さ）、DB 行マッピング(date→月/ bigint→文字列)、RPC 引数変換(YYYY-MM→YYYY-MM-01・円→number|null)、不足ラベル写像、進捗ラベル(未入力/入力中/完了)、型ガード。※ 雇用形態別の必須(complete)ルールは TS では検証しないことを UNIT-06 が保証。

### E2E（app/e2e/authenticated/customer-case.spec.ts 拡張）
- P2A2-E2E-01 に追記: 顧客が勤務・収入情報をオートセーブ→完了表示→再読込保持、スタッフ画面は「勤務・収入: 完了」等の進捗のみ表示し入力値(勤務先名)は表示しない。

## Phase 2A-W1 テストケース

### PG ハーネス（scripts/pg-harness/80_phase2aw1_branding.sql）
- W1-01 表示名+色保存(created) / W1-02 色更新(updated) / W1-03 ロゴ path 登録(logo_uploaded) / W1-04 楽観ロック(stale 拒否) / W1-05 ロゴ削除→null / W1-06 reset→null / W1-07 不正入力拒否(色/表示名/他 org path) / W1-07b SVG・traversal 拒否 / W1-10 SALES 更新不可・SELECT 可 / W1-11 customer 更新不可 / W1-12 SYSTEM_ADMIN 更新不可・不可視 / W1-13 他 org 更新不可・不可視 / W1-14 suspended admin 更新不可 / W1-15 customer は公開3項目のみ・値テーブル不可視 / W1-16 監査に url/path/binary 非含有 / W1-17 非 participant 0 件 / W1-18 直接 DML 拒否。Storage: W1-20 自 org folder INSERT 可 / W1-21 他 org 不可 / W1-22 SALES・customer・SYSTEM_ADMIN 不可 / W1-23 他 bucket 不可。

### Unit（src/lib/branding/branding.test.ts）
- W1-UNIT-01..10 HEX/CSS injection・display name・theme 導出・WCAG on-primary・magic bytes(PNG/JPEG/WebP/SVG 拒否)・size/mime/ext/magic・object path(テナント/traversal/SVG)・public URL・error mapping。

### E2E（app/e2e/authenticated/branding.spec.ts・SUPABASE_PENDING）
- P2AW1-E2E-01 保存→スタッフ反映→reload 保持 / -02 PNG upload・SVG 拒否 / -03 SALES 不可 / -04 semantic error 色不変 / -05 reset。
