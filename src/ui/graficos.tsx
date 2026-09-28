"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

// Gráficos del balance, dibujados en SVG sin librerías. Reglas: un solo eje; líneas de 2 px;
// columnas de hasta 24 px con el extremo del dato redondeado; grilla fina y recesiva; leyenda
// cuando hay dos series o más; al pasar el dedo o el mouse, un recuadro con los valores (y cruz
// de guía en las líneas). Los textos usan los colores de texto, nunca el de la serie. Cada
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

const compacto = new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 });
const plataCorta = (n: number) => (n < 0 ? `−$${compacto.format(-n)}` : `$${compacto.format(n)}`);

const MARGEN = { izq: 60, der: 16, arr: 12, aba: 28 };

/** Escala "linda" que incluye el cero: 4 o 5 marcas redondas. */
function escala(min: number, max: number) {
  let lo = Math.min(0, min);
  let hi = Math.max(0, max);
  if (lo === hi) hi = lo + 1;
  const bruto = (hi - lo) / 4;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto) ?? bruto;
  lo = Math.floor(lo / paso) * paso;
  hi = Math.ceil(hi / paso) * paso;
  const marcas: number[] = [];
  for (let t = lo; t <= hi + paso / 2; t += paso) marcas.push(Math.round(t));
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

function Ejes({ ancho, alto, y, marcas }: { ancho: number; alto: number; y: (v: number) => number; marcas: number[] }) {
  return (
    <g>
      {marcas.map((t) => (
        <g key={t}>
          <line x1={MARGEN.izq} x2={ancho - MARGEN.der} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--base-grafico)" : "var(--grilla)"} strokeWidth={1} />
          <text x={MARGEN.izq - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={12} fill="var(--texto-suave)">
            {plataCorta(t)}
          </text>
        </g>
      ))}
      <line x1={MARGEN.izq} x2={MARGEN.izq} y1={MARGEN.arr} y2={alto - MARGEN.aba} stroke="transparent" />
    </g>
  );
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

export function Leyenda({ series }: { series: { nombre: string; color: string; forma?: "linea" | "cuadro" }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-texto-suave">
      {series.map((s) => (
        <li key={s.nombre} className="flex items-center gap-1.5">
          <span className={s.forma === "cuadro" ? "inline-block size-3 rounded-sm" : "inline-block h-0.5 w-4 rounded-full"} style={{ background: `var(--${s.color})` }} />
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

/** Líneas en el tiempo (una o dos series del mismo tipo, en pesos). Con `area`, un velo suave debajo. */
export function GraficoLineas({ descripcion, etiquetas, series, area = false, alto = 240 }: { descripcion: string; etiquetas: string[]; series: SerieGrafico[]; area?: boolean; alto?: number }) {
  const [ref, ancho] = useAncho();
  const [i, setI] = useState<number | null>(null);
  const n = etiquetas.length;
  const valores = series.flatMap((s) => s.puntos.map((p) => p.valor));
  const { lo, hi, marcas } = escala(Math.min(...valores), Math.max(...valores));
  const w = ancho - MARGEN.izq - MARGEN.der;
  const h = alto - MARGEN.arr - MARGEN.aba;
  const x = (k: number) => MARGEN.izq + (n <= 1 ? w / 2 : (k * w) / (n - 1));
  const y = (v: number) => MARGEN.arr + h - ((v - lo) / (hi - lo)) * h;
  const elegir = (e: PointerEvent<SVGRectElement>) => {
    const caja = e.currentTarget.getBoundingClientRect();
    const k = n <= 1 ? 0 : Math.round(((e.clientX - caja.left) / caja.width) * (n - 1));
    setI(Math.max(0, Math.min(n - 1, k)));
  };

  return (
    <div className="flex flex-col gap-2">
      {series.length > 1 && <Leyenda series={series} />}
      <div ref={ref} className="relative w-full">
        <svg width={ancho} height={alto} role="img" aria-label={descripcion} className="block touch-pan-y">
          <Ejes ancho={ancho} alto={alto} y={y} marcas={marcas} />
          <EtiquetasX etiquetas={etiquetas} x={x} alto={alto} ancho={ancho} />
          {series.map((s) => {
            const linea = s.puntos.map((p, k) => `${k === 0 ? "M" : "L"}${x(k).toFixed(1)},${y(p.valor).toFixed(1)}`).join(" ");
            return (
              <g key={s.nombre}>
                {area && n > 1 && <path d={`${linea} L${x(n - 1)},${y(Math.max(lo, 0))} L${x(0)},${y(Math.max(lo, 0))} Z`} fill={`var(--${s.color})`} opacity={0.12} />}
                {n > 1 ? (
                  <path d={linea} fill="none" stroke={`var(--${s.color})`} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                ) : (
                  <circle cx={x(0)} cy={y(s.puntos[0]?.valor ?? 0)} r={4} fill={`var(--${s.color})`} />
                )}
              </g>
            );
          })}
          {i !== null && (
            <g>
              <line x1={x(i)} x2={x(i)} y1={MARGEN.arr} y2={alto - MARGEN.aba} stroke="var(--texto-suave)" strokeWidth={1} strokeDasharray="3 3" />
              {series.map((s) => (
                <circle key={s.nombre} cx={x(i)} cy={y(s.puntos[i]?.valor ?? 0)} r={4} fill={`var(--${s.color})`} stroke="var(--superficie)" strokeWidth={2} />
              ))}
            </g>
          )}
          <rect
            x={MARGEN.izq - 8}
            y={MARGEN.arr}
            width={w + 16}
            height={h}
            fill="transparent"
            tabIndex={0}
            aria-label={`${descripcion}: usá las flechas para recorrer los valores`}
            onPointerMove={elegir}
            onPointerDown={elegir}
            onPointerLeave={() => setI(null)}
            onKeyDown={conTeclado(n, i, setI)}
            onBlur={() => setI(null)}
            className="outline-none focus-visible:stroke-marca"
          />
        </svg>
        {i !== null && <Recuadro x={x(i)} ancho={ancho} titulo={etiquetas[i] ?? ""} filas={series.map((s) => ({ nombre: s.nombre, texto: s.puntos[i]?.texto ?? "", color: s.color }))} />}
      </div>
    </div>
  );
}

/** Columna con el extremo del dato redondeado (4 px) y apoyada en la línea del cero. */
function columna(x0: number, ancho: number, base: number, tope: number): string {
  const alto = Math.abs(base - tope);
  const r = Math.min(4, alto, ancho / 2);
  const x1 = x0 + ancho;
  if (tope <= base) return `M${x0},${base} L${x0},${tope + r} Q${x0},${tope} ${x0 + r},${tope} L${x1 - r},${tope} Q${x1},${tope} ${x1},${tope + r} L${x1},${base} Z`;
  return `M${x0},${base} L${x0},${tope - r} Q${x0},${tope} ${x0 + r},${tope} L${x1 - r},${tope} Q${x1},${tope} ${x1},${tope - r} L${x1},${base} Z`;
}

/** Columnas por período que pueden ser negativas (ganancia o pérdida): azul arriba del cero, rojo abajo. */
export function GraficoColumnas({ descripcion, nombre, etiquetas, puntos, alto = 220 }: { descripcion: string; nombre: string; etiquetas: string[]; puntos: Punto[]; alto?: number }) {
  const [ref, ancho] = useAncho();
  const [i, setI] = useState<number | null>(null);
  const n = etiquetas.length;
  const { lo, hi, marcas } = escala(Math.min(...puntos.map((p) => p.valor)), Math.max(...puntos.map((p) => p.valor)));
  const w = ancho - MARGEN.izq - MARGEN.der;
  const h = alto - MARGEN.arr - MARGEN.aba;
  const banda = w / Math.max(n, 1);
  const anchoColumna = Math.max(2, Math.min(24, banda - 2));
  const x = (k: number) => MARGEN.izq + banda * k + banda / 2;
  const y = (v: number) => MARGEN.arr + h - ((v - lo) / (hi - lo)) * h;
  const hayNegativos = puntos.some((p) => p.valor < 0);

  return (
    <div className="flex flex-col gap-2">
      {hayNegativos && (
        <Leyenda
          series={[
            { nombre: "Ganó", color: "serie-1", forma: "cuadro" },
            { nombre: "Perdió", color: "serie-negativa", forma: "cuadro" },
          ]}
        />
      )}
      <div ref={ref} className="relative w-full">
        <svg width={ancho} height={alto} role="img" aria-label={descripcion} className="block touch-pan-y" onPointerLeave={() => setI(null)}>
          <Ejes ancho={ancho} alto={alto} y={y} marcas={marcas} />
          <EtiquetasX etiquetas={etiquetas} x={x} alto={alto} ancho={ancho} />
          {puntos.map((p, k) => (
            <g key={k}>
              {i === k && <rect x={x(k) - banda / 2} y={MARGEN.arr} width={banda} height={h} fill="var(--grilla)" opacity={0.6} />}
              {p.valor !== 0 && <path d={columna(x(k) - anchoColumna / 2, anchoColumna, y(0), y(p.valor))} fill={p.valor < 0 ? "var(--serie-negativa)" : "var(--serie-1)"} />}
              <rect
                x={x(k) - banda / 2}
                y={MARGEN.arr}
                width={banda}
                height={h}
                fill="transparent"
                onPointerEnter={() => setI(k)}
                onPointerDown={() => setI(k)}
              />
            </g>
          ))}
          <rect x={MARGEN.izq} y={alto - MARGEN.aba} width={w} height={1} fill="transparent" tabIndex={0} aria-label={`${descripcion}: usá las flechas para recorrer los valores`} onKeyDown={conTeclado(n, i, setI)} onBlur={() => setI(null)} />
        </svg>
        {i !== null && <Recuadro x={x(i)} ancho={ancho} titulo={etiquetas[i] ?? ""} filas={[{ nombre, texto: puntos[i]?.texto ?? "" }]} />}
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
