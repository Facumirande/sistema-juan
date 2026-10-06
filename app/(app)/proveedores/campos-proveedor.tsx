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
      <fieldset className="grid gap-4 rounded-lg border border-borde p-3 sm:grid-cols-2">
        <legend className="px-1 font-semibold">🏦 Para transferirle</legend>
        <Campo etiqueta="Alias" name="aliasTransferencia" defaultValue={proveedor?.aliasTransferencia ?? ""} placeholder="Ej. garcia.hnos.mercado" autoCapitalize="none" />
        <Campo etiqueta="A nombre de quién está la cuenta" name="titularCuenta" defaultValue={proveedor?.titularCuenta ?? ""} placeholder="Ej. García Juan Carlos" ayuda="Para confirmar que el banco muestra el mismo nombre antes de transferir." />
        <Campo etiqueta="CBU o CVU (opcional)" name="cbu" inputMode="numeric" defaultValue={proveedor?.cbu ?? ""} placeholder="22 números" />
      </fieldset>
      <details>
        <summary className="min-h-11 cursor-pointer py-2 font-medium">Más datos (fiscales, código)</summary>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <Campo etiqueta="Código (opcional)" name="codigo" defaultValue={proveedor?.codigo ?? ""} />
          <Campo etiqueta="Razón social" name="razonSocial" defaultValue={proveedor?.razonSocial ?? ""} />
          <Campo etiqueta="CUIT" name="identificacionFiscal" defaultValue={proveedor?.identificacionFiscal ?? ""} />
          <Campo etiqueta="Correo" name="email" type="email" defaultValue={proveedor?.email ?? ""} />
          <Campo etiqueta="Dirección" name="direccion" defaultValue={proveedor?.direccion ?? ""} />
        </div>
      </details>
      <AreaTexto etiqueta="Observaciones" name="observaciones" defaultValue={proveedor?.observaciones ?? ""} />
    </>
  );
}
