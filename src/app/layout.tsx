import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Каталог компаний — Polza Agency",
  description: "Поиск компаний по названию и городу",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
