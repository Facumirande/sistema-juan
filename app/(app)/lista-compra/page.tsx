import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { dec, sumar } from "@/dominio/dinero/decimal";
import { formatearCantidad, formatearMoneda, formatearNumero, type UnidadMedida } from "@/dominio/dinero/formato";
import { formatearFechaHora } from "@/dominio/fechas/fechas";
import { obtenerListaCompra, type LineaDeLista } from "@/modulos/compras/lista-compra";
import { diasParaElegir } from "@/modulos/jornadas/dia";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { FechaGrande } from "@/ui/fecha-grande";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Encabezado, clasesBoton } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";
import { SelectorDeDia } from "@/ui/selector-de-dia";

import { generarListaAccion } from "./acciones";
import { datosParaComprar } from "./datos-para-comprar";
import { ListaDeCompras, type RenglonDeLista } from "./lista";

export const metadata: Metadata = { title: "Lista de compras · Sistema Repartos" };

const AVISOS: Readonly<Record<string, string>> = {
  SIN_PROVEEDOR: "Ningún puesto tiene precio cargado: elegí el puesto al anotar la compra.",
  CREDITO_INSUFICIENTE: "El puesto más barato no tiene crédito suficiente: se sugiere otro.",
  PRECIO_DESACTUALIZADO: "El precio es viejo: confirmalo en el puesto.",
};

const cant = (v: string, unidad: string) => formatearCantidad(v, unidad as UnidadMedida);
const num = (v: string) => formatearNumero(v, { decimales: 3, recortarCeros: true });

/** Lo que ya se pagó (o quedó a cuenta) por un producto: la suma de sus compras anotadas. Nulo si no hay ninguna con precio. */
function gastadoEn(l: LineaDeLista) {
  const conPrecio = l.compras.filter((k) => k.precio !== null);
  return conPrecio.length > 0 ? sumar(conPrecio.map((k) => dec(k.cantidad).times(k.precio!))) : null;
}

/** Lo que sale un producto, en pesos: lo anotado al comprarlo o, si todavía no, lo que se calcula. */
function importeDe(l: LineaDeLista): RenglonDeLista["importe"] {
  const gastado = gastadoEn(l);
  if (gastado) return { texto: formatearMoneda(gastado), real: true };
  if (l.estado !== "NO_CONSEGUIDO" && l.costoEstimado && dec(l.costoEstimado).gt(0)) return { texto: formatearMoneda(l.costoEstimado), real: false };
  return null;
}

/** Un producto de la lista, ya dicho en palabras para su renglón. */
function renglon(l: LineaDeLista, conCompra: boolean): RenglonDeLista {
  // El envase se muestra solo cuando se compra en uno de verdad (no suelto, por kilo o por unidad).
  const porEnvase = l.presentacion !== null && l.cantidadPresentaciones !== null && dec(l.cantidadPresentaciones).gt(0) && !dec(l.factor).eq(1);
  const precio = l.precioSugerido ? ` · ${formatearMoneda(l.precioSugerido)}${l.presentacion ? ` cada ${l.presentacion.toLowerCase()}` : ""}` : "";
  return {
    id: l.id,
    productoId: l.productoId,
    producto: l.producto,
    grupo: l.grupo,
    compras: l.compras.map((k) => `${k.proveedor} · ${num(k.cantidad)} × ${k.presentacion}${k.precio ? ` a ${formatearMoneda(k.precio)}` : ""} · ${k.aCuenta ? "a cuenta" : "pagado"}`),
    compra: conCompra ? datosParaComprar(l) : null,
    importe: importeDe(l),
    total: cant(l.necesidadBase, l.unidadBase),
    equivalencia: porEnvase ? `≈ ${num(l.cantidadPresentaciones!)} × ${l.presentacion}` : null,
    falta: l.estado === "PARCIAL" ? `Falta ${cant(l.pendienteBase, l.unidadBase)}` : null,
    clientes: l.paraQuien.map((q) => ({ cliente: q.cliente, cantidad: cant(q.cantidadBase, l.unidadBase) })),
    puesto: l.proveedor ? `${l.proveedor}${l.ubicacion ? ` (${l.ubicacion})` : ""}${precio}` : null,
    estado: l.estado,
    tildado: l.tildado,
    avisos: [...(l.necesidadModificada ? ["Cambió un pedido después de comprarlo: revisá si alcanza."] : []), ...(l.estado === "PENDIENTE" || l.estado === "PARCIAL" ? l.alertas.map((a) => AVISOS[a] ?? a) : [])],
    nota: [l.observaciones, l.motivoNoConseguido].filter(Boolean).join(" / ") || null,
    ordenManual: l.ordenManual,
  };
}

/** P-50 Lista de compras del día: la lista, un renglón por producto, para comprar y tildar. */
export default async function PaginaListaCompra({ searchParams }: PageProps<"/lista-compra">) {
  const sesion = await sesionParaPantalla("lista_compra.ver");
  const db = obtenerBaseDatos();
  const sp = await searchParams;
  // Con el día ya elegido, los días para cambiar y la lista se piden a la vez.
  const pedida = parametro(sp.fecha);
  const yaElegida = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : null;
  const [{ fecha, hoy, dias }, anticipada] = await Promise.all([diasParaElegir(db, sesion.authUserId, pedida), yaElegida ? obtenerListaCompra(db, sesion.authUserId, yaElegida, { paraComprar: true }) : null]);
  const lista = yaElegida ? anticipada : await obtenerListaCompra(db, sesion.authUserId, fecha, { paraComprar: true });
  const lineas = lista ? lista.plan.flatMap((p) => p.lineas) : [];
  const puede = (p: (typeof sesion.permisos)[number]) => sesion.permisos.includes(p);
  const faltan = lineas.filter((l) => l.estado === "PENDIENTE" || l.estado === "PARCIAL");
  const chico = "flex min-h-11 items-center gap-2 rounded-xl border border-borde bg-superficie px-4 font-semibold hover:border-marca/60";
  const cerrado = lista?.estadoJornada === "CERRADA";
  // En pesos: lo ya comprado (a lo que salió) y lo que falta (calculado con el último precio de cada puesto).
  const yaComprado = sumar(lineas.map((l) => gastadoEn(l) ?? dec(0)));
  const faltaComprar = sumar(lineas.filter((l) => l.estado !== "NO_CONSEGUIDO" && !gastadoEn(l)).map((l) => l.costoEstimado ?? "0"));
  const totalDeLaLista = yaComprado.plus(faltaComprar);

  return (
    <section className="flex max-w-5xl flex-col gap-4">
      <Encabezado
        titulo="Lista de compras"
        descripcion={
          lista
            ? `${lista.pedidos === 1 ? "1 pedido" : `${lista.pedidos} pedidos`} · ${lineas.length === 1 ? "1 producto" : `${lineas.length} productos`}`
            : "Lo que hay que comprar para lo que se entrega ese día."
        }
      >
        {lista && (
          <>
            {puede("documentos.imprimir_compra") && (
              <Link href={`/lista-compra/imprimir?fecha=${fecha}&ya=1`} className={clasesBoton("secundario")}>
                🖨️ Imprimir
              </Link>
            )}
            <a href={`/lista-compra/planilla?fecha=${fecha}`} download className={clasesBoton("secundario")}>
              📊 Excel
            </a>
            {puede("compras.registrar") && faltan.length > 0 && !cerrado && (
              <Link href={`/lista-compra/comprar?fecha=${fecha}`} className={clasesBoton("principal")}>
                🛒 Empezar la compra
              </Link>
            )}
          </>
        )}
      </Encabezado>

      <FechaGrande fecha={fecha} hoy={hoy} />
      <div className="print:hidden">
        <SelectorDeDia dias={dias} fecha={fecha} hoy={hoy} enlace={(f) => `/lista-compra?fecha=${f}`} />
      </div>

      {!lista ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-borde bg-superficie p-4">
          <p className="text-lg font-semibold">Todavía no hay lista para este día</p>
          <p className="text-texto-suave">Se arma con los pedidos: en el tablero, tocá “🛒 Mandar a la lista de compras” en cada pedido. O armala acá con todos los pedidos de ese día.</p>
          <div className="flex flex-wrap gap-2">
            {puede("lista_compra.generar") && (
              <FormularioAccion accion={generarListaAccion} boton="Armar la lista con todos los pedidos del día">
                <input type="hidden" name="fecha" value={fecha} />
              </FormularioAccion>
            )}
            <Link href={`/inicio?fecha=${fecha}`} className={clasesBoton("secundario")}>
              Ir al tablero de ese día
            </Link>
          </div>
        </div>
      ) : (
        <>
          {lista.desactualizada && !cerrado && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-amber-500 bg-superficie p-3">
              <p className="min-w-0 flex-1 font-medium">⚠ Cambió un pedido después de armar la lista. Actualizala para comprar lo justo (lo ya comprado no se pierde).</p>
              {puede("lista_compra.generar") && (
                <FormularioAccion accion={generarListaAccion} boton="Actualizar la lista" enLinea>
                  <input type="hidden" name="fecha" value={fecha} />
                </FormularioAccion>
              )}
            </div>
          )}

          {faltan.length === 0 && lineas.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[var(--pastel-verde)] p-3 text-[var(--pastel-verde-texto)]">
              <p className="min-w-0 flex-1 text-lg font-bold">✓ Ya está todo comprado</p>
              {puede("preparacion.ver") && !cerrado && (
                <Link href={`/preparacion/${fecha}`} className={clasesBoton("principal")}>
                  📦 Seguir: preparar los pedidos&nbsp;→
                </Link>
              )}
            </div>
          )}

          {lista.costoEstimadoTotal !== null && (
            <dl className="grid gap-2 rounded-2xl border border-borde bg-superficie p-4 sm:grid-cols-3">
              <div className="flex flex-col">
                <dt className="text-texto-suave">💵 Toda la lista sale</dt>
                <dd className="text-3xl font-bold tabular-nums">{formatearMoneda(totalDeLaLista)}</dd>
                <dd className="text-sm text-texto-suave">lo ya comprado, a lo que salió; lo demás, calculado</dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-texto-suave">✓ Ya comprado (anotado)</dt>
                <dd className="text-3xl font-bold text-marca tabular-nums">{formatearMoneda(yaComprado)}</dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-texto-suave">🛒 Falta comprar (se calcula)</dt>
                <dd className="text-3xl font-bold tabular-nums">{formatearMoneda(faltaComprar)}</dd>
              </div>
            </dl>
          )}

          <ListaDeCompras
            fecha={fecha}
            renglones={lineas.map((l) => renglon(l, puede("compras.registrar") && !cerrado))}
            puede={{ editar: puede("lista_compra.editar") && !cerrado, comprar: puede("compras.registrar") && !cerrado, exceder: puede("compras.exceder_limite") }}
            proveedores={lista.proveedores}
          />

          <details className="rounded-2xl border border-borde bg-superficie p-4 print:hidden">
            <summary className="cursor-pointer font-semibold">⚙️ Más opciones</summary>
            <div className="mt-3 flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                <Link href={`/compras?fecha=${fecha}`} className={chico}>
                  🧾 Compras anotadas de ese día
                </Link>
                {puede("compras.registrar") && !cerrado && (
                  <Link href={`/compras/nueva?fecha=${fecha}`} className={chico}>
                    ＋ Anotar una compra de varias cosas en un puesto
                  </Link>
                )}
                <a href={`/lista-compra/planilla?fecha=${fecha}&formato=csv`} download className={chico}>
                  📄 Bajar como CSV
                </a>
              </div>
              {puede("lista_compra.generar") && !lista.desactualizada && !cerrado && (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-texto-suave">Si cambiaste pedidos y querés que la lista vuelva a sumar todo (lo comprado y lo tildado se conservan):</p>
                  <FormularioAccion accion={generarListaAccion} boton="Volver a calcular la lista" variante="secundario">
                    <input type="hidden" name="fecha" value={fecha} />
                  </FormularioAccion>
                </div>
              )}
              <p className="text-sm text-texto-suave">Armada el {formatearFechaHora(lista.generadaEn, sesion.zonaHoraria)}.</p>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
