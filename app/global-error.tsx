"use client";

import { useEffect } from "react";

/** Si falla hasta el marco de la aplicación (el menú o el encabezado), una página simple que explica qué hacer. */
export default function ErrorGeneral({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", minHeight: "100dvh", display: "grid", placeItems: "center", padding: 16, background: "Canvas", color: "CanvasText" }}>
        <title>Algo falló · Sistema Repartos</title>
        <main style={{ maxWidth: 560, textAlign: "center", display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
          <span aria-hidden style={{ fontSize: 56 }}>
            🛠️
          </span>
          <h1 style={{ margin: 0, fontSize: 26 }}>El sistema no pudo abrir esta pantalla</h1>
          <p style={{ margin: 0, fontSize: 18, lineHeight: 1.5 }}>
            Es un problema del sistema, no algo que hayas hecho mal. Probá de nuevo en un momento; si sigue pasando, avisale a Facundo
            {error.digest ? ` con este código: ${error.digest}` : ""}.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ minHeight: 48, padding: "0 24px", fontSize: 18, fontWeight: 600, borderRadius: 12, border: "none", background: "#1d7a46", color: "#fff", cursor: "pointer" }}
          >
            Probar de nuevo
          </button>
        </main>
      </body>
    </html>
  );
}
