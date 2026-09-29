import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Sistema Juan",
  description: "Gestión para distribuidores de frutas y verduras.",
  appleWebApp: { title: "Sistema Juan", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#2f7d32" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
