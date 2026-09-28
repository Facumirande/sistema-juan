import type { Permiso } from "@/seguridad/catalogo-permisos";

export interface ItemMenu {
  pantalla: string;
  etiqueta: string;
  ruta: string;
  /** Se muestra si el usuario tiene alguno. Vacío = cualquier usuario con sesión. */
  permisos: readonly Permiso[];
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
 * Menú por grupos (08 §2.2, reorganizado para el uso interno): arriba el día de trabajo (la
 * pantalla "Hoy" lleva paso a paso por pedidos, compras, preparación, remitos y entregas);
 * aparte, los registros (datos de clientes, productos, proveedores y precios), las cuentas con el
 * balance, y cada paso del día por separado para ir directo.
 */
export const MENU: readonly GrupoMenu[] = [
  {
    grupo: "Día de trabajo",
    items: [
      { pantalla: "P-02", etiqueta: "Hoy", ruta: "/inicio", permisos: [] },
      { pantalla: "P-77", etiqueta: "Mi reparto", ruta: "/repartos/mios", permisos: ["repartos.ver_propios"] },
      { pantalla: "P-45", etiqueta: "Todos los días", ruta: "/jornadas", permisos: ["jornada.ver"] },
    ],
  },
  {
    grupo: "Registros",
    items: [
      { pantalla: "P-15", etiqueta: "Clientes", ruta: "/clientes", permisos: ["clientes.ver"] },
      { pantalla: "P-10", etiqueta: "Productos", ruta: "/productos", permisos: ["productos.ver"] },
      { pantalla: "P-20", etiqueta: "Proveedores", ruta: "/proveedores", permisos: ["proveedores.ver"] },
      { pantalla: "P-25", etiqueta: "Precios de compra", ruta: "/precios/compra", permisos: ["precios.ver_costos"] },
      { pantalla: "P-32", etiqueta: "Precios de venta", ruta: "/precios/venta", permisos: ["precios.ver_margenes"] },
    ],
  },
  {
    grupo: "Cuentas y balance",
    items: [
      { pantalla: "P-91", etiqueta: "Balance", ruta: "/balance", permisos: ["reportes.ver"] },
      { pantalla: "P-93", etiqueta: "Movimientos", ruta: "/balance/movimientos", permisos: ["reportes.ver"] },
      { pantalla: "P-60", etiqueta: "Deudas con proveedores", ruta: "/cuentas-proveedores", permisos: ["pagos.ver"] },
      { pantalla: "P-85", etiqueta: "Facturación", ruta: "/facturacion", permisos: ["facturacion.ver"] },
      { pantalla: "P-90", etiqueta: "Reportes", ruta: "/reportes", permisos: ["reportes.ver"] },
    ],
  },
  {
    grupo: "Cada paso por separado",
    plegado: true,
    items: [
      { pantalla: "P-40", etiqueta: "Pedidos", ruta: "/pedidos", permisos: ["pedidos.ver"] },
      { pantalla: "P-50", etiqueta: "Lista de compra", ruta: "/lista-compra", permisos: ["lista_compra.ver"] },
      { pantalla: "P-56", etiqueta: "Compras", ruta: "/compras", permisos: ["compras.ver"] },
      { pantalla: "P-70", etiqueta: "Preparación", ruta: "/preparacion", permisos: ["preparacion.ver"] },
      { pantalla: "P-75", etiqueta: "Repartos", ruta: "/repartos", permisos: ["repartos.ver"] },
      { pantalla: "P-79", etiqueta: "Entregas", ruta: "/entregas", permisos: ["entregas.ver"] },
      {
        pantalla: "P-92",
        etiqueta: "Documentos emitidos",
        ruta: "/documentos",
        permisos: ["documentos.imprimir_compra", "documentos.imprimir_entrega", "documentos.imprimir_contable", "documentos.imprimir_cuenta"],
        enConstruccion: true,
      },
    ],
  },
  {
    grupo: "Configuración",
    items: [
      { pantalla: "P-95", etiqueta: "Empresa", ruta: "/configuracion", permisos: ["configuracion.ver"], enConstruccion: true },
      { pantalla: "P-96", etiqueta: "Usuarios", ruta: "/usuarios", permisos: ["usuarios.administrar"] },
      { pantalla: "P-98", etiqueta: "Auditoría", ruta: "/auditoria", permisos: ["auditoria.ver"], enConstruccion: true },
    ],
  },
];

/** Menú visible para un usuario: los grupos sin ninguna pantalla visible no aparecen (08 §2.2). */
export function menuPara(permisos: readonly Permiso[]): GrupoMenu[] {
  const propios = new Set(permisos);
  return MENU.map((g) => ({
    ...g,
    items: g.items.filter((i) => i.permisos.length === 0 || i.permisos.some((p) => propios.has(p))),
  })).filter((g) => g.items.length > 0);
}

/** Lo que se muestra en el menú: solo las pantallas que ya existen (sin "próximamente"). */
export function menuDisponible(permisos: readonly Permiso[]): GrupoMenu[] {
  return menuPara(permisos)
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.enConstruccion) }))
    .filter((g) => g.items.length > 0);
}
