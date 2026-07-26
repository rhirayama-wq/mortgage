/**
 * setup が書き出す実行時マニフェストの読み書き。
 * 法人 ID / membership ID は `supabase db reset` のたびに再採番されるため、
 * テスト側にハードコードせず必ずここ経由で参照する（テスト順序非依存・再現可能）。
 * 秘密値（token / Cookie / key）は保存しない。
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  FIXTURE_MANIFEST_PATH,
  type FixtureKey,
  type FixtureManifest,
} from "./identities";

export function writeFixtureManifest(manifest: FixtureManifest): void {
  writeFileSync(FIXTURE_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export function readFixtureManifest(): FixtureManifest {
  if (!existsSync(FIXTURE_MANIFEST_PATH)) {
    throw new Error(
      "e2e fixture manifest is missing — run the `auth-setup` project first (npm run e2e:local)",
    );
  }
  const parsed = JSON.parse(readFileSync(FIXTURE_MANIFEST_PATH, "utf8")) as FixtureManifest;
  if (!parsed.organizationIds?.A || !parsed.organizationIds?.B) {
    throw new Error("e2e fixture manifest is malformed — re-run the `auth-setup` project");
  }
  return parsed;
}

export function membershipIdOf(manifest: FixtureManifest, key: FixtureKey): string {
  const id = manifest.membershipIds[key];
  if (!id) {
    throw new Error(`e2e fixture manifest has no membership id for "${key}"`);
  }
  return id;
}
