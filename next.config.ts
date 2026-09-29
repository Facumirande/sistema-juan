import type { NextConfig } from "next";

// Cabeceras de seguridad para todas las respuestas (revisión de la iteración 8). No se fija un
// Content-Security-Policy de scripts porque Next.js usa scripts en línea; sí se impide que el
// sistema se abra dentro de otra página y se limita qué puede usar el navegador (solo la
// ubicación, para marcar direcciones y calcular el viaje).
const cabecerasDeSeguridad = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: cabecerasDeSeguridad }];
  },
};

export default nextConfig;
