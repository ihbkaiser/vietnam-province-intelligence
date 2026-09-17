import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EduGeo AI",
  description: "Nền tảng hỗ trợ dạy và học Lịch sử, Địa lý bằng RAG AI"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
