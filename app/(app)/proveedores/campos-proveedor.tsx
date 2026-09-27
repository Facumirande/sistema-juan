import { formatearNumero } from "@/dominio/dinero/formato";
import type { FichaProveedor } from "@/modulos/proveedores/proveedores";
import { CONDICIONES_PAGO, opciones } from "@/ui/etiquetas";
import { AreaTexto, Campo, CampoNumero, Selector } from "@/ui/formularios";

/** Campos del alta y la edición de un proveedor. Los de crédito solo con `proveedores.editar_limite`. */
export function CamposProveedor({ proveedor, editarCredito }: { proveedor?: FichaProveedor; editarCredito: boolean }) {
  const limite = proveedor?.credito?.limiteCredito;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Nombre" name="nombre" defaultValue={proveedor?.nombre} placeholder="Ej. Hnos. García" required />
        <Campo etiqueta="Ubicación en el mercado" name="ubicacionMercado" defaultValue={proveedor?.ubicacionMercado ?? ""} placeholder="Ej. Nave 2, puesto 14" />
        <Campo etiqueta="Teléfono / WhatsApp" name="telefono" type="tel" defaultValue={proveedor?.telefono ?? ""} />
        <Campo etiqueta="Contacto" name="contactoNombre" defaultValue={proveedor?.contactoNombre ?? ""} />
        <Selector
          etiqueta="Condición de pago habitual"
          name="condicionPagoHabitual"
          opciones={opciones(CONDICIONES_PAGO)}
          defaultValue={proveedor?.condicionPagoHabitual ?? "CREDITO"}
        />
        {editarCredito && (
          <>
            <CampoNumero
              etiqueta="Límite de crédito"
              name="limiteCredito"
              defaultValue={limite ? formatearNumero(limite, { decimales: 2, recortarCeros: true }) : ""}
              ayuda="Lo máximo que se le puede deber. Vacío = sin límite."
            />
            <CampoNumero
              etiqueta="Plazo de pago (días)"
              name="plazoPagoDias"
              inputMode="numeric"
              defaultValue={proveedor?.credito?.plazoPagoDias?.toString() ?? ""}
              ayuda="Para calcular vencimientos. Vacío = sin plazo."
            />
          </>
        )}
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer py-2 font-medium">Más datos (fiscales, banco, código)</summary>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <Campo etiqueta="Código (opcional)" name="codigo" defaultValue={proveedor?.codigo ?? ""} />
          <Campo etiqueta="Razón social" name="razonSocial" defaultValue={proveedor?.razonSocial ?? ""} />
          <Campo etiqueta="CUIT" name="identificacionFiscal" defaultValue={proveedor?.identificacionFiscal ?? ""} />
          <Campo etiqueta="Correo" name="email" type="email" defaultValue={proveedor?.email ?? ""} />
          <Campo etiqueta="Dirección" name="direccion" defaultValue={proveedor?.direccion ?? ""} />
          <Campo etiqueta="Datos bancarios (CBU / alias)" name="datosBancarios" defaultValue={proveedor?.datosBancarios ?? ""} />
        </div>
      </details>
      <AreaTexto etiqueta="Observaciones" name="observaciones" defaultValue={proveedor?.observaciones ?? ""} />
    </>
  );
}
