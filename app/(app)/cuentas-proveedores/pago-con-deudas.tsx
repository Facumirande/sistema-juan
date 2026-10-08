"use client";

import { useState } from "react";

import { imputarFIFO } from "@/dominio/compras/credito";
import { dec, sumar, type ValorDecimal } from "@/dominio/dinero/decimal";
import { interpretarNumero } from "@/dominio/dinero/entrada";
import { formatearMoneda, formatearNumero } from "@/dominio/dinero/formato";

import type { DeudaParaImputar } from "./imputacion-pago";

// "Otro pago" (pedido del usuario, 07/10/2026): el importe ya viene cargado con todo lo que se le
// debe; cada compra se elige con un tilde y el importe se calcula solo con lo elegido. Si se paga
// menos, se escribe el importe y se descuenta de lo más viejo de lo elegido. Así el registro deja
// claro qué compra pagó cada pago.

/** Un importe como lo lee el servidor ("2440,50"): con coma decimal y sin puntos. */
const paraEnviar = (v: ValorDecimal) => dec(v).toFixed(2).replace(".", ",");
const paraEscribir = (v: ValorDecimal) => formatearNumero(v, { decimales: 2, recortarCeros: true });

export function PagoConDeudas({ deudas, proveedor }: { deudas: DeudaParaImputar[]; proveedor: string }) {
  const [elegidas, setElegidas] = useState<readonly string[]>(deudas.map((d) => d.clave));
  const [texto, setTexto] = useState(deudas.length > 0 ? paraEscribir(sumar(deudas.map((d) => d.pendiente))) : "");

  const suyas = deudas.filter((d) => elegidas.includes(d.clave));
  const totalElegido = sumar(suyas.map((d) => d.pendiente));
  const monto = interpretarNumero(texto);
  const valido = monto !== null && monto.gt(0);
  // Sin ninguna elegida, lo que se pague va a las compras más viejas.
  const aCuales = suyas.length > 0 ? suyas : deudas;
  const reparto = valido ? imputarFIFO(aCuales.map((d) => ({ id: d.clave, pendiente: d.pendiente })), monto) : null;
  const pagaDe = (clave: string) => reparto?.imputaciones.find((i) => i.id === clave)?.monto ?? null;

  /** Al cambiar lo elegido, el importe pasa a ser la suma de lo elegido. */
  const elegir = (claves: readonly string[]) => {
    setElegidas(claves);
    const total = sumar(deudas.filter((d) => claves.includes(d.clave)).map((d) => d.pendiente));
    setTexto(total.gt(0) ? paraEscribir(total) : "");
  };
  const alternar = (clave: string) => elegir(elegidas.includes(clave) ? elegidas.filter((c) => c !== clave) : deudas.map((d) => d.clave).filter((c) => c === clave || elegidas.includes(c)));

  const chico = "min-h-11 rounded-full border-2 border-borde px-4 font-semibold hover:border-marca";

  return (
    <div className="flex flex-col gap-4">
      {/* Lo que viaja al servidor: con algo elegido, el pago va justo a esas compras. */}
      <input type="hidden" name="modo" value={suyas.length > 0 ? "MANUAL" : "FIFO"} />
      {suyas.length > 0 && reparto?.imputaciones.map((i) => <input key={i.id} type="hidden" name={`asig_${i.id}`} value={paraEnviar(i.monto)} />)}

      {deudas.length === 0 ? (
        <p className="rounded-xl bg-fondo p-4 text-lg">No hay compras sin pagar. Lo que le pagues ahora queda a favor y se descuenta solo de las próximas compras.</p>
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-xl font-bold">1. ¿Qué compras le pagás?</legend>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => elegir(deudas.map((d) => d.clave))} className={chico}>
              ☑ Todas
            </button>
            <button type="button" onClick={() => elegir([])} className={chico}>
              ☐ Ninguna
            </button>
            <span className="text-texto-suave">Tocá cada compra para sumarla o sacarla: el importe se calcula solo.</span>
          </div>
          <ul className="flex flex-col gap-2">
            {deudas.map((d) => {
              const elegida = elegidas.includes(d.clave);
              const paga = pagaDe(d.clave);
              const queda = paga ? dec(d.pendiente).minus(paga) : dec(d.pendiente);
              return (
                <li key={d.clave}>
                  <label className={`flex min-h-16 cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border-2 px-3 py-2 ${elegida ? "border-marca bg-marca/10" : "border-borde bg-superficie"}`}>
                    <input type="checkbox" checked={elegida} onChange={() => alternar(d.clave)} className="size-7 shrink-0 accent-[var(--marca)]" aria-label={`Pagar ${d.descripcion}`} />
                    <span className="min-w-0 flex-1 basis-40">
                      <b className="text-lg">{d.descripcion}</b>
                      <span className="block text-texto-suave">{d.detalle}</span>
                    </span>
                    <span className="text-right">
                      <b className="text-xl tabular-nums">{formatearMoneda(d.pendiente)}</b>
                      <span className={`block font-semibold ${paga ? (queda.isZero() ? "text-marca" : "text-amber-600 dark:text-amber-400") : "text-texto-suave"}`}>
                        {paga ? (queda.isZero() ? "✓ queda pagada" : `se pagan ${formatearMoneda(paga)} · quedan ${formatearMoneda(queda)}`) : "sigue sin pagar"}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}

      <label className="flex flex-col gap-2">
        <span className="text-xl font-bold">
          {deudas.length > 0 ? "2. " : ""}¿Cuánto le pagás? <span className="text-error">*</span>
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden className="text-3xl font-bold">
            $
          </span>
          <input
            name="monto"
            required
            inputMode="decimal"
            autoComplete="off"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            placeholder="Ej. 200.000"
            className="h-16 w-full max-w-xs rounded-xl border-2 border-borde bg-superficie px-4 text-3xl font-bold tabular-nums"
          />
        </span>
        <span className="font-semibold" role="status">
          {!valido
            ? suyas.length === 0 && deudas.length > 0
              ? "Elegí qué compras pagás, o escribí el importe (se descuenta de las más viejas)."
              : "Escribí cuánto le pagás."
            : reparto && reparto.sobrante.gt(0)
              ? `Es más de lo ${suyas.length > 0 ? "elegido" : "que le debemos"}: quedan ${formatearMoneda(reparto.sobrante)} a nuestro favor con ${proveedor}, para las próximas compras.`
              : suyas.length === 0 && deudas.length > 0
                ? "No elegiste ninguna compra: se descuenta de las más viejas."
                : monto.lt(totalElegido)
                  ? `Pagás una parte de lo elegido (${formatearMoneda(totalElegido)}): se descuenta primero de lo más viejo.`
                  : suyas.length === deudas.length && deudas.length > 0
                    ? `Con este pago no le quedamos debiendo nada a ${proveedor}.`
                    : ""}
        </span>
      </label>
    </div>
  );
}
