import { redirect } from "next/navigation";

import { obtenerBaseDatos } from "@/db/cliente";
import { jornadaEnCurso } from "@/modulos/pedidos/jornadas";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";

/** El menú lleva a la preparación del día en curso. */
export default async function Preparacion() {
  const sesion = await sesionParaPantalla("preparacion.ver");
  redirect(`/preparacion/${await jornadaEnCurso(obtenerBaseDatos(), sesion.authUserId)}`);
}
