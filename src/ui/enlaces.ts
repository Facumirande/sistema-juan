import type { TipoEntidad } from "@/modulos/colaboracion/registro";

/** Adónde lleva una nota o un registro de actividad (la tarjeta abierta si es un pedido). */
export function enlaceDeEntidad(tipo: TipoEntidad, id: string, fecha: string | null): string {
  switch (tipo) {
    case "PEDIDO":
      return fecha ? `/inicio?fecha=${fecha}&pedido=${id}` : `/pedidos/${id}`;
    case "CLIENTE":
      return `/clientes/${id}`;
    case "PROVEEDOR":
      return `/proveedores/${id}`;
    case "PRODUCTO":
      return `/productos/${id}`;
    case "COMPRA":
      return `/compras/${id}`;
    case "PAGO":
      return `/cuentas-proveedores/pagos/${id}`;
    case "ENTREGA":
      return `/entregas/${id}`;
    case "REPARTO":
      return `/repartos/${id}`;
    case "JORNADA":
      return fecha ? `/inicio?fecha=${fecha}&vista=pasos` : "/jornadas";
    case "LISTA_COMPRA":
      return fecha ? `/lista-compra?fecha=${fecha}` : "/lista-compra";
    case "FACTURA":
      return `/facturacion/${id}`;
    case "USUARIO":
      return "/usuarios";
  }
}
