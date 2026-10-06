// Los tres pasos de la preparación, siempre a la vista (pedido del usuario, 06/10/2026: que se
// entienda qué hacer): separar lo de cada cliente, marcarlo preparado (se hace el remito) y que
// salga (pasa a En camino). El paso en el que se está va resaltado.

export type PasoDePreparacion = "separar" | "preparado" | "sale";

const PASOS: readonly { clave: PasoDePreparacion; icono: string; titulo: string; ayuda: string }[] = [
  { clave: "separar", icono: "📦", titulo: "Separar", ayuda: "Tildá cada producto: “✓ Está todo” o “Falta algo” con el motivo." },
  { clave: "preparado", icono: "🧾", titulo: "Marcar preparado", ayuda: "Con todo tildado, “Marcar como preparado”: el remito se hace solo." },
  { clave: "sale", icono: "🚚", titulo: "Sale", ayuda: "“🚚 Sale ahora” cuando se va a entregar: pasa a En camino." },
];

export function PasosDePreparacion({ actual }: { actual: PasoDePreparacion | null }) {
  const indice = actual ? PASOS.findIndex((p) => p.clave === actual) : PASOS.length;
  return (
    <ol aria-label="Cómo se prepara" className="grid gap-2 sm:grid-cols-3">
      {PASOS.map((p, i) => {
        const hecho = i < indice;
        const ahora = i === indice;
        return (
          <li
            key={p.clave}
            aria-current={ahora ? "step" : undefined}
            className={`flex items-start gap-3 rounded-2xl border-2 p-3 ${ahora ? "border-marca bg-superficie shadow-sm" : hecho ? "border-transparent bg-[var(--pastel-verde)] text-[var(--pastel-verde-texto)]" : "border-borde bg-superficie opacity-80"}`}
          >
            <span aria-hidden className={`flex size-9 shrink-0 items-center justify-center rounded-full text-lg font-bold ${ahora ? "bg-marca text-marca-texto" : hecho ? "bg-[var(--listo-fondo)] text-[var(--listo-texto)]" : "bg-fondo"}`}>
              {hecho ? "✓" : i + 1}
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">
                <span aria-hidden>{p.icono}</span> {p.titulo}
                {ahora && <span className="ml-2 rounded-full bg-marca px-2 py-0.5 text-xs font-bold text-marca-texto">ahora</span>}
              </span>
              <span className={`block text-sm ${hecho ? "" : "text-texto-suave"}`}>{p.ayuda}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** En qué paso está una entrega según su estado y si tiene todo separado. */
export function pasoDeEntrega(estado: string, separadas: number, lineas: number): PasoDePreparacion | null {
  if (estado === "EN_REPARTO" || estado === "ENTREGADA") return null;
  if (estado === "PREPARADA") return "sale";
  return lineas > 0 && separadas === lineas ? "preparado" : "separar";
}
