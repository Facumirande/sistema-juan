import type { MetadataRoute } from "next";

// Para agregar el sistema a la pantalla de inicio del celular y abrirlo como una app, sin la barra
// del navegador. Arranca en el tablero de pedidos.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sistema Juan",
    short_name: "Sistema Juan",
    description: "Pedidos, compras en el mercado, preparación y entregas del día.",
    lang: "es-AR",
    start_url: "/inicio",
    display: "standalone",
    background_color: "#f6f7f5",
    theme_color: "#2f7d32",
    icons: [
      { src: "/iconos/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/iconos/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/iconos/icono-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
