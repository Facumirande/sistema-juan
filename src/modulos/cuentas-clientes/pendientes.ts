import { count, gt } from "drizzle-orm";

import { proveedor } from "@/db/esquema";
import type { BaseDatos } from "@/db/tipos";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";

import { cuentasDeClientes } from "./cuentas";

// Los números del menú junto a "A cobrar" y "A pagar" (pedido del usuario, 08/10/2026): cuántos
// clientes deben algo y a cuántos proveedores se les debe. Nulo donde la persona no puede verlo.

export interface PendientesDelMenu {
  /** Clientes con algo para cobrarles. */
  aCobrar: number | null;
  /** Proveedores a los que se les debe algo. */
  aPagar: number | null;
}

export async function pendientesDelMenu(db: BaseDatos, authUserId: string): Promise<PendientesDelMenu> {
  return ejecutarComoUsuario(db, authUserId, null, async (tx, c) => {
    const verCobrar = c.permisos.tiene("cobranzas.ver");
    const verPagar = c.permisos.tiene("pagos.ver");
    // Todo sale junto: una ida a la base.
    const [cuentas, [pagar]] = await Promise.all([
      verCobrar ? cuentasDeClientes(tx) : Promise.resolve([]),
      verPagar ? tx.select({ n: count() }).from(proveedor).where(gt(proveedor.saldoActual, "0")) : Promise.resolve([{ n: 0 }]),
    ]);
    return {
      aCobrar: verCobrar ? cuentas.filter((x) => x.cuenta.aCobrar.gt(0)).length : null,
      aPagar: verPagar ? Number(pagar?.n ?? 0) : null,
    };
  });
}
