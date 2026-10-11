"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";

import { Checklist, conTildeDeCompra, motivoParaNoTildar, type ProductoDeChecklist, type Tilde } from "@/ui/checklist";
import { ESTADO_INICIAL, type EstadoAccion } from "@/ui/estado-accion";

import { PrecioYPuesto, type DatosParaComprar } from "../lista-compra/precio-y-puesto";

import { separarProductoAccion, tildarProductoAccion } from "./acciones";

// El mismo checklist de la tarjeta del tablero, para la tarjeta abierta y la pantalla de
// preparación: se tilda ahí mismo, queda marcado al instante y se guarda solo. Si algo no se puede,
// dice por qué y cómo seguir.

type Accion = (estado: EstadoAccion, datos: FormData) => Promise<EstadoAccion>;
type Cambio = { indice: number; producto: ProductoDeChecklist };

/** Lo necesario para anotar, desde la tarjeta, a quién se le compró cada producto y a cuánto. */
export interface ParaComprar {
  /** Por renglón de la lista de compras. */
  /** `anotada`: ya se le anotó una compra con su precio (el botón "$" lo muestra). */
  compras: Record<string, { productoId: string; producto: string; datos: DatosParaComprar; anotada: boolean }>;
  proveedores: { id: string; nombre: string; aCuenta: boolean }[];
  puedeExceder: boolean;
}

export function ChecklistVivo({ productos, modo, fecha, etiqueta, paraComprar }: { productos: ProductoDeChecklist[]; modo: "compra" | "separar"; fecha: string; etiqueta?: string; paraComprar?: ParaComprar | null }) {
  const router = useRouter();
  /** El renglón de la lista que tiene abierto su panel de precio y puesto. */
  const [anotando, setAnotando] = useState<string | null>(null);
  const compraDe = (p: ProductoDeChecklist) => (modo === "compra" && p.listaItemId && p.compra !== "NO_CONSEGUIDO" ? (paraComprar?.compras[p.listaItemId] ?? null) : null);
  const [vista, cambiar] = useOptimistic(productos, (actual: ProductoDeChecklist[], c: Cambio) => actual.map((p, i) => (i === c.indice ? c.producto : p)));
  const [mensaje, setMensaje] = useState<EstadoAccion>(ESTADO_INICIAL);
  const [, empezar] = useTransition();
  // Lo último que se mandó, por si el servidor pide confirmarlo (destildar una compra anotada).
  const [ultimo, setUltimo] = useState<{ cambio: Cambio; accion: Accion; datos: Record<string, string> } | null>(null);

  const guardar = (cambio: Cambio, accion: Accion, datos: Record<string, string>) => {
    setUltimo({ cambio, accion, datos });
    const fd = new FormData();
    for (const [clave, valor] of Object.entries(datos)) fd.append(clave, valor);
    empezar(async () => {
      cambiar(cambio);
      const r = await accion(ESTADO_INICIAL, fd);
      // Lo que sale bien se ve en el tilde y no dice nada: solo se avisa lo que no se pudo hacer.
      setMensaje(r.ok ? ESTADO_INICIAL : r.mensaje ? r : { ok: false, mensaje: "No se pudo guardar: revisá la conexión y probá de nuevo." });
    });
  };
  const tildar = (p: ProductoDeChecklist, valor: Tilde) => {
    const motivo = motivoParaNoTildar(p, valor, fecha);
    if (motivo) {
      setMensaje({ ok: false, ...motivo });
      return;
    }
    guardar({ indice: vista.indexOf(p), producto: conTildeDeCompra(p, valor) }, tildarProductoAccion, { itemId: p.listaItemId!, valor, desde: p.compra ?? "" });
  };
  const separar = (p: ProductoDeChecklist, separado: boolean) => {
    if (!p.entregaItemId) return;
    guardar({ indice: vista.indexOf(p), producto: { ...p, hecha: separado } }, separarProductoAccion, { itemId: p.entregaItemId, separado: separado ? "si" : "no" });
  };

  return (
    <div className="flex flex-col gap-2">
      {mensaje.mensaje && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-[var(--vence-fondo)] px-4 py-3 font-medium text-[var(--vence-texto)]">
          <span className="min-w-0 flex-1">{mensaje.mensaje}</span>
          {mensaje.requiereConfirmacion && ultimo && (
            <button type="button" onClick={() => guardar(ultimo.cambio, ultimo.accion, { ...ultimo.datos, confirmarVariacion: "on" })} className="rounded-lg bg-white px-3 py-2 font-bold text-[#172b4d] shadow-sm">
              Confirmar
            </button>
          )}
          {mensaje.enlace && (
            <Link href={mensaje.enlace.href} className="rounded-lg bg-white px-3 py-2 font-semibold text-[#172b4d] shadow-sm">
              {mensaje.enlace.texto}{"\u00a0→"}
            </Link>
          )}
          <button type="button" onClick={() => setMensaje(ESTADO_INICIAL)} aria-label="Cerrar el aviso" className="flex size-9 items-center justify-center rounded-full text-xl leading-none hover:bg-black/10">
            ×
          </button>
        </div>
      )}
      <Checklist
        productos={vista}
        modo={modo}
        alTildar={tildar}
        alSeparar={separar}
        tamano="amplio"
        etiqueta={etiqueta}
        alLado={(p) => {
          const compra = compraDe(p);
          if (!compra) return null;
          // Amarillo mientras falta anotar el precio; oscuro y con tilde cuando ya se anotó.
          const color = compra.anotada ? "border-black/70 bg-black/75 text-amber-300 hover:bg-black/60 dark:border-white/30" : anotando === p.listaItemId ? "border-amber-600 bg-amber-500 text-black" : "border-amber-500 bg-amber-400 text-black hover:bg-amber-300";
          return (
            <button
              type="button"
              onClick={() => setAnotando(anotando === p.listaItemId ? null : p.listaItemId!)}
              aria-expanded={anotando === p.listaItemId}
              aria-label={compra.anotada ? `${p.nombre}: el precio ya está anotado (tocá para sumar otra compra)` : `${p.nombre}: anotar a quién se le compró y a cuánto`}
              title={compra.anotada ? "Precio ya anotado: tocá para sumar otra compra" : "Anotar el precio de compra y el proveedor"}
              className={`relative flex size-12 shrink-0 items-center justify-center rounded-xl border-2 text-3xl leading-none font-black shadow-sm transition-transform active:scale-90 ${color}`}
            >
              $
              {compra.anotada && (
                <span aria-hidden className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-[var(--listo-fondo)] text-xs font-black text-white">
                  ✓
                </span>
              )}
            </button>
          );
        }}
        debajo={(p) => {
          const compra = compraDe(p);
          return (
            compra &&
            anotando === p.listaItemId && (
              <div className="mt-1 rounded-xl border-2 border-dashed border-amber-500/70 bg-black/[0.04] p-3 text-base dark:bg-white/[0.06]">
                <PrecioYPuesto
                  key={p.listaItemId}
                  itemId={p.listaItemId!}
                  productoId={compra.productoId}
                  producto={compra.producto}
                  datos={compra.datos}
                  proveedores={paraComprar!.proveedores}
                  puedeExceder={paraComprar!.puedeExceder}
                  alGuardar={() => {
                    setAnotando(null);
                    router.refresh();
                  }}
                />
              </div>
            )
          );
        }}
      />
    </div>
  );
}
