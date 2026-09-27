import { formatearNumero } from "@/dominio/dinero/formato";
import type { Semaforo } from "@/dominio/compras/credito";

// Semáforo de crédito (06 §8.3): siempre con color + ícono + texto + porcentaje, no solo color.

const ESTILOS: Readonly<Record<Semaforo, { icono: string; texto: string; clases: string }>> = {
  VERDE: { icono: "●", texto: "Verde", clases: "border-marca text-marca" },
  AMARILLO: { icono: "▲", texto: "Amarillo", clases: "border-amber-500 text-amber-600 dark:text-amber-400" },
  ROJO: { icono: "▲!", texto: "Rojo", clases: "border-error text-error" },
  EXCEDIDO: { icono: "⬣", texto: "EXCEDIDO", clases: "border-error bg-error text-superficie" },
  SIN_LIMITE: { icono: "○", texto: "Sin límite", clases: "border-borde text-texto-suave" },
};

export function SemaforoCredito({ semaforo, usoPct }: { semaforo: Semaforo; usoPct?: string | null }) {
  const e = ESTILOS[semaforo];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm font-semibold whitespace-nowrap ${e.clases}`}>
      <span aria-hidden>{e.icono}</span>
      {e.texto}
      {usoPct && ` ${formatearNumero(usoPct, { decimales: 1 })} %`}
    </span>
  );
}
