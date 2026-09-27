"use client";

import { useState, type ReactNode } from "react";

import { imputarFIFO } from "@/dominio/compras/credito";
import { dec, sumar } from "@/dominio/dinero/decimal";
import { interpretarNumero } from "@/dominio/dinero/entrada";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { CampoNumero } from "@/ui/formularios";

export interface DeudaParaImputar {
  clave: string;
  descripcion: string;
  detalle: string;
  pendiente: string;
}

/**
 * Monto e imputación de un pago (P-62, 06 §4.2 y §4.3): con FIFO muestra antes de confirmar qué
 * compras quedan pagadas y cuánto queda a favor; con "Elegir", un importe por compra.
 */
export function ImputacionPago({
  deudas,
  montoFijo,
  modoInicial = "FIFO",
  iniciales = {},
  children,
}: {
  deudas: DeudaParaImputar[];
  montoFijo?: string;
  modoInicial?: "FIFO" | "MANUAL";
  /** Importes ya asignados por deuda (al cambiar la imputación de un pago). */
  iniciales?: Record<string, string>;
  /** Otros campos del pago, entre el monto y la lista de compras. */
  children?: ReactNode;
}) {
  const [texto, setTexto] = useState("");
  const [modo, setModo] = useState(modoInicial);
  const [asignado, setAsignado] = useState<Record<string, string>>(iniciales);
  const monto = montoFijo ? dec(montoFijo) : interpretarNumero(texto);
  const fifo = monto && monto.gt(0) ? imputarFIFO(deudas.map((d) => ({ id: d.clave, pendiente: d.pendiente })), monto) : null;
  const totalAsignado = sumar(Object.values(asignado).map((v) => interpretarNumero(v) ?? dec(0)));

  return (
    <div className="flex flex-col gap-3">
      {!montoFijo && <CampoNumero etiqueta="Monto" name="monto" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej. 200.000" />}
      {children}
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-1 font-medium">A qué compras va</legend>
        <label className="flex min-h-11 items-center gap-2">
          <input type="radio" name="modo" value="FIFO" checked={modo === "FIFO"} onChange={() => setModo("FIFO")} className="size-5" />
          A las más viejas primero
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="radio" name="modo" value="MANUAL" checked={modo === "MANUAL"} onChange={() => setModo("MANUAL")} className="size-5" />
          Elegir
        </label>
      </fieldset>

      {deudas.length === 0 ? (
        <p className="text-texto-suave">No hay compras pendientes: todo el pago queda a favor para las próximas compras.</p>
      ) : modo === "FIFO" ? (
        <ul className="flex flex-col rounded-lg border border-borde">
          {deudas.map((d) => {
            const aplicado = fifo?.imputaciones.find((i) => i.id === d.clave)?.monto;
            const queda = aplicado ? dec(d.pendiente).minus(aplicado) : dec(d.pendiente);
            return (
              <li key={d.clave} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-borde px-3 py-2 first:border-t-0">
                <span>
                  <b>{d.descripcion}</b> <span className="text-sm text-texto-suave">{d.detalle}</span>
                </span>
                <span className="text-right">
                  debe {formatearMoneda(d.pendiente)}
                  {aplicado && (
                    <span className={`block text-sm font-semibold ${queda.isZero() ? "text-marca" : "text-amber-600 dark:text-amber-400"}`}>
                      {queda.isZero() ? "queda pagada" : `se pagan ${formatearMoneda(aplicado)}, quedan ${formatearMoneda(queda)}`}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="flex flex-col gap-2">
          {deudas.map((d) => (
            <li key={d.clave} className="grid grid-cols-[1fr_10rem] items-end gap-2">
              <span>
                <b>{d.descripcion}</b> <span className="text-sm text-texto-suave">{d.detalle}</span>
                <span className="block text-sm">debe {formatearMoneda(d.pendiente)}</span>
              </span>
              <CampoNumero
                etiqueta="Pagar"
                name={`asig_${d.clave}`}
                value={asignado[d.clave] ?? ""}
                onChange={(e) => setAsignado({ ...asignado, [d.clave]: e.target.value })}
                placeholder="0"
              />
            </li>
          ))}
        </ul>
      )}

      {monto && monto.gt(0) && (
        <p className="font-semibold">
          {modo === "FIFO"
            ? fifo && fifo.sobrante.gt(0) && `Quedan ${formatearMoneda(fifo.sobrante)} a favor para las próximas compras.`
            : totalAsignado.gt(monto)
              ? `Asignaste ${formatearMoneda(totalAsignado)}: es más que el pago.`
              : `Asignado ${formatearMoneda(totalAsignado)} · quedan ${formatearMoneda(monto.minus(totalAsignado))} a favor.`}
        </p>
      )}
    </div>
  );
}
