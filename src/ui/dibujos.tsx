"use client";

import { createContext, useContext, type ReactNode } from "react";

import { dibujoDeProducto, type DibujosElegidos } from "@/dominio/catalogo/productos";

// Los dibujos elegidos a mano para los productos, a mano de toda la pantalla (11/10/2026): los pone
// el marco de la aplicación una sola vez y cada lugar que dibuja un producto los consulta. Así el
// dibujo que se elige en Productos es el mismo en el tablero, la lista de compras, los pedidos…

const Contexto = createContext<DibujosElegidos>({});

export function DibujosDeProductos({ elegidos, children }: { elegidos: DibujosElegidos; children: ReactNode }) {
  return <Contexto.Provider value={elegidos}>{children}</Contexto.Provider>;
}

/** El dibujo de un producto: el elegido a mano si tiene; si no, el que sale de su nombre o de su grupo. */
export function useDibujoDeProducto(): (nombre: string, grupo?: string | null) => string {
  const elegidos = useContext(Contexto);
  return (nombre, grupo) => dibujoDeProducto(nombre, grupo, elegidos);
}

/** El dibujo de un producto, para ponerlo en cualquier pantalla (también en las que se arman en el servidor). */
export function DibujoDeProducto({ nombre, grupo }: { nombre: string; grupo?: string | null }) {
  const dibujoDe = useDibujoDeProducto();
  return <>{dibujoDe(nombre, grupo)}</>;
}
