import Link from "next/link";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

// Piezas de formulario compartidas. Controles de al menos 44 px de alto y texto de 16 px (01 §16).

export type VarianteBoton = "principal" | "secundario" | "peligro";

export function clasesBoton(variante: VarianteBoton = "principal"): string {
  const base = "inline-flex min-h-12 items-center justify-center rounded-lg px-4 py-1.5 text-center font-semibold text-balance disabled:opacity-60";
  if (variante === "principal") return `${base} bg-marca text-marca-texto`;
  if (variante === "peligro") return `${base} border border-error text-error`;
  return `${base} border border-borde`;
}

const CLASES_CONTROL = "h-12 rounded-lg border border-borde bg-superficie px-3 text-base";

/** El nombre de un casillero; si es obligatorio, con su asterisco rojo. */
export function Etiqueta({ texto, obligatorio }: { texto: string; obligatorio?: boolean }) {
  return (
    <span className="font-medium">
      {texto}
      {obligatorio && (
        <span className="text-error" title="Obligatorio">
          {" "}
          *
        </span>
      )}
    </span>
  );
}

export function Campo({ etiqueta, ayuda, ...input }: InputHTMLAttributes<HTMLInputElement> & { etiqueta: string; ayuda?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <Etiqueta texto={etiqueta} obligatorio={input.required} />
      <input {...input} className={`${CLASES_CONTROL} ${input.className ?? ""}`} />
      {ayuda && <span className="text-sm text-texto-suave">{ayuda}</span>}
    </label>
  );
}

/** Campo para precios y cantidades: acepta "17.550" o "1.234,56" y abre el teclado numérico en el celular. */
export function CampoNumero(props: InputHTMLAttributes<HTMLInputElement> & { etiqueta: string; ayuda?: string }) {
  return <Campo inputMode="decimal" autoComplete="off" {...props} />;
}

export interface Opcion {
  valor: string;
  etiqueta: string;
}

export function Selector({
  etiqueta,
  opciones,
  vacia,
  ayuda,
  ...select
}: SelectHTMLAttributes<HTMLSelectElement> & { etiqueta: string; opciones: readonly Opcion[]; vacia?: string; ayuda?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <Etiqueta texto={etiqueta} obligatorio={select.required} />
      <select {...select} className={CLASES_CONTROL}>
        {vacia !== undefined && <option value="">{vacia}</option>}
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.etiqueta}
          </option>
        ))}
      </select>
      {ayuda && <span className="text-sm text-texto-suave">{ayuda}</span>}
    </label>
  );
}

export function Casilla({ etiqueta, ayuda, ...input }: InputHTMLAttributes<HTMLInputElement> & { etiqueta: string; ayuda?: string }) {
  return (
    <label className="flex min-h-11 items-start gap-3">
      <input type="checkbox" {...input} className="mt-1 size-5 shrink-0" />
      <span>
        <span className="font-medium">{etiqueta}</span>
        {ayuda && <span className="block text-sm text-texto-suave">{ayuda}</span>}
      </span>
    </label>
  );
}

export function AreaTexto({ etiqueta, ...area }: TextareaHTMLAttributes<HTMLTextAreaElement> & { etiqueta: string }) {
  return (
    <label className="flex flex-col gap-1">
      <Etiqueta texto={etiqueta} obligatorio={area.required} />
      <textarea rows={3} {...area} className="rounded-lg border border-borde bg-superficie px-3 py-2 text-base" />
    </label>
  );
}

export function Aviso({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="rounded-lg border border-borde bg-superficie px-3 py-2 text-texto-suave">
      {children}
    </div>
  );
}

export function Encabezado({ titulo, descripcion, volver, children }: { titulo: string; descripcion?: ReactNode; volver?: { ruta: string; texto: string }; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-2">
      {volver && (
        <Link href={volver.ruta} className="text-texto-suave hover:underline">
          ← {volver.texto}
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{titulo}</h1>
        {children && <div className="flex flex-wrap gap-2">{children}</div>}
      </div>
      {descripcion && <p className="text-texto-suave">{descripcion}</p>}
    </header>
  );
}

export function Estado({ activo }: { activo: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold whitespace-nowrap ${activo ? "bg-marca/15 text-marca" : "bg-error/15 text-error"}`}>
      <span aria-hidden className={`size-2 rounded-full ${activo ? "bg-marca" : "bg-error"}`} />
      {activo ? "Activo" : "Dado de baja"}
    </span>
  );
}

/** Tarjeta desplegable para formularios de alta o edición ("+ Nuevo producto"). */
export function Desplegable({ titulo, abierto, children }: { titulo: string; abierto?: boolean; children: ReactNode }) {
  return (
    <details className="rounded-lg border border-borde bg-superficie p-4" open={abierto}>
      <summary className="cursor-pointer text-lg font-semibold">{titulo}</summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

export function Tarjeta({ titulo, children }: { titulo?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-borde bg-superficie p-4">
      {titulo && <h2 className="text-lg font-semibold">{titulo}</h2>}
      {children}
    </section>
  );
}

/** Tabla con desplazamiento horizontal propio en el celular (la página nunca se desplaza de costado). */
export function Tabla({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-borde bg-superficie">
      <table className="w-full border-collapse text-left [&_td]:border-t [&_td]:border-borde [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2 [&_th]:text-sm [&_th]:font-semibold [&_th]:text-texto-suave">
        {children}
      </table>
    </div>
  );
}

/** Formulario GET para filtros de listados: funciona sin JavaScript y deja los filtros en la URL. */
export function Filtros({ children }: { children: ReactNode }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-borde bg-superficie p-3">
      {children}
      <button type="submit" className={clasesBoton("secundario")}>
        Filtrar
      </button>
    </form>
  );
}
