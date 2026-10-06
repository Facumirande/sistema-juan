import { cache } from "react";

import { obtenerBaseDatos } from "@/db/cliente";
import type { ClaveEtapa } from "@/dominio/jornadas/etapas";
import { procesoEnCurso } from "@/modulos/jornadas/dia";
import type { Permiso } from "@/seguridad/catalogo-permisos";
import { EnlaceDeEtapa, EnlaceDeMenu } from "@/ui/enlace-menu";
import { fechaConDia } from "@/ui/etiquetas";
import { ICONO_NAVEGACION, type ItemMenu } from "@/ui/navegacion";

// Las etapas del día en curso en el menú de la izquierda (pedido del usuario, 06/10/2026): cada
// una se abre directo, sin cargar el tablero. Se buscan aparte (con Suspense) para no demorar la
// pantalla; mientras tanto, y si no hay un día en curso, se ven los enlaces de siempre.

/** Una sola consulta por pedido aunque el menú se dibuje dos veces (celular y computadora). */
const proceso = cache((authUserId: string) =>
  procesoEnCurso(obtenerBaseDatos(), authUserId).catch((error: unknown) => {
    console.error("No se pudieron leer las etapas del día:", error);
    return null;
  }),
);

const ETAPAS: Readonly<Record<Exclude<ClaveEtapa, "pedidos">, { etiqueta: string; icono: string; permiso: Permiso; ruta: (fecha: string) => string }>> = {
  lista: { etiqueta: "Lista de compras", icono: "🛒", permiso: "lista_compra.ver", ruta: (f) => `/lista-compra?fecha=${f}` },
  preparacion: { etiqueta: "Preparación", icono: "📦", permiso: "preparacion.ver", ruta: (f) => `/preparacion/${f}` },
  remitos: { etiqueta: "Remitos", icono: "🧾", permiso: "documentos.imprimir_entrega", ruta: (f) => `/entregas/remitos?fecha=${f}` },
  viaje: { etiqueta: "Logística y entregas", icono: ICONO_NAVEGACION, permiso: "repartos.ver", ruta: (f) => `/viaje?fecha=${f}` },
  cierre: { etiqueta: "Cierre del día", icono: "🔒", permiso: "jornada.cerrar", ruta: (f) => `/jornadas/${f}/cierre` },
};

/** Los enlaces de las etapas sin día en curso (los de siempre, sueltos). */
export function EtapasSueltas({ items }: { items: readonly ItemMenu[] }) {
  return items.map((item) => <EnlaceDeMenu key={item.pantalla} href={item.ruta} icono={item.icono} etiqueta={item.etiqueta} />);
}

export async function EtapasDelDia({ authUserId, permisos, items }: { authUserId: string; permisos: readonly Permiso[]; items: readonly ItemMenu[] }) {
  const p = permisos.includes("jornada.ver") ? await proceso(authUserId) : null;
  if (!p) return <EtapasSueltas items={items} />;
  const etapas = p.etapas.filter((e): e is typeof e & { clave: keyof typeof ETAPAS } => e.clave !== "pedidos" && permisos.includes(ETAPAS[e.clave as keyof typeof ETAPAS].permiso));
  if (etapas.length === 0) return <EtapasSueltas items={items} />;
  return (
    <div className="mt-1 mb-1 ml-3 flex flex-col gap-0.5 border-l-2 border-borde pl-2" role="group" aria-label={`Etapas del ${fechaConDia(p.fecha)}`}>
      <p className="px-1 pb-1 text-xs font-semibold text-texto-suave">
        {p.fecha === p.hoy ? "Hoy" : "Día"} {p.fecha.slice(8, 10)}/{p.fecha.slice(5, 7)} · etapas
      </p>
      {etapas.map((e) => {
        const def = ETAPAS[e.clave];
        return <EnlaceDeEtapa key={e.clave} href={def.ruta(p.fecha)} icono={def.icono} etiqueta={def.etiqueta} estado={e.estado} detalle={e.detalle} />;
      })}
    </div>
  );
}
