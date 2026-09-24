import type { Metadata } from "next";

import { hoyEnEmpresa, formatearFecha } from "@/dominio/fechas/fechas";
import { obtenerSesion } from "@/modulos/seguridad/sesion";

export const metadata: Metadata = { title: "Tablero · Sistema Juan" };

/** P-02 Tablero. Por ahora muestra la sesión; los bloques de 08 §5.1 se agregan con cada iteración. */
export default async function Tablero() {
  const sesion = await obtenerSesion();
  if (!sesion) return null;
  const hoy = formatearFecha(hoyEnEmpresa(new Date(), sesion.zonaHoraria));

  return (
    <section className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Hola, {sesion.nombre}</h1>
      <p className="text-texto-suave">Hoy es {hoy}.</p>
      <div className="rounded-lg border border-borde bg-superficie p-4">
        <p className="font-medium">Tus roles: {sesion.roles.join(", ") || "ninguno"}</p>
        <p className="text-texto-suave">
          El tablero con pedidos, compras, proveedores y alertas se completa a medida que se construyen los módulos.
        </p>
      </div>
    </section>
  );
}
