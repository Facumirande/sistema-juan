import type { Permiso } from "@/seguridad/catalogo-permisos";

export interface ItemMenu {
  pantalla: string;
  etiqueta: string;
  /** Dibujo que acompaña el nombre en el menú. */
  icono: string;
  ruta: string;
  /** Se muestra si el usuario tiene alguno. Vacío = cualquier usuario con sesión. */
  permisos: readonly Permiso[];
  /** No se muestra a quien tiene alguno de estos (ej. "Mi reparto" no hace falta a quien maneja todos los repartos). */
  ocultarCon?: readonly Permiso[];
  /** Se muestra como botón (la acción más usada). */
  destacado?: true;
  /** Pantalla todavía no construida (se muestra deshabilitada). */
  enConstruccion?: true;
}

export interface GrupoMenu {
  grupo: string;
  /** Grupo secundario: se muestra cerrado y se abre al tocarlo. */
  plegado?: true;
  items: readonly ItemMenu[];
}

/**
 * Menú por grupos (08 §2.2, reducido el 29/09/2026 a lo esencial): el día de trabajo, los
 * registros y las cuentas. Lo demás se abre desde la pantalla que corresponde (los precios desde
 * Productos, los reportes desde Balance, los usuarios y la configuración desde Mi cuenta, cada
 * etapa del día desde el tablero o el paso a paso).
 */
export const MENU: readonly GrupoMenu[] = [
  {
    grupo: "Día de trabajo",
    items: [
      { pantalla: "P-02", etiqueta: "Tablero de pedidos", icono: "📋", ruta: "/inicio", permisos: [] },
      { pantalla: "P-41", etiqueta: "Nuevo pedido", icono: "＋", ruta: "/pedidos/nuevo", permisos: ["pedidos.crear"], destacado: true },
      { pantalla: "P-50", etiqueta: "Lista de compras", icono: "🛒", ruta: "/lista-compra", permisos: ["lista_compra.ver"] },
      { pantalla: "P-78b", etiqueta: "Viaje de entrega", icono: "🧭", ruta: "/viaje", permisos: ["repartos.ver"] },
      { pantalla: "P-77", etiqueta: "Mi reparto", icono: "🚚", ruta: "/repartos/mios", permisos: ["repartos.ver_propios"], ocultarCon: ["repartos.gestionar"] },
      { pantalla: "P-94", etiqueta: "Actividad y notas", icono: "💬", ruta: "/actividad", permisos: [] },
    ],
  },
  {
    grupo: "Registros",
    items: [
      { pantalla: "P-15", etiqueta: "Clientes", icono: "👥", ruta: "/clientes", permisos: ["clientes.ver"] },
      { pantalla: "P-10", etiqueta: "Productos", icono: "🥕", ruta: "/productos", permisos: ["productos.ver"] },
      { pantalla: "P-20", etiqueta: "Proveedores", icono: "🏪", ruta: "/proveedores", permisos: ["proveedores.ver"] },
    ],
  },
  {
    grupo: "Cuentas",
    items: [
      { pantalla: "P-91", etiqueta: "Balance", icono: "📈", ruta: "/balance", permisos: ["reportes.ver"] },
      { pantalla: "P-60", etiqueta: "Deudas con proveedores", icono: "💰", ruta: "/cuentas-proveedores", permisos: ["pagos.ver"] },
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
