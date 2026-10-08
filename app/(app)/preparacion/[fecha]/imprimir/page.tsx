import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { obtenerBaseDatos } from "@/db/cliente";
import { dec, sumar } from "@/dominio/dinero/decimal";
import { formatearCantidad, type UnidadMedida } from "@/dominio/dinero/formato";
import { formatearFechaHora } from "@/dominio/fechas/fechas";
import { hojaDePreparacion } from "@/modulos/entregas/preparacion";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { BotonImprimir } from "@/ui/boton-imprimir";
import { fechaConDia } from "@/ui/etiquetas";
import { parametro } from "@/ui/parametros";

export const metadata: Metadata = { title: "DOC-07 Hoja de preparación · Sistema Repartos" };

const cant = (v: string, u: string) => formatearCantidad(v, u as UnidadMedida);
const tabla = "w-full border-collapse text-left text-sm [&_td]:border-b [&_td]:border-borde [&_td]:px-1 [&_td]:py-1.5 [&_td]:align-top [&_th]:border-b [&_th]:border-texto [&_th]:px-1";

/**
 * DOC-07 Hoja de preparación (09): por cliente (una hoja por entrega) o por producto (el reparto
 * entre clientes), con columnas para anotar el peso real. Sin precios.
 */
export default async function HojaDePreparacion({ params, searchParams }: PageProps<"/preparacion/[fecha]/imprimir">) {
  const sesion = await sesionParaPantalla("documentos.imprimir_entrega");
  const { fecha } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) notFound();
  const porProducto = parametro((await searchParams).vista) === "producto";
  const hojas = await hojaDePreparacion(obtenerBaseDatos(), sesion.authUserId, fecha);
  const emitida = formatearFechaHora(new Date(), sesion.zonaHoraria);

  const productos = new Map<string, { producto: string; unidad: string; lineas: { cliente: string; pedida: string; propuesta: string | null; esSustitucion: boolean }[] }>();
  for (const h of hojas) {
    for (const l of h.lineas) {
      const p = productos.get(l.productoId) ?? { producto: l.producto, unidad: l.unidad, lineas: [] };
      p.lineas.push({ cliente: h.cliente, pedida: l.cantidadPedida, propuesta: l.cantidadPropuesta, esSustitucion: l.esSustitucion });
      productos.set(l.productoId, p);
    }
  }

  return (
    <article className="mx-auto flex max-w-4xl flex-col gap-6 bg-superficie p-4 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/preparacion/${fecha}${porProducto ? "?vista=producto" : ""}`} className="text-texto-suave hover:underline">
          ← Preparación
        </Link>
        <Link href={`/preparacion/${fecha}/imprimir${porProducto ? "" : "?vista=producto"}`} className="underline-offset-4 hover:underline">
          {porProducto ? "Por cliente" : "Por producto"}
        </Link>
        <BotonImprimir />
      </div>
      {hojas.length === 0 && <p>No hay entregas para preparar el {fechaConDia(fecha)}.</p>}

      {!porProducto &&
        hojas.map((h) => (
          <section key={h.id} className="flex break-after-page flex-col gap-2">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-texto pb-1">
              <h1 className="text-lg font-bold">HOJA DE PREPARACIÓN</h1>
              <p className="text-xl font-extrabold first-letter:uppercase">{fechaConDia(fecha)}</p>
              <p className="w-full font-semibold">
                {h.cliente} — {h.punto} · {h.numero}
                {h.reparto && ` · ${h.reparto}${h.orden ? `, parada ${h.orden}` : ""}`}
                {h.horario && ` · recibe ${h.horario}`}
              </p>
            </header>
            {h.observaciones && <p className="border-2 border-texto p-2">{h.observaciones}</p>}
            <table className={tabla}>
              <thead>
                <tr>
                  <th className="w-6" />
                  <th>Producto</th>
                  <th>Pedido</th>
                  <th>A preparar</th>
                  <th className="w-28">Preparado</th>
                  <th>Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {h.lineas.map((l) => (
                  <tr key={l.id}>
                    <td>☐</td>
                    <td>
                      {l.producto}
                      {l.reemplazaA && <span className="block text-xs">en reemplazo de {l.reemplazaA}</span>}
                    </td>
                    <td className="whitespace-nowrap">{l.esSustitucion ? "—" : cant(l.cantidadPedida, l.unidad)}</td>
                    <td className="whitespace-nowrap font-semibold">{cant(l.cantidadPreparada ?? l.cantidadPropuesta ?? l.cantidadPedida, l.unidad)}</td>
                    <td className="border-texto!" />
                    <td className="text-xs">{l.observaciones}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="pt-4">Bultos: ________ Preparó: ____________________ Hora: ________</p>
            <p className="text-xs">
              Documento sin valores · impreso {emitida} por {sesion.nombre}
            </p>
          </section>
        ))}

      {porProducto && hojas.length > 0 && (
        <>
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-texto pb-1">
            <h1 className="text-lg font-bold">HOJA DE PREPARACIÓN POR PRODUCTO</h1>
            <p>Entrega del {fechaConDia(fecha)}</p>
          </header>
          {[...productos.values()]
            .sort((a, b) => a.producto.localeCompare(b.producto, "es"))
            .map((p) => {
              const necesidad = sumar(p.lineas.map((l) => l.pedida));
              const aPreparar = sumar(p.lineas.map((l) => l.propuesta ?? l.pedida));
              return (
                <section key={p.producto} className="break-inside-avoid">
                  <h2 className="font-bold">
                    {p.producto} · pedido {cant(necesidad.toString(), p.unidad)}
                    {aPreparar.lt(necesidad) && ` · alcanza para ${cant(aPreparar.toString(), p.unidad)} (faltan ${cant(necesidad.minus(aPreparar).toString(), p.unidad)})`}
                  </h2>
                  <table className={tabla}>
                    <tbody>
                      {p.lineas.map((l, n) => (
                        <tr key={n}>
                          <td>{l.cliente}</td>
                          <td className="whitespace-nowrap">{l.esSustitucion ? "reemplazo" : cant(l.pedida, p.unidad)}</td>
                          <td className="whitespace-nowrap font-semibold">{dec(l.propuesta ?? l.pedida).isZero() && !l.esSustitucion ? "no hay" : cant(l.propuesta ?? l.pedida, p.unidad)}</td>
                          <td className="w-28 border-texto!" />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              );
            })}
          <p className="text-xs">
            Documento sin valores · impreso {emitida} por {sesion.nombre}
          </p>
        </>
      )}
    </article>
  );
}
