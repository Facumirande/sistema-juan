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
import { PagoConDeudas } from "../../pago-con-deudas";

export const metadata: Metadata = { title: "Registrar pago · Sistema Repartos" };

/**
 * P-62 Pagarle a un proveedor (06 §4.1). El importe viene cargado con todo lo que se le debe; cada
 * compra se elige con un tilde y el importe se calcula con lo elegido. Arriba, bien claro, quién le
 * debe a quién.
 */
export default async function RegistrarPago({ params }: PageProps<"/cuentas-proveedores/[id]/pago">) {
  const sesion = await sesionParaPantalla("pagos.registrar");
  const id = idDeRuta((await params).id);
  const hoy = hoyEnEmpresa(new Date(), sesion.zonaHoraria);
  const c = await cargarFicha(cuentaCorriente(obtenerBaseDatos(), sesion.authUserId, id, { desde: hoy, hasta: hoy }));
  const i = c.indicadores;
  const aFavor = i.saldoAFavor.gt(0);
  const debemos = !aFavor && i.saldoPendiente.gt(0);

  return (
    <section className="flex max-w-3xl flex-col gap-5">
      <Encabezado titulo={`Pagarle a ${c.proveedor.nombre}`} volver={{ ruta: `/cuentas-proveedores/${id}`, texto: "Cuenta del proveedor" }} descripcion="Elegí qué compras le pagás: el importe se calcula solo. Si le pagás otra cantidad, escribila." />

      <div className={`flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl p-5 ${debemos ? "bg-[var(--pastel-naranja)] text-[var(--pastel-naranja-texto)]" : "bg-[var(--pastel-verde)] text-[var(--pastel-verde-texto)]"}`}>
        <p className="flex flex-col">
          <span className="text-lg font-semibold">{debemos ? `📤 Nosotros le debemos a ${c.proveedor.nombre}` : aFavor ? `🤝 ${c.proveedor.nombre} nos debe a nosotros` : `✓ Estamos al día con ${c.proveedor.nombre}`}</span>
          <b className="text-4xl tabular-nums sm:text-5xl">{formatearMoneda(aFavor ? i.saldoAFavor : i.saldoPendiente)}</b>
        </p>
        <p className="min-w-0 flex-1 basis-56 text-lg">
          {debemos
            ? "Es mercadería que ya retiramos y todavía no le pagamos."
            : aFavor
              ? "Le pagamos de más (o hay un ajuste a nuestro favor): se descuenta solo de las próximas compras."
              : "No le debemos nada y él tampoco nos debe."}
          {Number(c.vencimientos.vencida) > 0 && <b className="block">⏰ De eso, {formatearMoneda(c.vencimientos.vencida)} ya están vencidos.</b>}
        </p>
        <SemaforoCredito semaforo={i.semaforo} usoPct={i.usoPct?.toString()} />
      </div>

      <DatosTransferencia alias={c.proveedor.aliasTransferencia} cbu={c.proveedor.cbu} titular={c.proveedor.titularCuenta} cargar={sesion.permisos.includes("proveedores.editar") ? `/proveedores/${id}?editar#editar` : undefined} />

      <FormularioAccion accion={registrarPagoAccion} boton="✓ Registrar el pago">
        <input type="hidden" name="proveedorId" value={id} />
        <input type="hidden" name="claveIdempotencia" value={randomUUID()} />
        <PagoConDeudas
          proveedor={c.proveedor.nombre}
          deudas={c.pendientes.map((p) => ({
            clave: p.clave,
            descripcion: p.descripcion,
            detalle: `${formatearFecha(hoyEnEmpresa(p.fecha, sesion.zonaHoraria))}${p.vence ? ` · vence ${formatearFecha(p.vence)}` : ""}${p.diasAtraso ? ` · ${p.diasAtraso} días de atraso` : ""}`,
            pendiente: p.pendiente,
          }))}
        />
        <div className="max-w-xs">
          <Selector etiqueta="¿Cómo le pagaste?" name="medio" opciones={opciones(MEDIOS_PAGO)} defaultValue="EFECTIVO" />
        </div>
        <details className="rounded-xl border border-borde bg-superficie p-4">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">Más datos (otro día, número de transferencia, cheque, notas)</summary>
          <div className="mt-2 flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="¿Qué día le pagaste?" name="fecha" type="date" defaultValue={c.hoy} max={c.hoy} />
              <Campo etiqueta="Referencia (opcional)" name="referencia" placeholder="N.º de transferencia o de cheque" />
              <Campo etiqueta="Si es un cheque: banco" name="chequeBanco" />
              <Campo etiqueta="Si es un cheque: fecha de cobro" name="chequeFechaCobro" type="date" />
            </div>
            <AreaTexto etiqueta="Notas (opcional)" name="observaciones" />
          </div>
        </details>
      </FormularioAccion>
    </section>
  );
}
