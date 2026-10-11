import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { hoyEnEmpresa, sumarDias } from "@/dominio/fechas/fechas";
import { viajeDelDia } from "@/modulos/entregas/viaje";
import { jornadaEnCurso } from "@/modulos/pedidos/jornadas";
import { diaElegido } from "@/ui/dia-elegido";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { BotonAccion } from "@/ui/boton-accion";
import { fechaConDia } from "@/ui/etiquetas";
import { FechaGrande } from "@/ui/fecha-grande";
import { Encabezado, Tarjeta, clasesBoton } from "@/ui/formularios";
import { FlechaNavegacion } from "@/ui/iconos";
import { parametro } from "@/ui/parametros";

import { salirAccion } from "../repartos/acciones";

import { ubicarPuntoAccion, ubicarSalidaAccion } from "./acciones";
import { Recorrido, type Destino } from "./recorrido";
import { MarcarUbicacion } from "./ubicacion";

export const metadata: Metadata = { title: "Logística · Sistema Repartos" };

/**
 * P-78b Logística: el recorrido del día en una sola lista (lo que está en camino y los destinos que
 * se le suman), con su orden, los kilómetros, el GPS y el botón para entregar. Lo que todavía no
 * salió queda aparte, plegado.
 */
export default async function PaginaViaje({ searchParams }: PageProps<"/viaje">) {
  const sesion = await sesionParaPantalla("repartos.ver");
  const db = obtenerBaseDatos();
  const pedida = parametro((await searchParams).fecha);
  const fecha = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : ((await diaElegido()) ?? (await jornadaEnCurso(db, sesion.authUserId)));
  const { salida, paradas, recorrido, favoritos, cerrado } = await viajeDelDia(db, sesion.authUserId, fecha);
  const puedeGestionar = sesion.permisos.includes("repartos.gestionar") && !cerrado;
  const puedeEntregar = sesion.permisos.includes("entregas.confirmar");
  const aca = `/viaje?fecha=${fecha}`;

  const destinos: Destino[] = recorrido.map((d) => ({
    clave: d.clave,
    tipo: d.tipo,
    id: d.id,
    nombre: d.nombre,
    punto: d.punto,
    direccion: d.direccion,
    localidad: d.localidad,
    horario: d.horario,
    coordenada: d.coordenada,
    telefono: d.telefono,
    hecha: d.hecha,
    entregar: d.tipo === "ENTREGA" && !d.hecha && puedeEntregar ? `/repartos/mios/entrega/${d.id}?volver=${encodeURIComponent(aca)}` : null,
    enlaces: d.tipo === "ENTREGA" && d.numero ? [{ texto: d.numero, href: `/entregas/${d.id}` }] : [],
    favorito: d.favoritoId !== null,
    quitar: d.tipo === "EXTRA" && puedeGestionar ? "extra" : null,
  }));

  // Lo que todavía no salió: las entregas que se están preparando, con o sin reparto armado.
  const sinSalir = paradas.filter((p) => p.estado !== "EN_REPARTO");
  const sueltas: Destino[] = sinSalir
    .filter((p) => !p.repartoId)
    .map((p) => ({ clave: p.entregaId, tipo: "ENTREGA", id: p.entregaId, nombre: p.cliente, punto: p.punto, direccion: p.direccion, localidad: p.localidad, horario: p.horario, coordenada: p.coordenada, telefono: p.telefono, hecha: false }));
  const repartos = [...new Map(paradas.filter((p) => p.repartoId).map((p) => [p.repartoId!, p.reparto!])).entries()].map(([id, numero]) => {
    const suyas = paradas.filter((p) => p.repartoId === id);
    return { id, numero, paradas: suyas, enCamino: suyas.some((p) => p.estado === "EN_REPARTO"), listo: suyas.every((p) => p.estado === "PREPARADA") };
  });
  // Los lugares a los que hay que ir y todavía no tienen su ubicación marcada, cada uno una sola vez.
  const sinUbicar = [...new Map(paradas.filter((p) => !p.coordenada).map((p) => [p.puntoId, p])).values()];

  return (
    <section className="flex max-w-4xl flex-col gap-5">
      <Encabezado titulo="Logística" descripcion={`El recorrido del ${fechaConDia(fecha)}: a dónde hay que ir, en qué orden y el GPS para llegar.`}>
        <Link href={`/inicio?fecha=${fecha}`} className={clasesBoton("principal")}>
          ← Volver al tablero
        </Link>
      </Encabezado>
      <div className="flex flex-wrap items-center gap-2">
        <FechaGrande fecha={fecha} hoy={hoyEnEmpresa(new Date(), sesion.zonaHoraria)} />
        <nav aria-label="Día" className="flex gap-2">
          <Link href={`/viaje?fecha=${sumarDias(fecha, -1)}`} className={clasesBoton("secundario")} aria-label="Día anterior">
            ←
          </Link>
          <Link href={`/viaje?fecha=${sumarDias(fecha, 1)}`} className={clasesBoton("secundario")} aria-label="Día siguiente">
            →
          </Link>
        </nav>
      </div>

      <div id="recorrido">
        <Tarjeta
          titulo={
            <span className="flex items-center gap-2 text-xl">
              <FlechaNavegacion /> Recorrido
            </span>
          }
        >
          <Recorrido
            destinos={destinos}
            salida={salida}
            guardar={puedeGestionar ? { tipo: "dia", fecha } : null}
            agregar={puedeGestionar ? { fecha, favoritos } : null}
            vacio={cerrado ? "Ese día no tuvo recorrido." : "Todavía no hay nada en camino: cuando un pedido sale, aparece acá."}
          />
        </Tarjeta>
      </div>

      {sinUbicar.length > 0 && (
        <details className="color-amarillo rounded-2xl bg-[var(--col)] p-4 text-[var(--col-texto)]">
          <summary className="cursor-pointer text-lg font-bold">📍 {sinUbicar.length === 1 ? "Falta marcar la ubicación de 1 lugar" : `Falta marcar la ubicación de ${sinUbicar.length} lugares`}</summary>
          <p className="mt-2 font-medium">Sin eso no se calculan los kilómetros hasta ahí (el GPS igual busca la dirección escrita). Tocá cada uno:</p>
          <ul className="mt-3 flex flex-col gap-2">
            {sinUbicar.map((p) => (
              <li key={p.puntoId}>
                <details className="rounded-xl bg-superficie p-3 text-texto">
                  <summary className="min-h-10 cursor-pointer">
                    <b>{p.cliente}</b>
                    {p.punto && p.punto !== p.cliente && ` · ${p.punto}`}
                    <span className="text-texto-suave">
                      {" "}
                      · {p.direccion || "sin dirección escrita"}
                      {p.localidad && `, ${p.localidad}`}
                    </span>{" "}
                    <span className="font-semibold text-marca">Marcar dónde queda</span>
                  </summary>
                  <div className="mt-3">
                    <MarcarUbicacion accion={ubicarPuntoAccion} campos={{ puntoId: p.puntoId }} actual={null} direccion={[p.direccion, p.localidad].filter(Boolean).join(", ")} titulo={`Ubicación de ${p.cliente}`} centro={salida.coordenada} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </details>
      )}

      {(repartos.length > 0 || sueltas.length > 0) && (
        <details className="rounded-2xl border border-borde bg-superficie p-4" open={recorrido.length === 0 && sinSalir.length > 0}>
          <summary className="cursor-pointer text-lg font-semibold">
            {sinSalir.length > 0 ? `📦 Todavía no ${sinSalir.length === 1 ? "salió 1 entrega" : `salieron ${sinSalir.length} entregas`}` : `Repartos del día (${repartos.length})`}
          </summary>
          <div className="mt-3 flex flex-col gap-4">
            {repartos.length > 0 && (
              <ul className="flex flex-col gap-2">
                {repartos.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-borde p-3">
                    <span className="min-w-0">
                      <span className="block font-semibold">
                        {r.numero} · {r.paradas.length === 1 ? "1 parada" : `${r.paradas.length} paradas`} · {r.enCamino ? "🚚 en camino" : r.listo ? "✓ listo para salir" : "preparándose"}
                      </span>
                      <span className="block text-sm text-texto-suave">{r.paradas.map((p) => p.cliente).join(", ")}</span>
                    </span>
                    <span className="flex flex-wrap gap-2">
                      {!r.enCamino && r.listo && puedeGestionar && (
                        <BotonAccion accion={salirAccion} datos={{ repartoId: r.id }} confirmar="¿Sale el reparto? Sus pedidos pasan a En camino." className={clasesBoton("principal")}>
                          🚚 Salir
                        </BotonAccion>
                      )}
                      <Link href={`/repartos/${r.id}`} className={clasesBoton("secundario")}>
                        Abrir el reparto
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {sueltas.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="font-semibold">Entregas sin reparto: se les puede armar uno con este orden (o mandarlas desde el tablero con “Sale ahora”).</p>
                <Recorrido destinos={sueltas} salida={salida} guardar={puedeGestionar ? { tipo: "armar", fecha } : null} />
              </div>
            )}
          </div>
        </details>
      )}

      {sesion.permisos.includes("configuracion.editar") && (
        <details className="rounded-2xl border border-borde bg-superficie p-4" open={!salida.coordenada}>
          <summary className="cursor-pointer text-lg font-semibold">
            🏬 De dónde salen los repartos {salida.coordenada ? <span className="font-normal text-texto-suave">· {salida.direccion ?? "marcado"} · cambiar</span> : <span className="text-error">· falta marcarlo</span>}
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            <p className="text-texto-suave">El depósito o el mercado. Se marca una sola vez y sirve para calcular los kilómetros y el mejor orden de todos los días.</p>
            <MarcarUbicacion accion={ubicarSalidaAccion} campos={{}} actual={salida.coordenada} direccion={salida.direccion ?? ""} titulo="Lugar de salida" guardaDireccion />
          </div>
        </details>
      )}
    </section>
  );
}
