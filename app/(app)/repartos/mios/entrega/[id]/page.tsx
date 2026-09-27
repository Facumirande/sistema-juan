import type { Metadata } from "next";

import { obtenerBaseDatos } from "@/db/cliente";
import { entregaParaConfirmar } from "@/modulos/entregas/entregas";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { cargarFicha, idDeRuta } from "@/ui/accion-servidor";
import { ESTADOS_ENTREGA } from "@/ui/etiquetas";
import { Aviso, Encabezado, clasesBoton } from "@/ui/formularios";

import { FormulariosConfirmacion } from "../../../../entregas/confirmacion";

export const metadata: Metadata = { title: "Confirmar entrega · Sistema Juan" };

/** P-78 Confirmar entrega (celular del repartidor), sin precios. */
export default async function ConfirmarEntrega({ params }: PageProps<"/repartos/mios/entrega/[id]">) {
  const sesion = await sesionParaPantalla("entregas.confirmar");
  const e = await cargarFicha(entregaParaConfirmar(obtenerBaseDatos(), sesion.authUserId, idDeRuta((await params).id)));
  const mapa = `https://www.google.com/maps/search/?api=1&query=${e.latitud && e.longitud ? `${e.latitud},${e.longitud}` : encodeURIComponent(e.direccion)}`;

  return (
    <section className="flex max-w-xl flex-col gap-4">
      <Encabezado
        titulo={e.cliente}
        volver={{ ruta: "/repartos/mios", texto: "Mi reparto" }}
        descripcion={[e.punto, e.direccion, e.horario && `recibe ${e.horario}`, e.orden && `parada ${e.orden}`].filter(Boolean).join(" · ")}
      />
      <div className="flex flex-wrap gap-2">
        {e.telefono && (
          <a href={`tel:${e.telefono.replace(/[^\d+]/g, "")}`} className={clasesBoton("secundario")}>
            Llamar{e.contacto ? ` a ${e.contacto}` : ""}
          </a>
        )}
        <a href={mapa} target="_blank" rel="noreferrer" className={clasesBoton("secundario")}>
          Mapa
        </a>
      </div>
      {e.instrucciones && <p>📝 {e.instrucciones}</p>}
      {e.estado === "EN_REPARTO" || e.estado === "PREPARADA" ? (
        <FormulariosConfirmacion entregaId={e.id} lineas={e.lineas} volver="/repartos/mios" requiereFirma={e.requiereFirma} />
      ) : (
        <Aviso>
          Esta entrega está {ESTADOS_ENTREGA[e.estado]?.toLowerCase()}
          {e.recibidoPor && ` (recibió ${e.recibidoPor})`}.
        </Aviso>
      )}
    </section>
  );
}
