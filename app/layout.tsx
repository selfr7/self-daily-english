import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daily English · 每日表达",
  description: "记录口语练习，复习词汇和常用表达。",
  
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

