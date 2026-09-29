import type { ReactNode } from "react";

// Piezas de las altas guiadas (clientes, proveedores): cada pregunta numerada en su tarjeta y los
// botones grandes para elegir una opción.

export function Pregunta({ n, titulo, ayuda, children }: { n: number; titulo: string; ayuda?: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-2xl border border-borde bg-superficie p-4 sm:p-5">
      <legend className="sr-only">{titulo}</legend>
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-marca font-bold text-marca-texto">
          {n}
        </span>
        <div>
          <p className="text-lg font-semibold">{titulo}</p>
          {ayuda && <p className="text-sm text-texto-suave">{ayuda}</p>}
        </div>
      </div>
      {children}
    </fieldset>
  );
}

/** Clases de un botón de opción (elegido o no). */
export const opcion = (elegida: boolean) =>
  `flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border-2 px-4 py-2 text-left font-medium ${elegida ? "border-marca bg-marca/10" : "border-borde bg-superficie hover:border-marca/60"}`;

export const campoGrande = "h-12 rounded-xl border-2 border-borde bg-superficie px-3 text-base";
