import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { formatearFechaHora, hoyEnEmpresa, sumarDias } from "@/dominio/fechas/fechas";
import { remitosDelDia, type RemitoDelDia } from "@/modulos/entregas/entregas";
import { jornadaEnCurso } from "@/modulos/pedidos/jornadas";
import { diaElegido } from "@/ui/dia-elegido";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { FechaGrande } from "@/ui/fecha-grande";
import { Encabezado, clasesBoton } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";

export const metadata: Metadata = { title: "Remitos · Sistema Repartos" };

const ESTADO: Readonly<Record<string, { texto: string; clases: string }>> = {
  BORRADOR: { texto: "Sin preparar", clases: "bg-fondo text-texto-suave" },
  EN_PREPARACION: { texto: "Preparándose", clases: "bg-[var(--pastel-amarillo)] text-[var(--pastel-amarillo-texto)]" },
  PREPARADA: { texto: "Listo para salir", clases: "bg-[var(--listo-fondo)] text-[var(--listo-texto)]" },
  EN_REPARTO: { texto: "🚚 En camino", clases: "bg-[var(--pastel-verde)] text-[var(--pastel-verde-texto)]" },
  ENTREGADA: { texto: "✅ Entregado", clases: "bg-[var(--pastel-verde)] text-[var(--pastel-verde-texto)]" },
};

function TarjetaRemito({ r, fecha, zona, puede }: { r: RemitoDelDia; fecha: string; zona: string; puede: { contable: boolean; preparar: boolean; entrega: boolean } }) {
  const doc = `/entregas/${r.entregaId}/documento`;
  return (
    <li className={`flex flex-col gap-3 rounded-2xl border-2 bg-superficie p-4 ${r.hecho ? "border-[var(--listo-fondo)]" : "border-borde"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xl font-semibold">🧾 {r.cliente}</p>
          <p className="text-sm text-texto-suave">
            {r.punto} · {r.numero}
            {r.reparto && ` · ${r.reparto}${r.orden ? `, parada ${r.orden}` : ""}`}
            {r.bultos !== null && ` · ${r.bultos} bultos`}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${ESTADO[r.estado]?.clases ?? ""}`}>{ESTADO[r.estado]?.texto ?? r.estado}</span>
      </div>
      {r.hecho ? (
        <>
          <p className="text-sm text-texto-suave">Remito hecho{r.emitidoEn && ` el ${formatearFechaHora(r.emitidoEn, zona)}`}. Va sin precios: es el que firma el cliente.</p>
          <div className="flex flex-wrap gap-2">
            <Link href={`${doc}/lista-entrega`} className={clasesBoton("secundario")}>
              👁 Ver
            </Link>
            <Link href={`${doc}/lista-entrega?imprimir=1`} className={clasesBoton("principal")}>
              🖨️ Imprimir
            </Link>
            <Link href={`${doc}/lista-entrega?copias=2&imprimir=1`} className={clasesBoton("secundario")}>
              🖨️ 2 copias
            </Link>
            {puede.contable && (
              <Link href={`${doc}/lista-contable`} className={clasesBoton("secundario")}>
                💲 Con precios
              </Link>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="rounded-lg bg-[var(--pastel-naranja)] px-3 py-2 text-sm font-semibold text-[var(--pastel-naranja-texto)]">
            {r.desactualizado
              ? "El pedido cambió después del remito: hay que rehacerlo."
              : r.estado === "PREPARADA"
                ? "Preparado pero sin remito: suele faltar un precio."
                : "Se hace solo al marcar preparado este pedido."}
          </p>
          <div className="flex flex-wrap gap-2">
            {r.estado === "PREPARADA" || r.desactualizado ? (
              puede.entrega && (
                <Link href={`/entregas/${r.entregaId}`} className={clasesBoton("principal")}>
                  Ver qué falta y hacerlo
                </Link>
              )
            ) : (
              puede.preparar && (
                <Link href={`/preparacion/${fecha}/entrega/${r.entregaId}`} className={clasesBoton("principal")}>
                  📦 Ir a prepararlo
                </Link>
              )
            )}
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * P-81 Remitos del día (pedido del usuario, 06/10/2026: darles importancia y que se puedan ver e
 * imprimir fácil): una tarjeta por cliente con su remito para ver o imprimir (una o dos copias), y
 * todos juntos en el orden del reparto.
 */
export default async function Remitos({ searchParams }: PageProps<"/entregas/remitos">) {
  const sesion = await sesionParaPantalla("documentos.imprimir_entrega");
  const db = obtenerBaseDatos();
  const pedida = parametro((await searchParams).fecha);
  const fecha = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : ((await diaElegido()) ?? (await jornadaEnCurso(db, sesion.authUserId)));
  const remitos = await remitosDelDia(db, sesion.authUserId, fecha);
  const hechos = remitos.filter((r) => r.hecho);
  const contable = sesion.permisos.includes("documentos.imprimir_contable");
  const imprimir = `/entregas/remitos/imprimir?fecha=${fecha}`;

  return (
    <section className="flex max-w-5xl flex-col gap-5">
      <Encabezado
        titulo="Remitos"
        descripcion="El remito es la lista de entrega que firma el cliente (sin precios). Se hace solo al marcar preparado cada pedido. Imprimilos de a uno o todos juntos, en el orden del reparto."
      />
      <FechaGrande fecha={fecha} hoy={hoyEnEmpresa(new Date(), sesion.zonaHoraria)} />
      <nav aria-label="Día" className="flex flex-wrap gap-2">
        <Link href={`/entregas/remitos?fecha=${sumarDias(fecha, -1)}`} className={clasesBoton("secundario")} aria-label="Día anterior">
          ←
        </Link>
        <Link href={`/entregas/remitos?fecha=${sumarDias(fecha, 1)}`} className={clasesBoton("secundario")} aria-label="Día siguiente">
          →
        </Link>
        {sesion.permisos.includes("preparacion.ver") && (
          <Link href={`/preparacion/${fecha}`} className={clasesBoton("secundario")}>
            📦 Preparación
          </Link>
        )}
      </nav>

      {remitos.length === 0 ? (
        <p className="text-texto-suave">No hay entregas para este día: los remitos aparecen al empezar a preparar.</p>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-2xl border-2 border-marca bg-superficie p-4">
            <p className="text-lg font-semibold">
              {hechos.length === remitos.length ? "✓ Están todos los remitos" : `${hechos.length} de ${remitos.length} remitos hechos`}
            </p>
            {hechos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Link href={`${imprimir}&imprimir=1`} className={clasesBoton("principal")}>
                  🖨️ Imprimir todos ({hechos.length})
                </Link>
                <Link href={`${imprimir}&copias=2&imprimir=1`} className={clasesBoton("secundario")}>
                  🖨️ Todos con 2 copias (cliente y negocio)
                </Link>
                <Link href={imprimir} className={clasesBoton("secundario")}>
                  👁 Ver todos
                </Link>
                {contable && (
                  <Link href={`${imprimir}&tipo=contable`} className={clasesBoton("secundario")}>
                    💲 Listas con precios
                  </Link>
                )}
              </div>
            )}
          </div>
          <ul className="grid gap-4 md:grid-cols-2">
            {remitos.map((r) => (
              <TarjetaRemito
                key={r.entregaId}
                r={r}
                fecha={fecha}
                zona={sesion.zonaHoraria}
                puede={{ contable, preparar: sesion.permisos.includes("preparacion.ver"), entrega: sesion.permisos.includes("entregas.ver") }}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
