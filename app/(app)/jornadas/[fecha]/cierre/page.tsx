import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { obtenerBaseDatos } from "@/db/cliente";
import { dec } from "@/dominio/dinero/decimal";
import { formatearCantidad, formatearMoneda, formatearNumero, type UnidadMedida } from "@/dominio/dinero/formato";
import { formatearFechaHora } from "@/dominio/fechas/fechas";
import { estadoDelCierre } from "@/modulos/jornadas/cierre";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { cargarFicha } from "@/ui/accion-servidor";
import { ESTADOS_JORNADA, fechaConDia } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Aviso, Campo, Encabezado, Tabla, Tarjeta } from "@/ui/formularios";

import { cerrarJornadaAccion, justificarPendientesAccion, reabrirJornadaAccion } from "../../acciones";

export const metadata: Metadata = { title: "Cierre de jornada · Sistema Juan" };

const pct = (v: string | null) => (v ? ` (${formatearNumero(v, { decimales: 2 })} %)` : "");

/** P-47 Cierre de jornada: validaciones (RN-040) y resumen del día (04 §5.h). */
export default async function CierreDeJornada({ params }: PageProps<"/jornadas/[fecha]/cierre">) {
  const sesion = await sesionParaPantalla("jornada.cerrar");
  const { fecha } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) notFound();
  const e = await cargarFicha(estadoDelCierre(obtenerBaseDatos(), sesion.authUserId, fecha));
  const r = e.resumen;
  const cerrada = e.estado === "CERRADA";
  const oculto = <input type="hidden" name="fecha" value={fecha} />;

  const filas: [string, string, string][] = [
    ["Comprado", formatearMoneda(r.comprado), r.comprasPorProveedor.map((c) => `${c.proveedor} ${formatearMoneda(c.total)}`).join(" · ")],
    ["· pagado en el momento", formatearMoneda(r.pagadoEnElActo), r.comprasPorProveedor.filter((c) => dec(c.pagado).gt(0)).map((c) => `${c.proveedor} ${formatearMoneda(c.pagado)}`).join(" · ")],
    ["· deuda generada", formatearMoneda(r.deudaGenerada), ""],
    ["Vendido (entregas confirmadas)", formatearMoneda(r.vendido), r.ventasPorCliente.map((v) => `${v.cliente} ${formatearMoneda(v.total)}`).join(" · ")],
    ["Costo de lo vendido", formatearMoneda(r.costoVendido), ""],
    ["Margen sobre lo vendido", formatearMoneda(r.margen) + pct(r.margenPct), ""],
    ["Sobrantes y devoluciones (al costo)", formatearMoneda(r.sobrantesCosto), r.sobrantes.map((s) => `${s.producto} ${formatearCantidad(s.cantidad, s.unidad as UnidadMedida)} ${formatearMoneda(s.costo)}`).join(" · ")],
    ["Resultado del día (vendido − comprado)", formatearMoneda(r.resultado) + pct(r.resultadoPct), ""],
    ["Deuda con proveedores al cierre", formatearMoneda(r.saldoProveedores), r.saldosPorProveedor.map((s) => `${s.proveedor} ${formatearMoneda(s.saldo)}`).join(" · ")],
    ["Pedidos", `${r.pedidos.entregados} entregados · ${r.pedidos.cancelados} cancelados`, r.entregasConDiferencias ? `${r.entregasConDiferencias} con diferencias` : ""],
  ];

  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <Encabezado
        titulo={`Cierre del ${fechaConDia(fecha)}`}
        volver={{ ruta: `/jornadas/${fecha}`, texto: "Jornada" }}
        descripcion={cerrada ? `Cerrada${e.cerrada?.en ? ` el ${formatearFechaHora(e.cerrada.en, sesion.zonaHoraria)}` : ""}${r.cerradaPor ? ` por ${r.cerradaPor}` : ""}.` : `Jornada ${ESTADOS_JORNADA[e.estado]?.toLowerCase()}.`}
      />

      {!cerrada && (
        <>
          {e.bloqueos.length > 0 ? (
            <Tarjeta titulo="Falta resolver">
              <ul className="flex flex-col gap-1">
                {e.bloqueos.map((b, i) => (
                  <li key={i} className="text-error">
                    {b.ruta ? (
                      <Link href={b.ruta} className="underline-offset-4 hover:underline">
                        {b.texto}
                      </Link>
                    ) : (
                      b.texto
                    )}
                  </li>
                ))}
              </ul>
            </Tarjeta>
          ) : (
            <p className="font-semibold text-marca">✔ Todo entregado y con sus documentos.</p>
          )}
          {e.advertencias.length > 0 && (
            <Tarjeta titulo="Para revisar">
              <ul className="flex flex-col gap-1">
                {e.advertencias.map((a, i) => (
                  <li key={i}>
                    {a.ruta ? (
                      <Link href={a.ruta} className="underline-offset-4 hover:underline">
                        {a.texto}
                      </Link>
                    ) : (
                      a.texto
                    )}
                  </li>
                ))}
              </ul>
              {e.lineasSinJustificar > 0 && (
                <FormularioAccion accion={justificarPendientesAccion} boton="Marcar lo pendiente como no conseguido" variante="secundario">
                  {oculto}
                </FormularioAccion>
              )}
            </Tarjeta>
          )}
        </>
      )}

      <Tarjeta titulo="Resumen del día">
        <Tabla>
          <tbody>
            {filas.map(([concepto, monto, detalle]) => (
              <tr key={concepto}>
                <td className="font-medium">{concepto}</td>
                <td className="text-right font-semibold whitespace-nowrap">{monto}</td>
                <td className="text-sm text-texto-suave">{detalle}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
        {r.alertas.length > 0 && (
          <div>
            <p className="font-semibold">Alertas</p>
            <ul className="list-disc pl-5 text-sm">
              {r.alertas.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        )}
      </Tarjeta>

      {!cerrada && (
        <>
          {!["PREPARANDO", "REPARTIENDO"].includes(e.estado) && <Aviso>La jornada todavía no se preparó ni se repartió.</Aviso>}
          {e.bloqueos.length === 0 && ["PREPARANDO", "REPARTIENDO"].includes(e.estado) && (
            <FormularioAccion accion={cerrarJornadaAccion} boton="Cerrar jornada" confirmar="¿Cerrar la jornada? Queda de solo lectura con este resumen.">
              {oculto}
            </FormularioAccion>
          )}
        </>
      )}
      {cerrada && sesion.permisos.includes("jornada.reabrir") && (
        <details className="rounded-lg border border-borde bg-superficie p-4">
          <summary className="cursor-pointer font-semibold">Reabrir la jornada</summary>
          <FormularioAccion accion={reabrirJornadaAccion} boton="Reabrir" variante="secundario">
            {oculto}
            <Campo etiqueta="Por qué" name="motivo" placeholder="Ej. corregir una entrega" />
          </FormularioAccion>
        </details>
      )}
    </section>
  );
}
