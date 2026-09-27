import { formatearCantidad, formatearNumero, type UnidadMedida } from "@/dominio/dinero/formato";
import { MOTIVOS_DIFERENCIA, opciones } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Campo, CampoNumero, Selector } from "@/ui/formularios";

import { confirmarEntregaAccion } from "./acciones";

interface Linea {
  id: string;
  producto: string;
  unidad: string;
  reemplazaA: string | null;
  cantidadPreparada: string | null;
}

const num = (v: string) => formatearNumero(v, { decimales: 3, recortarCeros: true });

function Recepcion({ requiereFirma }: { requiereFirma?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Campo etiqueta="Recibió" name="recibidoPor" placeholder="Nombre" autoComplete="off" />
      <Campo etiqueta="Cargo (opcional)" name="recibidoCargo" placeholder="Ej. dueño, jefa de cocina" autoComplete="off" />
      {requiereFirma && <p className="text-sm text-texto-suave sm:col-span-2">Este cliente pide el remito firmado: guardá el duplicado firmado.</p>}
    </div>
  );
}

/**
 * Confirmación de una entrega (P-78, 04 §5.f.3): "Entregado completo" en tres toques más el
 * nombre; "Con diferencias" por línea (nunca más de lo preparado, RN-126); "No recibió" (RN-134).
 * Sin precios.
 */
export function FormulariosConfirmacion({ entregaId, lineas, volver, requiereFirma }: { entregaId: string; lineas: Linea[]; volver: string; requiereFirma?: boolean }) {
  const oculto = (
    <>
      <input type="hidden" name="entregaId" value={entregaId} />
      <input type="hidden" name="volver" value={volver} />
    </>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border-2 border-marca p-3">
        <h2 className="text-lg font-semibold">Entregado completo</h2>
        <ul className="text-texto-suave">
          {lineas.map((l) => (
            <li key={l.id}>
              {l.producto} · {formatearCantidad(l.cantidadPreparada ?? "0", l.unidad as UnidadMedida)}
            </li>
          ))}
        </ul>
        <FormularioAccion accion={confirmarEntregaAccion} boton="Confirmar entrega">
          {oculto}
          <input type="hidden" name="modo" value="COMPLETA" />
          <Recepcion requiereFirma={requiereFirma} />
        </FormularioAccion>
      </div>

      <details className="rounded-lg border border-borde p-3">
        <summary className="min-h-11 cursor-pointer py-2 text-lg font-semibold">Con diferencias</summary>
        <FormularioAccion accion={confirmarEntregaAccion} boton="Confirmar con diferencias">
          {oculto}
          <input type="hidden" name="modo" value="DIFERENCIAS" />
          <ul className="flex flex-col gap-3">
            {lineas.map((l) => (
              <li key={l.id} className="flex flex-col gap-2 border-t border-borde pt-2 first:border-t-0">
                <p className="font-semibold">
                  {l.producto}
                  {l.reemplazaA && <span className="font-normal text-texto-suave"> (en reemplazo de {l.reemplazaA})</span>}
                  <span className="font-normal text-texto-suave"> · se llevó {formatearCantidad(l.cantidadPreparada ?? "0", l.unidad as UnidadMedida)}</span>
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <CampoNumero etiqueta="Entregado" name={`ent_${l.id}`} defaultValue={num(l.cantidadPreparada ?? "0")} />
                  <Selector etiqueta="Motivo si es menos" name={`mot_${l.id}`} opciones={opciones(MOTIVOS_DIFERENCIA)} vacia="—" />
                  <Campo etiqueta="Detalle" name={`det_${l.id}`} placeholder="Ej. 4 kg golpeados" />
                </div>
              </li>
            ))}
          </ul>
          <Recepcion requiereFirma={requiereFirma} />
          <Campo etiqueta="Observaciones (opcional)" name="observaciones" />
        </FormularioAccion>
      </details>

      <details className="rounded-lg border border-borde p-3">
        <summary className="min-h-11 cursor-pointer py-2 text-lg font-semibold">No recibió nada</summary>
        <FormularioAccion accion={confirmarEntregaAccion} boton="Registrar que no recibió" variante="peligro" confirmar="¿Confirmás que no se entregó nada? Toda la mercadería vuelve.">
          {oculto}
          <input type="hidden" name="modo" value="NO_RECIBIO" />
          <Selector
            etiqueta="Por qué"
            name="motivoNoRecibio"
            opciones={[
              { valor: "OTRO", etiqueta: "Cerrado / no había nadie" },
              { valor: "CAMBIO_CLIENTE", etiqueta: "Canceló en la puerta" },
            ]}
          />
          <Campo etiqueta="Detalle" name="detalleNoRecibio" placeholder="Ej. local cerrado a las 9" />
          <Campo etiqueta="Quién avisó (opcional)" name="recibidoPor" />
        </FormularioAccion>
      </details>
    </div>
  );
}
