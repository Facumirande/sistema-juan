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
 * Menú por grupos (08 §2.2, simplificado el 28/09/2026 para las dos personas que lo usan): arriba
 * el tablero de pedidos y cargar un pedido, después los registros y las cuentas; todo lo demás
 * (cada paso del día por separado, precios, reportes, usuarios) queda plegado en "Más opciones".
 */
export const MENU: readonly GrupoMenu[] = [
  {
    grupo: "Día de trabajo",
    items: [
      { pantalla: "P-02", etiqueta: "Tablero de pedidos", icono: "📋", ruta: "/inicio", permisos: [] },
      { pantalla: "P-41", etiqueta: "Nuevo pedido", icono: "＋", ruta: "/pedidos/nuevo", permisos: ["pedidos.crear"], destacado: true },
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
  {
    grupo: "Más opciones",
    plegado: true,
    items: [
      { pantalla: "P-02b", etiqueta: "El día paso a paso", icono: "☰", ruta: "/inicio?vista=pasos", permisos: ["jornada.ver"] },
      { pantalla: "P-45", etiqueta: "Todos los días", icono: "📅", ruta: "/jornadas", permisos: ["jornada.ver"] },
      { pantalla: "P-40", etiqueta: "Lista de pedidos", icono: "🗒️", ruta: "/pedidos", permisos: ["pedidos.ver"] },
      { pantalla: "P-50", etiqueta: "Lista de compra", icono: "🛒", ruta: "/lista-compra", permisos: ["lista_compra.ver"] },
      { pantalla: "P-56", etiqueta: "Compras", icono: "🧺", ruta: "/compras", permisos: ["compras.ver"] },
      { pantalla: "P-70", etiqueta: "Preparación", icono: "📦", ruta: "/preparacion", permisos: ["preparacion.ver"] },
      { pantalla: "P-75", etiqueta: "Repartos", icono: "🚚", ruta: "/repartos", permisos: ["repartos.ver"] },
      { pantalla: "P-79", etiqueta: "Entregas", icono: "✅", ruta: "/entregas", permisos: ["entregas.ver"] },
      { pantalla: "P-25", etiqueta: "Precios de compra", icono: "🏷️", ruta: "/precios/compra", permisos: ["precios.ver_costos"] },
      { pantalla: "P-32", etiqueta: "Precios de venta", icono: "💲", ruta: "/precios/venta", permisos: ["precios.ver_margenes"] },
      { pantalla: "P-93", etiqueta: "Movimientos", icono: "↔️", ruta: "/balance/movimientos", permisos: ["reportes.ver"] },
      { pantalla: "P-90", etiqueta: "Reportes", icono: "📊", ruta: "/reportes", permisos: ["reportes.ver"] },
      {
        pantalla: "P-92",
        etiqueta: "Documentos emitidos",
        icono: "📄",
        ruta: "/documentos",
        permisos: ["documentos.imprimir_compra", "documentos.imprimir_entrega", "documentos.imprimir_contable", "documentos.imprimir_cuenta"],
        enConstruccion: true,
      },
      { pantalla: "P-96", etiqueta: "Usuarios", icono: "👤", ruta: "/usuarios", permisos: ["usuarios.administrar"] },
      { pantalla: "P-95", etiqueta: "Empresa", icono: "⚙️", ruta: "/configuracion", permisos: ["configuracion.ver"], enConstruccion: true },
      { pantalla: "P-98", etiqueta: "Auditoría", icono: "🔍", ruta: "/auditoria", permisos: ["auditoria.ver"], enConstruccion: true },
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
