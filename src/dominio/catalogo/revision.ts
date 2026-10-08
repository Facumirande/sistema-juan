import { dec } from "../dinero/decimal";
import { formatearMoneda, formatearNumero } from "../dinero/formato";

// Lo esencial que tiene que estar bien en un producto para trabajar con él (07/10/2026): que tenga
// precio de compra y que no se venda por debajo de lo que cuesta. Lo que no cumple se avisa en la
// campanita, con el enlace para arreglarlo.

export interface ProductoARevisar {
  /** Cuántos puestos lo venden (ofertas activas). */
  ofertas: number;
  /** Lo que cuesta la unidad (el puesto más barato que lo tiene); nulo si no hay precio. */
  costo: string | null;
  /** La ganancia que se le aplica (la propia, la de su categoría o la general), en %. */
  ganancia: string;
  /** Precios pactados con clientes, por unidad. */
  preciosFijos: readonly { cliente: string; precio: string }[];
  /** Ganancias especiales de clientes para este producto, en %. */
  gananciasDeClientes: readonly { cliente: string; ganancia: string }[];
}

const pct = (v: string) => `${formatearNumero(v, { decimales: 2, recortarCeros: true })} %`;

/** Qué hay que arreglar en un producto, dicho para la persona; vacío si está todo bien. */
export function problemasDeProducto(p: ProductoARevisar): string[] {
  const problemas: string[] = [];
  if (p.ofertas === 0) problemas.push("Le falta el precio de compra: sin eso no se sabe dónde comprarlo ni a cuánto venderlo.");
  if (dec(p.ganancia).lt(0)) problemas.push(`Tiene ganancia negativa (${pct(p.ganancia)}): se vende por debajo de lo que cuesta.`);
  for (const f of p.preciosFijos) {
    if (p.costo !== null && dec(f.precio).lt(p.costo)) problemas.push(`A ${f.cliente} se le vende a ${formatearMoneda(f.precio)} y cuesta ${formatearMoneda(p.costo)}: se pierde plata en cada venta.`);
  }
  for (const g of p.gananciasDeClientes) {
    if (dec(g.ganancia).lt(0)) problemas.push(`A ${g.cliente} se le vende con ganancia negativa (${pct(g.ganancia)}): por debajo de lo que cuesta.`);
  }
  return problemas;
}
