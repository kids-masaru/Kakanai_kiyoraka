import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "介護DX カカナイ",
  description: "介護業務DX - 帳票自動転記・AI分析",
  manifest: "/manifest.json",
  themeColor: "#3b82f6",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased bg-gray-50 min-h-screen">
        {children}
      </body>
    </html>
  );
}
