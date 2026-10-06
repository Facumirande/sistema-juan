"use client";

import { useMemo, useState } from "react";

import { categoriaSugerida, CATEGORIAS_PREELEGIDAS, normalizar } from "@/dominio/catalogo/categorias";
import { codigoSugerido, dibujoDeProducto, ejemploDeCostos, envasesSugeridos, explicarPresentacion, grupoDeProducto, nombreDePresentacion, unidadSugerida } from "@/dominio/catalogo/productos";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Pregunta, campoGrande, opcion } from "@/ui/guiado";

import { crearProductoGuiadoAccion } from "../acciones";

// Alta de un producto en tres preguntas (qué es, cómo se vende, en qué envase se compra), con la
// tarjeta de cómo va a quedar. La ganancia, el código y las notas quedan en "Más opciones". La
// categoría se elige entre las que ya se usan, las preelegidas (Duras, Blandas, Frágiles…),
// "Ninguna" u otra escrita; mientras no se elija, se propone una según el nombre (RN-154).

interface Categoria {
  id: string;
  nombre: string;
  grupo: string;
}

const UNIDADES = [
  { valor: "KG", icono: "⚖️", nombre: "Por kilo", ejemplo: "tomate, papa, banana", corta: "kg", fraccion: true, comun: true },
  { valor: "UNIDAD", icono: "🔢", nombre: "Por unidad", ejemplo: "lechuga, palta, ananá", corta: "u", fraccion: false, comun: true },
  { valor: "ATADO", icono: "🌿", nombre: "Por atado", ejemplo: "perejil, acelga, rúcula", corta: "atado", fraccion: false, comun: true },
  { valor: "DOCENA", icono: "🔟", nombre: "Por docena", ejemplo: "limones, naranjas", corta: "docena", fraccion: false, comun: true },
  { valor: "MAPLE", icono: "🥚", nombre: "Por maple", ejemplo: "huevos", corta: "maple", fraccion: false, comun: false },
  { valor: "BANDEJA", icono: "🧺", nombre: "Por bandeja", ejemplo: "frutillas, champiñones", corta: "bandeja", fraccion: false, comun: false },
  { valor: "PAQUETE", icono: "📦", nombre: "Por paquete", ejemplo: "hierbas, brotes", corta: "paquete", fraccion: false, comun: false },
  { valor: "LITRO", icono: "💧", nombre: "Por litro", ejemplo: "jugos", corta: "l", fraccion: true, comun: false },
] as const;

const FRANJA: Readonly<Record<string, string>> = { VERDURA: "var(--etiqueta-verde)", FRUTA: "var(--etiqueta-naranja)", OTRO: "var(--etiqueta-gris)" };

export function FormularioProducto({
  categorias,
  codigos,
  recargoGlobal,
  recargoPorCategoria,
  verRecargos,
}: {
  categorias: Categoria[];
  codigos: string[];
  recargoGlobal: string;
  recargoPorCategoria: Record<string, string | null>;
  verRecargos: boolean;
}) {
  const [nombre, setNombre] = useState("");
  /** "id:<uuid>", "nombre:<texto>" o "ninguna"; null = la que se propone por el nombre. */
  const [elegida, setElegida] = useState<string | null>(null);
  const [otraCategoria, setOtraCategoria] = useState<string | null>(null);
  const [unidad, setUnidad] = useState<(typeof UNIDADES)[number]["valor"]>("KG");
  const [unidadAMano, setUnidadAMano] = useState(false);
  const [verTodas, setVerTodas] = useState(false);
  const [fraccion, setFraccion] = useState(true);
  const [envase, setEnvase] = useState("Cajón");
  const [cantidad, setCantidad] = useState("18");
  const [otroEnvase, setOtroEnvase] = useState(false);
  const [codigoPropio, setCodigoPropio] = useState<string | null>(null);
  const [recargo, setRecargo] = useState("");
  const [precioEjemplo, setPrecioEjemplo] = useState("");

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
  const presentacion = envase.trim() ? nombreDePresentacion(envase, cantidad, u.corta) : "";
  const explicacion = envase.trim() ? explicarPresentacion(presentacion, cantidad, u.corta) : null;
  const recargoQueAplica = recargo.trim() || recargoPorCategoria[categoriaId] || recargoGlobal;
  const origenRecargo = recargo.trim() ? "la de este producto" : recargoPorCategoria[categoriaId] ? `la de ${categoria?.nombre ?? "la categoría"}` : "la general";
  const ejemplo = envase.trim() && precioEjemplo ? ejemploDeCostos({ precioEnvase: precioEjemplo, cantidad, recargoPct: recargoQueAplica }) : null;
  const grupo = grupoDeProducto(nombre, categoria?.grupo);
  const dibujo = dibujoDeProducto(nombre, grupo);
  const unidadesVisibles = UNIDADES.filter((x) => x.comun || verTodas || x.valor === unidad);
  const elegirUnidad = (x: (typeof UNIDADES)[number], aMano = true) => {
    if (aMano) setUnidadAMano(true);
    setUnidad(x.valor);
    setFraccion(x.fraccion);
    const primero = envasesSugeridos(x.valor)[0];
    setEnvase(primero?.envase ?? "");
    setCantidad(primero?.cantidad ?? "");
    setOtroEnvase(false);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <FormularioAccion accion={crearProductoGuiadoAccion} boton="Crear el producto" className="flex flex-col gap-4">
        <input type="hidden" name="unidadBase" value={unidad} />
        <input type="hidden" name="categoria" value={valorCategoria} />
        {fraccion && <input type="hidden" name="admiteFraccion" value="on" />}
        <input type="hidden" name="envase" value={envase} />
        <input type="hidden" name="cantidadEnvase" value={cantidad} />
        {codigoPropio !== null && <input type="hidden" name="codigo" value={codigoPropio} />}

        <Pregunta n={1} titulo="¿Qué producto es?" ayuda="El nombre como lo dicen ustedes y en qué grupo va.">
          <input
            name="nombre"
            required
            autoFocus
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
          {otraCategoria !== null && (
            <input value={otraCategoria} onChange={(e) => setOtraCategoria(e.target.value)} maxLength={80} placeholder="Nombre de la categoría (ej. Verduras de estación)" aria-label="Nombre de otra categoría" className={campoGrande} />
          )}
        </Pregunta>

        <Pregunta n={2} titulo="¿Cómo se vende?" ayuda="Así se anotan los pedidos y se calculan los precios. Después no se puede cambiar.">
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
              Otra forma (maple, bandeja, paquete, litro)
            </button>
          )}
        </Pregunta>

        <Pregunta n={3} titulo="¿En qué envase lo comprás?" ayuda="Para calcular cuánto cuesta cada kilo o unidad. Si se compra suelto, elegí “Suelto”.">
          <div className="flex flex-wrap gap-2">
            {envasesSugeridos(unidad).map((e) => {
              const activo = !otroEnvase && envase === e.envase && cantidad === e.cantidad;
              return (
                <button
                  key={`${e.envase}-${e.cantidad}`}
                  type="button"
                  onClick={() => {
                    setEnvase(e.envase);
                    setCantidad(e.cantidad);
                    setOtroEnvase(false);
                  }}
                  aria-pressed={activo}
                  className={opcion(activo)}
                >
                  {e.envase} de {e.cantidad} {u.corta}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setEnvase("");
                setCantidad("");
                setOtroEnvase(false);
              }}
              aria-pressed={!envase && !otroEnvase}
              className={opcion(!envase && !otroEnvase)}
            >
              Suelto (sin envase)
            </button>
            <button type="button" onClick={() => setOtroEnvase(true)} aria-pressed={otroEnvase} className={opcion(otroEnvase)}>
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
                <span className="font-medium">Cuánto trae</span>
                <span className="flex items-center gap-2">
                  <input inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="18" className={`${campoGrande} w-24`} />
                  <span className="font-medium">{u.corta}</span>
                </span>
              </label>
            </div>
          )}
          {explicacion && <p className="rounded-xl bg-fondo px-3 py-2 font-medium">👉 {explicacion}</p>}
        </Pregunta>

        <details className="rounded-2xl border border-borde bg-superficie p-4">
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
                {envase.trim() && (
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
                <input value={codigoPropio} onChange={(e) => setCodigoPropio(e.target.value.toUpperCase())} maxLength={20} placeholder="Ej. TOM-R" className={`${campoGrande} w-44 uppercase`} />
              )}
            </div>
            <label className="flex flex-col gap-1">
              <span className="font-medium">Notas</span>
              <textarea name="observaciones" rows={2} placeholder="Ej. elegir los más maduros" className="rounded-xl border-2 border-borde bg-superficie px-3 py-2 text-base" />
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
                <p className="text-sm text-tarjeta-suave">Se vende {u.nombre.toLowerCase()}</p>
              </div>
            </div>
            <p className="text-sm text-tarjeta-suave">📦 {presentacion ? `Se compra en ${presentacion}` : "Se compra suelto"}</p>
            <p className="text-sm text-tarjeta-suave">🏷 {nombreCategoria ?? "Sin categoría"}</p>
          </div>
        </div>
        <p className="text-sm text-texto-suave">Después de crearlo, en su ficha le cargás qué proveedores lo venden y a qué precio (o se carga solo con la primera compra).</p>
      </aside>
    </div>
  );
}
