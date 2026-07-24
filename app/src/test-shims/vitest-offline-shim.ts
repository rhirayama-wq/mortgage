/**
 * オフライン実行用シム（npm レジストリ不通環境向けフォールバック）。
 * 正式なテストランナーは Vitest（`npm run test`）。
 * このシムは `npm run test:offline` 実行時のみ、tsconfig.offline-test.json の
 * paths 設定によって "vitest" の代わりに解決され、node:test へ委譲する。
 * テスト本体のアサーションは node:assert/strict のため両ランナーで同一挙動。
 * Vitest 実行時（node_modules あり）にはこのファイルは使用されない。
 */

import { test as nodeTest } from "node:test";

export const test = nodeTest as unknown as (
  name: string,
  fn: () => void | Promise<void>,
) => void;
