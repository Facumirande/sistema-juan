import { dec } from "../dinero/decimal";
import { ABREVIATURA_UNIDAD, type UnidadMedida } from "../dinero/formato";
import { sumarDias, type FechaISO } from "../fechas/fechas";
import { NOMBRES_DE_UNIDAD, leerTabla, parecido, type ProblemaDePlanilla } from "../planillas/comun";
import { cantidadPermitida, juntarLineas, leerCantidad, normalizarBusqueda, textoCantidad, type LineaElegida, type PresentacionDeVenta } from "./carga";

export { MAXIMO_BYTES_PLANILLA, type ProblemaDePlanilla } from "../planillas/comun";

// Pedidos en una planilla de Excel (06/10/2026): la misma planilla sirve para bajar los pedidos de
// un día y para cargarlos. Una fila por producto: fecha de entrega, cliente, código (o nombre) del
// producto, cantidad y en qué se pide. Las filas del mismo cliente y día forman un pedido.

/** Las columnas de la planilla, en el orden en que se bajan. Se reconocen por el título, en cualquier orden. */
export const COLUMNAS_DE_PEDIDOS = ["Fecha de entrega", "Cliente", "Código", "Producto", "Cantidad", "Unidad o envase", "Nota"] as const;

type Campo = "fecha" | "cliente" | "codigo" | "producto" | "cantidad" | "envase" | "nota";

const TITULOS: Readonly<Record<Campo, readonly string[]>> = {
  fecha: ["fecha de entrega", "fecha", "dia", "dia de entrega", "entrega"],
  cliente: ["cliente", "clientes"],
  codigo: ["codigo", "cod", "cod.", "codigo de producto", "codigo del producto"],
  producto: ["producto", "productos", "nombre", "nombre del producto", "descripcion"],
  cantidad: ["cantidad", "cant", "cant."],
  envase: ["unidad o envase", "envase", "unidad", "presentacion", "se pide por"],
  nota: ["nota", "notas", "observaciones", "observacion", "aclaracion"],
};

export interface FilaDePedido {
  /** Número de fila en la planilla (la primera es 1), para decir dónde está cada problema. */
  fila: number;
  fecha: string;
  cliente: string;
  codigo: string;
  producto: string;
  cantidad: string;
  envase: string;
  nota: string;
}

/**
 * Las filas de pedidos de una planilla: busca la fila de títulos (Cliente, Cantidad y Código o
 * Producto) y lee lo de abajo. Si el cliente o la fecha están vacíos, valen los de la fila de
 * arriba (para escribirlos una sola vez por pedido).
 */
export function filasDePedidos(planilla: readonly (readonly string[])[]): { filas: FilaDePedido[]; problema: string | null } {
  const tabla = leerTabla(planilla, TITULOS, (hay) => hay.has("cliente") && hay.has("cantidad") && (hay.has("codigo") || hay.has("producto")));
  if (!tabla) {
    return {
      filas: [],
      problema: "No encuentro los títulos de las columnas. La primera fila tiene que decir, por lo menos: Cliente, Código (o Producto) y Cantidad. Bajá la planilla modelo y copiá ahí los pedidos.",
    };
  }
  const filas: FilaDePedido[] = [];
  let cliente = "";
  let fecha = "";
  for (const f of tabla) {
    // Una fila que escribe un cliente nuevo sin fecha toma la fecha por defecto, no la del pedido anterior.
    if (f.cliente && f.cliente !== cliente) fecha = f.fecha;
    else if (f.fecha) fecha = f.fecha;
    if (f.cliente) cliente = f.cliente;
    filas.push({ ...f, fecha, cliente });
  }
  return { filas, problema: filas.length === 0 ? "La planilla no tiene ningún pedido debajo de los títulos." : null };
}

const esFechaReal = (anio: number, mes: number, dia: number): FechaISO | null => {
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return `${String(anio).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
};

/**
 * La fecha como la escribe la persona o como la guarda Excel: "07/10/2026", "7/10" (este año, o
 * el que viene si ya pasó hace rato), "2026-10-07" o el número de serie de Excel (46302).
 */
export function leerFechaDePlanilla(texto: string, hoy: FechaISO): FechaISO | null {
  const t = texto.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (iso) return esFechaReal(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dma = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(t);
  if (dma) {
    const dia = Number(dma[1]);
    const mes = Number(dma[2]);
    if (dma[3]) return esFechaReal(dma[3].length === 2 ? 2000 + Number(dma[3]) : Number(dma[3]), mes, dia);
    const esteAnio = esFechaReal(Number(hoy.slice(0, 4)), mes, dia);
    // "5/1" escrito en diciembre es del año que viene.
    return esteAnio && esteAnio < sumarDias(hoy, -180) ? esFechaReal(Number(hoy.slice(0, 4)) + 1, mes, dia) : esteAnio;
  }
  if (/^\d{4,6}(\.\d+)?$/.test(t)) {
    // Excel cuenta los días desde el 30/12/1899.
    const serie = Math.floor(Number(t));
    if (serie < 20000 || serie > 80000) return null;
    return sumarDias("1899-12-30", serie);
  }
  return null;
}

export interface ClienteDeCatalogo {
  id: string;
  nombre: string;
  /** Tiene cargado dónde se le entrega. */
  conLugar: boolean;
}

export interface ProductoDeCatalogo {
  id: string;
  codigo: string;
  nombre: string;
  unidadBase: UnidadMedida;
  admiteFraccion: boolean;
  presentaciones: readonly PresentacionDeVenta[];
}

export interface CatalogoParaPlanilla {
  hoy: FechaISO;
  /** El día que vale para las filas sin fecha. */
  fechaPorDefecto: FechaISO;
  cerrados: readonly FechaISO[];
  clientes: readonly ClienteDeCatalogo[];
  productos: readonly ProductoDeCatalogo[];
}

export interface LineaDePlanilla extends LineaElegida {
  producto: string;
  /** "2 × Cajón 18 kg", "5 kg". */
  texto: string;
}

export interface PedidoDePlanilla {
  fecha: FechaISO;
  clienteId: string;
  cliente: string;
  lineas: LineaDePlanilla[];
}

/**
 * Arma los pedidos de la planilla contra los clientes y productos que existen. Devuelve los
 * pedidos listos para cargar y, fila por fila, lo que no se entiende y cómo arreglarlo. Con
 * problemas no se carga nada: se corrige la planilla y se vuelve a subir.
 */
export function interpretarPedidos(filas: readonly FilaDePedido[], catalogo: CatalogoParaPlanilla): { pedidos: PedidoDePlanilla[]; problemas: ProblemaDePlanilla[] } {
  const problemas: ProblemaDePlanilla[] = [];
  const clientePorNombre = new Map(catalogo.clientes.map((c) => [normalizarBusqueda(c.nombre), c]));
  const productoPorCodigo = new Map(catalogo.productos.map((p) => [p.codigo.trim().toUpperCase(), p]));
  const productoPorNombre = new Map(catalogo.productos.map((p) => [normalizarBusqueda(p.nombre), p]));
  const grupos = new Map<string, { fecha: FechaISO; cliente: ClienteDeCatalogo; lineas: (LineaElegida & { producto: ProductoDeCatalogo })[] }>();

  for (const f of filas) {
    const falla = (mensaje: string) => problemas.push({ fila: f.fila, mensaje });

    if (!f.cliente) {
      falla("Falta el cliente.");
      continue;
    }
    const cliente = clientePorNombre.get(normalizarBusqueda(f.cliente));
    if (!cliente) {
      const sugerido = parecido(f.cliente, catalogo.clientes.map((c) => c.nombre));
      falla(`No hay ningún cliente que se llame “${f.cliente}”.${sugerido ? ` ¿Quisiste decir “${sugerido}”?` : ""} Escribilo igual que en Clientes, o crealo antes.`);
      continue;
    }
    if (!cliente.conLugar) {
      falla(`${cliente.nombre} no tiene cargado dónde se le entrega: agregale una dirección en su ficha.`);
      continue;
    }

    const fecha = f.fecha ? leerFechaDePlanilla(f.fecha, catalogo.hoy) : catalogo.fechaPorDefecto;
    if (!fecha) {
      falla(`No entiendo la fecha “${f.fecha}”: escribila como 07/10/2026 (o dejala vacía para usar el día elegido).`);
      continue;
    }
    if (fecha < catalogo.hoy) {
      falla(`La fecha ${fecha.slice(8, 10)}/${fecha.slice(5, 7)}/${fecha.slice(0, 4)} ya pasó: los pedidos se cargan para hoy o más adelante.`);
      continue;
    }
    if (catalogo.cerrados.includes(fecha)) {
      falla(`El día ${fecha.slice(8, 10)}/${fecha.slice(5, 7)} ya está cerrado: elegí otro día.`);
      continue;
    }

    let producto: ProductoDeCatalogo | undefined;
    if (f.codigo) {
      producto = productoPorCodigo.get(f.codigo.trim().toUpperCase());
      if (!producto) {
        const porNombre = f.producto ? productoPorNombre.get(normalizarBusqueda(f.producto)) : undefined;
        falla(`No hay ningún producto con el código “${f.codigo}”.${porNombre ? ` ${porNombre.nombre} tiene el código ${porNombre.codigo}.` : " Fijate el código en Productos (o en la hoja “Productos” de la planilla modelo)."}`);
        continue;
      }
    } else if (f.producto) {
      producto = productoPorNombre.get(normalizarBusqueda(f.producto));
      if (!producto) {
        const sugerido = parecido(f.producto, catalogo.productos.map((p) => p.nombre));
        falla(`No hay ningún producto que se llame “${f.producto}”.${sugerido ? ` ¿Quisiste decir “${sugerido}”?` : ""} Usá su código o escribilo igual que en Productos.`);
        continue;
      }
    } else {
      falla("Falta el producto: escribí su código o su nombre.");
      continue;
    }

    const cantidad = leerCantidad(f.cantidad);
    if (!cantidad) {
      falla(f.cantidad ? `${producto.nombre}: “${f.cantidad}” no es una cantidad. Escribí un número mayor que 0, por ejemplo 2 o 2,5.` : `${producto.nombre}: falta la cantidad.`);
      continue;
    }

    const unidad = ABREVIATURA_UNIDAD[producto.unidadBase];
    const envase = normalizarBusqueda(f.envase);
    let presentacion: PresentacionDeVenta | null = null;
    if (envase && !NOMBRES_DE_UNIDAD[producto.unidadBase].includes(envase)) {
      presentacion = producto.presentaciones.find((x) => !x.esUnidadBase && normalizarBusqueda(x.nombre) === envase) ?? null;
      if (!presentacion) {
        const envases = producto.presentaciones.filter((x) => !x.esUnidadBase).map((x) => x.nombre);
        falla(`${producto.nombre}: “${f.envase}” no es una forma de pedirlo. Poné ${unidad}${envases.length ? ` o uno de sus envases (${envases.join(", ")})` : ""}, o dejá la columna vacía.`);
        continue;
      }
    }
    const factor = presentacion?.factor ?? "1";
    if (!cantidadPermitida(cantidad, factor, producto.admiteFraccion)) {
      falla(`${producto.nombre} se pide en unidades enteras: poné una cantidad sin coma (dice ${f.cantidad}).`);
      continue;
    }

    const clave = `${fecha}:${cliente.id}`;
    const grupo = grupos.get(clave) ?? { fecha, cliente, lineas: [] };
    grupo.lineas.push({ productoId: producto.id, presentacionId: presentacion?.id ?? null, cantidad, observaciones: f.nota.trim().slice(0, 200) || null, producto });
    grupos.set(clave, grupo);
  }

  const pedidos = [...grupos.values()].map((g): PedidoDePlanilla => {
    const porProducto = new Map(g.lineas.map((l) => [l.productoId, l.producto]));
    return {
      fecha: g.fecha,
      clienteId: g.cliente.id,
      cliente: g.cliente.nombre,
      lineas: juntarLineas(g.lineas.map((l) => ({ productoId: l.productoId, presentacionId: l.presentacionId, cantidad: l.cantidad, observaciones: l.observaciones }))).map((l) => {
        const p = porProducto.get(l.productoId)!;
        const pres = p.presentaciones.find((x) => x.id === l.presentacionId) ?? { nombre: ABREVIATURA_UNIDAD[p.unidadBase], esUnidadBase: true };
        return { ...l, producto: p.nombre, texto: textoCantidad(dec(l.cantidad).toString(), pres, p.unidadBase) };
      }),
    };
  });
  return { pedidos: pedidos.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.cliente.localeCompare(b.cliente, "es")), problemas };
}
