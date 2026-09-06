import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Universe Meta | Competitive Operations",
  description: "Universe Meta competitive operations dashboard",
  icons: {
    icon: "/universe-meta-mark.webp",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
