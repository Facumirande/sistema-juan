import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Sistema Repartos",
  description: "Gestión para distribuidores de frutas y verduras.",
  applicationName: "Repartos",
  // Agregada a la pantalla de inicio se abre como una app, sin nada del navegador (también en el iPhone:
  // los más viejos solo entienden la etiqueta con el nombre de Apple, que va en `other`).
  appleWebApp: { capable: true, title: "Repartos", statusBarStyle: "default" },
  other: { "apple-mobile-web-app-capable": "yes" },
  // Que el iPhone no convierta precios y cantidades en enlaces de teléfono.
  formatDetection: { telephone: false, address: false, email: false },
};

// Como una app en el celular (pedido del usuario, 10/10/2026): no se agranda con los dedos, ocupa
// toda la pantalla (también detrás de la muesca y de la barra de gestos: `viewport-fit=cover`, con
// los márgenes seguros que pone `globals.css`) y la barra de estado toma el color de la barra de
// arriba del sistema, claro u oscuro, para que no quede una franja de otro color.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1b201e" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
