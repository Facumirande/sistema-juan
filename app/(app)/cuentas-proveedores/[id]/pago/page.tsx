import { randomUUID } from "node:crypto";

import type { Metadata } from "next";

import { obtenerBaseDatos } from "@/db/cliente";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { formatearFecha, hoyEnEmpresa } from "@/dominio/fechas/fechas";
import { cuentaCorriente } from "@/modulos/compras/cuenta-corriente";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { cargarFicha, idDeRuta } from "@/ui/accion-servidor";
import { MEDIOS_PAGO, opciones } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { AreaTexto, Campo, Encabezado, Selector } from "@/ui/formularios";
import { DatosTransferencia } from "@/ui/datos-transferencia";
import { SemaforoCredito } from "@/ui/semaforo";

import { registrarPagoAccion } from "../../acciones";
import { ImputacionPago } from "../../imputacion-pago";

export const metadata: Metadata = { title: "Registrar pago · Sistema Repartos" };

/** P-62 Registrar pago a un proveedor (06 §4.1). */
export default async function RegistrarPago({ params }: PageProps<"/cuentas-proveedores/[id]/pago">) {
  const sesion = await sesionParaPantalla("pagos.registrar");
  const id = idDeRuta((await params).id);
  const hoy = hoyEnEmpresa(new Date(), sesion.zonaHoraria);
  const c = await cargarFicha(cuentaCorriente(obtenerBaseDatos(), sesion.authUserId, id, { desde: hoy, hasta: hoy }));

  return (
    <section className="flex max-w-2xl flex-col gap-4">
      <Encabezado
        titulo={`Pagarle a ${c.proveedor.nombre}`}
        volver={{ ruta: `/cuentas-proveedores/${id}`, texto: "Cuenta del proveedor" }}
        descripcion="Para pagar una parte o varias compras juntas. Se descuenta primero de las compras más viejas; si querés, elegís vos cuáles cancela. Para pagar una compra entera es más rápido el botón de esa compra en la cuenta."
      />
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-borde bg-superficie p-3">
        <SemaforoCredito semaforo={c.indicadores.semaforo} usoPct={c.indicadores.usoPct?.toString()} />
        {c.indicadores.saldoAFavor.gt(0) ? (
          <span>
            Ya tenemos <b>{formatearMoneda(c.indicadores.saldoAFavor)}</b> a favor
          </span>
        ) : (
          <span>
            Se le debe <b>{formatearMoneda(c.indicadores.saldoPendiente)}</b>
            {Number(c.vencimientos.vencida) > 0 && <span className="text-error"> · vencido {formatearMoneda(c.vencimientos.vencida)}</span>}
          </span>
        )}
      </div>
      <DatosTransferencia alias={c.proveedor.aliasTransferencia} cbu={c.proveedor.cbu} titular={c.proveedor.titularCuenta} cargar={sesion.permisos.includes("proveedores.editar") ? `/proveedores/${id}?editar#editar` : undefined} />
      <FormularioAccion accion={registrarPagoAccion} boton="Registrar pago">
        <input type="hidden" name="proveedorId" value={id} />
        <input type="hidden" name="claveIdempotencia" value={randomUUID()} />
        <ImputacionPago
          deudas={c.pendientes.map((p) => ({
            clave: p.clave,
            descripcion: p.descripcion,
            detalle: `${formatearFecha(hoyEnEmpresa(p.fecha, sesion.zonaHoraria))}${p.vence ? ` · vence ${formatearFecha(p.vence)}` : ""}${p.diasAtraso ? ` · ${p.diasAtraso} días de atraso` : ""}`,
            pendiente: p.pendiente,
          }))}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Selector etiqueta="Cómo se pagó" name="medio" opciones={opciones(MEDIOS_PAGO)} defaultValue="EFECTIVO" />
            <Campo etiqueta="Fecha" name="fecha" type="date" defaultValue={c.hoy} max={c.hoy} />
            <Campo etiqueta="Referencia (opcional)" name="referencia" placeholder="N.º de transferencia o de cheque" />
          </div>
          <details>
            <summary className="min-h-11 cursor-pointer py-2 font-medium">Si es un cheque</summary>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Banco" name="chequeBanco" />
              <Campo etiqueta="Fecha de cobro" name="chequeFechaCobro" type="date" />
            </div>
          </details>
        </ImputacionPago>
        <AreaTexto etiqueta="Notas (opcional)" name="observaciones" />
      </FormularioAccion>
    </section>
  );
}
