import type { ClaseDatos, Permiso } from "./catalogo-permisos";

/** Roles de sistema (02 §2): se crean en cada empresa y no se pueden borrar. */
export type CodigoRolSistema = "ADMIN" | "VENDEDOR" | "COMPRADOR" | "PREPARADOR" | "REPARTIDOR" | "ADMINISTRATIVO";

/** Comodín del rol ADMIN: todos los permisos, incluidos los futuros. */
export const TODOS_LOS_PERMISOS = "*";

export interface DefinicionRolSistema {
  nombre: string;
  descripcion: string;
  /** "Sí" en la matriz de 02 §5. */
  porDefecto: readonly Permiso[];
  /** "Opc." en la matriz de 02 §5: el ADMIN puede agregarlos al rol. */
  opcionales: readonly Permiso[];
  /** Clases de datos que el rol nunca puede recibir (02 §6). */
  clasesProhibidas: readonly ClaseDatos[];
}

const CLASES_SENSIBLES: readonly ClaseDatos[] = ["V", "C", "M", "F", "P"];

type RolesConPermisos = Exclude<CodigoRolSistema, "ADMIN">;

/** Matriz rol × permiso de 02 §5 (ADMIN tiene `*`). */
export const ROLES_SISTEMA: Readonly<Record<RolesConPermisos, DefinicionRolSistema>> = {
  VENDEDOR: {
    nombre: "Vendedor",
    descripcion: "Clientes y pedidos.",
    porDefecto: [
      "productos.ver", "clientes.ver", "clientes.editar", "precios.ver_venta",
      "pedidos.ver", "pedidos.crear", "pedidos.editar", "pedidos.confirmar", "pedidos.cancelar",
      "jornada.ver", "entregas.ver", "documentos.imprimir_entrega",
    ],
    opcionales: [
      "precios.override_linea", "pedidos.editar_en_curso", "lista_compra.ver", "lista_compra.generar",
      "repartos.ver", "documentos.imprimir_contable", "facturacion.ver", "cobranzas.ver", "reportes.ver",
    ],
    clasesProhibidas: [],
  },
  COMPRADOR: {
    nombre: "Comprador",
    descripcion: "Lista de compra, compras, precios de compra y proveedores.",
    porDefecto: [
      "productos.ver", "productos.editar", "proveedores.ver", "proveedores.editar", "proveedores.ver_credito",
      "precios.ver_costos", "precios.editar_compra", "jornada.ver",
      "lista_compra.ver", "lista_compra.generar", "lista_compra.editar",
      "compras.ver", "compras.registrar", "documentos.imprimir_compra", "stock.ver",
    ],
    opcionales: [
      "precios.ver_venta", "pedidos.ver", "jornada.gestionar", "compras.anular", "compras.exceder_limite",
      "pagos.ver", "pagos.registrar", "preparacion.ver", "preparacion.asignar_faltantes",
      "documentos.imprimir_cuenta", "stock.ajustar", "reportes.ver",
    ],
    clasesProhibidas: [],
  },
  PREPARADOR: {
    nombre: "Preparador",
    descripcion: "Preparación de la mercadería. Nunca ve precios.",
    porDefecto: [
      "jornada.ver", "jornada.gestionar", "preparacion.ver", "preparacion.registrar",
      "entregas.ver", "entregas.gestionar", "entregas.emitir_documentos", "documentos.imprimir_entrega", "stock.ver",
    ],
    opcionales: [
      "productos.ver", "lista_compra.ver", "preparacion.asignar_faltantes",
      "repartos.ver", "repartos.gestionar", "stock.ajustar",
    ],
    clasesProhibidas: CLASES_SENSIBLES,
  },
  REPARTIDOR: {
    nombre: "Repartidor",
    descripcion: "Sus repartos y la confirmación de sus entregas. Nunca ve precios.",
    porDefecto: ["jornada.ver", "repartos.ver_propios", "entregas.ver", "entregas.confirmar", "documentos.imprimir_entrega"],
    opcionales: [],
    clasesProhibidas: CLASES_SENSIBLES,
  },
  ADMINISTRATIVO: {
    nombre: "Administrativo",
    descripcion: "Pagos a proveedores, facturación, reportes y documentos contables.",
    porDefecto: [
      "productos.ver", "clientes.ver", "clientes.editar", "proveedores.ver", "proveedores.ver_credito",
      "precios.ver_costos", "precios.ver_venta", "pedidos.ver", "jornada.ver", "jornada.cerrar",
      "compras.ver", "compras.registrar", "compras.anular",
      "pagos.ver", "pagos.registrar", "pagos.anular", "pagos.ajustar",
      "repartos.gestionar", "entregas.ver", "entregas.emitir_documentos", "entregas.corregir",
      "documentos.imprimir_entrega", "documentos.imprimir_contable", "documentos.imprimir_cuenta",
      "facturacion.ver", "facturacion.emitir", "facturacion.exportar",
      "cobranzas.ver", "cobranzas.registrar", "reportes.ver", "reportes.exportar",
    ],
    opcionales: [
      "productos.editar", "proveedores.editar", "proveedores.editar_limite", "precios.ver_margenes",
      "pedidos.crear", "pedidos.editar", "pedidos.confirmar", "pedidos.cancelar", "jornada.gestionar",
      "lista_compra.ver", "repartos.ver", "entregas.gestionar", "entregas.confirmar", "entregas.anular",
      "documentos.imprimir_compra", "documentos.anular", "facturacion.anular", "cobranzas.anular",
      "stock.ver", "configuracion.ver", "auditoria.ver",
    ],
    clasesProhibidas: [],
  },
};

export const NOMBRE_ROL_ADMIN = "Administrador";
