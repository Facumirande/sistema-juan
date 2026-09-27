import type { Metadata } from "next";

import { obtenerBaseDatos } from "@/db/cliente";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { hoyEnEmpresa } from "@/dominio/fechas/fechas";
import { cuentaCorriente } from "@/modulos/compras/cuenta-corriente";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { cargarFicha, idDeRuta } from "@/ui/accion-servidor";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Campo, CampoNumero, Encabezado, Selector, Tarjeta } from "@/ui/formularios";

import { saldoInicialAccion } from "../../../compras/acciones";
import { ajusteAccion } from "../../acciones";

export const metadata: Metadata = { title: "Ajuste de cuenta · Sistema Juan" };

/** P-63 Ajuste y deuda anterior al sistema (06 §5). */
export default async function AjusteDeCuenta({ params }: PageProps<"/cuentas-proveedores/[id]/ajuste">) {
  const sesion = await sesionParaPantalla("pagos.ajustar");
  const id = idDeRuta((await params).id);
  const hoy = hoyEnEmpresa(new Date(), sesion.zonaHoraria);
  const c = await cargarFicha(cuentaCorriente(obtenerBaseDatos(), sesion.authUserId, id, { desde: hoy, hasta: hoy }));
  const compras = c.pendientes.filter((p) => p.compraId).map((p) => ({ valor: p.compraId!, etiqueta: `${p.descripcion} · falta ${formatearMoneda(p.pendiente)}` }));

  return (
    <section className="flex max-w-2xl flex-col gap-6">
      <Encabezado
        titulo={`Ajustar la cuenta de ${c.proveedor.nombre}`}
        volver={{ ruta: `/cuentas-proveedores/${id}`, texto: "Cuenta del proveedor" }}
        descripcion={c.indicadores.saldoAFavor.gt(0) ? `Hoy tenemos ${formatearMoneda(c.indicadores.saldoAFavor)} a favor.` : `Hoy se le debe ${formatearMoneda(c.indicadores.saldoPendiente)}.`}
      />

      <Tarjeta titulo="Ajuste">
        <p className="text-texto-suave">
          Para corregir la cuenta sin tocar las compras: mercadería en mal estado o una nota de crédito (baja la deuda), una diferencia de precio o un recargo que
          reclama el proveedor (la sube).
        </p>
        <FormularioAccion accion={ajusteAccion} boton="Registrar ajuste">
          <input type="hidden" name="proveedorId" value={id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Selector
              etiqueta="Qué pasó"
              name="tipo"
              opciones={[
                { valor: "AJUSTE_CREDITO", etiqueta: "Baja la deuda (a nuestro favor)" },
                { valor: "AJUSTE_DEBITO", etiqueta: "Sube la deuda (a favor del proveedor)" },
              ]}
            />
            <CampoNumero etiqueta="Importe" name="monto" placeholder="Ej. 32.400" />
            <Selector etiqueta="Compra relacionada (opcional)" name="compraId" opciones={compras} vacia="—" />
            <Campo etiqueta="Vence (solo si sube la deuda)" name="vencimiento" type="date" />
          </div>
          <Campo etiqueta="Motivo" name="motivo" placeholder="Ej. 2 cajones de tomate podridos" />
        </FormularioAccion>
      </Tarjeta>

      <Tarjeta titulo="Deuda de antes de usar el sistema">
        <p className="text-texto-suave">Una por cada boleta que se le debía al empezar (o una sola por el total). Se paga igual que las compras, de la más vieja a la más nueva.</p>
        <FormularioAccion accion={saldoInicialAccion} boton="Cargar deuda">
          <input type="hidden" name="proveedorId" value={id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoNumero etiqueta="Cuánto se le debía" name="monto" placeholder="Ej. 120.000" />
            <Campo etiqueta="Fecha de la boleta" name="fecha" type="date" max={hoy} />
            <Campo etiqueta="Vence (opcional)" name="vencimiento" type="date" />
            <Campo etiqueta="N.º de boleta (opcional)" name="referencia" />
          </div>
        </FormularioAccion>
      </Tarjeta>
    </section>
  );
}
