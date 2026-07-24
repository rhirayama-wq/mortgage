import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "住宅ローン検索プラットフォーム",
  description:
    "不動産会社向け 住宅ローン検索・比較・提案支援プラットフォーム (MVP)",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
