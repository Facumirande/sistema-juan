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
 * El libro de Excel de un mes: resumen, gráficos de barras a todo lo ancho, el detalle día por día
 * y lo vendido por cliente y por producto. Cada quien baja lo que su usuario puede ver.
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
      ...dato("Se compró (mercadería)", t.comprado),
      ...dato("Costó la mercadería vendida", t.costoVendido),
      ...dato("Quedó de ganancia", t.ganancia),
      ...dato("Ganancia de cada $100 vendidos", t.gananciaPct),
      ...dato("Se les pagó a los proveedores", t.pagado),
      ...dato("Se les debía a los proveedores al terminar", b.ver.deuda ? (b.deuda.at(-1)?.valores.saldo ?? "0") : null),
    ],
  };

  // El detalle por día: de estas columnas salen los gráficos.
  const columnas = ["Día", ...(b.ver.venta ? ["Vendido"] : []), ...(verCompras ? ["Comprado"] : []), ...(b.ver.costo ? ["Ganancia"] : []), ...(b.ver.deuda ? ["Deuda con proveedores"] : [])];
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
      ...grafico(`Lo que se les debía a los proveedores al terminar cada día de ${nombre}`, serie("Deuda con proveedores", NARANJA)),
    ],
  };

  const ranking = (hoja: string, titulo: string, filas: { nombre: string; vendido: string; ganancia: string | null }[]): Hoja => ({
    nombre: hoja,
    columnas: [titulo, "Vendido", ...(b.ver.costo ? ["Ganancia"] : [])],
    filas: filas.map((f) => [f.nombre, numero(f.vendido), ...(b.ver.costo ? [f.ganancia === null ? null : numero(f.ganancia)] : [])]),
    graficos: filas.length ? [{ titulo: `${titulo}: lo vendido en ${nombre}`, hoja, etiquetas: 0, series: [{ columna: 1, color: AZUL }] }] : [],
  });

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
    ],
  };
}
