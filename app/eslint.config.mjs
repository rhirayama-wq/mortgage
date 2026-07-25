import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Next.js 自動生成ファイル。内容は編集せず ESLint 対象から除外する
    // （triple-slash-reference は生成物由来のため。ルール自体は無効化しない）。
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "**/next-env.d.ts",
    ],
  },
];

export default eslintConfig;
