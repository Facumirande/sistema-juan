import type { Permiso } from "@/seguridad/catalogo-permisos";

export interface ItemMenu {
  pantalla: string;
  etiqueta: string;
  /** Dibujo que acompaña el nombre en el menú (`ICONO_NAVEGACION`: la flecha del GPS). */
  icono: string;
  ruta: string;
  /** Se muestra si el usuario tiene alguno. Vacío = cualquier usuario con sesión. */
  permisos: readonly Permiso[];
  /** No se muestra a quien tiene alguno de estos (ej. "Mi reparto" no hace falta a quien maneja todos los repartos). */
  ocultarCon?: readonly Permiso[];
  /**
   * Se muestra como botón: "principal" es el tablero (la pantalla del día, en verde lleno) y
   * "secundario", debajo, la acción más usada (también llamativa, con borde verde).
   */
  destacado?: "principal" | "secundario";
  /** Pantalla todavía no construida (se muestra deshabilitada). */
  enConstruccion?: true;
  /**
   * Es una etapa del día: con un día en curso, el menú la muestra dentro de "Etapas del día" (con
   * su avance y el enlace a ese día) en vez de suelta.
   */
  etapa?: true;
}

/** El ícono de la flecha de navegación (se dibuja en SVG, no es un emoji). */
export const ICONO_NAVEGACION = "flecha-navegacion";

export interface GrupoMenu {
  grupo: string;
  /** Grupo secundario: se muestra cerrado y se abre al tocarlo. */
  plegado?: true;
  items: readonly ItemMenu[];
}

/**
 * Menú por grupos (08 §2.2): el día de trabajo, los registros y las cuentas. Las etapas del día
 * (lista de compras, preparación, remitos, viaje) se agrupan debajo del tablero cuando hay un día
 * en curso. Lo demás se abre desde la pantalla que corresponde (los precios desde Productos, los
 * reportes desde Balance, los usuarios y la configuración desde Mi cuenta).
 */
export const MENU: readonly GrupoMenu[] = [
  {
    grupo: "Día de trabajo",
    items: [
      { pantalla: "P-02", etiqueta: "Tablero de pedidos", icono: "📋", ruta: "/inicio", permisos: [], destacado: "principal" },
      { pantalla: "P-41", etiqueta: "Nuevo pedido", icono: "＋", ruta: "/pedidos/nuevo", permisos: ["pedidos.crear"], destacado: "secundario" },
      // Etapas: con un día en curso van agrupadas debajo del tablero, cada una con su avance.
      { pantalla: "P-50", etiqueta: "Lista de compras", icono: "🛒", ruta: "/lista-compra", permisos: ["lista_compra.ver"], etapa: true },
      { pantalla: "P-70", etiqueta: "Preparación", icono: "📦", ruta: "/preparacion", permisos: ["preparacion.ver"], etapa: true },
      { pantalla: "P-81", etiqueta: "Remitos", icono: "🧾", ruta: "/entregas/remitos", permisos: ["documentos.imprimir_entrega"], etapa: true },
      { pantalla: "P-78b", etiqueta: "Logística", icono: ICONO_NAVEGACION, ruta: "/viaje", permisos: ["repartos.ver"], etapa: true },
      { pantalla: "P-77", etiqueta: "Mi reparto", icono: "🚚", ruta: "/repartos/mios", permisos: ["repartos.ver_propios"], ocultarCon: ["repartos.gestionar"] },
      { pantalla: "P-94", etiqueta: "Actividad y notas", icono: "💬", ruta: "/actividad", permisos: [] },
    ],
  },
  {
    grupo: "Registros",
    items: [
      { pantalla: "P-15", etiqueta: "Clientes", icono: "👥", ruta: "/clientes", permisos: ["clientes.ver"] },
      { pantalla: "P-10", etiqueta: "Productos", icono: "🥕", ruta: "/productos", permisos: ["productos.ver"] },
      // Los precios del mercado cambian todos los días: a mano para cambiarlos rápido.
      { pantalla: "P-27", etiqueta: "Precios de hoy", icono: "💲", ruta: "/precios/hoy", permisos: ["precios.ver_costos"] },
      { pantalla: "P-20", etiqueta: "Proveedores", icono: "🏪", ruta: "/proveedores", permisos: ["proveedores.ver"] },
    ],
  },
  {
    grupo: "Cuentas",
    items: [
      { pantalla: "P-91", etiqueta: "Balance", icono: "📈", ruta: "/balance", permisos: ["reportes.ver"] },
      // Lo que todavía no se movió: lo entregado sin cobrar y lo retirado sin pagar.
      { pantalla: "P-65", etiqueta: "A cobrar", icono: "🤝", ruta: "/cuentas-clientes", permisos: ["cobranzas.ver"] },
      { pantalla: "P-60", etiqueta: "A pagar", icono: "📤", ruta: "/cuentas-proveedores", permisos: ["pagos.ver"] },
      { pantalla: "P-66", etiqueta: "Gastos e ingresos", icono: "💸", ruta: "/gastos", permisos: ["pagos.ver"] },
      { pantalla: "P-85", etiqueta: "Facturación", icono: "🧾", ruta: "/facturacion", permisos: ["facturacion.ver"] },
    ],
  },
];

/** Menú visible para un usuario: los grupos sin ninguna pantalla visible no aparecen (08 §2.2). */
export function menuPara(permisos: readonly Permiso[]): GrupoMenu[] {
  const propios = new Set(permisos);
  return MENU.map((g) => ({
    ...g,
    items: g.items.filter(
      (i) => (i.permisos.length === 0 || i.permisos.some((p) => propios.has(p))) && !(i.ocultarCon ?? []).some((p) => propios.has(p)),
    ),
  })).filter((g) => g.items.length > 0);
}

/** Lo que se muestra en el menú: solo las pantallas que ya existen (sin "próximamente"). */
export function menuDisponible(permisos: readonly Permiso[]): GrupoMenu[] {
  return menuPara(permisos)
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.enConstruccion) }))
    .filter((g) => g.items.length > 0);
}
