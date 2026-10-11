import type { MetadataRoute } from "next";

// Para instalar el sistema (pantalla de inicio del celular o la computadora) y abrirlo como una app,
// sin nada del navegador (ni la barra con la dirección). Arranca en el tablero de pedidos;
// manteniendo apretado el ícono aparecen los atajos a lo más usado. Los colores son los de la barra
// de arriba y del fondo del sistema: al abrirla no se ve una franja de otro color.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sistema Repartos",
    short_name: "Repartos",
    description: "Pedidos, compras en el mercado, preparación y entregas del día.",
    id: "/inicio",
    lang: "es-AR",
    dir: "ltr",
    start_url: "/inicio",
    scope: "/",
    display: "standalone",
    orientation: "any",
    categories: ["business", "productivity"],
    background_color: "#f6f7f5",
    theme_color: "#ffffff",
    icons: [
      { src: "/iconos/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/iconos/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/iconos/icono-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Nuevo pedido", short_name: "Pedido", url: "/pedidos/nuevo", icons: [{ src: "/iconos/icono-192.png", sizes: "192x192" }] },
      { name: "Lista de compras", short_name: "Compras", url: "/lista-compra", icons: [{ src: "/iconos/icono-192.png", sizes: "192x192" }] },
      { name: "Logística", short_name: "Logística", url: "/viaje", icons: [{ src: "/iconos/icono-192.png", sizes: "192x192" }] },
    ],
  };
}
