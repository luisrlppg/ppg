import type { Metadata } from "next";
import { PreferencesProvider } from "@/lib/preferences";
import "./globals.css";

export const metadata: Metadata = {
  title: "PLASA ERP",
  description: "ERP de producción PLASA",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <PreferencesProvider>{children}</PreferencesProvider>
      </body>
    </html>
  );
}