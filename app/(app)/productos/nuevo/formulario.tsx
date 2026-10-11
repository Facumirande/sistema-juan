"use client";

import { useMemo, useState } from "react";

import { categoriaSugerida, CATEGORIAS_PREELEGIDAS, normalizar } from "@/dominio/catalogo/categorias";
import { codigoSugerido, dibujoDeProducto, ejemploDeCostos, envasesSugeridos, explicarPresentacion, grupoDeProducto, nombreDePresentacion, unidadSugerida } from "@/dominio/catalogo/productos";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { ElegirDibujo } from "@/ui/elegir-dibujo";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Pregunta, campoGrande, opcion } from "@/ui/guiado";

import { crearProductoGuiadoAccion, editarProductoGuiadoAccion } from "../acciones";

// Un producto en tres preguntas (qué es, cómo se vende, en qué envase se compra), con la tarjeta de
// cómo va a quedar. La ganancia, el código y las notas quedan en "Más opciones". La categoría se
// elige entre las que ya se usan, las preelegidas (Duras, Blandas, Frágiles…), "Ninguna" u otra
// escrita; mientras no se elija, se propone una según el nombre (RN-154). El dibujo sale solo del
// nombre y se puede cambiar por otro de la lista.
//
// El mismo formulario sirve para crear y para editar (pedido del usuario, 11/10/2026: "al editor de
// productos dejalo con las mismas herramientas que cuando los creas"): con `producto` arranca con
// sus datos y guarda los cambios.

interface Categoria {
  id: string;
  nombre: string;
  grupo: string;
}

/** Lo que hace falta de un producto para editarlo con este formulario. */
export interface ProductoAEditar {
  id: string;
  nombre: string;
  codigo: string;
  categoriaId: string;
  unidadBase: string;
  /** Todavía se puede cambiar cómo se vende (no tiene otros envases ni precios cargados). */
  unidadEditable: boolean;
  admiteFraccion: boolean;
  /** La ganancia propia del producto, en %; vacía si usa la de su categoría o la general. */
  recargo: string;
  observaciones: string;
  nombreCorto: string;
  dibujo: string | null;
  /** Los envases que ya tiene (sin el de la unidad en que se cuenta) y sirven para comprar. */
  envasesDeCompra: { id: string; nombre: string }[];
  /** El envase en que se compra (nulo = suelto). */
  envaseDeCompraId: string | null;
  /** En qué se puede vender, para elegir el de siempre. */
  envasesDeVenta: { id: string; nombre: string }[];
  envaseDeVentaId: string | null;
  /** A dónde se vuelve después de guardar. */
  volver: "lista" | "ficha";
}

const UNIDADES = [
  { valor: "KG", icono: "⚖️", nombre: "Por kilo", ejemplo: "tomate, papa, banana", corta: "kg", fraccion: true, comun: true },
  { valor: "UNIDAD", icono: "🔢", nombre: "Por unidad", ejemplo: "lechuga, palta, ananá", corta: "u", fraccion: false, comun: true },
  { valor: "ATADO", icono: "🌿", nombre: "Por atado", ejemplo: "perejil, acelga, rúcula", corta: "atado", fraccion: false, comun: true },
  { valor: "CAJON", icono: "🧺", nombre: "Por cajón", ejemplo: "sin decir los kilos", corta: "cajón", fraccion: false, comun: true },
  { valor: "BOLSA", icono: "🛍️", nombre: "Por bolsa", ejemplo: "papa, cebolla", corta: "bolsa", fraccion: false, comun: true },
  { valor: "CAJA", icono: "📦", nombre: "Por caja", ejemplo: "banana, manzana", corta: "caja", fraccion: false, comun: true },
  { valor: "JAULA", icono: "🥬", nombre: "Por jaula", ejemplo: "lechuga, repollo", corta: "jaula", fraccion: false, comun: true },
  { valor: "DOCENA", icono: "🔟", nombre: "Por docena", ejemplo: "limones, naranjas", corta: "docena", fraccion: false, comun: false },
  { valor: "MAPLE", icono: "🥚", nombre: "Por maple", ejemplo: "huevos", corta: "maple", fraccion: false, comun: false },
  { valor: "BANDEJA", icono: "🧺", nombre: "Por bandeja", ejemplo: "frutillas, champiñones", corta: "bandeja", fraccion: false, comun: false },
  { valor: "PAQUETE", icono: "📦", nombre: "Por paquete", ejemplo: "hierbas, brotes", corta: "paquete", fraccion: false, comun: false },
  { valor: "LITRO", icono: "💧", nombre: "Por litro", ejemplo: "jugos", corta: "l", fraccion: true, comun: false },
  { valor: "BOLSON", icono: "🛍️", nombre: "Por bolsón", ejemplo: "zanahoria", corta: "bolsón", fraccion: false, comun: false },
  { valor: "RISTRA", icono: "🧄", nombre: "Por ristra", ejemplo: "ajo", corta: "ristra", fraccion: false, comun: false },
] as const;
type Unidad = (typeof UNIDADES)[number]["valor"];
/** Las que son un envase: se cuenta en ese envase y no se pregunta cuántos kilos trae (10/10/2026). */
const DE_ENVASE: ReadonlySet<string> = new Set(["CAJON", "CAJA", "BOLSA", "JAULA", "BOLSON", "RISTRA"]);

const FRANJA: Readonly<Record<string, string>> = { VERDURA: "var(--etiqueta-verde)", FRUTA: "var(--etiqueta-naranja)", OTRO: "var(--etiqueta-gris)" };

export function FormularioProducto({
  categorias,
  codigos,
  recargoGlobal,
  recargoPorCategoria,
  verRecargos,
  producto,
}: {
  categorias: Categoria[];
  codigos: string[];
  recargoGlobal: string;
  recargoPorCategoria: Record<string, string | null>;
  verRecargos: boolean;
  /** Con esto, el formulario edita ese producto en vez de crear uno. */
  producto?: ProductoAEditar;
}) {
  const editando = producto !== undefined;
  const unidadInicial = (UNIDADES.find((x) => x.valor === producto?.unidadBase)?.valor ?? "KG") as Unidad;
  const [nombre, setNombre] = useState(producto?.nombre ?? "");
  /** "id:<uuid>", "nombre:<texto>" o "ninguna"; null = la que se propone por el nombre. */
  const [elegida, setElegida] = useState<string | null>(producto ? `id:${producto.categoriaId}` : null);
  const [otraCategoria, setOtraCategoria] = useState<string | null>(null);
  const [unidad, setUnidad] = useState<Unidad>(unidadInicial);
  // Al editar, la forma de vender no sigue al nombre: ya está elegida.
  const [unidadAMano, setUnidadAMano] = useState(editando);
  const [verTodas, setVerTodas] = useState(false);
  const [fraccion, setFraccion] = useState(producto?.admiteFraccion ?? true);
  /** El envase que ya tiene y se eligió para comprar (solo al editar); nulo = uno nuevo o suelto. */
  const [envaseId, setEnvaseId] = useState<string | null>(producto?.envaseDeCompraId ?? null);
  const [envase, setEnvase] = useState(editando ? "" : "Cajón");
  const [cantidad, setCantidad] = useState(editando ? "" : "18");
  const [otroEnvase, setOtroEnvase] = useState(false);
  const [codigoPropio, setCodigoPropio] = useState<string | null>(producto?.codigo ?? null);
  const [recargo, setRecargo] = useState(producto?.recargo ?? "");
  const [precioEjemplo, setPrecioEjemplo] = useState("");
  const [dibujoElegido, setDibujoElegido] = useState<string | null>(producto?.dibujo ?? null);

  // La categoría propuesta por el nombre: la que ya existe con ese nombre o la preelegida.
  const sugerida = useMemo(() => {
    const n = categoriaSugerida(nombre);
    if (!n) return "ninguna";
    const existente = categorias.find((c) => normalizar(c.nombre) === normalizar(n));
    return existente ? `id:${existente.id}` : `nombre:${n}`;
  }, [nombre, categorias]);
  const valorCategoria = otraCategoria !== null ? (otraCategoria.trim() ? `nombre:${otraCategoria.trim()}` : "ninguna") : (elegida ?? sugerida);
  const categoria = valorCategoria.startsWith("id:") ? categorias.find((c) => `id:${c.id}` === valorCategoria) : undefined;
  const nombreCategoria = categoria?.nombre ?? (valorCategoria.startsWith("nombre:") ? valorCategoria.slice(7) : null);
  const categoriaId = categoria?.id ?? "";
  const usadas = new Set(categorias.map((c) => normalizar(c.nombre)));
  const preelegidasLibres = CATEGORIAS_PREELEGIDAS.filter((c) => !usadas.has(normalizar(c.nombre)));
  const elegirCategoria = (valor: string) => {
    setElegida(valor);
    setOtraCategoria(null);
  };
  const u = UNIDADES.find((x) => x.valor === unidad)!;
  const codigoAuto = useMemo(() => (nombre.trim() ? codigoSugerido(nombre, new Set(codigos)) : "—"), [nombre, codigos]);
  const envaseQueTiene = producto?.envasesDeCompra.find((e) => e.id === envaseId) ?? null;
  const presentacionNueva = envase.trim() ? nombreDePresentacion(envase, cantidad, u.corta) : "";
  const presentacion = envaseQueTiene?.nombre ?? presentacionNueva;
  const explicacion = !envaseQueTiene && envase.trim() ? explicarPresentacion(presentacionNueva, cantidad, u.corta) : null;
  const recargoQueAplica = recargo.trim() || recargoPorCategoria[categoriaId] || recargoGlobal;
  const origenRecargo = recargo.trim() ? "la de este producto" : recargoPorCategoria[categoriaId] ? `la de ${categoria?.nombre ?? "la categoría"}` : "la general";
  const ejemplo = !envaseQueTiene && envase.trim() && precioEjemplo ? ejemploDeCostos({ precioEnvase: precioEjemplo, cantidad, recargoPct: recargoQueAplica }) : null;
  const grupo = grupoDeProducto(nombre, categoria?.grupo);
  const dibujoAutomatico = dibujoDeProducto(nombre, grupo);
  const dibujo = dibujoElegido ?? dibujoAutomatico;
  const unidadesVisibles = UNIDADES.filter((x) => x.comun || verTodas || x.valor === unidad);
  const elegirUnidad = (x: (typeof UNIDADES)[number], aMano = true) => {
    if (aMano) setUnidadAMano(true);
    setUnidad(x.valor);
    setFraccion(x.fraccion);
    const primero = envasesSugeridos(x.valor)[0];
    setEnvaseId(null);
    setEnvase(primero?.envase ?? "");
    setCantidad(primero?.cantidad ?? "");
    setOtroEnvase(false);
  };
  // Los envases de siempre que el producto todavía no tiene (al editar, los que tiene van primero).
  const yaTiene = new Set((producto?.envasesDeCompra ?? []).map((e) => normalizar(e.nombre)));
  const sugeridos = envasesSugeridos(unidad).filter((e) => !yaTiene.has(normalizar(nombreDePresentacion(e.envase, e.cantidad, u.corta))));
  const puedeCambiarUnidad = !editando || producto.unidadEditable;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <FormularioAccion accion={editando ? editarProductoGuiadoAccion : crearProductoGuiadoAccion} boton={editando ? "Guardar los cambios" : "Crear el producto"} className="flex flex-col gap-4">
        {editando && <input type="hidden" name="id" value={producto.id} />}
        {editando && <input type="hidden" name="volver" value={producto.volver} />}
        <input type="hidden" name="unidadBase" value={unidad} />
        <input type="hidden" name="categoria" value={valorCategoria} />
        {fraccion && <input type="hidden" name="admiteFraccion" value="on" />}
        <input type="hidden" name="presentacionCompraId" value={envaseId ?? ""} />
        <input type="hidden" name="envase" value={envaseId ? "" : envase} />
        <input type="hidden" name="cantidadEnvase" value={envaseId ? "" : cantidad} />
        {codigoPropio !== null && <input type="hidden" name="codigo" value={codigoPropio} />}

        <Pregunta n={1} titulo="¿Qué producto es?" ayuda="El nombre como lo dicen ustedes y en qué grupo va.">
          <input
            name="nombre"
            required
            autoFocus={!editando}
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value);
              // Mientras no se eligió a mano, la forma de vender sigue al nombre (huevos → maple).
              if (!unidadAMano) {
                const x = UNIDADES.find((y) => y.valor === unidadSugerida(e.target.value));
                if (x && x.valor !== unidad) elegirUnidad(x, false);
              }
            }}
            placeholder="Ej. Tomate redondo"
            aria-label="Nombre del producto"
            className={campoGrande}
          />
          <ElegirDibujo name="dibujo" elegido={dibujoElegido} automatico={dibujoAutomatico} alElegir={setDibujoElegido} />
          <p className="text-sm font-medium">
            Categoría{elegida === null && otraCategoria === null && nombre.trim() && sugerida !== "ninguna" && <span className="font-normal text-texto-suave"> (propuesta por el nombre: cambiala si querés)</span>}
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Categoría">
            {categorias.map((c) => (
              <button key={c.id} type="button" onClick={() => elegirCategoria(`id:${c.id}`)} aria-pressed={valorCategoria === `id:${c.id}`} className={opcion(valorCategoria === `id:${c.id}`)}>
                <span aria-hidden>{CATEGORIAS_PREELEGIDAS.find((p) => normalizar(p.nombre) === normalizar(c.nombre))?.icono ?? dibujoDeProducto("", c.grupo)}</span>
                {c.nombre}
              </button>
            ))}
            {preelegidasLibres.map((c) => (
              <button key={c.nombre} type="button" title={c.ayuda} onClick={() => elegirCategoria(`nombre:${c.nombre}`)} aria-pressed={valorCategoria === `nombre:${c.nombre}`} className={opcion(valorCategoria === `nombre:${c.nombre}`)}>
                <span aria-hidden>{c.icono}</span>
                {c.nombre}
              </button>
            ))}
            <button type="button" onClick={() => elegirCategoria("ninguna")} aria-pressed={valorCategoria === "ninguna" && otraCategoria === null} className={opcion(valorCategoria === "ninguna" && otraCategoria === null)}>
              Ninguna
            </button>
            <button type="button" onClick={() => setOtraCategoria(otraCategoria ?? "")} aria-pressed={otraCategoria !== null} className={opcion(otraCategoria !== null)}>
              Otra…
            </button>
          </div>
          {!editando && (
            <p className="text-sm text-texto-suave">
              Su código se arma solo: <b className="text-texto">{codigoAuto}</b>. Sirve para buscarlo y para las planillas de Excel.
            </p>
          )}
          {otraCategoria !== null && (
            <input value={otraCategoria} onChange={(e) => setOtraCategoria(e.target.value)} maxLength={80} placeholder="Nombre de la categoría (ej. Verduras de estación)" aria-label="Nombre de otra categoría" className={campoGrande} />
          )}
        </Pregunta>

        <Pregunta n={2} titulo="¿Cómo se vende?" ayuda={puedeCambiarUnidad ? "Así se anotan los pedidos y se calculan los precios. Después no se puede cambiar." : "Así se anotan los pedidos y se calculan los precios."}>
          {puedeCambiarUnidad ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {unidadesVisibles.map((x) => (
                  <button key={x.valor} type="button" onClick={() => elegirUnidad(x)} aria-pressed={x.valor === unidad} className={`${opcion(x.valor === unidad)} flex-col items-start`}>
                    <span className="text-2xl" aria-hidden>
                      {x.icono}
                    </span>
                    <span className="font-semibold">{x.nombre}</span>
                    <span className="text-xs text-texto-suave">{x.ejemplo}</span>
                  </button>
                ))}
              </div>
              {!verTodas && (
                <button type="button" onClick={() => setVerTodas(true)} className="self-start text-sm font-medium underline underline-offset-2">
                  Otra forma (docena, maple, bandeja, paquete, litro, bolsón, ristra)
                </button>
              )}
            </>
          ) : (
            <p className="flex flex-wrap items-center gap-3 rounded-xl bg-fondo px-3 py-2">
              <span className="text-2xl" aria-hidden>
                {u.icono}
              </span>
              <span>
                <b>{u.nombre}</b>
                <span className="block text-sm text-texto-suave">Ya tiene envases o precios cargados en esta medida: no se cambia. Si hace falta otra, se crea un producto nuevo.</span>
              </span>
            </p>
          )}
        </Pregunta>

        {DE_ENVASE.has(unidad) ? (
          <Pregunta n={3} titulo="¿En qué envase lo comprás?" ayuda="">
            <p className="rounded-xl bg-fondo px-3 py-2 font-medium">👉 Se compra y se vende por {u.corta}: no hace falta decir cuántos kilos trae.</p>
          </Pregunta>
        ) : (
          <Pregunta
            n={3}
            titulo="¿En qué envase lo comprás?"
            ayuda={
              editando
                ? "Para calcular cuánto cuesta cada kilo o unidad. Elegí uno de los que ya tiene o agregale otro; si se compra suelto, “Suelto”."
                : "Para calcular cuánto cuesta cada kilo o unidad. Si se compra suelto, elegí “Suelto”. Si no sabés cuánto trae, dejalo vacío: se cuenta por ese envase."
            }
          >
            <div className="flex flex-wrap gap-2">
              {(producto?.envasesDeCompra ?? []).map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => {
                    setEnvaseId(e.id);
                    setOtroEnvase(false);
                  }}
                  aria-pressed={envaseId === e.id}
                  className={opcion(envaseId === e.id)}
                >
                  {e.nombre}
                </button>
              ))}
              {sugeridos.map((e) => {
                const activo = !envaseId && !otroEnvase && envase === e.envase && cantidad === e.cantidad;
                return (
                  <button
                    key={`${e.envase}-${e.cantidad}`}
                    type="button"
                    onClick={() => {
                      setEnvaseId(null);
                      setEnvase(e.envase);
                      setCantidad(e.cantidad);
                      setOtroEnvase(false);
                    }}
                    aria-pressed={activo}
                    className={opcion(activo)}
                  >
                    {editando && "＋ "}
                    {e.envase} de {e.cantidad} {u.corta}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setEnvaseId(null);
                  setEnvase("");
                  setCantidad("");
                  setOtroEnvase(false);
                }}
                aria-pressed={!envaseId && !envase && !otroEnvase}
                className={opcion(!envaseId && !envase && !otroEnvase)}
              >
                Suelto (sin envase)
              </button>
              <button
                type="button"
                onClick={() => {
                  setEnvaseId(null);
                  setOtroEnvase(true);
                }}
                aria-pressed={otroEnvase}
                className={opcion(otroEnvase)}
              >
                Otro envase…
              </button>
            </div>
            {otroEnvase && (
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="font-medium">Envase</span>
                  <input value={envase} onChange={(e) => setEnvase(e.target.value)} placeholder="Ej. Jaula, bolsa" className={`${campoGrande} w-44`} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-medium">Cuánto trae{editando ? "" : " (opcional)"}</span>
                  <span className="flex items-center gap-2">
                    <input inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="18" className={`${campoGrande} w-24`} />
                    <span className="font-medium">{u.corta}</span>
                  </span>
                </label>
              </div>
            )}
            {explicacion && <p className="rounded-xl bg-fondo px-3 py-2 font-medium">👉 {explicacion}</p>}
            {editando && <p className="text-sm text-texto-suave">Para cambiar cuánto trae un envase, desactivarlo o ver todos, están en la ficha del producto (“¿En qué envases viene?”).</p>}
          </Pregunta>
        )}

        <details className="rounded-2xl border border-borde bg-superficie p-4" open={editando}>
          <summary className="cursor-pointer text-lg font-semibold">Más opciones (se pueden dejar como están)</summary>
          <div className="mt-4 flex flex-col gap-5">
            {verRecargos && (
              <div className="flex flex-col gap-2">
                <p className="font-medium">¿Cuánto le ganás?</p>
                <span className="flex flex-wrap items-center gap-2">
                  <input name="recargo" inputMode="decimal" value={recargo} onChange={(e) => setRecargo(e.target.value)} placeholder={recargoQueAplica} aria-label="Ganancia sobre el costo en %" className={`${campoGrande} w-24`} />
                  <span className="font-medium">%</span>
                  <span className="text-sm text-texto-suave">
                    Si lo dejás vacío se usa {origenRecargo}: {recargoQueAplica} %.
                  </span>
                </span>
                {!envaseQueTiene && envase.trim() && (
                  <div className="flex flex-col gap-2 rounded-xl bg-fondo p-3">
                    <label className="flex flex-wrap items-center gap-2">
                      <span>Para probar: si el {presentacion.toLowerCase() || "envase"} te cuesta $</span>
                      <input inputMode="decimal" value={precioEjemplo} onChange={(e) => setPrecioEjemplo(e.target.value)} placeholder="18.000" aria-label="Precio de ejemplo del envase" className="h-10 w-28 rounded-lg border border-borde bg-superficie px-2" />
                    </label>
                    {ejemplo && (
                      <p className="font-medium">
                        → el {u.corta} te sale {formatearMoneda(ejemplo.costoUnidad)} y lo vendés a <b>{formatearMoneda(ejemplo.ventaUnidad)}</b>
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" checked={fraccion} onChange={(e) => setFraccion(e.target.checked)} className="size-5" />
              <span>
                Se puede pedir en partes <span className="text-texto-suave">(ej. 1,5 {u.corta})</span>
              </span>
            </label>
            <div className="flex flex-col gap-1">
              <span className="font-medium">Código</span>
              {codigoPropio === null ? (
                <p className="text-sm text-texto-suave">
                  Se arma solo: <b className="text-texto">{codigoAuto}</b>.{" "}
                  <button type="button" onClick={() => setCodigoPropio(codigoAuto === "—" ? "" : codigoAuto)} className="font-medium underline underline-offset-2">
                    Poner otro
                  </button>
                </p>
              ) : (
                <input value={codigoPropio} onChange={(e) => setCodigoPropio(e.target.value.toUpperCase())} maxLength={20} placeholder="Ej. TOM-R" aria-label="Código del producto" className={`${campoGrande} w-44 uppercase`} />
              )}
            </div>
            {editando && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="font-medium">
                    Nombre corto <span className="font-normal text-texto-suave">(opcional, para donde hay poco lugar)</span>
                  </span>
                  <input name="nombreCorto" defaultValue={producto.nombreCorto} maxLength={40} className={`${campoGrande} max-w-sm`} />
                </label>
                {producto.envasesDeVenta.length > 1 && (
                  <label className="flex flex-col gap-1">
                    <span className="font-medium">¿En qué se vende de siempre?</span>
                    <select name="presentacionVentaDefaultId" defaultValue={producto.envaseDeVentaId ?? ""} className={`${campoGrande} max-w-sm`}>
                      {producto.envasesDeVenta.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            )}
            <label className="flex flex-col gap-1">
              <span className="font-medium">Notas</span>
              <textarea name="observaciones" rows={2} defaultValue={producto?.observaciones ?? ""} placeholder="Ej. elegir los más maduros" className="rounded-xl border-2 border-borde bg-superficie px-3 py-2 text-base" />
            </label>
          </div>
        </details>
      </FormularioAccion>

      <aside className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
        <p className="text-sm font-semibold text-texto-suave">Así va a quedar</p>
        <div className="flex flex-col overflow-hidden rounded-lg bg-tarjeta text-tarjeta-texto shadow-tarjeta">
          <span aria-hidden className="h-2" style={{ background: FRANJA[grupo] ?? FRANJA.OTRO }} />
          <div className="flex flex-col gap-2 p-3">
            <div className="flex items-start gap-3">
              <span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-black/5 text-2xl dark:bg-white/10">
                {dibujo}
              </span>
              <div>
                <p className="font-semibold">{nombre.trim() || "Nombre del producto"}</p>
                <p className="text-sm text-tarjeta-suave">
                  {codigoPropio?.trim() || codigoAuto} · se vende {u.nombre.toLowerCase()}
                </p>
              </div>
            </div>
            <p className="text-sm text-tarjeta-suave">📦 {presentacion ? `Se compra en ${presentacion}` : "Se compra suelto"}</p>
            <p className="text-sm text-tarjeta-suave">🏷 {nombreCategoria ?? "Sin categoría"}</p>
          </div>
        </div>
        <p className="text-sm text-texto-suave">
          {editando
            ? "Los puestos que lo venden, sus precios y el resto de los envases se manejan en su ficha."
            : "Después de crearlo, en su ficha le cargás qué proveedores lo venden y a qué precio (o se carga solo con la primera compra)."}
        </p>
      </aside>
    </div>
  );
}
