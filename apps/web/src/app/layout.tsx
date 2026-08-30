import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PPG ERP",
  description: "ERP de producción PPG",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}