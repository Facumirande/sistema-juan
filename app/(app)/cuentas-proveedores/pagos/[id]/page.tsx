import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { dec } from "@/dominio/dinero/decimal";
import { formatearMoneda, formatearNumero } from "@/dominio/dinero/formato";
import { formatearFecha, formatearFechaHora, hoyEnEmpresa } from "@/dominio/fechas/fechas";
import { cuentaCorriente } from "@/modulos/compras/cuenta-corriente";
import { obtenerPago } from "@/modulos/compras/pagos";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { cargarFicha, idDeRuta } from "@/ui/accion-servidor";
import { MEDIOS_PAGO } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Aviso, Campo, Encabezado, Tarjeta } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";

import { anularPagoAccion, reimputarPagoAccion } from "../../acciones";
import { ImputacionPago } from "../../imputacion-pago";

export const metadata: Metadata = { title: "Pago · Sistema Juan" };

/** P-64 Detalle de pago: a qué compras se imputó, reimputar y anular (06 §4.5, §6.2). */
export default async function DetalleDePago({ params, searchParams }: PageProps<"/cuentas-proveedores/pagos/[id]">) {
  const sesion = await sesionParaPantalla("pagos.ver");
  const id = idDeRuta((await params).id);
  const recienRegistrado = parametro((await searchParams).registrado) === "1";
  const db = obtenerBaseDatos();
  const p = await cargarFicha(obtenerPago(db, sesion.authUserId, id));
  const puedeCorregir = p.estado === "REGISTRADO" && sesion.permisos.includes("pagos.anular");
  const hoy = hoyEnEmpresa(new Date(), sesion.zonaHoraria);
  // Para reimputar: lo que se debe hoy más lo que este pago ya cancela (vuelve a quedar libre).
  const cuenta = puedeCorregir ? await cuentaCorriente(db, sesion.authUserId, p.proveedorId, { desde: hoy, hasta: hoy }) : null;
  const activas = p.imputaciones.filter((i) => i.activa);
  const historicas = p.imputaciones.filter((i) => !i.activa);

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <Encabezado
        titulo={`${p.numero} · ${p.proveedor}`}
        volver={{ ruta: `/cuentas-proveedores/${p.proveedorId}`, texto: "Cuenta del proveedor" }}
        descripcion={`${formatearFechaHora(p.fecha, sesion.zonaHoraria)} · ${MEDIOS_PAGO[p.medio] ?? p.medio}${p.referencia ? ` · ${p.referencia}` : ""}${p.registradoPor ? ` · cargado por ${p.registradoPor}` : ""}`}
      >
        {p.estado === "ANULADO" && <span className="rounded-full border border-error px-3 py-1 font-semibold text-error">Anulado</span>}
      </Encabezado>

      {recienRegistrado && p.estado === "REGISTRADO" && (
        <p role="status" className="rounded-lg border border-marca bg-superficie p-3 font-semibold">
          Pago registrado.
        </p>
      )}
      {p.estado === "ANULADO" && <Aviso>Anulado: {p.motivoAnulacion}</Aviso>}

      <Tarjeta titulo={`Pago de ${formatearMoneda(p.monto)}`}>
        {p.compra && (
          <p>
            Pagado en el momento de la compra{" "}
            <Link href={`/compras/${p.compra.id}`} className="underline">
              {p.compra.numero}
            </Link>
            .
          </p>
        )}
        {p.chequeBanco && (
          <p>
            Cheque del {p.chequeBanco}
            {p.chequeFechaCobro && `, se cobra el ${formatearFecha(p.chequeFechaCobro)}`}.
          </p>
        )}
        {p.observaciones && <p>{p.observaciones}</p>}
        {p.estado === "REGISTRADO" && (
          <>
            {activas.length === 0 ? (
              <p className="text-texto-suave">No está aplicado a ninguna compra.</p>
            ) : (
              <ul className="flex flex-col">
                {activas.map((i) => (
                  <li key={i.id} className="flex justify-between gap-2 border-t border-borde py-2 first:border-t-0">
                    {i.compraId ? (
                      <Link href={`/compras/${i.compraId}`} className="underline-offset-4 hover:underline">
                        {i.deuda}
                      </Link>
                    ) : (
                      <span>{i.deuda}</span>
                    )}
                    <span className="font-semibold">{formatearMoneda(i.monto)}</span>
                  </li>
                ))}
              </ul>
            )}
            {dec(p.aFavor).gt(0) && <p className="font-semibold text-marca">Quedan {formatearMoneda(p.aFavor)} a favor para las próximas compras.</p>}
          </>
        )}
        {historicas.length > 0 && (
          <details>
            <summary className="min-h-11 cursor-pointer py-2 text-sm text-texto-suave">Imputaciones anteriores ({historicas.length})</summary>
            <ul className="flex flex-col text-sm text-texto-suave">
              {historicas.map((i) => (
                <li key={i.id}>
                  {i.deuda} {formatearMoneda(i.monto)} · quitada {i.desactivadaEn ? formatearFechaHora(i.desactivadaEn, sesion.zonaHoraria) : ""}: {i.motivoDesactivacion}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Tarjeta>

      {puedeCorregir && cuenta && (
        <>
          <details className="rounded-lg border border-borde bg-superficie p-4">
            <summary className="cursor-pointer font-semibold">Cambiar a qué compras va</summary>
            <p className="py-2 text-sm text-texto-suave">La deuda total no cambia: solo cambia qué compras figuran pagadas.</p>
            <FormularioAccion accion={reimputarPagoAccion} boton="Guardar">
              <input type="hidden" name="pagoId" value={p.id} />
              <ImputacionPago
                montoFijo={p.monto}
                modoInicial="MANUAL"
                iniciales={Object.fromEntries(activas.filter((i) => i.compraId).map((i) => [`C:${i.compraId}`, formatearNumero(i.monto, { decimales: 2, recortarCeros: true })]))}
                deudas={cuenta.pendientes
                  .map((d) => ({ clave: d.clave, descripcion: d.descripcion, detalle: d.vence ? `vence ${formatearFecha(d.vence)}` : "", pendiente: d.pendiente }))
                  .concat(
                    activas
                      .filter((i) => i.compraId && !cuenta.pendientes.some((d) => d.compraId === i.compraId))
                      .map((i) => ({ clave: `C:${i.compraId}`, descripcion: i.deuda, detalle: "(pagada con este pago)", pendiente: "0" })),
                  )
                  .map((d) => {
                    const propia = activas.find((i) => d.clave === `C:${i.compraId}`);
                    return propia ? { ...d, pendiente: dec(d.pendiente).plus(propia.monto).toFixed(2) } : d;
                  })
                  .sort((a, b) => a.descripcion.localeCompare(b.descripcion))}
              />
              <Campo etiqueta="Por qué" name="motivo" placeholder="Ej. el proveedor pidió cancelar la del martes" />
            </FormularioAccion>
          </details>
          <details className="rounded-lg border border-borde bg-superficie p-4">
            <summary className="cursor-pointer font-semibold text-error">Anular el pago</summary>
            <p className="py-2 text-sm text-texto-suave">
              {p.compra
                ? `Es el pago hecho en la compra ${p.compra.numero}: esa compra va a quedar como deuda pendiente.`
                : "Las compras que cancelaba vuelven a quedar pendientes (por ejemplo, si rebotó un cheque)."}
            </p>
            <FormularioAccion accion={anularPagoAccion} boton="Anular" variante="peligro" confirmar={`¿Anular ${p.numero}?`}>
              <input type="hidden" name="pagoId" value={p.id} />
              <Campo etiqueta="Por qué" name="motivo" placeholder="Ej. cheque rechazado" />
            </FormularioAccion>
          </details>
        </>
      )}
    </section>
  );
}
