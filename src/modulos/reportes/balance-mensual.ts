import type { BaseDatos } from "@/db/tipos";
import { dec } from "@/dominio/dinero/decimal";
import { ErrorDeNegocio } from "@/dominio/errores";
import { formatearFecha, type FechaISO } from "@/dominio/fechas/fechas";
import { MESES_QUE_SE_GUARDAN, mesDe, mesesParaListar, nombreDeMes, primerMesGuardado, rangoDeMes, type Mes, type RangoDeMes } from "@/dominio/reportes/meses";
import type { Celda, GraficoDeHoja, Hoja } from "@/lib/planilla";

import { balance } from "./balance";

// El balance de cada mes en un archivo de Excel, para mirar mes a mes y dejar documentado. Los
// archivos no se guardan: se arman al bajarlos con lo que hay registrado, así que nunca quedan
// viejos ni ocupan lugar. Se ofrecen los últimos meses (MESES_QUE_SE_GUARDAN); los anteriores
// salen solos de la lista.

/** Los mismos colores que los gráficos de la pantalla. */
const AZUL = "2A78D6";
const NARANJA = "EB6834";

export interface MesDeBalance extends RangoDeMes {
  nombre: string;
  vendido: string | null;
  comprado: string | null;
  ganancia: string | null;
}

/** La lista de meses que se pueden bajar, del más nuevo al más viejo, con lo principal de cada uno. */
export async function balancesPorMes(db: BaseDatos, authUserId: string, hoy: FechaISO): Promise<MesDeBalance[]> {
  const b = await balance(db, authUserId, { desde: `${primerMesGuardado(hoy)}-01`, hasta: hoy, agrupacion: "MES" });
  const porMes = new Map(b.series.map((s) => [mesDe(s.periodo), s.valores]));
  const deuda = new Map(b.deuda.map((s) => [mesDe(s.periodo), s.valores.saldo]));
  const hay = (v: string | undefined) => v !== undefined && !dec(v).isZero();
  const tuvoMovimientos = (m: Mes) => hay(porMes.get(m)?.vendido) || hay(porMes.get(m)?.comprado) || hay(porMes.get(m)?.ganancia) || hay(deuda.get(m));
  return mesesParaListar(hoy, tuvoMovimientos).map((r) => {
    const v = porMes.get(r.mes);
    return {
      ...r,
      nombre: nombreDeMes(r.mes),
      vendido: b.ver.venta && v ? v.vendido : null,
      comprado: b.totales.comprado !== null && v ? v.comprado : null,
      ganancia: b.ver.costo && v ? v.ganancia : null,
    };
  });
}

const numero = (v: string): Celda => ({ numero: dec(v).toString() });

/**
 * El libro de Excel de un mes: resumen (con el dinero real, el pendiente y el total), gráficos de
 * barras a todo lo ancho, el detalle día por día, lo vendido por cliente y por producto, lo que
 * falta cobrar y pagar, y los gastos e ingresos por rubro. Cada quien baja lo que su usuario puede ver.
 */
export async function libroDelMes(db: BaseDatos, authUserId: string, mes: string, hoy: FechaISO): Promise<{ rango: RangoDeMes; nombre: string; hojas: Hoja[] }> {
  const rango = rangoDeMes(mes, hoy);
  if (!rango) {
    throw new ErrorDeNegocio("VALIDACION", `Ese mes no está entre los que se pueden bajar: se guardan los últimos ${MESES_QUE_SE_GUARDAN} meses, hasta el mes en curso. Elegilo de la lista del balance.`);
  }
  const b = await balance(db, authUserId, { desde: rango.desde, hasta: rango.hasta, agrupacion: "DIA" });
  const t = b.totales;
  const nombre = nombreDeMes(rango.mes);
  const verCompras = t.comprado !== null;
  const dato = (titulo: string, v: string | null): Celda[][] => (v === null ? [] : [[titulo, numero(v)]]);

  const resumen: Hoja = {
    nombre: "Resumen",
    columnas: [`Balance de ${nombre}`, "Importe"],
    filas: [
      ["Desde", formatearFecha(rango.desde)],
      ["Hasta", `${formatearFecha(rango.hasta)}${rango.enCurso ? " (el mes todavía no terminó)" : ""}`],
      ["Entregas a clientes", { numero: String(t.entregas) }],
      ...dato("Se vendió", t.vendido),
      ...dato("Compras (mercadería retirada)", t.comprado),
      ...dato("Costó la mercadería vendida", t.costoVendido),
      ...dato("Quedó de ganancia", t.ganancia),
      ...dato("Ganancia de cada $100 vendidos", t.gananciaPct),
      ...dato("Se les pagó a los proveedores", t.pagado),
      ...dato("A pagar a los proveedores al terminar", b.ver.deuda ? (b.deuda.at(-1)?.valores.saldo ?? "0") : null),
      // Las compras y las ventas del mes: lo que ya se saldó y lo que quedó pendiente.
      ...(b.compras ? [...dato("Compras del mes ya pagadas", b.compras.pagado), ...dato("Compras del mes que quedaron a pagar (crédito)", b.compras.aPagar)] : []),
      ...(b.ventas ? [...dato("Ventas del mes ya cobradas", b.ventas.cobrado), ...dato("Ventas del mes que falta cobrar", b.ventas.aCobrar)] : []),
      // El dinero: lo real es lo que entró y salió en el mes; lo pendiente es lo que falta cobrar y pagar hoy.
      ...(b.dinero
        ? [
            ...dato("DINERO REAL · entró: cobrado a clientes", b.dinero.cobrado),
            ...dato("DINERO REAL · entró: otros ingresos", b.dinero.ingresos),
            ...dato("DINERO REAL · salió: pagado a proveedores", b.dinero.pagado),
            ...dato("DINERO REAL · salió: gastos generales", b.dinero.gastos),
            ...dato("DINERO REAL del mes (entró − salió)", b.dinero.real),
            ...dato("DINERO PENDIENTE · a cobrar a los clientes (hoy)", b.dinero.aCobrar),
            ...dato("DINERO PENDIENTE · a pagar a los proveedores (hoy)", b.dinero.aPagar),
            ...dato("DINERO PENDIENTE (a cobrar − a pagar)", b.dinero.pendiente),
            ...dato("BALANCE TOTAL (real + pendiente)", b.dinero.total),
          ]
        : []),
    ],
  };

  // El detalle por día: de estas columnas salen los gráficos.
  const columnas = ["Día", ...(b.ver.venta ? ["Vendido"] : []), ...(verCompras ? ["Comprado"] : []), ...(b.ver.costo ? ["Ganancia"] : []), ...(b.ver.deuda ? ["A pagar"] : []), ...(b.ver.dinero ? ["Entró", "Salió"] : [])];
  const col = (titulo: string) => columnas.indexOf(titulo);
  const porDia: Hoja = {
    nombre: "Por día",
    columnas,
    filas: b.series.map((s, i) => [
      formatearFecha(s.periodo).slice(0, 5),
      ...(b.ver.venta ? [numero(s.valores.vendido)] : []),
      ...(verCompras ? [numero(s.valores.comprado)] : []),
      ...(b.ver.costo ? [numero(s.valores.ganancia)] : []),
      ...(b.ver.deuda ? [numero(b.deuda[i]?.valores.saldo ?? "0")] : []),
      ...(b.ver.dinero ? [numero(s.valores.entro), numero(s.valores.salio)] : []),
    ]),
  };
  const serie = (titulo: string, color: string) => (col(titulo) > 0 ? [{ columna: col(titulo), color }] : []);
  const grafico = (titulo: string, series: GraficoDeHoja["series"]): GraficoDeHoja[] => (series.length ? [{ titulo, hoja: porDia.nombre, etiquetas: 0, series }] : []);
  const graficos: Hoja = {
    nombre: "Gráficos",
    columnas: [`Gráficos de ${nombre}: una barra por día`],
    filas: [],
    graficos: [
      ...grafico(`Lo que se vendió y lo que se compró cada día de ${nombre}`, [...serie("Vendido", AZUL), ...serie("Comprado", NARANJA)]),
      ...grafico(`Lo que quedó de ganancia cada día de ${nombre}`, serie("Ganancia", AZUL)),
      ...grafico(`Lo que quedaba a pagar a los proveedores al terminar cada día de ${nombre}`, serie("A pagar", NARANJA)),
      ...grafico(`La plata que entró y la que salió cada día de ${nombre}`, [...serie("Entró", AZUL), ...serie("Salió", NARANJA)]),
    ],
  };

  const ranking = (hoja: string, titulo: string, filas: { nombre: string; vendido: string; ganancia: string | null }[]): Hoja => ({
    nombre: hoja,
    columnas: [titulo, "Vendido", ...(b.ver.costo ? ["Ganancia"] : [])],
    filas: filas.map((f) => [f.nombre, numero(f.vendido), ...(b.ver.costo ? [f.ganancia === null ? null : numero(f.ganancia)] : [])]),
    graficos: filas.length ? [{ titulo: `${titulo}: lo vendido en ${nombre}`, hoja, etiquetas: 0, series: [{ columna: 1, color: AZUL }] }] : [],
  });

  // Lo que falta cobrar y pagar (a hoy) y los gastos e ingresos del mes, cada uno en su hoja con su gráfico.
  const lista = (hoja: string, columnas: string[], filas: Celda[][], color: string): Hoja => ({
    nombre: hoja,
    columnas,
    filas,
    graficos: filas.length ? [{ titulo: `${hoja}: ${columnas[1]!.toLowerCase()}`, hoja, etiquetas: 0, series: [{ columna: 1, color }] }] : [],
  });
  const deCuentas: Hoja[] = b.ver.dinero
    ? [
        lista("A cobrar", ["Cliente", "Falta cobrar (hoy)", "Debe desde"], b.aCobrarPorCliente.map((x) => [x.cliente, numero(x.saldo), x.desde ? formatearFecha(x.desde) : null]), AZUL),
        lista("A pagar", ["Proveedor", "Falta pagar (hoy)"], b.aPagarPorProveedor.map((x) => [x.proveedor, numero(x.saldo)]), NARANJA),
        lista(
          "Gastos e ingresos",
          ["Rubro", "Importe", "Qué es", "Veces", "Cantidad"],
          b.gastosPorRubro.map((r) => [`${r.dibujo} ${r.rubro}`, numero(r.total), r.tipo === "GASTO" ? "Gasto" : "Ingreso", { numero: String(r.veces) }, r.cantidad ? `${r.cantidad} ${r.unidad}` : null]),
          NARANJA,
        ),
      ]
    : [];

  return {
    rango,
    nombre,
    hojas: [
      resumen,
      graficos,
      porDia,
      ...(b.ver.venta
        ? [
            ranking(
              "Clientes",
              "Cliente",
              b.clientes.map((c) => ({ nombre: c.cliente, vendido: c.vendido, ganancia: c.ganancia })),
            ),
            ranking(
              "Productos",
              "Producto",
              b.productos.map((p) => ({ nombre: p.producto, vendido: p.vendido, ganancia: p.ganancia })),
            ),
          ]
        : []),
      ...deCuentas,
    ],
  };
}
