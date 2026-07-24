# 住宅ローン検索・提案プラットフォーム (MVP)

不動産会社の営業担当者が、顧客属性・物件条件から住宅ローン商品の適合可能性を
検索・比較・保存できるプラットフォーム。最終ゴールは不動産事業者向け業務支援と
購入者向け診断・比較・申込支援の融合（docs/feature-map.md）。

**開発ルールの最上位は `CLAUDE.md`。作業開始時は必ず CLAUDE.md → README → /docs の順に読むこと。**

## 現在地（2026-07-24）
- Phase 1（認証・所属・RLS・監査）を再構築中。
- DB 層: migration v6 相当を PGハーネス（PostgreSQL 16.13）で検証済み。
- 認証アプリ層: 6 ブロッカー修正済みの形で実装済み。
- 実 Supabase（PostgREST/GoTrue/Inbucket）検証は未了 → docs/phase1-validation.md。

## 構成
```text
app/                 Next.js 15 (App Router, TS strict)
  src/lib/auth/      アクセス判定・検証・safe-next・OTP・監査（純粋ロジック中心）
  src/lib/supabase/  browser / server / middleware / service クライアント
  src/app/           login, auth/callback, auth/signout(POST),
                     (org-app)/cases, (system)/system-console,
                     no-access, pending-invitation, error
  supabase/          migrations/0001_phase1_identity_org_rls.sql, seed.sql
docs/                設計文書（assumptions が未確定事項の正）
scripts/pg-harness/  PostgreSQL 単体での DB 検証ハーネス
```

## 開発コマンド
```bash
cd app
npm install                 # 要ネットワーク
cp .env.example .env.local  # supabase start の値を設定
npm run verify              # typecheck + lint + unit + build
npm run test                # unit（依存ゼロ、node:test + tsx）
npm run typecheck:pure      # 純粋モジュールのみの strict typecheck
```

## DB ハーネス（Docker 不要）
```bash
PGHOST=/tmp PGPORT=5433 PGUSER=postgres bash scripts/pg-harness/run.sh
```

## 実 Supabase ローカル検証（Docker 必須・Phase 1 完了条件）
```bash
supabase start        # 本番プロジェクトには絶対にリンクしない
supabase db reset     # migrations + seed 適用
# Inbucket: http://127.0.0.1:54324 で Magic Link を受信
E2E_SUPABASE_LOCAL=1 npm run e2e
```

## 禁止事項（抜粋・詳細は CLAUDE.md §32）
本番 Supabase への接続 / 本番 Magic Link 送信 / 実顧客データ・実在金融機関の
非公開条件の投入 / service role key の NEXT_PUBLIC_ 設定。
テストデータは必ず fictional / test only を明記。
