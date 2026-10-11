"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";

import { interpretarNumero } from "@/dominio/dinero/entrada";
import { formatearMoneda, formatearNumero } from "@/dominio/dinero/formato";
import { ESTADO_INICIAL, type EstadoAccion } from "@/ui/estado-accion";

import { comprarDeLaListaAccion } from "./acciones";

// "💲 Precio y puesto" de un renglón de la lista de compras (pedido del usuario, 07/10/2026): se
// anota ahí mismo en qué puesto se compró, cuánto y a cuánto, sin salir de la lista. Es una compra
// común: el precio queda como el último de ese puesto para ese producto (en la ficha del producto y
// en la del proveedor, con su historial) y, si es a cuenta, se suma a lo que se le debe.

export interface DatosParaComprar {
  /** "kg", "u"… */
  unidad: string;
  /** Envases en los que se compra el producto. */
  envases: { id: string; nombre: string; factor: string }[];
  /** Los puestos que ya lo venden, con su último precio. */
  ofertas: { ofertaId: string; proveedorId: string; presentacionId: string; precio: string; factor: string }[];
  sugerido: { proveedorId: string | null; envaseId: string | null; cantidad: string };
}

interface Props {
  itemId: string;
  productoId: string;
  producto: string;
  datos: DatosParaComprar;
  proveedores: { id: string; nombre: string; aCuenta: boolean }[];
  puedeExceder: boolean;
  alGuardar: () => void;
}

const sinPesos = (v: string) => formatearMoneda(v).replace("$", "").trim();
const etiqueta = "text-sm font-semibold text-texto-suave";
const control = (mal: boolean) => `rounded-xl border-2 bg-superficie ${mal ? "border-error" : "border-borde"}`;

export function PrecioYPuesto({ itemId, productoId, producto, datos, proveedores, puedeExceder, alGuardar }: Props) {
  // Al guardar bien, el renglón se cierra solo y queda tildado con su puesto y su precio.
  const [estado, enviar, enviando] = useActionState(async (previo: EstadoAccion, fd: FormData) => {
    const r = await comprarDeLaListaAccion(previo, fd);
    if (r.ok) alGuardar();
    return r;
  }, ESTADO_INICIAL);
  const [clave] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : ""));
  const ofertaDe = (p: string, e: string) => datos.ofertas.find((o) => o.proveedorId === p && o.presentacionId === e) ?? null;
  const [proveedorId, setProveedorId] = useState(datos.sugerido.proveedorId ?? "");
  const [envaseId, setEnvaseId] = useState(datos.sugerido.envaseId ?? datos.envases[0]?.id ?? "");
  const [cantidad, setCantidad] = useState(datos.sugerido.cantidad);
  const [precio, setPrecio] = useState(() => {
    const o = ofertaDe(datos.sugerido.proveedorId ?? "", datos.sugerido.envaseId ?? "");
    return o ? sinPesos(o.precio) : "";
  });
  // Con puesto, a cuenta; sin puesto, pagado en efectivo (se puede cambiar; 10/10/2026).
  const [pago, setPago] = useState<"CUENTA" | "PAGADO">(datos.sugerido.proveedorId ? "CUENTA" : "PAGADO");
  const [exceder, setExceder] = useState(false);
  const [motivoExceso, setMotivoExceso] = useState("");
  // Recién al tocar "Guardar" se marcan en rojo los casilleros obligatorios que quedaron vacíos.
  const [revisado, setRevisado] = useState(false);

  if (datos.envases.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-amber-500 bg-superficie p-3">
        <p className="min-w-0 flex-1">
          <b>A {producto} le falta el envase de compra.</b> Para anotar el precio hay que decir en qué viene (cajón, bolsa o suelto) y cuánto trae. Se carga una sola vez.
        </p>
        <Link href={`/productos/${productoId}`} className="flex min-h-11 items-center rounded-xl bg-marca px-4 font-bold text-marca-texto">
          Cargar el envase →
        </Link>
      </div>
    );
  }

  const oferta = ofertaDe(proveedorId, envaseId);
  const envase = datos.envases.find((e) => e.id === envaseId) ?? null;
  const proveedor = proveedores.find((p) => p.id === proveedorId) ?? null;
  const c = interpretarNumero(cantidad);
  const p = interpretarNumero(precio);
  const total = c && p ? c.times(p) : null;
  const factor = oferta?.factor ?? envase?.factor ?? null;
  const porUnidad = p && factor && Number(factor) > 0 && Number(factor) !== 1 ? p.div(factor) : null;
  const loVenden = new Set(datos.ofertas.map((o) => o.proveedorId));
  const enOrden = [...proveedores].sort((a, b) => Number(loVenden.has(b.id)) - Number(loVenden.has(a.id)));
  const falta = { cantidad: !c || c.lte(0), precio: !p || p.lte(0) };
  const confirmar = estado.requiereConfirmacion === true;

  const elegir = (nuevoProveedor: string, nuevoEnvase: string) => {
    setProveedorId(nuevoProveedor);
    setEnvaseId(nuevoEnvase);
    const o = ofertaDe(nuevoProveedor, nuevoEnvase);
    setPrecio(o ? sinPesos(o.precio) : "");
  };
  const elegirProveedor = (id: string) => {
    // Si ese puesto lo vende en otro envase, se pasa a ese.
    const suya = ofertaDe(id, envaseId) ?? datos.ofertas.find((o) => o.proveedorId === id) ?? null;
    elegir(id, suya?.presentacionId ?? envaseId);
    setPago(id ? "CUENTA" : "PAGADO");
  };
  const sumar = (paso: number) => setCantidad(formatearNumero(String(Math.max(0, (c ? Number(c.toString()) : 0) + paso)), { decimales: 3, recortarCeros: true }));
  const guardar = () => {
    setRevisado(true);
    if (falta.cantidad || falta.precio) return;
    const fd = new FormData();
    fd.append("itemId", itemId);
    fd.append("claveIdempotencia", clave);
    fd.append("puesto", oferta ? `oferta:${oferta.ofertaId}` : proveedorId ? `proveedor:${proveedorId}:${envaseId}` : `sinpuesto::${envaseId}`);
    fd.append("pago", proveedorId ? pago : "PAGADO");
    fd.append("cantidad", cantidad);
    fd.append("precio", precio);
    if (confirmar) fd.append("confirmarVariacion", "on");
    if (exceder) {
      fd.append("exceder", "on");
      fd.append("motivoExceso", motivoExceso);
    }
    startTransition(() => enviar(fd));
  };
  const boton = "flex size-11 shrink-0 items-center justify-center rounded-lg text-3xl leading-none font-bold text-marca hover:bg-fondo";

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_auto_minmax(0,1fr)]">
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>
            Puesto donde lo compraste
          </span>
          <select value={proveedorId} onChange={(e) => elegirProveedor(e.target.value)} className={`h-12 px-3 text-lg font-semibold ${control(false)}`}>
            <option value="">Sin puesto (efectivo)</option>
            {enOrden.map((x) => {
              const suya = datos.ofertas.find((o) => o.proveedorId === x.id);
              return (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                  {suya ? ` · ${formatearMoneda(suya.precio)}` : ""}
                </option>
              );
            })}
          </select>
        </label>

        <div className="flex flex-col gap-1">
          <span className={etiqueta}>
            Cantidad <span className="text-error">*</span>
          </span>
          <div className={`flex items-center gap-1 p-0.5 ${control(revisado && falta.cantidad)}`}>
            <button type="button" onClick={() => sumar(-1)} aria-label="Uno menos" className={boton}>
              −
            </button>
            <input
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              onFocus={(e) => e.target.select()}
              inputMode="decimal"
              aria-label={`Cuántos ${envase?.nombre.toLowerCase() ?? "envases"} de ${producto}`}
              aria-invalid={revisado && falta.cantidad}
              className="h-11 w-16 min-w-0 flex-1 bg-transparent text-center text-2xl font-extrabold tabular-nums"
            />
            <button type="button" onClick={() => sumar(1)} aria-label="Uno más" className={boton}>
              +
            </button>
          </div>
          {revisado && falta.cantidad && <span className="text-sm font-medium text-error">Falta la cantidad.</span>}
        </div>

        <label className="flex flex-col gap-1">
          <span className={etiqueta}>
            Precio por {envase?.nombre.toLowerCase() ?? "envase"} <span className="text-error">*</span>
          </span>
          <span className={`flex items-center gap-2 px-3 ${control(revisado && falta.precio)}`}>
            <span aria-hidden className="text-2xl font-bold text-texto-suave">
              $
            </span>
            <input
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              onFocus={(e) => e.target.select()}
              inputMode="decimal"
              placeholder="0"
              aria-invalid={revisado && falta.precio}
              className="h-12 min-w-0 flex-1 bg-transparent text-2xl font-extrabold tabular-nums"
            />
          </span>
          {revisado && falta.precio ? (
            <span className="text-sm font-medium text-error">Falta el precio.</span>
          ) : (
            <span className="text-sm text-texto-suave">
              {oferta ? `Último precio: ${formatearMoneda(oferta.precio)}` : proveedor ? "Primer precio de este puesto: queda guardado." : ""}
              {porUnidad && ` · ${formatearMoneda(porUnidad.toString())} por ${datos.unidad}`}
            </span>
          )}
        </label>
      </div>

      {datos.envases.length > 1 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="En qué envase lo compraste">
          <span className={etiqueta}>Envase</span>
          {datos.envases.map((e) => (
            <button key={e.id} type="button" onClick={() => elegir(proveedorId, e.id)} aria-pressed={envaseId === e.id} className={`min-h-10 rounded-full border-2 px-4 font-bold ${envaseId === e.id ? "border-marca bg-marca text-marca-texto" : "border-borde bg-superficie"}`}>
              {e.nombre}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="grid grid-cols-2 overflow-hidden rounded-xl border-2 border-borde" role="group" aria-label="Forma de pago">
          {(
            [
              ["PAGADO", "💵 Pagado"],
              ["CUENTA", "📒 A cuenta"],
            ] as const
          ).map(([valor, texto]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setPago(valor)}
              aria-pressed={(proveedorId ? pago : "PAGADO") === valor}
              // Sin puesto no hay a quién deberle: queda pagado.
              disabled={!proveedorId && valor === "CUENTA"}
              title={!proveedorId && valor === "CUENTA" ? "Elegí el puesto para dejarlo a cuenta" : undefined}
              className={`min-h-11 px-4 font-bold disabled:cursor-not-allowed disabled:opacity-50 ${(proveedorId ? pago : "PAGADO") === valor ? "bg-marca text-marca-texto" : "bg-superficie"}`}
            >
              {texto}
            </button>
          ))}
        </div>
        <p className="min-w-0 flex-1 text-sm text-texto-suave">{!proveedor ? "Sin puesto: queda pagada en efectivo." : pago === "CUENTA" ? `Queda a pagar: se suma a lo que le debemos a ${proveedor.nombre}.` : "Queda pagada: no suma deuda."}</p>
        <p className="text-lg">
          Total <b className="text-2xl tabular-nums">{total ? formatearMoneda(total.toString()) : "$ —"}</b>
        </p>
        <button type="button" onClick={guardar} disabled={enviando} className="min-h-12 rounded-xl bg-marca px-5 text-lg font-bold text-marca-texto disabled:animate-pulse disabled:opacity-60">
          {enviando ? "Guardando…" : confirmar ? "✓ Confirmar" : "✓ Guardar la compra"}
        </button>
      </div>

      {estado.mensaje && !estado.ok && (
        <div role="alert" className="flex flex-col gap-2 rounded-xl bg-error/10 px-4 py-3 font-medium text-error">
          <p>{estado.mensaje}</p>
          {estado.enlace && (
            <Link href={estado.enlace.href} className="self-start rounded-lg bg-superficie px-3 py-2 font-semibold text-texto shadow-sm">
              {estado.enlace.texto}{"\u00a0→"}
            </Link>
          )}
          {puedeExceder && /l[ií]mite/i.test(estado.mensaje) && (
            <div className="flex flex-col gap-2 text-texto">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={exceder} onChange={(e) => setExceder(e.target.checked)} className="size-5" /> Anotarla igual, aunque pase el límite de crédito del puesto
              </label>
              {exceder && <input value={motivoExceso} onChange={(e) => setMotivoExceso(e.target.value)} placeholder="Por qué (ej. hay que abastecer al hospital)" className="h-11 rounded-lg border border-borde bg-superficie px-3" />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
