import { cache } from "react";

import { obtenerBaseDatos } from "@/db/cliente";
import { pendientesDelMenu } from "@/modulos/cuentas-clientes/pendientes";

// El número junto a "A cobrar" y "A pagar" en el menú: cuántos clientes deben y a cuántos proveedores
// se les debe. Se busca aparte (con Suspense) para no demorar la pantalla y se pone al día solo.

/** Una sola consulta por pedido aunque el menú se dibuje dos veces (celular y computadora). */
const pendientes = cache((authUserId: string) =>
  pendientesDelMenu(obtenerBaseDatos(), authUserId).catch((error: unknown) => {
    console.error("No se pudieron contar los pendientes del menú:", error);
    return { aCobrar: null, aPagar: null };
  }),
);

export async function InsigniaDePendientes({ authUserId, cual }: { authUserId: string; cual: "aCobrar" | "aPagar" }) {
  const n = (await pendientes(authUserId))[cual];
  if (!n) return null;
  const texto = cual === "aCobrar" ? (n === 1 ? "1 cliente debe" : `${n} clientes deben`) : n === 1 ? "Se le debe a 1 proveedor" : `Se les debe a ${n} proveedores`;
  return (
    <span
      title={texto}
      aria-label={texto}
      className={`inline-block h-6 min-w-6 shrink-0 rounded-full px-1.5 text-center text-sm leading-6 font-extrabold tabular-nums ${
        cual === "aCobrar" ? "bg-[var(--etiqueta-azul)] text-etiqueta-texto" : "bg-[var(--vence-fondo)] text-[var(--vence-texto)]"
      }`}
    >
      {n}
    </span>
  );
}
