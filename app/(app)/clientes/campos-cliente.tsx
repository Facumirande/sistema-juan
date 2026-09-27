import type { FichaCliente, PuntoDeEntrega } from "@/modulos/clientes/clientes";
import { DIAS_SEMANA, PERIODICIDADES, TIPOS_CLIENTE, opciones } from "@/ui/etiquetas";
import { AreaTexto, Campo, Casilla, Selector } from "@/ui/formularios";

const PRIORIDADES = [
  { valor: "1", etiqueta: "1 · máxima (ej. hospital)" },
  { valor: "2", etiqueta: "2" },
  { valor: "3", etiqueta: "3 · normal" },
  { valor: "4", etiqueta: "4" },
  { valor: "5", etiqueta: "5 · mínima" },
];

/** Campos del alta y la edición de un cliente (P-16). */
export function CamposCliente({ cliente }: { cliente?: FichaCliente }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Nombre" name="nombre" defaultValue={cliente?.nombre} placeholder="Ej. Hospital San Martín" required />
        <Selector etiqueta="Tipo" name="tipoCliente" opciones={opciones(TIPOS_CLIENTE)} defaultValue={cliente?.tipoCliente ?? "COMERCIO"} />
        <Campo etiqueta="Teléfono para pedidos" name="telefono" type="tel" defaultValue={cliente?.telefono ?? ""} />
        <Campo etiqueta="Contacto" name="contactoNombre" defaultValue={cliente?.contactoNombre ?? ""} />
        <Selector
          etiqueta="Prioridad si falta mercadería"
          name="prioridadFaltantes"
          opciones={PRIORIDADES}
          defaultValue={String(cliente?.prioridadFaltantes ?? 3)}
        />
        <Selector
          etiqueta="Facturación"
          name="periodicidadFacturacion"
          opciones={opciones(PERIODICIDADES)}
          defaultValue={cliente?.periodicidadFacturacion ?? "POR_ENTREGA"}
        />
      </div>
      <Casilla etiqueta="Pide número de orden de compra" name="requiereOrdenCompra" defaultChecked={cliente?.requiereOrdenCompra ?? false} />
      <Casilla etiqueta="Acepta que se le cambie un producto por otro" name="aceptaSustituciones" defaultChecked={cliente?.aceptaSustituciones ?? true} />
      <Casilla etiqueta="Hay que traer el remito firmado" name="requiereFirma" defaultChecked={cliente?.requiereFirma ?? false} />
      <details>
        <summary className="min-h-11 cursor-pointer py-2 font-medium">Datos fiscales y correos</summary>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <Campo etiqueta="Razón social" name="razonSocial" defaultValue={cliente?.razonSocial ?? ""} />
          <Campo etiqueta="CUIT" name="identificacionFiscal" defaultValue={cliente?.identificacionFiscal ?? ""} />
          <Campo etiqueta="Condición fiscal" name="condicionFiscal" defaultValue={cliente?.condicionFiscal ?? ""} placeholder="Ej. Responsable inscripto" />
          <Campo etiqueta="Dirección fiscal" name="direccionFiscal" defaultValue={cliente?.direccionFiscal ?? ""} />
          <Campo etiqueta="Correo" name="email" type="email" defaultValue={cliente?.email ?? ""} />
          <Campo etiqueta="Correo para remitos valorizados" name="emailContable" type="email" defaultValue={cliente?.emailContable ?? ""} />
          <Campo etiqueta="Código (opcional)" name="codigo" defaultValue={cliente?.codigo ?? ""} />
        </div>
      </details>
      <AreaTexto etiqueta="Observaciones" name="observaciones" defaultValue={cliente?.observaciones ?? ""} />
    </>
  );
}

/** Campos de un punto de entrega. `prefijo` permite cargarlo junto con el alta del cliente. */
export function CamposPunto({ punto, prefijo = "" }: { punto?: PuntoDeEntrega; prefijo?: string }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Nombre del punto" name={`${prefijo}nombre`} defaultValue={punto?.nombre} placeholder="Ej. Local, Cocina central" />
        <Campo etiqueta="Dirección" name={`${prefijo}direccion`} defaultValue={punto?.direccion} />
        <Campo etiqueta="Localidad" name={`${prefijo}localidad`} defaultValue={punto?.localidad ?? ""} />
        <Campo etiqueta="Quién recibe" name={`${prefijo}contactoNombre`} defaultValue={punto?.contactoNombre ?? ""} />
        <Campo etiqueta="Teléfono de quien recibe" name={`${prefijo}contactoTelefono`} type="tel" defaultValue={punto?.contactoTelefono ?? ""} />
        <div className="grid grid-cols-2 gap-2">
          <Campo etiqueta="Recibe desde" name={`${prefijo}horarioDesde`} type="time" defaultValue={punto?.horarioDesde ?? ""} />
          <Campo etiqueta="Hasta" name={`${prefijo}horarioHasta`} type="time" defaultValue={punto?.horarioHasta ?? ""} />
        </div>
      </div>
      <fieldset className="flex flex-wrap gap-x-4">
        <legend className="mb-1 font-medium">Días de entrega</legend>
        {DIAS_SEMANA.map((d) => (
          <Casilla
            key={d.valor}
            etiqueta={d.etiqueta}
            name={`${prefijo}diasEntrega`}
            value={d.valor}
            defaultChecked={punto?.diasEntrega.includes(Number(d.valor)) ?? false}
          />
        ))}
      </fieldset>
      <Campo etiqueta="Referencias" name={`${prefijo}referencias`} defaultValue={punto?.referencias ?? ""} placeholder="Ej. entrada por la calle lateral" />
      <AreaTexto etiqueta="Instrucciones de entrega (salen en el remito)" name={`${prefijo}instruccionesEntrega`} defaultValue={punto?.instruccionesEntrega ?? ""} />
    </>
  );
}
