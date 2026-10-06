import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { dibujoDeProducto } from "@/dominio/catalogo/productos";
import { dec } from "@/dominio/dinero/decimal";
import { formatearCantidad, formatearNumero, type UnidadMedida } from "@/dominio/dinero/formato";
import { avisoDeFaltante } from "@/dominio/entregas/entregas";
import { listarProductos } from "@/modulos/catalogo/productos";
import { obtenerEntregaParaPreparar, type LineaAPreparar } from "@/modulos/entregas/preparacion";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { cargarFicha, idDeRuta } from "@/ui/accion-servidor";
import { BotonAccion } from "@/ui/boton-accion";
import { ESTADOS_ENTREGA, MOTIVOS_FALTANTE, UNIDADES_CORTAS } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Aviso, Campo, CampoNumero, Encabezado, Selector, clasesBoton } from "@/ui/formularios";

import { salenAhoraAccion } from "../../../../repartos/acciones";
import { marcarPreparadaAccion, preparadoAccion, sustituirAccion, todoPropuestoAccion } from "../../../acciones";
import { PasosDePreparacion, pasoDeEntrega } from "../../../pasos";

export const metadata: Metadata = { title: "Preparar un pedido · Sistema Juan" };

const cant = (v: string, u: string) => formatearCantidad(v, u as UnidadMedida);
const num = (v: string) => formatearNumero(v, { decimales: 3, recortarCeros: true });
const aviso = (l: LineaAPreparar) => (l.esSustitucion ? null : avisoDeFaltante({ pedida: l.pedida, propuesta: l.propuesta, preparada: l.preparada, motivo: l.motivoFaltante, unidad: l.unidad as UnidadMedida }));
const PASTEL_FALTA = "rounded-lg bg-[var(--pastel-naranja)] px-3 py-2 font-semibold text-[var(--pastel-naranja-texto)]";

// P-71 (uso interno, 29/09/2026): el pedido de un cliente como una lista para separar. Cada
// producto dice cuánto separar; si está todo, un toque ("✓ Está todo"); si falta algo, cuánto se
// manda y por qué. Arriba queda a la vista lo que faltó, para avisarle al cliente.

function Linea({ l, editable, productos, aceptaSustituciones }: { l: LineaAPreparar; editable: boolean; productos: { valor: string; etiqueta: string }[]; aceptaSustituciones: boolean }) {
  const aPreparar = l.propuesta ?? l.pedida;
  const recortada = !l.esSustitucion && dec(aPreparar).lt(l.pedida);
  const falta = aviso(l);
  const lista = l.preparada !== null;
  const unidad = UNIDADES_CORTAS[l.unidad] ?? l.unidad.toLowerCase();
  return (
    <li className={`flex flex-col gap-3 rounded-2xl border-2 bg-superficie p-4 ${lista ? (falta ? "border-[var(--etiqueta-naranja)]" : "border-[var(--listo-fondo)]") : "border-borde"}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-4xl leading-none">
          {dibujoDeProducto(l.producto)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xl leading-tight font-semibold">{l.producto}</p>
          {l.reemplazaA && <p className="text-sm text-texto-suave">🔁 En lugar de {l.reemplazaA}</p>}
          <p className="text-lg">
            {l.esSustitucion ? "Mandar " : "Separar "}
            <b className="tabular-nums">{cant(l.esSustitucion ? (l.preparada ?? l.pedida) : l.pedida, l.unidad)}</b>
            {l.pedidaEnPresentacion && <span className="text-texto-suave"> ({l.pedidaEnPresentacion})</span>}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${lista ? (falta ? "bg-[var(--pastel-naranja)] text-[var(--pastel-naranja-texto)]" : "bg-[var(--listo-fondo)] text-[var(--listo-texto)]") : "bg-fondo text-texto-suave"}`}>
          {lista ? (falta ? "⚠ Faltó" : `✓ ${cant(l.preparada!, l.unidad)}`) : "⬜ Por separar"}
        </span>
      </div>
      {falta && <p className={PASTEL_FALTA}>⚠ {falta}</p>}
      {l.observaciones && <p className="text-sm">📝 “{l.observaciones}”</p>}

      {editable && !lista && (
        <FormularioAccion accion={preparadoAccion} boton={!recortada ? `✓ Está todo (${cant(aPreparar, l.unidad)})` : dec(aPreparar).isZero() ? "✗ No va (no hay)" : `✓ Separé ${cant(aPreparar, l.unidad)} (lo que hay)`} enLinea>
          <input type="hidden" name="itemId" value={l.id} />
          <input type="hidden" name="cantidad" value={num(aPreparar)} />
          {recortada && <input type="hidden" name="motivo" value={l.motivoFaltante ?? "FALTANTE"} />}
        </FormularioAccion>
      )}
      {editable && (
        <details className="rounded-xl bg-fondo px-3">
          <summary className="min-h-11 cursor-pointer py-2.5 font-semibold">{lista ? "✏️ Corregir lo que se separó" : l.esSustitucion ? "✏️ Cambiar la cantidad" : "⚠ Falta algo o pesa distinto"}</summary>
          <div className="flex flex-col gap-4 pb-3">
            <FormularioAccion accion={preparadoAccion} boton="Guardar">
              <input type="hidden" name="itemId" value={l.id} />
              <CampoNumero etiqueta={`¿Cuánto se manda? (en ${unidad})`} ayuda="0 si no va nada." name="cantidad" defaultValue={lista ? num(l.preparada!) : ""} placeholder={num(aPreparar)} className="w-40" />
              {!l.esSustitucion && (
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 font-medium">Si falta, ¿por qué?</legend>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(MOTIVOS_FALTANTE).map(([valor, texto]) => (
                      <label key={valor} className="flex min-h-11 cursor-pointer items-center rounded-full border-2 border-borde bg-superficie px-4 has-checked:border-marca has-checked:bg-marca has-checked:text-marca-texto has-focus-visible:outline-2 has-focus-visible:outline-marca">
                        <input type="radio" name="motivo" value={valor} defaultChecked={(l.motivoFaltante ?? (recortada ? "FALTANTE" : null)) === valor} className="sr-only" />
                        {texto}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            </FormularioAccion>
            {!l.esSustitucion && (
              <details className="rounded-xl border border-borde bg-superficie px-3">
                <summary className="min-h-11 cursor-pointer py-2.5 font-medium">🔁 Mandar otro producto en su lugar</summary>
                <div className="pb-3">
                  <FormularioAccion accion={sustituirAccion} boton="Agregar el reemplazo">
                    <input type="hidden" name="itemId" value={l.id} />
                    <Selector etiqueta="¿Qué se manda?" name="productoId" opciones={productos.filter((p) => p.valor !== l.productoId)} vacia="Elegí…" />
                    <CampoNumero etiqueta="¿Cuánto?" name="cantidad" className="w-40" />
                    <Campo
                      etiqueta={aceptaSustituciones ? "¿Quién lo autorizó? (opcional)" : "¿Quién lo autorizó? (este cliente no suele aceptar reemplazos)"}
                      name="autorizadoPor"
                      placeholder="Ej. el jefe de cocina por WhatsApp"
                    />
                  </FormularioAccion>
                </div>
              </details>
            )}
          </div>
        </details>
      )}
    </li>
  );
}

/** P-71 Preparar el pedido de un cliente (celular o tablet): qué separar, qué faltó y por qué, sin precios. */
export default async function PrepararEntrega({ params }: PageProps<"/preparacion/[fecha]/entrega/[id]">) {
  const sesion = await sesionParaPantalla("preparacion.ver");
  const { fecha, id } = await params;
  const db = obtenerBaseDatos();
  const e = await cargarFicha(obtenerEntregaParaPreparar(db, sesion.authUserId, idDeRuta(id)));
  const puedeRegistrar = sesion.permisos.includes("preparacion.registrar");
  const editable = puedeRegistrar && ["BORRADOR", "EN_PREPARACION", "PREPARADA"].includes(e.estado);
  const separando = ["BORRADOR", "EN_PREPARACION"].includes(e.estado);
  const salio = ["EN_REPARTO", "ENTREGADA"].includes(e.estado);
  const verRemito = e.remito && sesion.permisos.includes("documentos.imprimir_entrega");
  const productos = editable ? (await listarProductos(db, sesion.authUserId)).map((p) => ({ valor: p.id, etiqueta: p.nombre })) : [];
  const separadas = e.lineas.filter((l) => l.preparada !== null).length;
  const faltas = e.lineas.map((l) => ({ l, falta: aviso(l) })).filter((x) => x.falta);
  const pct = e.lineas.length ? Math.round((separadas / e.lineas.length) * 100) : 0;

  return (
    <section className="flex max-w-2xl flex-col gap-5 pb-4">
      <Encabezado
        titulo={`📦 ${e.cliente}`}
        volver={{ ruta: `/preparacion/${fecha}`, texto: "Preparación" }}
        descripcion={[e.punto, e.numero, e.horario && `recibe ${e.horario}`, e.reparto && `${e.reparto}${e.orden ? `, parada ${e.orden}` : ""}`].filter(Boolean).join(" · ")}
      >
        <span className="rounded-full border border-borde px-3 py-1 text-sm">{ESTADOS_ENTREGA[e.estado]}</span>
      </Encabezado>

      <PasosDePreparacion actual={pasoDeEntrega(e.estado, separadas, e.lineas.length)} />

      {separando ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-[var(--pastel-amarillo)] p-4 text-[var(--pastel-amarillo-texto)]">
          <p className="text-lg font-semibold">
            {separadas === e.lineas.length ? "✓ Está todo separado: falta marcarlo como preparado (abajo)" : `Separados ${separadas} de ${e.lineas.length} productos`}
            {faltas.length > 0 && ` · falta algo en ${faltas.length}`}
          </p>
          <div className="h-3 overflow-hidden rounded-full bg-black/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Avance de la preparación">
            <div className="h-3 rounded-full bg-[var(--listo-fondo)]" style={{ width: `${pct}%` }} />
          </div>
          {editable && separadas < e.lineas.length && (
            <FormularioAccion accion={todoPropuestoAccion} boton="✓ Está todo en los que faltan" enLinea confirmar="¿Marcar como separado lo pedido (o lo que alcanzó) en todos los productos que faltan? Después podés corregir cualquiera.">
              <input type="hidden" name="entregaId" value={e.id} />
            </FormularioAccion>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl bg-[var(--pastel-verde)] p-4 text-[var(--pastel-verde-texto)]">
          <p className="text-lg font-semibold">
            {salio ? (e.estado === "ENTREGADA" ? "✅ Ya se entregó" : "🚚 Ya salió: está en camino") : e.remito ? "✓ Preparado y con el remito hecho: listo para salir" : "✓ Preparado"}
          </p>
          <div className="flex flex-wrap gap-2">
            {verRemito && (
              <Link href={`/entregas/${e.id}/documento/lista-entrega`} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-superficie px-4 font-semibold text-texto">
                🧾 Ver o imprimir el remito
              </Link>
            )}
            {e.estado === "PREPARADA" && sesion.permisos.includes("repartos.gestionar") && (
              <BotonAccion accion={salenAhoraAccion} datos={{ entrega: e.id }} mostrarExito className={clasesBoton("principal")}>
                🚚 Sale ahora (pasa a En camino)
              </BotonAccion>
            )}
          </div>
          {e.estado === "PREPARADA" && editable && (
            <FormularioAccion accion={marcarPreparadaAccion} boton="Guardar los bultos" variante="secundario" enLinea>
              <input type="hidden" name="entregaId" value={e.id} />
              <CampoNumero etiqueta="¿Cuántos bultos?" name="bultos" defaultValue={e.bultos?.toString() ?? ""} inputMode="numeric" className="w-28" />
            </FormularioAccion>
          )}
        </div>
      )}

      {(e.observaciones || e.instrucciones) && (
        <div className="rounded-2xl border-2 border-marca p-4">
          {e.observaciones && <p>📝 {e.observaciones}</p>}
          {e.instrucciones && <p className="text-sm text-texto-suave">Para la entrega: {e.instrucciones}</p>}
        </div>
      )}
      {faltas.length > 0 && (
        <div className="flex flex-col gap-1 rounded-2xl border-2 border-[var(--etiqueta-naranja)] p-4">
          <p className="font-semibold">Lo que falta (para avisarle al cliente)</p>
          <ul className="list-disc pl-5">
            {faltas.map(({ l, falta }) => (
              <li key={l.id}>
                <b>{l.producto}</b>: {falta}
              </li>
            ))}
          </ul>
        </div>
      )}
      {e.documentosPendientes && <Aviso>Falta un precio para hacer el remito: completalo desde la entrega antes de que salga el reparto.</Aviso>}

      <ul className="flex flex-col gap-3">
        {e.lineas.map((l) => (
          <Linea key={l.id} l={l} editable={editable} productos={productos} aceptaSustituciones={e.aceptaSustituciones} />
        ))}
      </ul>

      {editable && separando && (
        <div className="sticky bottom-0 flex flex-col gap-2 rounded-2xl border-2 border-marca bg-superficie p-4 shadow-lg">
          <p className="font-semibold">
            {separadas < e.lineas.length
              ? `Paso 1: faltan separar ${e.lineas.length - separadas} ${e.lineas.length - separadas === 1 ? "producto" : "productos"}. Después marcalo como preparado.`
              : "Paso 2: todo separado. Marcalo como preparado y el remito se hace solo."}
          </p>
          <FormularioAccion accion={marcarPreparadaAccion} boton="🧾 Marcar como preparado" variante={separadas < e.lineas.length ? "secundario" : "principal"} enLinea>
            <input type="hidden" name="entregaId" value={e.id} />
            <CampoNumero etiqueta="¿Cuántos bultos? (opcional)" name="bultos" defaultValue={e.bultos?.toString() ?? ""} inputMode="numeric" className="w-28" />
          </FormularioAccion>
        </div>
      )}
    </section>
  );
}
