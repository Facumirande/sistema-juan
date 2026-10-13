import { asc, eq } from "drizzle-orm";

import { empresa, proveedor } from "@/db/esquema";
import type { BaseDatos } from "@/db/tipos";
import { leerCircuitos, revisarCircuitos, type CircuitoDeCompra } from "@/dominio/compras/circuitos";
import { ErrorDeNegocio } from "@/dominio/errores";
import { registrarActividad } from "@/modulos/colaboracion/registro";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";

// Los circuitos de compra del negocio (RN-201): se guardan con la empresa (`empresa.circuitos_compra`),
// como quién se encarga de cada paso. Los ve quien ve la lista de compras y los arma quien la edita.

export interface CircuitosDelNegocio {
  circuitos: CircuitoDeCompra[];
  /** Los puestos que se pueden poner en un circuito, por dónde quedan en el mercado. */
  puestos: { id: string; nombre: string; ubicacion: string | null }[];
}

/** Los circuitos armados y los puestos para armarlos (una sola ida a la base). */
export async function circuitosDeCompra(db: BaseDatos, authUserId: string): Promise<CircuitosDelNegocio> {
  return ejecutarComoUsuario(db, authUserId, "lista_compra.ver", async (tx) => {
    const [[e], puestos] = await Promise.all([
      tx.select({ circuitos: empresa.circuitosCompra }).from(empresa),
      tx.select({ id: proveedor.id, nombre: proveedor.nombre, ubicacion: proveedor.ubicacionMercado }).from(proveedor).where(eq(proveedor.activo, true)).orderBy(asc(proveedor.nombre)),
    ]);
    const activos = new Set(puestos.map((p) => p.id));
    // Un puesto dado de baja sale solo de los circuitos donde estaba.
    return { circuitos: leerCircuitos(e?.circuitos).map((c) => ({ ...c, paradas: c.paradas.filter((id) => activos.has(id)) })), puestos };
  });
}

/** Guarda todos los circuitos juntos, como quedaron en la pantalla (los que no vienen se quitan). */
export async function guardarCircuitos(db: BaseDatos, authUserId: string, propuestos: readonly { id: string; nombre: string; paradas: readonly string[] }[]): Promise<CircuitoDeCompra[]> {
  return ejecutarComoUsuario(db, authUserId, "lista_compra.editar", async (tx, c) => {
    const puestos = await tx.select({ id: proveedor.id }).from(proveedor).where(eq(proveedor.activo, true));
    const revisado = revisarCircuitos(propuestos, new Set(puestos.map((p) => p.id)));
    if ("error" in revisado) throw new ErrorDeNegocio("VALIDACION", revisado.error);
    await Promise.all([
      tx.update(empresa).set({ circuitosCompra: revisado.circuitos, actualizadoPor: c.usuarioId }).where(eq(empresa.id, c.empresaId)),
      registrarActividad(tx, c, {
        accion: "MODIFICAR",
        entidadTipo: "LISTA_COMPRA",
        resumen: revisado.circuitos.length === 0 ? "quitó los circuitos de compra" : `armó ${revisado.circuitos.length === 1 ? `el circuito de compra “${revisado.circuitos[0]!.nombre}”` : `los circuitos de compra (${revisado.circuitos.map((x) => x.nombre).join(", ")})`}`,
      }),
    ]);
    return revisado.circuitos;
  });
}

/**
 * El orden de las paradas de hoy, acomodado desde "Recorrido de compra" (RN-203): se guarda en el
 * circuito elegido, así queda para los días que siguen. Los puestos de hoy pasan adelante en ese orden
 * y los demás del circuito conservan el suyo, detrás. Si todavía no hay circuito (o ese ya no existe),
 * se crea uno con ese orden.
 */
export async function ordenarParadas(db: BaseDatos, authUserId: string, datos: { circuitoId: string; paradas: readonly string[] }): Promise<CircuitoDeCompra[]> {
  return ejecutarComoUsuario(db, authUserId, "lista_compra.editar", async (tx, c) => {
    const [[e], puestos] = await Promise.all([tx.select({ circuitos: empresa.circuitosCompra }).from(empresa), tx.select({ id: proveedor.id }).from(proveedor).where(eq(proveedor.activo, true))]);
    const actuales = leerCircuitos(e?.circuitos);
    const nombres = new Set(actuales.map((x) => x.nombre.toLowerCase()));
    let nombre = "Mi recorrido";
    for (let n = 2; nombres.has(nombre.toLowerCase()); n++) nombre = `Mi recorrido ${n}`;
    const propuestos = actuales.some((x) => x.id === datos.circuitoId)
      ? actuales.map((x) => (x.id === datos.circuitoId ? { ...x, paradas: [...datos.paradas, ...x.paradas.filter((id) => !datos.paradas.includes(id))] } : x))
      : [...actuales, { id: datos.circuitoId, nombre, paradas: [...datos.paradas] }];
    const revisado = revisarCircuitos(propuestos, new Set(puestos.map((p) => p.id)));
    if ("error" in revisado) throw new ErrorDeNegocio("VALIDACION", revisado.error);
    await tx.update(empresa).set({ circuitosCompra: revisado.circuitos, actualizadoPor: c.usuarioId }).where(eq(empresa.id, c.empresaId));
    return revisado.circuitos;
  });
}
