"use client";

import { useMemo, useState } from "react";

import { codigoSugerido, dibujoDeProducto, ejemploDeCostos, envasesSugeridos, explicarPresentacion, nombreDePresentacion } from "@/dominio/catalogo/productos";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { FormularioAccion } from "@/ui/formulario-accion";

import { crearProductoGuiadoAccion } from "../acciones";

// Alta de un producto en cuatro pasos, con la tarjeta de cómo va a quedar y una cuenta de ejemplo.

interface Categoria {
  id: string;
  nombre: string;
  grupo: string;
}

const UNIDADES = [
  { valor: "KG", icono: "⚖️", nombre: "Por kilo", ejemplo: "tomate, papa, banana", corta: "kg", fraccion: true },
  { valor: "UNIDAD", icono: "🔢", nombre: "Por unidad", ejemplo: "lechuga, palta, ananá", corta: "u", fraccion: false },
  { valor: "ATADO", icono: "🌿", nombre: "Por atado", ejemplo: "perejil, acelga, rúcula", corta: "atado", fraccion: false },
  { valor: "MAPLE", icono: "🥚", nombre: "Por maple", ejemplo: "huevos", corta: "maple", fraccion: false },
  { valor: "BANDEJA", icono: "🧺", nombre: "Por bandeja", ejemplo: "frutillas, champiñones", corta: "bandeja", fraccion: false },
  { valor: "DOCENA", icono: "🔟", nombre: "Por docena", ejemplo: "limones, naranjas", corta: "docena", fraccion: false },
  { valor: "PAQUETE", icono: "📦", nombre: "Por paquete", ejemplo: "hierbas, brotes", corta: "paquete", fraccion: false },
  { valor: "LITRO", icono: "💧", nombre: "Por litro", ejemplo: "jugos", corta: "l", fraccion: true },
] as const;

const FRANJA: Readonly<Record<string, string>> = { VERDURA: "var(--etiqueta-verde)", FRUTA: "var(--etiqueta-naranja)", OTRO: "var(--etiqueta-gris)" };

function Paso({ n, titulo, ayuda, children }: { n: number; titulo: string; ayuda: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border border-borde bg-superficie p-4">
      <legend className="sr-only">{titulo}</legend>
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-marca font-bold text-marca-texto">
          {n}
        </span>
        <div>
          <p className="text-lg font-semibold">{titulo}</p>
          <p className="text-sm text-texto-suave">{ayuda}</p>
        </div>
      </div>
      {children}
    </fieldset>
  );
}

const chip = (activo: boolean) =>
  `flex cursor-pointer items-center gap-2 rounded-lg border-2 px-3 py-2 text-left ${activo ? "border-marca bg-marca/10" : "border-borde bg-superficie hover:border-marca/60"}`;

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
  const [categoriaId, setCategoriaId] = useState(categorias[0]?.id ?? "");
  const [unidad, setUnidad] = useState<(typeof UNIDADES)[number]["valor"]>("KG");
  const [fraccion, setFraccion] = useState(true);
  const [envase, setEnvase] = useState("Cajón");
  const [cantidad, setCantidad] = useState("18");
  const [codigoPropio, setCodigoPropio] = useState<string | null>(null);
  const [recargo, setRecargo] = useState("");
  const [precioEjemplo, setPrecioEjemplo] = useState("");

  const categoria = categorias.find((c) => c.id === categoriaId);
  const u = UNIDADES.find((x) => x.valor === unidad)!;
  const codigoAuto = useMemo(() => (nombre.trim() ? codigoSugerido(nombre, new Set(codigos)) : "—"), [nombre, codigos]);
  const presentacion = envase.trim() ? nombreDePresentacion(envase, cantidad, u.corta) : "";
  const explicacion = envase.trim() ? explicarPresentacion(presentacion, cantidad, u.corta) : null;
  const recargoQueAplica = recargo.trim() || recargoPorCategoria[categoriaId] || recargoGlobal;
  const origenRecargo = recargo.trim() ? "el de este producto" : recargoPorCategoria[categoriaId] ? `el de ${categoria?.nombre ?? "la categoría"}` : "el general";
  const ejemplo = envase.trim() && precioEjemplo ? ejemploDeCostos({ precioEnvase: precioEjemplo, cantidad, recargoPct: recargoQueAplica }) : null;
  const dibujo = dibujoDeProducto(nombre, categoria?.grupo);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <FormularioAccion accion={crearProductoGuiadoAccion} boton="Crear producto" className="flex flex-col gap-4">
        <Paso n={1} titulo="¿Qué producto es?" ayuda="El nombre como lo dicen ustedes y en qué categoría va.">
          <label className="flex flex-col gap-1">
            <span className="font-medium">Nombre</span>
            <input name="nombre" required autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Tomate redondo" className="h-12 rounded-lg border border-borde bg-superficie px-3 text-base" />
          </label>
          <div className="flex flex-col gap-1">
            <span className="font-medium">Categoría</span>
            <div className="flex flex-wrap gap-2">
              {categorias.map((c) => (
                <label key={c.id} className={chip(c.id === categoriaId)}>
                  <input type="radio" name="categoriaId" value={c.id} checked={c.id === categoriaId} onChange={() => setCategoriaId(c.id)} className="sr-only" />
                  <span aria-hidden>{dibujoDeProducto("", c.grupo)}</span>
                  {c.nombre}
                </label>
              ))}
            </div>
          </div>
          {codigoPropio === null ? (
            <p className="text-sm text-texto-suave">
              Código: <b className="text-texto">{codigoAuto}</b> (se arma solo){" "}
              <button type="button" onClick={() => setCodigoPropio(codigoAuto === "—" ? "" : codigoAuto)} className="font-medium underline underline-offset-2">
                Poner otro
              </button>
            </p>
          ) : (
            <label className="flex flex-col gap-1">
              <span className="font-medium">Código</span>
              <input name="codigo" value={codigoPropio} onChange={(e) => setCodigoPropio(e.target.value.toUpperCase())} maxLength={20} placeholder="Ej. TOM-R" className="h-12 rounded-lg border border-borde bg-superficie px-3 text-base uppercase" />
            </label>
          )}
        </Paso>

        <Paso n={2} titulo="¿En qué lo contás?" ayuda="Así se anotan los pedidos y se calcula todo. Después no se cambia.">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {UNIDADES.map((x) => (
              <label key={x.valor} className={`${chip(x.valor === unidad)} flex-col items-start`}>
                <input
                  type="radio"
                  name="unidadBase"
                  value={x.valor}
                  checked={x.valor === unidad}
                  onChange={() => {
                    setUnidad(x.valor);
                    setFraccion(x.fraccion);
                    const primero = envasesSugeridos(x.valor)[0];
                    setEnvase(primero?.envase ?? "");
                    setCantidad(primero?.cantidad ?? "");
                  }}
                  className="sr-only"
                />
                <span className="text-2xl" aria-hidden>
                  {x.icono}
                </span>
                <span className="font-semibold">{x.nombre}</span>
                <span className="text-xs text-texto-suave">{x.ejemplo}</span>
              </label>
            ))}
          </div>
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" name="admiteFraccion" checked={fraccion} onChange={(e) => setFraccion(e.target.checked)} className="size-5" />
            <span>
              Se puede pedir en partes <span className="text-texto-suave">(ej. 1,5 {u.corta})</span>
            </span>
          </label>
        </Paso>

        <Paso n={3} titulo="¿Cómo lo comprás en el mercado?" ayuda="El envase en que viene y cuánto trae. Si no viene en envase, dejalo vacío.">
          <div className="flex flex-wrap gap-2">
            {envasesSugeridos(unidad).map((e) => {
              const activo = envase === e.envase && cantidad === e.cantidad;
              return (
                <button
                  key={`${e.envase}-${e.cantidad}`}
                  type="button"
                  onClick={() => {
                    setEnvase(e.envase);
                    setCantidad(e.cantidad);
                  }}
                  aria-pressed={activo}
                  className={chip(activo)}
                >
                  {e.envase} {e.cantidad} {u.corta}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setEnvase("");
                setCantidad("");
              }}
              aria-pressed={!envase}
              className={chip(!envase)}
            >
              No viene en envase
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-medium">Envase</span>
              <input name="envase" value={envase} onChange={(e) => setEnvase(e.target.value)} placeholder="Ej. Cajón, bolsa, jaula" className="h-12 w-44 rounded-lg border border-borde bg-superficie px-3 text-base" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium">Trae</span>
              <span className="flex items-center gap-2">
                <input name="cantidadEnvase" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="18" className="h-12 w-24 rounded-lg border border-borde bg-superficie px-3 text-base" />
                <span className="font-medium">{u.corta}</span>
              </span>
            </label>
          </div>
          {explicacion && <p className="rounded-lg bg-fondo px-3 py-2 font-medium">👉 {explicacion}</p>}
        </Paso>

        {verRecargos && (
          <Paso n={4} titulo="¿Cuánto le ganás?" ayuda="El porcentaje que se le suma al costo para venderlo. Si lo dejás vacío, se usa el de la categoría o el general.">
            <label className="flex flex-col gap-1">
              <span className="font-medium">Ganancia sobre el costo</span>
              <span className="flex items-center gap-2">
                <input name="recargo" inputMode="decimal" value={recargo} onChange={(e) => setRecargo(e.target.value)} placeholder={recargoQueAplica} className="h-12 w-24 rounded-lg border border-borde bg-superficie px-3 text-base" />
                <span className="font-medium">%</span>
                <span className="text-sm text-texto-suave">
                  (se usa {origenRecargo}: {recargoQueAplica} %)
                </span>
              </span>
            </label>
            {envase.trim() && (
              <div className="flex flex-col gap-2 rounded-lg bg-fondo p-3">
                <label className="flex flex-wrap items-center gap-2">
                  <span>
                    Para probar: si el {presentacion.toLowerCase() || "envase"} te cuesta $
                  </span>
                  <input inputMode="decimal" value={precioEjemplo} onChange={(e) => setPrecioEjemplo(e.target.value)} placeholder="18.000" aria-label="Precio de ejemplo del envase" className="h-10 w-28 rounded-lg border border-borde bg-superficie px-2" />
                </label>
                {ejemplo && (
                  <p className="font-medium">
                    → el {u.corta} te sale {formatearMoneda(ejemplo.costoUnidad)} y lo vendés a <b>{formatearMoneda(ejemplo.ventaUnidad)}</b>
                  </p>
                )}
              </div>
            )}
          </Paso>
        )}

        <details className="rounded-xl border border-borde bg-superficie p-4">
          <summary className="cursor-pointer font-semibold">Algo más para anotar (opcional)</summary>
          <textarea name="observaciones" rows={3} placeholder="Ej. elegir los más maduros" className="mt-3 w-full rounded-lg border border-borde bg-superficie px-3 py-2 text-base" />
        </details>
      </FormularioAccion>

      <aside className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
        <p className="text-sm font-semibold text-texto-suave">Así va a quedar</p>
        <div className="flex flex-col overflow-hidden rounded-lg bg-tarjeta text-tarjeta-texto shadow-tarjeta">
          <span aria-hidden className="h-2" style={{ background: FRANJA[categoria?.grupo ?? "OTRO"] ?? FRANJA.OTRO }} />
          <div className="flex flex-col gap-2 p-3">
            <div className="flex items-start gap-3">
              <span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-black/5 text-2xl dark:bg-white/10">
                {dibujo}
              </span>
              <div>
                <p className="font-semibold">{nombre.trim() || "Nombre del producto"}</p>
                <p className="text-sm text-tarjeta-suave">
                  {codigoPropio ?? codigoAuto} · se cuenta por {u.corta}
                </p>
              </div>
            </div>
            <p className="text-sm text-tarjeta-suave">📦 {presentacion ? `Se compra en ${presentacion}` : "Sin envase de compra"}</p>
            <p className="text-sm text-tarjeta-suave">🏷 {categoria?.nombre ?? "Sin categoría"}</p>
          </div>
        </div>
        <p className="text-sm text-texto-suave">Después de crearlo, en su ficha le cargás los proveedores y sus precios.</p>
      </aside>
    </div>
  );
}
