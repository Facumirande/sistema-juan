"use client";

import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, useTransition, type InputHTMLAttributes } from "react";
import { flushSync } from "react-dom";

// El buscador, igual en todos lados (pedido del usuario, 08/10/2026): la lupa a la izquierda y, en
// cuanto hay algo escrito, una ✕ grande a la derecha para borrarlo de un toque. En el celular abre el
// teclado con la tecla "Buscar" y sin corregir ni poner mayúsculas.

const caja = "h-12 w-full min-w-0 rounded-xl border-2 border-borde bg-superficie pr-12 pl-10 text-lg [&::-webkit-search-cancel-button]:hidden";
const lupa = "pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-lg leading-none";
const cruz = "absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-xl font-bold text-texto-suave hover:bg-fondo hover:text-texto";

type Comun = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "type">;

/** Buscador que se maneja desde la pantalla (lo escrito filtra al instante). */
export function Buscador({ valor, alCambiar, className = "", ...resto }: Comun & { valor: string; alCambiar: (texto: string) => void }) {
  const entrada = useRef<HTMLInputElement>(null);
  return (
    <div className={`relative ${className}`}>
      <span aria-hidden className={lupa}>
        🔎
      </span>
      <input
        ref={entrada}
        type="search"
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        {...resto}
        className={caja}
      />
      {valor && (
        <button
          type="button"
          aria-label="Borrar lo que se buscó"
          title="Borrar"
          onClick={() => {
            alCambiar("");
            entrada.current?.focus();
          }}
          className={cruz}
        >
          ✕
        </button>
      )}
    </div>
  );
}

/**
 * Buscador dentro de un formulario de filtros (que se manda al servidor). Filtra mientras se escribe
 * (pedido del usuario, 10/10/2026): un instante después de la última tecla la pantalla se pone al
 * día con lo escrito y los demás filtros, sin recargar ni perder el cursor. La ✕ lo borra y vuelve a
 * mostrar todo enseguida.
 */
export function CampoBuscar({ defaultValue = "", className = "", ...resto }: Comun & { name: string; defaultValue?: string }) {
  const [texto, setTexto] = useState(defaultValue);
  const router = useRouter();
  const pantalla = usePathname();
  const [buscando, empezar] = useTransition();
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aplicar = (formulario: HTMLFormElement | null, valor: string) => {
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(() => {
      if (!formulario) return;
      const parametros = new URLSearchParams();
      for (const [clave, v] of new FormData(formulario)) if (typeof v === "string" && v !== "" && clave !== resto.name) parametros.append(clave, v);
      if (valor.trim()) parametros.set(resto.name, valor.trim());
      empezar(() => router.replace(`${pantalla}${parametros.size ? `?${parametros.toString()}` : ""}`, { scroll: false }));
    }, 300);
  };
  return (
    <div className={`relative ${className}`}>
      <span aria-hidden className={lupa}>
        🔎
      </span>
      <input
        type="search"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          aplicar(e.currentTarget.form, e.target.value);
        }}
        aria-busy={buscando || undefined}
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        {...resto}
        className={caja}
      />
      {texto && (
        <button
          type="button"
          aria-label="Borrar lo que se buscó"
          title="Borrar"
          onClick={(e) => {
            const formulario = e.currentTarget.form;
            flushSync(() => setTexto(""));
            // Se vuelve a mostrar todo.
            aplicar(formulario, "");
          }}
          className={cruz}
        >
          ✕
        </button>
      )}
    </div>
  );
}
