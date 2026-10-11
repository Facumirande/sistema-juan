"use client";

import Link from "next/link";
import { useOptimistic, useRef, useState, useSyncExternalStore, useTransition, type PointerEvent as EventoPuntero } from "react";

import { normalizarBusqueda } from "@/dominio/pedidos/carga";
import { Buscador } from "@/ui/buscador";
import { NombreDeProducto } from "@/ui/checklist";
import { ESTADO_INICIAL, type EstadoAccion } from "@/ui/estado-accion";

import { elegirPuestoAccion, noConseguidoAccion, ordenarListaAccion, pagadoDesdeLaListaAccion, tildarLineaAccion } from "./acciones";
import { PrecioYPuesto, type DatosParaComprar } from "./precio-y-puesto";

// La lista de compras del día, como una lista: un renglón por producto con el nombre bien grande,
// cuánto hay que comprar y para cuántos clientes es. Se tilda lo comprado con un toque, se ordena
// arrastrando (como conviene recorrer el mercado) o alfabéticamente, y se busca por nombre. A la
// derecha de cada renglón, algo separado, está “💲 Precio y puesto”: despliega dónde se compró,
// cuánto y a cuánto, y lo guarda sin salir de la lista. El detalle de cada producto (para quién es)
// también se despliega.

export interface RenglonDeLista {
  id: string;
  productoId: string;
  producto: string;
  /** Grupo de su categoría, para el dibujo. */
  grupo: string | null;
  /** Las compras ya anotadas, dichas en palabras: "Puesto 12 · 3 × Bolsa 20 kg a $21.000 · a cuenta". */
  compras: string[];
  /** Lo necesario para anotar la compra en el mismo renglón (null si no se puede). */
  compra: DatosParaComprar | null;
  /** Con compras anotadas: si ya están pagadas o falta pagarlas (el interruptor del final del renglón). */
  pago: "PAGADO" | "A_CUENTA" | null;
  /** Lo que sale en pesos: lo anotado al comprarlo (`real`) o lo que se calcula con el último precio. Nulo si no se sabe. */
  importe: { texto: string; real: boolean } | null;
  /** "63 kg" */
  total: string;
  /** "≈ 3 × Bolsa 20 kg", si se compra por envase. */
  equivalencia: string | null;
  /** "Falta 23 kg", si ya se compró una parte. */
  falta: string | null;
  clientes: { cliente: string; cantidad: string }[];
  /** "Puesto 12 · $21.000 cada bolsa" */
  puesto: string | null;
  /** Dónde se va a comprar (para agrupar y para elegirlo en el renglón). */
  puestoId: string | null;
  puestoNombre: string | null;
  /** Dónde queda en el mercado ("Nave 2, puesto 14"): ordena los puestos por cercanía. */
  puestoUbicacion: string | null;
  categoria: string;
  categoriaOrden: number;
  estado: "PENDIENTE" | "PARCIAL" | "COMPRADO" | "NO_CONSEGUIDO";
  /** Tildado a mano (se puede destildar); una compra anotada, no. */
  tildado: boolean;
  avisos: string[];
  nota: string | null;
  ordenManual: number | null;
}

type Accion = (estado: EstadoAccion, datos: FormData) => Promise<EstadoAccion>;
type Orden = "manual" | "alfabetico" | "puesto" | "grupo";
const ORDENES: readonly { clave: Orden; texto: string }[] = [
  { clave: "manual", texto: "Manual" },
  { clave: "alfabetico", texto: "A-Z" },
  { clave: "puesto", texto: "Por puesto" },
  { clave: "grupo", texto: "Por grupo" },
];
type Cambio = { id: string } & Partial<Pick<RenglonDeLista, "estado" | "tildado" | "pago" | "puestoId" | "puestoNombre">>;

// Cómo se prefiere ver la lista se recuerda en este aparato.
const CLAVE_ORDEN = "lista-de-compras:orden";
const AVISO_DE_ORDEN = "lista-de-compras:orden-cambiado";
const suscribirAlOrden = (avisar: () => void) => {
  window.addEventListener(AVISO_DE_ORDEN, avisar);
  window.addEventListener("storage", avisar);
  return () => {
    window.removeEventListener(AVISO_DE_ORDEN, avisar);
    window.removeEventListener("storage", avisar);
  };
};
const ordenGuardado = (): Orden => {
  try {
    const guardado = window.localStorage.getItem(CLAVE_ORDEN);
    return ORDENES.find((o) => o.clave === guardado)?.clave ?? "manual";
  } catch {
    // Sin almacenamiento (modo privado): queda el orden a mano.
    return "manual";
  }
};
const hecho = (r: RenglonDeLista) => r.estado === "COMPRADO" || r.estado === "NO_CONSEGUIDO";

export function ListaDeCompras({
  fecha,
  renglones,
  puede,
  proveedores,
}: {
  fecha: string;
  renglones: RenglonDeLista[];
  puede: { editar: boolean; comprar: boolean; exceder: boolean; pagar: boolean };
  /** Los puestos, para elegir dónde se compró. */
  proveedores: { id: string; nombre: string; aCuenta: boolean }[];
}) {
  const [vista, marcar] = useOptimistic(renglones, (actual: RenglonDeLista[], c: Cambio) => actual.map((r) => (r.id === c.id ? { ...r, ...c } : r)));
  const orden = useSyncExternalStore(suscribirAlOrden, ordenGuardado, (): Orden => "manual");
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  // El renglón que tiene desplegado "Precio y puesto" (uno a la vez).
  const [comprando, setComprando] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<EstadoAccion>(ESTADO_INICIAL);
  const [ocupado, empezar] = useTransition();
  // Lo último que se mandó, por si el servidor pide confirmarlo.
  const [ultimo, setUltimo] = useState<{ accion: Accion; datos: Record<string, string | string[]>; cambio?: Cambio } | null>(null);
  // El orden a mano mientras se arrastra (y hasta que el servidor lo devuelve guardado).
  const [aMano, setAMano] = useState<string[] | null>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const filas = useRef(new Map<string, HTMLLIElement>());

  const elegirOrden = (o: Orden) => {
    try {
      window.localStorage.setItem(CLAVE_ORDEN, o);
    } catch {
      // Sin almacenamiento no se puede recordar: queda el orden a mano.
    }
    window.dispatchEvent(new Event(AVISO_DE_ORDEN));
  };

  const ejecutar = (accion: Accion, datos: Record<string, string | string[]>, cambio?: Cambio) => {
    setUltimo({ accion, datos, cambio });
    const fd = new FormData();
    for (const [clave, valor] of Object.entries(datos)) for (const v of Array.isArray(valor) ? valor : [valor]) fd.append(clave, v);
    empezar(async () => {
      if (cambio) marcar(cambio);
      const r = await accion(ESTADO_INICIAL, fd);
      // Solo se avisa cuando algo no se pudo hacer.
      setMensaje(r.ok ? ESTADO_INICIAL : r.mensaje ? r : { ok: false, mensaje: "No se pudo guardar: revisá la conexión y probá de nuevo." });
    });
  };
  const tildar = (r: RenglonDeLista) => {
    // Destildar una compra anotada también se puede: el servidor pide confirmar y la anula (RN-186).
    const tildado = r.estado !== "COMPRADO";
    ejecutar(tildarLineaAccion, { itemId: r.id, tildado: String(tildado) }, { id: r.id, estado: tildado ? "COMPRADO" : "PENDIENTE", tildado });
  };
  const pagar = (r: RenglonDeLista, pagado: boolean) => {
    if ((r.pago === "PAGADO") === pagado) return;
    ejecutar(pagadoDesdeLaListaAccion, { itemId: r.id, pagado: String(pagado) }, { id: r.id, pago: pagado ? "PAGADO" : "A_CUENTA" });
  };
  const noHay = (r: RenglonDeLista) => {
    const quitar = r.estado === "NO_CONSEGUIDO";
    ejecutar(noConseguidoAccion, { itemId: r.id, quitar: String(quitar) }, { id: r.id, estado: quitar ? "PENDIENTE" : "NO_CONSEGUIDO", tildado: false });
  };

  // Orden: el puesto a mano (lo que nunca se ordenó queda al final, como venía) o alfabético.
  const porId = new Map(vista.map((r) => [r.id, r]));
  const manual = [...vista].sort((a, b) => (a.ordenManual ?? 1e9) - (b.ordenManual ?? 1e9));
  const enOrden = orden === "alfabetico" ? [...vista].sort((a, b) => a.producto.localeCompare(b.producto, "es")) : aMano ? [...aMano.map((id) => porId.get(id)).filter((r): r is RenglonDeLista => Boolean(r)), ...manual.filter((r) => !aMano.includes(r.id))] : manual;
  const buscado = normalizarBusqueda(busqueda);
  const visibles = buscado ? enOrden.filter((r) => normalizarBusqueda(r.producto).includes(buscado)) : enOrden;
  const seArrastra = puede.editar && orden === "manual" && !buscado;
  // Por puesto (los puestos por dónde quedan en el mercado; lo que va sin puesto, al final) o por
  // grupo (las categorías en su orden); adentro de cada uno, el orden a mano.
  const grupos: { clave: string; titulo: string; detalle: string | null; renglones: RenglonDeLista[] }[] | null =
    orden === "puesto" || orden === "grupo"
      ? (() => {
          const porClave = new Map<string, { clave: string; titulo: string; detalle: string | null; orden: string; renglones: RenglonDeLista[] }>();
          for (const r of visibles) {
            const clave = orden === "puesto" ? (r.puestoId ?? "") : r.categoria;
            const g = porClave.get(clave) ?? {
              clave,
              titulo: orden === "puesto" ? (r.puestoNombre ?? "Sin puesto (efectivo)") : r.categoria,
              detalle: orden === "puesto" ? r.puestoUbicacion : null,
              orden: orden === "puesto" ? (r.puestoId ? `0 ${r.puestoUbicacion ?? "~"} ${r.puestoNombre ?? ""}` : "9") : String(r.categoriaOrden).padStart(4, "0"),
              renglones: [],
            };
            g.renglones.push(r);
            porClave.set(clave, g);
          }
          return [...porClave.values()].sort((a, b) => a.orden.localeCompare(b.orden, "es", { numeric: true }));
        })()
      : null;
  const elegirPuesto = (r: RenglonDeLista, proveedorId: string) =>
    ejecutar(elegirPuestoAccion, { itemId: r.id, proveedorId }, { id: r.id, puestoId: proveedorId || null, puestoNombre: proveedores.find((p) => p.id === proveedorId)?.nombre ?? null });

  // ——— Arrastrar un renglón para ordenar ———
  const agarrar = (e: EventoPuntero<HTMLButtonElement>, id: string) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setAMano(enOrden.map((r) => r.id));
    setArrastrando(id);
  };
  const mover = (e: EventoPuntero<HTMLButtonElement>) => {
    if (!arrastrando || !aMano) return;
    const desde = aMano.indexOf(arrastrando);
    // El lugar nuevo: antes del primer renglón cuya mitad queda por debajo del dedo.
    let hasta = aMano.length - 1;
    for (const [i, id] of aMano.entries()) {
      const caja = filas.current.get(id)?.getBoundingClientRect();
      if (caja && e.clientY < caja.top + caja.height / 2) {
        hasta = i > desde ? i - 1 : i;
        break;
      }
    }
    if (hasta === desde) return;
    const nuevo = [...aMano];
    nuevo.splice(desde, 1);
    nuevo.splice(hasta, 0, arrastrando);
    setAMano(nuevo);
  };
  const soltar = () => {
    if (!arrastrando || !aMano) return;
    setArrastrando(null);
    if (aMano.join() !== manual.map((r) => r.id).join()) ejecutar(ordenarListaAccion, { fecha, item: aMano });
  };

  const faltan = vista.filter((r) => !hecho(r)).length;
  const boton = "flex shrink-0 items-center justify-center rounded-xl border-2 font-bold leading-none transition-colors";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <p className="mr-auto flex items-center gap-2 text-sm text-texto-suave">
          {seArrastra ? (
            <>
              <span aria-hidden className="text-lg leading-none">
                ⠿
              </span>
              Arrastrá para ordenar como te conviene comprar
            </>
          ) : (
            `${faltan === 0 ? "Está todo resuelto" : faltan === 1 ? "Falta 1 producto" : `Faltan ${faltan} productos`} de ${vista.length}`
          )}
        </p>
        <span className="flex rounded-xl border border-borde bg-superficie p-1 text-sm" role="group" aria-label="Cómo ordenar la lista">
          {ORDENES.map((o) => (
            <button key={o.clave} type="button" onClick={() => elegirOrden(o.clave)} aria-pressed={orden === o.clave} className={`min-h-9 rounded-lg px-2.5 font-semibold whitespace-nowrap ${orden === o.clave ? "bg-marca text-marca-texto" : ""}`}>
              {o.texto}
            </button>
          ))}
        </span>
        <Buscador valor={busqueda} alCambiar={setBusqueda} placeholder="Buscar producto" aria-label="Buscar un producto en la lista" className="w-full sm:w-64" />
      </div>

      {mensaje.mensaje && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-error/10 px-4 py-3 font-medium text-error">
          <span className="min-w-0 flex-1">{mensaje.mensaje}</span>
          {mensaje.requiereConfirmacion && ultimo && (
            <button type="button" onClick={() => ejecutar(ultimo.accion, { ...ultimo.datos, confirmarVariacion: "on" }, ultimo.cambio)} className="rounded-lg bg-error px-3 py-2 font-bold text-white shadow-sm">
              Confirmar
            </button>
          )}
          {mensaje.enlace && (
            <Link href={mensaje.enlace.href} className="rounded-lg bg-superficie px-3 py-2 font-semibold text-texto shadow-sm">
              {mensaje.enlace.texto}{"\u00a0→"}
            </Link>
          )}
          <button type="button" onClick={() => setMensaje(ESTADO_INICIAL)} aria-label="Cerrar el aviso" className="flex size-9 items-center justify-center rounded-full text-xl leading-none">
            ×
          </button>
        </div>
      )}

      {grupos ? (
        <div className="flex flex-col gap-4" aria-busy={ocupado}>
          {grupos.map((g) => (
            <section key={g.clave} aria-label={g.titulo} className="flex flex-col gap-2">
              <h3 className="flex flex-wrap items-baseline gap-x-2 px-1 text-lg font-extrabold">
                {orden === "puesto" ? "🏪" : "🧺"} {g.titulo}
                {g.detalle && <span className="text-sm font-medium text-texto-suave">{g.detalle}</span>}
                <span className="text-sm font-semibold text-texto-suave">· {g.renglones.filter((r) => !hecho(r)).length} por comprar</span>
              </h3>
              <ol className="flex flex-col gap-2">{g.renglones.map((r) => fila(r))}</ol>
            </section>
          ))}
          {grupos.length === 0 && <p className="rounded-2xl border border-borde bg-superficie p-4 text-texto-suave">Ningún producto de la lista se llama así.</p>}
        </div>
      ) : (
      <ol className="flex flex-col gap-2" aria-busy={ocupado}>
        {visibles.map((r) => fila(r))}
        {visibles.length === 0 && <li className="rounded-2xl border border-borde bg-superficie p-4 text-texto-suave">Ningún producto de la lista se llama así.</li>}
      </ol>
      )}
    </div>
  );

  function fila(r: RenglonDeLista) {
    const listo = hecho(r);
    const desplegado = abierto === r.id;
    return (
      <li
        key={r.id}
        ref={(el) => {
          if (el) filas.current.set(r.id, el);
          else filas.current.delete(r.id);
        }}
        className={`rounded-2xl border-2 bg-superficie ${arrastrando === r.id ? "border-marca shadow-lg" : r.estado === "PARCIAL" ? "border-amber-500" : "border-borde"} ${listo ? "opacity-70" : ""}`}
      >
        {/* En el celular va en tres columnas (mover · el producto · tildar y precio, uno sobre otro);
            con más ancho, todo en un renglón. */}
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 px-2 py-2 sm:flex sm:gap-3 sm:px-3">
          {seArrastra && (
            <button
              type="button"
              aria-label={`Mover ${r.producto} en la lista`}
              title="Arrastrá para cambiarlo de lugar"
              onPointerDown={(e) => agarrar(e, r.id)}
              onPointerMove={mover}
              onPointerUp={soltar}
              onPointerCancel={soltar}
              className="row-span-2 flex h-12 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-xl text-texto-suave hover:bg-fondo active:cursor-grabbing print:hidden"
            >
              ⠿
            </button>
          )}
          <button type="button" onClick={() => setAbierto(desplegado ? null : r.id)} aria-expanded={desplegado} className="col-start-2 row-span-2 flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 py-1 text-left">
            {/* El nombre no baja de un ancho cómodo: si no entra con la cantidad al lado, la cantidad pasa abajo. */}
            <span className="min-w-0 flex-1 basis-40">
              <NombreDeProducto nombre={r.producto} grupo={r.grupo} className={`text-xl sm:text-2xl ${listo ? "line-through" : ""}`} />
              <span className="block text-sm text-texto-suave">
                {r.estado === "NO_CONSEGUIDO" ? <b className="text-error">No se consiguió</b> : r.compras.length ? <b className="text-marca">🧾 {r.compras.join(" + ")}</b> : (r.equivalencia ?? r.puesto ?? "—")}
                {r.falta && <b className="text-amber-700 dark:text-amber-400"> · {r.falta}</b>}
              </span>
            </span>
            <span className={`shrink-0 text-xl font-bold tabular-nums sm:text-2xl ${listo ? "line-through" : ""}`}>{r.total}</span>
            {r.importe && (
              <span className="ml-auto flex shrink-0 flex-col items-end leading-tight" title={r.importe.real ? "Lo que se anotó al comprarlo" : "Lo que se calcula con el último precio cargado"}>
                <b className={`text-xl tabular-nums sm:text-2xl ${r.importe.real ? "text-marca" : ""}`}>{r.importe.texto}</b>
                <span className="text-sm text-texto-suave">{r.importe.real ? "salió" : "se calcula"}</span>
              </span>
            )}
            <span className="shrink-0 rounded-full border border-borde px-2.5 py-1 text-sm font-semibold max-sm:hidden">{r.clientes.length === 1 ? "1 cliente" : `${r.clientes.length} clientes`}</span>
          </button>
          {puede.editar && (
            <button
              type="button"
              role="checkbox"
              aria-checked={r.estado === "COMPRADO"}
              aria-label={`${r.producto}: ya lo compré`}
              title={r.estado === "COMPRADO" ? "Comprado: tocá para destildar" : "Tildar como comprado"}
              onClick={() => tildar(r)}
              className={`${boton} col-start-3 row-start-1 size-12 text-2xl print:hidden ${r.estado === "COMPRADO" ? "border-marca bg-marca text-marca-texto" : "border-borde bg-superficie hover:border-marca"}`}
            >
              {r.estado === "COMPRADO" ? "✓" : ""}
            </button>
          )}
          {/* A la derecha y algo separado: dónde se compró y a cuánto, para anotarlo ahí mismo. */}
          {puede.comprar && r.compra && r.estado !== "NO_CONSEGUIDO" && (
            <span className="col-start-3 row-start-2 flex shrink-0 items-center print:hidden sm:border-l-2 sm:border-dashed sm:border-borde sm:pl-3">
              <button
                type="button"
                onClick={() => setComprando(comprando === r.id ? null : r.id)}
                aria-expanded={comprando === r.id}
                title="Anotar en qué puesto se compró y a cuánto"
                className={`flex min-h-12 min-w-12 items-center justify-center gap-1.5 rounded-xl border-2 font-bold sm:px-3 ${comprando === r.id ? "border-marca bg-marca text-marca-texto" : "border-marca/50 bg-marca/10 text-marca hover:border-marca"}`}
              >
                <span aria-hidden className="text-xl leading-none">
                  💲
                </span>
                <span className="max-md:sr-only">{r.compras.length ? "Otra compra" : "Precio y puesto"}</span>
                <span aria-hidden className={`transition-transform max-sm:hidden ${comprando === r.id ? "rotate-180" : ""}`}>
                  ▾
                </span>
              </button>
            </span>
          )}
          {/* Dónde comprarlo, elegido antes de ir (pedido del usuario, 10/10/2026: comprar más rápido). */}
          {puede.editar && !listo && !r.pago && (
            <label className="col-span-2 col-start-2 row-start-3 flex min-w-0 items-center gap-1.5 justify-self-start text-sm print:hidden">
              <span aria-hidden>🏪</span>
              <span className="sr-only">Puesto donde comprar {r.producto}</span>
              <select
                value={r.puestoId ?? ""}
                onChange={(e) => elegirPuesto(r, e.target.value)}
                className="h-9 max-w-48 min-w-0 rounded-lg border border-borde bg-superficie px-2 font-semibold"
              >
                <option value="">Sin puesto (efectivo)</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
          {/* Al final: si lo comprado ya quedó pagado o a cuenta, igual que en el panel de precio y puesto. */}
          {puede.pagar && r.pago && (
            <span role="group" aria-label={`${r.producto}: ¿quedó pagado?`} className="col-span-2 col-start-2 row-start-3 grid shrink-0 grid-cols-2 justify-self-end overflow-hidden rounded-xl border-2 border-borde print:hidden">
              {(
                [
                  [true, "💵 Pagado"],
                  [false, "📒 A cuenta"],
                ] as const
              ).map(([pagado, texto]) => (
                <button
                  key={texto}
                  type="button"
                  onClick={() => pagar(r, pagado)}
                  aria-pressed={(r.pago === "PAGADO") === pagado}
                  title={pagado ? "Se le pagó en efectivo lo que faltaba" : "Queda en lo que le debemos al puesto"}
                  className={`min-h-10 px-3 font-bold whitespace-nowrap ${(r.pago === "PAGADO") === pagado ? "bg-marca text-marca-texto" : "bg-superficie text-texto-suave"}`}
                >
                  {texto}
                </button>
              ))}
            </span>
          )}
          <button type="button" onClick={() => setAbierto(desplegado ? null : r.id)} aria-label={desplegado ? "Cerrar el detalle" : "Ver el detalle"} className="flex size-10 shrink-0 items-center justify-center rounded-lg text-xl text-texto-suave hover:bg-fondo max-sm:hidden print:hidden">
            <span aria-hidden className={`transition-transform ${desplegado ? "rotate-90" : ""}`}>
              ›
            </span>
          </button>
        </div>
        {comprando === r.id && r.compra && (
          <div className="rounded-b-2xl border-t-2 border-dashed border-marca/50 bg-fondo px-3 py-3 print:hidden sm:px-4">
            <PrecioYPuesto key={r.id} itemId={r.id} productoId={r.productoId} producto={r.producto} datos={r.compra} proveedores={proveedores} puedeExceder={puede.exceder} alGuardar={() => setComprando(null)} />
          </div>
        )}
        {desplegado && (
          <div className="flex flex-col gap-3 border-t border-borde px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-texto-suave">Para quién es</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {r.clientes.map((c) => (
                  <li key={c.cliente} className="flex justify-between gap-3">
                    <span>{c.cliente}</span>
                    <b className="tabular-nums">{c.cantidad}</b>
                  </li>
                ))}
                {r.clientes.length === 0 && <li className="text-texto-suave">Ningún pedido de la lista lo lleva.</li>}
              </ul>
            </div>
            {r.puesto && (
              <p>
                <span className="text-sm font-semibold text-texto-suave">Dónde conviene: </span>
                {r.puesto}
              </p>
            )}
            {r.nota && <p>📝 “{r.nota}”</p>}
            {r.avisos.map((a) => (
              <p key={a} className="font-medium text-amber-700 dark:text-amber-400">
                ⚠ {a}
              </p>
            ))}
            <div className="flex flex-wrap gap-2 print:hidden">
              {puede.editar && !(r.estado === "COMPRADO") && (
                <button type="button" onClick={() => noHay(r)} className="min-h-11 rounded-xl border-2 border-borde px-4 font-semibold hover:border-error">
                  {r.estado === "NO_CONSEGUIDO" ? "↩ Volver a buscarlo" : "✕ No lo conseguí"}
                </button>
              )}
            </div>
          </div>
        )}
      </li>
    );
  }
}
