import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { dec } from "@/dominio/dinero/decimal";
import { formatearCantidad, formatearNumero, type UnidadMedida } from "@/dominio/dinero/formato";
import { listarProductos } from "@/modulos/catalogo/productos";
import { obtenerEntregaParaPreparar, type LineaAPreparar } from "@/modulos/entregas/preparacion";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { cargarFicha, idDeRuta } from "@/ui/accion-servidor";
import { ESTADOS_ENTREGA, MOTIVOS_FALTANTE, opciones } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Aviso, Campo, CampoNumero, Encabezado, Selector, clasesBoton } from "@/ui/formularios";

import { marcarPreparadaAccion, preparadoAccion, sustituirAccion, todoPropuestoAccion } from "../../../acciones";

export const metadata: Metadata = { title: "Preparar entrega · Sistema Juan" };

const cant = (v: string, u: string) => formatearCantidad(v, u as UnidadMedida);
const num = (v: string) => formatearNumero(v, { decimales: 3, recortarCeros: true });

function Linea({ l, editable, productos, aceptaSustituciones }: { l: LineaAPreparar; editable: boolean; productos: { valor: string; etiqueta: string }[]; aceptaSustituciones: boolean }) {
  const aPreparar = l.propuesta ?? l.pedida;
  const recortada = !l.esSustitucion && dec(aPreparar).lt(l.pedida);
  const ev = l.evaluacion;
  return (
    <li className={`flex flex-col gap-2 rounded-lg border p-3 ${l.preparada !== null ? "border-marca" : "border-borde"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-lg font-semibold">
          {l.producto}
          {l.reemplazaA && <span className="block text-sm font-normal text-texto-suave">en reemplazo de {l.reemplazaA}</span>}
        </p>
        {l.preparada !== null && (
          <span className={`text-sm font-semibold ${ev && !ev.dentro ? "text-error" : "text-marca"}`}>
            ✔ {cant(l.preparada, l.unidad)}
            {ev?.diferenciaPct && !dec(ev.diferenciaPct).isZero() && ` (${dec(ev.diferenciaPct).gt(0) ? "+" : ""}${formatearNumero(ev.diferenciaPct, { decimales: 1 })} %)`}
          </span>
        )}
      </div>
      {!l.esSustitucion && (
        <p className="text-texto-suave">
          Pedido {cant(l.pedida, l.unidad)}
          {l.pedidaEnPresentacion && ` (${l.pedidaEnPresentacion})`}
          {recortada && <b className="text-error"> · alcanza para {cant(aPreparar, l.unidad)}</b>}
        </p>
      )}
      {l.observaciones && <p className="text-sm">“{l.observaciones}”</p>}
      {l.motivoFaltante && <p className="text-sm text-error">{MOTIVOS_FALTANTE[l.motivoFaltante]}</p>}
      {editable && (
        <>
          <FormularioAccion accion={preparadoAccion} boton="Guardar" variante="secundario" enLinea>
            <input type="hidden" name="itemId" value={l.id} />
            <CampoNumero etiqueta={`Preparado (${l.unidad === "KG" ? "kg" : "u"})`} name="cantidad" defaultValue={l.preparada !== null ? num(l.preparada) : ""} placeholder={num(aPreparar)} className="w-32" />
            {!l.esSustitucion && <Selector etiqueta="Si falta" name="motivo" opciones={opciones(MOTIVOS_FALTANTE)} vacia="—" defaultValue={l.motivoFaltante ?? (recortada ? "FALTANTE" : "")} />}
          </FormularioAccion>
          {l.preparada === null && (
            <FormularioAccion accion={preparadoAccion} boton={`= ${cant(aPreparar, l.unidad)}`} variante="secundario" enLinea>
              <input type="hidden" name="itemId" value={l.id} />
              <input type="hidden" name="cantidad" value={num(aPreparar)} />
              {recortada && <input type="hidden" name="motivo" value="FALTANTE" />}
            </FormularioAccion>
          )}
          {!l.esSustitucion && (
            <details>
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Reemplazar por otro producto</summary>
              <FormularioAccion accion={sustituirAccion} boton="Agregar reemplazo" variante="secundario">
                <input type="hidden" name="itemId" value={l.id} />
                <Selector etiqueta="Producto" name="productoId" opciones={productos.filter((p) => p.valor !== l.productoId)} vacia="—" />
                <CampoNumero etiqueta="Cantidad" name="cantidad" />
                <Campo
                  etiqueta={aceptaSustituciones ? "Quién lo autorizó (opcional)" : "Quién lo autorizó (este cliente no acepta reemplazos)"}
                  name="autorizadoPor"
                  placeholder="Ej. jefe de cocina por WhatsApp"
                />
              </FormularioAccion>
            </details>
          )}
        </>
      )}
    </li>
  );
}

/** P-71 Preparar entrega (celular o tablet): peso real, faltantes y reemplazos, sin precios. */
export default async function PrepararEntrega({ params }: PageProps<"/preparacion/[fecha]/entrega/[id]">) {
  const sesion = await sesionParaPantalla("preparacion.ver");
  const { fecha, id } = await params;
  const db = obtenerBaseDatos();
  const e = await cargarFicha(obtenerEntregaParaPreparar(db, sesion.authUserId, idDeRuta(id)));
  const puedeRegistrar = sesion.permisos.includes("preparacion.registrar");
  const editable = puedeRegistrar && ["BORRADOR", "EN_PREPARACION", "PREPARADA"].includes(e.estado);
  const productos = editable ? (await listarProductos(db, sesion.authUserId)).map((p) => ({ valor: p.id, etiqueta: p.nombre })) : [];
  const cargadas = e.lineas.filter((l) => l.preparada !== null).length;

  return (
    <section className="flex max-w-xl flex-col gap-4">
      <Encabezado
        titulo={e.cliente}
        volver={{ ruta: `/preparacion/${fecha}`, texto: "Preparación" }}
        descripcion={[e.punto, e.numero, e.horario && `recibe ${e.horario}`, e.reparto && `${e.reparto}${e.orden ? `, parada ${e.orden}` : ""}`].filter(Boolean).join(" · ")}
      >
        <span className="rounded-full border border-borde px-3 py-1 text-sm">{ESTADOS_ENTREGA[e.estado]}</span>
      </Encabezado>
      {(e.observaciones || e.instrucciones) && (
        <div className="rounded-lg border-2 border-marca p-3">
          {e.observaciones && <p>📝 {e.observaciones}</p>}
          {e.instrucciones && <p className="text-sm text-texto-suave">Entrega: {e.instrucciones}</p>}
        </div>
      )}
      {e.documentosPendientes && <Aviso>Documentos pendientes: el administrador tiene que completar un precio antes de que salga el reparto.</Aviso>}

      {editable && cargadas < e.lineas.length && (
        <FormularioAccion accion={todoPropuestoAccion} boton="Cargar todo como está pedido" variante="secundario" confirmar="¿Cargar lo pedido en todas las líneas que faltan? Después podés corregir el peso real.">
          <input type="hidden" name="entregaId" value={e.id} />
        </FormularioAccion>
      )}

      <ul className="flex flex-col gap-3">
        {e.lineas.map((l) => (
          <Linea key={l.id} l={l} editable={editable} productos={productos} aceptaSustituciones={e.aceptaSustituciones} />
        ))}
      </ul>

      {editable && (
        <div className="sticky bottom-0 flex flex-col gap-2 rounded-lg border border-borde bg-superficie p-3 shadow">
          <p className="font-semibold">
            {cargadas}/{e.lineas.length} líneas
          </p>
          <FormularioAccion accion={marcarPreparadaAccion} boton={e.estado === "PREPARADA" ? "Guardar bultos" : "Marcar preparada"} enLinea>
            <input type="hidden" name="entregaId" value={e.id} />
            <CampoNumero etiqueta="Bultos" name="bultos" defaultValue={e.bultos?.toString() ?? ""} inputMode="numeric" className="w-24" />
          </FormularioAccion>
        </div>
      )}
      {["PREPARADA", "EN_REPARTO", "ENTREGADA"].includes(e.estado) && sesion.permisos.includes("documentos.imprimir_entrega") && !e.documentosPendientes && (
        <Link href={`/entregas/${e.id}/documento/lista-entrega`} className={clasesBoton("principal")}>
          Imprimir lista de entrega
        </Link>
      )}
    </section>
  );
}
