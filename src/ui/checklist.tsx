"use client";

import type { ReactNode } from "react";

import { dibujoDeProducto } from "@/dominio/catalogo/productos";
import type { EstadoLineaLista } from "@/dominio/compras/lista";

// El checklist de productos, igual en todos lados (pedido del usuario, 07/10/2026): en la tarjeta
// cerrada del tablero, en la tarjeta abierta y en la pantalla de preparación. Al comprar se tilda
// ✓ "ya se compró" o ✕ "no se consiguió"; al preparar, ✓ "ya está separado". El dibujo y el nombre
// del producto van siempre del mismo tamaño, grandes y en negrita.

export interface ProductoDeChecklist {
  nombre: string;
  cantidad: string;
  /** Grupo de su categoría (FRUTA, VERDURA…), para el dibujo. */
  grupo: string | null;
  hecha: boolean;
  /** Lo que faltó y por qué, o que no se consiguió. */
  aviso: string | null;
  /** Su renglón en la lista de compras (para tildar la compra). */
  listaItemId?: string | null;
  /** Cómo va su compra en la lista. */
  compra?: EstadoLineaLista | null;
  /** Tildado a mano: se puede destildar (una compra anotada, no). */
  tildado?: boolean;
  /** Su renglón en la preparación, mientras se puede tildar como separado. */
  entregaItemId?: string | null;
  /** Va en reemplazo de otro producto. */
  reemplazo?: boolean;
}

export type Tilde = "SI" | "NO" | "PENDIENTE";

/**
 * El dibujo y el nombre de un producto, del mismo tamaño a la vista y en negrita. El dibujo lleva
 * un cuerpo algo mayor que el del texto porque un emoji se ve más chico que una letra en negrita.
 * `debajo` va en un segundo renglón, bajo el nombre (la cantidad, donde el lugar es angosto).
 * Con `fluido`, el dibujo va como parte del texto: en una columna angosta el nombre usa todo el
 * ancho y se corta entre palabras, no por la mitad.
 */
export function NombreDeProducto({
  nombre,
  grupo,
  className = "",
  debajo,
  fluido = false,
  claseDelNombre = "",
}: {
  nombre: string;
  grupo?: string | null;
  className?: string;
  debajo?: ReactNode;
  fluido?: boolean;
  /** Con `fluido`: clases solo para el renglón del nombre (tachado, apagado), sin tocar lo de `debajo`. */
  claseDelNombre?: string;
}) {
  if (fluido) {
    return (
      <span className={`block min-w-0 font-bold ${className}`} title={nombre}>
        <span className={`block leading-tight [overflow-wrap:anywhere] ${claseDelNombre}`}>
          <span aria-hidden className="mr-[0.25em] align-[-0.08em] text-[1.25em] leading-none">
            {dibujoDeProducto(nombre, grupo ?? null)}
          </span>
          {nombre}
        </span>
        {debajo}
      </span>
    );
  }
  return (
    <span className={`flex min-w-0 items-center gap-2 font-bold ${className}`} title={nombre}>
      <span aria-hidden className="shrink-0 text-[1.3em] leading-none">
        {dibujoDeProducto(nombre, grupo ?? null)}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="leading-tight [overflow-wrap:anywhere]">{nombre}</span>
        {debajo}
      </span>
    </span>
  );
}

const TAMANOS = {
  /**
   * Dentro de una tarjeta del tablero. Las seis columnas entran en una pantalla, así que la tarjeta
   * puede ser angosta: el nombre usa todo el ancho, y la cantidad y la ✕ van debajo. Donde la
   * columna es más ancha (`@[18rem]`, por consulta de contenedor) la letra y la casilla crecen.
   */
  tarjeta: { texto: "text-base @[13rem]:text-lg @[18rem]:text-xl", casilla: "size-8 text-lg @[18rem]:size-10 @[18rem]:text-2xl", cruz: "size-7 text-sm", cantidad: "text-base", cantidadDebajo: true, fila: "items-start gap-1.5 py-1 @[18rem]:gap-2", sangria: "ml-9" },
  /**
   * En la tarjeta abierta y en la pantalla de preparación. Donde el lugar es angosto (el celular),
   * el nombre se queda con su renglón y la cantidad y la ✕ bajan al de abajo, a la derecha: el
   * nombre nunca queda aplastado letra por letra.
   */
  amplio: { texto: "text-xl sm:text-2xl", casilla: "size-12 text-3xl", cruz: "size-11 text-xl", cantidad: "text-xl", cantidadDebajo: false, fila: "flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-black/[0.04] px-2 py-2 dark:bg-white/[0.06]", sangria: "ml-[3.75rem]" },
} as const;

const TONOS = {
  /** Sobre el color de la columna del tablero. */
  columna: "rounded-lg bg-[var(--col-claro)] p-1 text-[var(--col-claro-texto)] @[18rem]:p-2",
  neutro: "",
} as const;

const casilla = "flex shrink-0 items-center justify-center rounded-xl border-2 font-black leading-none transition-[transform,background-color,border-color] active:scale-90 disabled:cursor-not-allowed";
const marcada = "border-[var(--listo-fondo)] bg-[var(--listo-fondo)] text-white";
// El borde no puede salir del color del texto: la casilla vacía lo lleva transparente para esconder el ✓.
const sinMarcar = "border-black/40 bg-white/85 text-transparent hover:border-[var(--listo-fondo)] dark:border-white/60 dark:bg-black/25";

interface Props<P extends ProductoDeChecklist> {
  productos: readonly P[];
  /** `compra`: ✓ comprado y ✕ no se consiguió. `separar`: ✓ separado. `ver`: sin tildes. `visto`: los tildes a la vista, sin poder tocarlos. */
  modo: "compra" | "separar" | "ver" | "visto";
  alTildar?: (p: P, valor: Tilde) => void;
  alSeparar?: (p: P, separado: boolean) => void;
  tono?: keyof typeof TONOS;
  tamano?: keyof typeof TAMANOS;
  /** Cuántos mostrar como mucho (el resto se cuenta: "y 3 más…"). */
  limite?: number;
  /** Para lectores de pantalla: de quién es y qué se tilda. */
  etiqueta?: string;
  className?: string;
  /** Algo más para cada producto, al lado de su casilla (el botón "$" de precio y puesto). */
  alLado?: (p: P) => ReactNode;
  /** Lo que se despliega debajo de un producto (el panel para anotar su compra). */
  debajo?: (p: P) => ReactNode;
}

export function Checklist<P extends ProductoDeChecklist>({ productos, modo, alTildar, alSeparar, tono = "neutro", tamano = "tarjeta", limite, etiqueta, className = "", alLado, debajo }: Props<P>) {
  const t = TAMANOS[tamano];
  const visibles = limite ? productos.slice(0, limite) : productos;
  return (
    <ul className={`flex flex-col gap-1 ${TONOS[tono]} ${className}`} aria-label={etiqueta}>
      {visibles.map((p, i) => {
        const noHay = modo === "compra" && p.compra === "NO_CONSEGUIDO";
        const hecha = modo === "compra" ? p.compra === "COMPRADO" : p.hecha;
        const apagado = noHay ? "line-through opacity-60" : hecha && modo !== "ver" ? "opacity-80" : "";
        const cruz = modo === "compra" && (
          <button
            type="button"
            aria-pressed={noHay}
            aria-label={`${p.nombre}: no se consiguió`}
            title={noHay ? "No se consiguió: tocá para volver a buscarlo" : "Marcar que no se consiguió"}
            data-sin-arrastre
            onClick={() => alTildar?.(p, noHay ? "PENDIENTE" : "NO")}
            className={`flex shrink-0 items-center justify-center rounded-full border-2 font-bold leading-none transition-colors active:scale-90 ${t.cruz} ${noHay ? "border-[var(--vence-fondo)] bg-[var(--vence-fondo)] text-white" : "border-current/30 opacity-60 hover:border-[var(--vence-fondo)] hover:opacity-100"}`}
          >
            ✕
          </button>
        );
        return (
          <li key={`${p.nombre}-${i}`}>
            <div className={`flex ${t.fila} ${t.texto}`}>
              {modo === "compra" && (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={hecha}
                  aria-label={`${p.nombre}: ya se compró`}
                  title={hecha ? (p.tildado ? "Comprado: tocá para destildar" : "Comprado (la compra está anotada)") : "Tildar como comprado"}
                  data-sin-arrastre
                  onClick={() => alTildar?.(p, hecha ? "PENDIENTE" : "SI")}
                  className={`${casilla} ${t.casilla} ${hecha ? marcada : sinMarcar}`}
                >
                  ✓
                </button>
              )}
              {modo === "separar" && (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={hecha}
                  aria-label={`${p.nombre}: ya está separado`}
                  title={!p.entregaItemId ? "Ya salió: se corrige desde la entrega" : hecha ? "Separado: tocá para destildar" : "Tildar como separado"}
                  data-sin-arrastre
                  disabled={!p.entregaItemId}
                  onClick={() => alSeparar?.(p, !hecha)}
                  className={`${casilla} ${t.casilla} ${hecha ? marcada : sinMarcar}`}
                >
                  ✓
                </button>
              )}
              {modo === "visto" && (
                <span aria-label={hecha ? "listo" : "falta"} className={`${casilla} ${t.casilla} ${hecha ? marcada : "border-black/30 text-transparent dark:border-white/45"}`}>
                  ✓
                </span>
              )}
              {alLado?.(p)}
              <NombreDeProducto
                nombre={`${p.reemplazo ? "🔁 " : ""}${p.nombre}`}
                grupo={p.grupo}
                fluido={t.cantidadDebajo}
                className={`flex-1 ${t.cantidadDebajo ? "" : `basis-40 ${apagado}`}`}
                claseDelNombre={apagado}
                debajo={
                  t.cantidadDebajo ? (
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className={`font-bold tabular-nums ${t.cantidad} ${noHay ? "line-through opacity-60" : ""}`}>{p.cantidad}</span>
                      {cruz}
                    </span>
                  ) : undefined
                }
              />
              {!t.cantidadDebajo && <span className={`ml-auto shrink-0 font-bold tabular-nums ${t.cantidad} ${noHay ? "line-through opacity-60" : ""}`}>{p.cantidad}</span>}
              {!t.cantidadDebajo && cruz}
            </div>
            {p.aviso && <span className={`mt-0.5 block w-fit rounded-md bg-white/85 px-2 text-sm font-semibold text-[#8a3a00] dark:bg-black/40 dark:text-[#fedec8] ${modo === "ver" ? "" : t.sangria}`}>⚠ {p.aviso}</span>}
            {debajo?.(p)}
          </li>
        );
      })}
      {limite !== undefined && productos.length > limite && <li className="text-sm font-medium opacity-75">y {productos.length - limite} más…</li>}
    </ul>
  );
}

/**
 * Por qué no se puede tildar la compra de un producto (o null si se puede): todavía no está en la
 * lista, o su compra ya está anotada con puesto y precio.
 */
export function motivoParaNoTildar(p: ProductoDeChecklist, valor: Tilde, fecha: string): { mensaje: string; enlace: { href: string; texto: string } } | null {
  if (!p.listaItemId) {
    return {
      mensaje: `${p.nombre} todavía no está en la lista de compras (cambió un pedido después de armarla): actualizala y vas a poder tildarlo.`,
      enlace: { href: `/lista-compra?fecha=${fecha}`, texto: "Ir a la lista de compras" },
    };
  }
  if (p.compra === "COMPRADO" && !p.tildado && valor !== "SI") {
    return {
      mensaje: `La compra de ${p.nombre} ya está anotada (puesto y precio). Para deshacerla, anulala desde “Compras anotadas”.`,
      enlace: { href: `/compras?fecha=${fecha}`, texto: "Ver las compras anotadas" },
    };
  }
  return null;
}

/** Cómo queda un producto apenas se lo tilda, mientras el servidor guarda. */
export function conTildeDeCompra<T extends ProductoDeChecklist>(p: T, valor: Tilde): T {
  return { ...p, hecha: valor !== "PENDIENTE", tildado: valor === "SI", compra: valor === "SI" ? "COMPRADO" : valor === "NO" ? "NO_CONSEGUIDO" : "PENDIENTE", aviso: valor === "NO" ? "No se consiguió en el mercado" : null };
}
