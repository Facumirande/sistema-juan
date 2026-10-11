import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";

import { GUION_DE_ASPECTO } from "@/ui/aspecto-inicial";
import { AspectoVivo } from "@/ui/aspecto-vivo";
import { SinGestoDeVolver } from "@/ui/sin-gesto-de-volver";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Sistema Repartos",
  description: "Gestión para distribuidores de frutas y verduras.",
  applicationName: "Repartos",
  // Agregada a la pantalla de inicio se abre como una app, sin nada del navegador (también en el iPhone:
  // los más viejos solo entienden la etiqueta con el nombre de Apple, que va en `other`).
  // `black-translucent`: en el iPhone la pantalla llega hasta arriba, por detrás de la hora y la batería (que van
  // en blanco), en vez de dejar una franja negra; `globals.css` baja el contenido con el margen seguro de arriba.
  appleWebApp: { capable: true, title: "Repartos", statusBarStyle: "black-translucent" },
  other: { "apple-mobile-web-app-capable": "yes" },
  // Que el iPhone no convierta precios y cantidades en enlaces de teléfono.
  formatDetection: { telephone: false, address: false, email: false },
};

// Como una app en el celular (pedido del usuario, 10/10/2026): no se agranda con los dedos, ocupa
// toda la pantalla (también detrás de la muesca y de la barra de gestos: `viewport-fit=cover`, con
// los márgenes seguros que pone `globals.css`) y la barra de estado toma el color del fondo del
// sistema, claro u oscuro (la barra de arriba es transparente), para que no quede una franja de otro color.
// Estos dos son los del aparato; `AspectoVivo` los cambia por el del modo elegido y, en el tablero, por el
// del cielo de la imagen de fondo.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#121614" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // El modo claro u oscuro y el aspecto de las tarjetas los pone el guion de `<head>` antes de dibujar nada
    // (son de cada aparato: el servidor no los conoce); por eso `suppressHydrationWarning`.
    <html lang="es" className={`${geistSans.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: GUION_DE_ASPECTO }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        {children}
        {/* El fondo de la franja de la hora y la batería en el iPhone (solo ocupa lugar ahí; `globals.css`). */}
        <div aria-hidden className="franja-de-estado" />
        <AspectoVivo />
        <SinGestoDeVolver />
      </body>
    </html>
  );
}
