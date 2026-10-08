import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { REDONDEOS, configuracionDeEmpresa, type ClaveRedondeo } from "@/modulos/configuracion/empresa";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Campo, CampoNumero, Encabezado, Selector } from "@/ui/formularios";

import { guardarConfiguracionAccion } from "./acciones";

export const metadata: Metadata = { title: "Configuración · Sistema Repartos" };

function Grupo({ titulo, ayuda, children }: { titulo: string; ayuda: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border border-borde bg-superficie p-4">
      <legend className="px-1 text-lg font-semibold">{titulo}</legend>
      <p className="-mt-2 text-sm text-texto-suave">{ayuda}</p>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

/** P-95 Configuración del negocio: datos de los documentos y ajustes (se pueden dejar como vienen). */
export default async function Configuracion() {
  const sesion = await sesionParaPantalla("configuracion.ver");
  const c = await configuracionDeEmpresa(obtenerBaseDatos(), sesion.authUserId);
  const editable = sesion.permisos.includes("configuracion.editar");
  const redondeos = (Object.keys(REDONDEOS) as ClaveRedondeo[]).map((k) => ({ valor: k, etiqueta: REDONDEOS[k].texto }));

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <Encabezado
        titulo="Configuración del negocio"
        descripcion="Los datos que salen en los remitos y algunos ajustes del sistema. Vienen con valores razonables: cambialos solo si hace falta."
      />
      <FormularioAccion accion={guardarConfiguracionAccion} boton="Guardar la configuración" className="flex flex-col gap-6">
        <fieldset disabled={!editable} className="flex flex-col gap-6">
          <Grupo titulo="Datos del negocio" ayuda="Salen en el encabezado de los remitos, las listas contables y los comprobantes.">
            <Campo etiqueta="Nombre" name="nombre" defaultValue={c.nombre} required />
            <Campo etiqueta="CUIT (opcional)" name="identificacionFiscal" defaultValue={c.identificacionFiscal ?? ""} />
            <Campo etiqueta="Dirección (opcional)" name="direccion" defaultValue={c.direccion ?? ""} />
            <Campo etiqueta="Teléfono (opcional)" name="telefono" type="tel" defaultValue={c.telefono ?? ""} />
            <Campo etiqueta="Correo (opcional)" name="email" type="email" defaultValue={c.email ?? ""} />
          </Grupo>

          <Grupo
            titulo="Precios"
            ayuda="La ganancia de cada producto se cambia en Precios de venta. Acá, cómo se redondea el precio y cuándo avisar."
          >
            <Selector etiqueta="Cómo se redondea el precio de venta" name="redondeo" opciones={redondeos} defaultValue={c.redondeo ?? "CERCANO_1"} />
            <CampoNumero
              etiqueta="Avisar si una venta deja menos de (%)"
              name="margenMinimoPct"
              defaultValue={c.margenMinimoPct}
              ayuda="Ganancia sobre lo que se cobra. Debajo de esto, el pedido lo marca en rojo."
            />
            <CampoNumero
              etiqueta="Pedir confirmación si un precio de compra cambia más de (%)"
              name="variacionBruscaPct"
              defaultValue={c.variacionBruscaPct}
              ayuda="Para no guardar un precio mal escrito por error."
            />
            <CampoNumero
              etiqueta="Marcar un precio de compra como viejo después de (días)"
              name="diasAlertaPrecioDesactualizado"
              inputMode="numeric"
              defaultValue={String(c.diasAlertaPrecioDesactualizado)}
            />
          </Grupo>

          <Grupo titulo="A pagar a los proveedores" ayuda="El color de cada proveedor según cuánto de su límite de crédito se usa, y los avisos de vencimiento.">
            <CampoNumero etiqueta="Amarillo desde (% del límite)" name="semaforoAmarilloPct" defaultValue={c.semaforoAmarilloPct} />
            <CampoNumero etiqueta="Rojo desde (% del límite)" name="semaforoRojoPct" defaultValue={c.semaforoRojoPct} />
            <CampoNumero
              etiqueta="Avisar un vencimiento con (días de anticipación)"
              name="diasAvisoVencimiento"
              inputMode="numeric"
              defaultValue={String(c.diasAvisoVencimiento)}
            />
          </Grupo>

          <Grupo titulo="Pedidos y preparación" ayuda="Para qué día se proponen los pedidos nuevos y cuánta diferencia de peso se acepta al preparar.">
            <Campo
              etiqueta="Hora de corte de pedidos (opcional)"
              name="horaCortePedidos"
              type="time"
              defaultValue={c.horaCortePedidos ?? ""}
              ayuda="Después de esta hora, un pedido nuevo se propone para pasado mañana. Vacío = siempre para mañana."
            />
            <CampoNumero
              etiqueta="Diferencia de peso aceptada al preparar (%)"
              name="toleranciaPesoPct"
              defaultValue={c.toleranciaPesoPct}
              ayuda="Si lo preparado difiere menos que esto de lo pedido, no se marca como diferencia."
            />
          </Grupo>
        </fieldset>
      </FormularioAccion>
      <p className="text-sm text-texto-suave">
        El lugar de donde salen los repartos se marca en el{" "}
        <Link href="/viaje" className="font-medium underline underline-offset-2">
          viaje de entrega
        </Link>
        .
      </p>
    </section>
  );
}
