import { cache } from "react";

import { obtenerBaseDatos } from "@/db/cliente";
import { procesoEnCurso } from "@/modulos/jornadas/dia";
import type { Permiso } from "@/seguridad/catalogo-permisos";
import { EnlaceDeMenu } from "@/ui/enlace-menu";
import { EtapasVivas, type EtapaVisible } from "@/ui/etapas-vivas";
import type { ItemMenu } from "@/ui/navegacion";

// Las etapas del día en el menú de la izquierda (pedido del usuario, 06/10/2026): cada una se abre
// directo, sin cargar el tablero. Son las del día elegido en el tablero (o en otra pantalla del día,
// 08/10/2026). Acá se buscan las que llegan con la pantalla (aparte, con Suspense, para no
// demorarla); de ahí en más las lleva `EtapasVivas` en el navegador, que cambia de día en el momento
// y pide solo lo suyo (`/etapas`). Sin un día en curso se ven los enlaces de siempre.

/** Una sola consulta por pedido aunque el menú se dibuje dos veces (celular y computadora). */
const proceso = cache((authUserId: string, dia: string | null) =>
  procesoEnCurso(obtenerBaseDatos(), authUserId, dia).catch((error: unknown) => {
    console.error("No se pudieron leer las etapas del día:", error);
    return null;
  }),
);

/** Qué permiso hace falta para abrir cada etapa, en el orden en que se muestran. */
const PERMISO_DE_ETAPA: readonly (readonly [EtapaVisible, Permiso])[] = [
  ["lista", "lista_compra.ver"],
  ["preparacion", "preparacion.ver"],
  ["remitos", "documentos.imprimir_entrega"],
  ["viaje", "repartos.ver"],
  ["cierre", "jornada.cerrar"],
];

/** Los enlaces de las etapas sin día en curso (los de siempre, sueltos). */
export function EtapasSueltas({ items }: { items: readonly ItemMenu[] }) {
  return items.map((item) => <EnlaceDeMenu key={item.pantalla} href={item.ruta} icono={item.icono} etiqueta={item.etiqueta} />);
}

export async function EtapasDelDia({ authUserId, permisos, items, dia, hoy }: { authUserId: string; permisos: readonly Permiso[]; items: readonly ItemMenu[]; dia: string | null; hoy: string }) {
  const sueltas = <EtapasSueltas items={items} />;
  if (!permisos.includes("jornada.ver")) return sueltas;
  const p = await proceso(authUserId, dia);
  const permitidas = PERMISO_DE_ETAPA.filter(([, permiso]) => permisos.includes(permiso)).map(([clave]) => clave);
  return <EtapasVivas inicial={p ? { fecha: p.fecha, etapas: p.etapas } : null} hoy={hoy} permitidas={permitidas} sueltas={sueltas} />;
}
