"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

// Gráficos del balance, dibujados en SVG sin librerías. Son todos de barras (más fáciles de leer
// que las líneas para quien no mira gráficos seguido). Reglas: un solo eje, en pesos; el gráfico
// ocupa todo el ancho que tiene y las barras se reparten ese ancho (pedido del usuario: gráficos
// grandes y precisos), con el extremo del dato redondeado y 2 px de separación entre las de un
// mismo período; cuando las barras son anchas, cada una lleva su valor escrito; grilla fina y recesiva; leyenda cuando hay dos series; al pasar el dedo o el mouse, un
// recuadro con los valores. Los textos usan los colores de texto, nunca el de la serie. Cada
// gráfico va acompañado de su tabla en la página.

export interface Punto {
  valor: number;
  /** El valor ya escrito (ej. "$806.370"). */
  texto: string;
}

export interface SerieGrafico {
  nombre: string;
  color: "serie-1" | "serie-2";
  puntos: Punto[];
}

// La plata en pesos enteros, sin decimales ni abreviaturas ("$250.000").
const enteros = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const plataCorta = (n: number) => (n < 0 ? `−$${enteros.format(-n)}` : `$${enteros.format(n)}`);

const MARGEN = { izq: 84, der: 16, aba: 28 };

/** Escala "linda" que incluye el cero: 4 o 5 marcas redondas. */
function escala(min: number, max: number) {
  let lo = Math.min(0, min);
  let hi = Math.max(0, max);
  // Sin movimientos (todo en cero) igual se dibuja una escala de pesos enteros: $0 a $4.
  if (lo === hi) hi = lo + 4;
  const bruto = (hi - lo) / 4;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  // Las marcas son pesos enteros: el paso nunca es menor a $1 (con pasos de 0,25 las marcas se
  // redondeaban al mismo número y React avisaba de claves repetidas en el balance).
  const paso = Math.max(1, [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto) ?? bruto);
  lo = Math.floor(lo / paso) * paso;
  hi = Math.ceil(hi / paso) * paso;
  const marcas: number[] = [];
  for (let t = lo; t <= hi + paso / 2; t += paso) {
    const marca = Math.round(t);
    if (marcas.at(-1) !== marca) marcas.push(marca);
  }
  return { lo, hi, marcas };
}

function useAncho() {
  const ref = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observador = new ResizeObserver(([e]) => e && setAncho(Math.max(260, Math.round(e.contentRect.width))));
    observador.observe(el);
    return () => observador.disconnect();
  }, []);
  return [ref, ancho] as const;
}

/** Qué etiquetas del eje horizontal se escriben: las que entran, siempre la primera y la última. */
function etiquetasVisibles(n: number, anchoUtil: number): Set<number> {
  const entran = Math.max(2, Math.floor(anchoUtil / 64));
  if (n <= entran) return new Set(Array.from({ length: n }, (_, i) => i));
  const paso = Math.ceil((n - 1) / (entran - 1));
  const res = new Set<number>([0, n - 1]);
  for (let i = paso; i < n - paso / 2; i += paso) res.add(i);
  return res;
}

function EtiquetasX({ etiquetas, x, alto, ancho }: { etiquetas: string[]; x: (i: number) => number; alto: number; ancho: number }) {
  const visibles = etiquetasVisibles(etiquetas.length, ancho - MARGEN.izq - MARGEN.der);
  return (
    <g>
      {etiquetas.map((e, i) =>
        visibles.has(i) ? (
          <text key={i} x={x(i)} y={alto - 8} textAnchor={i === 0 && etiquetas.length > 1 ? "start" : i === etiquetas.length - 1 && etiquetas.length > 1 ? "end" : "middle"} fontSize={12} fill="var(--texto-suave)">
            {e}
          </text>
        ) : null,
      )}
    </g>
  );
}

function Recuadro({ x, ancho, titulo, filas }: { x: number; ancho: number; titulo: string; filas: { nombre: string; texto: string; color?: string }[] }) {
  const aLaIzquierda = x > ancho * 0.6;
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-lg border border-borde bg-superficie px-3 py-2 text-sm shadow-md"
      style={{ left: x, transform: aLaIzquierda ? "translateX(calc(-100% - 12px))" : "translateX(12px)" }}
    >
      <p className="font-semibold">{titulo}</p>
      {filas.map((f) => (
        <p key={f.nombre} className="flex items-center justify-between gap-3 whitespace-nowrap">
          <span className="flex items-center gap-1.5 text-texto-suave">
            {f.color && <span className="inline-block size-2.5 rounded-full" style={{ background: `var(--${f.color})` }} />}
            {f.nombre}
          </span>
          <span className="font-medium tabular-nums">{f.texto}</span>
        </p>
      ))}
    </div>
  );
}

export function Leyenda({ series }: { series: { nombre: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-texto-suave">
      {series.map((s) => (
        <li key={s.nombre} className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm" style={{ background: `var(--${s.color})` }} />
          {s.nombre}
        </li>
      ))}
    </ul>
  );
}

/** Mueve el punto elegido con las flechas del teclado. */
function conTeclado(n: number, i: number | null, setI: (i: number | null) => void) {
  return (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") setI(Math.min(n - 1, (i ?? -1) + 1));
    else if (e.key === "ArrowLeft") setI(Math.max(0, (i ?? n) - 1));
    else if (e.key === "Escape") setI(null);
    else return;
    e.preventDefault();
  };
}

/** Columna con el extremo del dato redondeado (4 px) y apoyada, recta, en la línea del cero. */
function columna(x0: number, ancho: number, base: number, tope: number): string {
  const alto = Math.abs(base - tope);
  const r = Math.min(4, alto, ancho / 2);
  const x1 = x0 + ancho;
  if (tope <= base) return `M${x0},${base} L${x0},${tope + r} Q${x0},${tope} ${x0 + r},${tope} L${x1 - r},${tope} Q${x1},${tope} ${x1},${tope + r} L${x1},${base} Z`;
  return `M${x0},${base} L${x0},${tope - r} Q${x0},${tope} ${x0 + r},${tope} L${x1 - r},${tope} Q${x1},${tope} ${x1},${tope - r} L${x1},${base} Z`;
}

/** Lugar que se deja arriba para escribir el valor sobre una barra. */
const ARRIBA = 26;
/** Separación entre las barras de un mismo período (del color del fondo, no un borde). */
const ENTRE_BARRAS = 2;

/**
 * Barras por período: una serie (lo ganado, la deuda) o dos lado a lado (vendido y comprado), en
 * pesos y sobre un solo eje, a todo el ancho disponible. Con `perdidaEnRojo`, lo que queda debajo
 * del cero va en rojo. Si las barras son anchas, cada una lleva su valor; si no, con una sola
 * serie se escribe sobre la más alta y sobre la última, y el resto se lee al
 * pasar el dedo o el mouse (o con las flechas), y en la tabla que acompaña al gráfico.
 */
export function GraficoBarras({
  descripcion,
  etiquetas,
  series,
  perdidaEnRojo = false,
  alto = 340,
}: {
  descripcion: string;
  etiquetas: string[];
  series: SerieGrafico[];
  perdidaEnRojo?: boolean;
  alto?: number;
}) {
  const [ref, ancho] = useAncho();
  const [i, setI] = useState<number | null>(null);
  const n = etiquetas.length;
  const valores = series.flatMap((s) => s.puntos.map((p) => p.valor));
  const { lo, hi, marcas } = escala(Math.min(...valores, 0), Math.max(...valores, 0));
  const w = ancho - MARGEN.izq - MARGEN.der;
  const h = alto - ARRIBA - MARGEN.aba;
  const banda = w / Math.max(n, 1);
  const k = series.length;
  // Las barras se reparten casi todo el ancho de su período (con un tope, para que pocos períodos no den bloques enormes).
  const anchoBarra = Math.max(2, Math.min(160, (banda * 0.78 - ENTRE_BARRAS * (k - 1)) / k));
  // Con barras anchas entra el valor escrito sobre cada una.
  const rotularTodas = anchoBarra >= 76;
  const anchoGrupo = anchoBarra * k + ENTRE_BARRAS * (k - 1);
  const centro = (p: number) => MARGEN.izq + banda * p + banda / 2;
  const y = (v: number) => ARRIBA + h - ((v - lo) / (hi - lo)) * h;
  const hayNegativos = perdidaEnRojo && valores.some((v) => v < 0);
  const color = (s: SerieGrafico, v: number) => (perdidaEnRojo && v < 0 ? "var(--serie-negativa)" : `var(--${s.color})`);

  // Sin nada que mostrar, un cartel en palabras en vez de un eje vacío.
  if (valores.every((v) => v === 0)) {
    return <p className="flex min-h-24 items-center justify-center rounded-xl bg-fondo px-4 text-center text-texto-suave">Todavía no hay nada para mostrar en estas fechas.</p>;
  }

  // Con una sola serie, el valor escrito sobre la barra más alta y sobre la última (si no se pisan).
  const unica = k === 1 ? series[0]!.puntos : [];
  const mayor = unica.reduce((mejor, p, p_i) => (p.valor > (unica[mejor]?.valor ?? 0) ? p_i : mejor), 0);
  const rotuladas = new Set<number>();
  if (unica.length > 0) {
    if ((unica[n - 1]?.valor ?? 0) !== 0) rotuladas.add(n - 1);
    if ((unica[mayor]?.valor ?? 0) > 0 && (rotuladas.size === 0 || Math.abs(centro(mayor) - centro(n - 1)) > 84)) rotuladas.add(mayor);
  }

  return (
    <div className="flex flex-col gap-2">
      {k > 1 && <Leyenda series={series} />}
      {hayNegativos && (
        <Leyenda
          series={[
            { nombre: "Se ganó", color: series[0]!.color },
            { nombre: "Se perdió", color: "serie-negativa" },
          ]}
        />
      )}
      <div ref={ref} className="relative w-full">
        <svg width={ancho} height={alto} role="img" aria-label={descripcion} className="block touch-pan-y" onPointerLeave={() => setI(null)}>
          <g>
            {marcas.map((t, m) => (
              <g key={m}>
                <line x1={MARGEN.izq} x2={ancho - MARGEN.der} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--base-grafico)" : "var(--grilla)"} strokeWidth={1} />
                <text x={MARGEN.izq - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={12} fill="var(--texto-suave)">
                  {plataCorta(t)}
                </text>
              </g>
            ))}
          </g>
          <EtiquetasX etiquetas={etiquetas} x={centro} alto={alto} ancho={ancho} />
          {etiquetas.map((_, p) => (
            <g key={p}>
              {i === p && <rect x={centro(p) - banda / 2} y={ARRIBA} width={banda} height={h} fill="var(--grilla)" opacity={0.6} />}
              {series.map((s, j) => {
                const v = s.puntos[p]?.valor ?? 0;
                if (v === 0) return null;
                const x0 = centro(p) - anchoGrupo / 2 + j * (anchoBarra + ENTRE_BARRAS);
                return (
                  <g key={s.nombre}>
                    <path d={columna(x0, anchoBarra, y(0), y(v))} fill={color(s, v)} />
                    {rotularTodas && (
                      <text x={x0 + anchoBarra / 2} y={(v >= 0 ? y(v) : y(0)) - 7} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--texto)">
                        {s.puntos[p]!.texto}
                      </text>
                    )}
                  </g>
                );
              })}
              {!rotularTodas && rotuladas.has(p) && (
                <text
                  x={centro(p)}
                  y={(unica[p]!.valor >= 0 ? y(unica[p]!.valor) : y(0)) - 7}
                  textAnchor={p === n - 1 && n > 1 ? "end" : p === 0 && n > 1 ? "start" : "middle"}
                  dx={p === n - 1 && n > 1 ? anchoBarra / 2 : p === 0 && n > 1 ? -anchoBarra / 2 : 0}
                  fontSize={12}
                  fontWeight={600}
                  fill="var(--texto)"
                >
                  {unica[p]!.texto}
                </text>
              )}
              <rect x={centro(p) - banda / 2} y={ARRIBA} width={banda} height={h} fill="transparent" onPointerEnter={() => setI(p)} onPointerDown={() => setI(p)} />
            </g>
          ))}
          <rect x={MARGEN.izq} y={alto - MARGEN.aba} width={w} height={1} fill="transparent" tabIndex={0} aria-label={`${descripcion}: usá las flechas para recorrer los valores`} onKeyDown={conTeclado(n, i, setI)} onBlur={() => setI(null)} />
        </svg>
        {i !== null && <Recuadro x={centro(i)} ancho={ancho} titulo={etiquetas[i] ?? ""} filas={series.map((s) => ({ nombre: s.nombre, texto: s.puntos[i]?.texto ?? "", color: perdidaEnRojo && (s.puntos[i]?.valor ?? 0) < 0 ? "serie-negativa" : s.color }))} />}
      </div>
    </div>
  );
}

/** Ranking en barras horizontales (HTML): etiqueta, barra y valor escrito al final. */
export function BarrasHorizontales({ filas }: { filas: { etiqueta: string; valor: number; texto: string; detalle?: string | null }[] }) {
  const maximo = Math.max(...filas.map((f) => f.valor), 1);
  return (
    <ul className="flex flex-col gap-3">
      {filas.map((f) => (
        <li key={f.etiqueta} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate">{f.etiqueta}</span>
            <span className="shrink-0 text-sm font-medium tabular-nums">{f.texto}</span>
          </div>
          <div className="h-3 w-full">
            <div className="h-3 rounded-r-[4px] bg-serie-1" style={{ width: `${Math.max(0.5, (Math.max(f.valor, 0) / maximo) * 100)}%` }} />
          </div>
          {f.detalle && <span className="text-right text-xs text-texto-suave tabular-nums">{f.detalle}</span>}
        </li>
      ))}
    </ul>
  );
}
