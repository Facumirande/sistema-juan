import Decimal from "decimal.js";

import { dec, redondear2, sumar, type ValorDecimal } from "../dinero/decimal";

// Resumen del día al cerrar la jornada (04 §5.h): comprado, vendido, costo, margen, sobrantes,
// resultado y deuda con proveedores. Se guarda congelado en `jornada.resumen`.

export interface DatosResumen {
  /** Compras vigentes de la jornada. */
  compras: readonly { proveedor: string; total: ValorDecimal; pagadoEnElActo: ValorDecimal }[];
  /** Entregas confirmadas (su última versión). */
  entregas: readonly { cliente: string; total: ValorDecimal; costo: ValorDecimal; conDiferencias: boolean }[];
  /** Por producto: comprado y entregado en unidad base, y el costo real de la jornada. */
  productos: readonly { producto: string; unidad: string; comprado: ValorDecimal; entregado: ValorDecimal; costoUnitario: ValorDecimal | null }[];
  /** Saldo de cada proveedor al cierre (positivo = se le debe). */
  saldos: readonly { proveedor: string; saldo: ValorDecimal }[];
}

export interface ResumenDelDia {
  comprado: string;
  pagadoEnElActo: string;
  deudaGenerada: string;
  comprasPorProveedor: { proveedor: string; total: string; pagado: string }[];
  vendido: string;
  ventasPorCliente: { cliente: string; total: string }[];
  costoVendido: string;
  margen: string;
  /** Sobre la venta, 2 decimales; nulo sin ventas. */
  margenPct: string | null;
  sobrantes: { producto: string; unidad: string; cantidad: string; costo: string }[];
  sobrantesCosto: string;
  /** Vendido − comprado (= margen − sobrantes). */
  resultado: string;
  resultadoPct: string | null;
  saldoProveedores: string;
  saldosPorProveedor: { proveedor: string; saldo: string }[];
  entregasConDiferencias: number;
}

const pct = (parte: Decimal, total: Decimal) => (total.isZero() ? null : redondear2(parte.div(total).times(100)).toFixed(2));
const plata = (v: ValorDecimal) => redondear2(dec(v)).toFixed(2);

function agrupar<T>(filas: readonly T[], clave: (f: T) => string, valores: (f: T) => ValorDecimal[]): { clave: string; sumas: Decimal[] }[] {
  const mapa = new Map<string, Decimal[]>();
  for (const f of filas) {
    const actual = mapa.get(clave(f)) ?? valores(f).map(() => dec(0));
    mapa.set(
      clave(f),
      actual.map((s, i) => s.plus(valores(f)[i]!)),
    );
  }
  return [...mapa.entries()].map(([c, sumas]) => ({ clave: c, sumas })).sort((a, b) => a.clave.localeCompare(b.clave, "es"));
}

export function resumenDelDia(d: DatosResumen): ResumenDelDia {
  const comprado = sumar(d.compras.map((c) => c.total));
  const pagado = sumar(d.compras.map((c) => c.pagadoEnElActo));
  const vendido = sumar(d.entregas.map((e) => e.total));
  const costoVendido = sumar(d.entregas.map((e) => e.costo));
  const margen = vendido.minus(costoVendido);
  const sobrantes = d.productos
    .map((p) => {
      const cantidad = Decimal.max(dec(p.comprado).minus(p.entregado), 0);
      return { producto: p.producto, unidad: p.unidad, cantidad, costo: p.costoUnitario === null ? dec(0) : redondear2(cantidad.times(p.costoUnitario)) };
    })
    .filter((s) => s.cantidad.gt(0));
  const deudas = d.saldos.filter((s) => dec(s.saldo).gt(0));
  const resultado = vendido.minus(comprado);
  return {
    comprado: plata(comprado),
    pagadoEnElActo: plata(pagado),
    deudaGenerada: plata(comprado.minus(pagado)),
    comprasPorProveedor: agrupar(
      d.compras,
      (c) => c.proveedor,
      (c) => [c.total, c.pagadoEnElActo],
    ).map((g) => ({ proveedor: g.clave, total: plata(g.sumas[0]!), pagado: plata(g.sumas[1]!) })),
    vendido: plata(vendido),
    ventasPorCliente: agrupar(
      d.entregas,
      (e) => e.cliente,
      (e) => [e.total],
    ).map((g) => ({ cliente: g.clave, total: plata(g.sumas[0]!) })),
    costoVendido: plata(costoVendido),
    margen: plata(margen),
    margenPct: pct(margen, vendido),
    sobrantes: sobrantes.map((s) => ({ producto: s.producto, unidad: s.unidad, cantidad: s.cantidad.toFixed(3), costo: plata(s.costo) })),
    sobrantesCosto: plata(sumar(sobrantes.map((s) => s.costo))),
    resultado: plata(resultado),
    resultadoPct: pct(resultado, vendido),
    saldoProveedores: plata(sumar(deudas.map((s) => s.saldo))),
    saldosPorProveedor: deudas.map((s) => ({ proveedor: s.proveedor, saldo: plata(s.saldo) })).sort((a, b) => a.proveedor.localeCompare(b.proveedor, "es")),
    entregasConDiferencias: d.entregas.filter((e) => e.conDiferencias).length,
  };
}
