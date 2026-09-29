import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { tiempoRelativo } from "@/dominio/colaboracion/tiempo";
import { dec } from "@/dominio/dinero/decimal";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { esErrorDeNegocio } from "@/dominio/errores";
import { formatearFecha } from "@/dominio/fechas/fechas";
import { listarActividad } from "@/modulos/colaboracion/actividad";
import { bandejaDeNotas, notasDe } from "@/modulos/colaboracion/notas";
import { listarClientes } from "@/modulos/clientes/clientes";
import { listarCuentasProveedores } from "@/modulos/compras/cuenta-corriente";
import { diaDeTrabajo, type DiaDeTrabajo } from "@/modulos/jornadas/dia";
import { obtenerPedido } from "@/modulos/pedidos/pedidos";
import { avanceDeTarjeta, tableroDePedidos } from "@/modulos/pedidos/tablero";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { contarPedidosPendientes } from "@/modulos/usuarios/acceso";
import type { Permiso } from "@/seguridad/catalogo-permisos";
import { Avatar } from "@/ui/avatar";
import { BotonAccion } from "@/ui/boton-accion";
import { enlaceDeEntidad } from "@/ui/enlaces";
import { ESTADOS_JORNADA } from "@/ui/etiquetas";
import { parametro } from "@/ui/parametros";

import { marcarTodasLeidasAccion } from "../actividad/acciones";
import { Modal } from "./modal";
import { DiaPasoAPaso, nombreDelDia, plural, tituloDelDia } from "./paso-a-paso";
import { TableroTrello } from "./tablero";
import { TarjetaAbierta } from "./tarjeta-abierta";

export const metadata: Metadata = { title: "Hoy · Sistema Juan" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Los días para cambiar de tablero (como el selector de tableros de Trello). */
function SelectorDeDia({ dia, vista, sobreTablero }: { dia: DiaDeTrabajo; vista: "tablero" | "pasos"; sobreTablero: boolean }) {
  return (
    <nav aria-label="Elegir el día" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {dia.dias.map((x) => {
        const elegido = x.fecha === dia.fecha;
        const clases = sobreTablero
          ? elegido
            ? "bg-white text-[#172b4d]"
            : "bg-white/20 text-white hover:bg-white/30"
          : elegido
            ? "border border-marca bg-marca text-marca-texto"
            : "border border-borde bg-superficie";
        return (
          <Link
            key={x.fecha}
            href={`/inicio?fecha=${x.fecha}${vista === "pasos" ? "&vista=pasos" : ""}`}
            aria-current={elegido ? "date" : undefined}
            className={`flex min-h-12 min-w-20 shrink-0 flex-col items-center justify-center rounded-lg px-3 py-1 text-center ${clases}`}
          >
            <span className="text-sm font-semibold capitalize">
              {nombreDelDia(x.fecha, dia.hoy)} {x.fecha.slice(8, 10)}/{x.fecha.slice(5, 7)}
            </span>
            <span className={`text-xs ${elegido || sobreTablero ? "opacity-90" : "text-texto-suave"}`}>
              {x.estado === "CERRADA" ? "Cerrado" : x.pedidos > 0 ? plural(x.pedidos, "pedido", "pedidos") : "Sin pedidos"}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

/** P-02 "Hoy": el tablero de pedidos del día (estilo Trello) o el día paso a paso. */
export default async function Inicio({ searchParams }: PageProps<"/inicio">) {
  const sesion = await sesionParaPantalla(null);
  const puede = (p: Permiso) => sesion.permisos.includes(p);
  const db = obtenerBaseDatos();
  const sp = await searchParams;
  const vista: "tablero" | "pasos" = parametro(sp.vista) === "pasos" || !puede("pedidos.ver") ? "pasos" : "tablero";
  const pedidoAbierto = parametro(sp.pedido);

  const [pedidosDeAcceso, cuentas, dia, bandeja] = await Promise.all([
    puede("usuarios.administrar") ? contarPedidosPendientes(db, sesion.authUserId) : Promise.resolve(0),
    puede("pagos.ver") && puede("proveedores.ver_credito") ? listarCuentasProveedores(db, sesion.authUserId).then((r) => r.cuentas) : Promise.resolve([]),
    puede("jornada.ver") ? diaDeTrabajo(db, sesion.authUserId, parametro(sp.fecha)) : Promise.resolve(null),
    bandejaDeNotas(db, sesion.authUserId, 0),
  ]);
  const vencidas = cuentas.filter((c) => dec(c.vencimientos.vencida).gt(0));
  const porVencer = cuentas.filter((c) => dec(c.vencimientos.vencida).isZero() && dec(c.vencimientos.porVencer).gt(0));
  const enTablero = vista === "tablero" && dia !== null;
  const [tablero, clientes] = await Promise.all([
    enTablero ? tableroDePedidos(db, sesion.authUserId, dia.fecha) : Promise.resolve(null),
    dia && puede("pedidos.crear") ? listarClientes(db, sesion.authUserId).then((cs) => cs.map((c) => ({ id: c.id, nombre: c.nombre }))) : Promise.resolve([]),
  ]);

  const base = dia ? `/inicio?fecha=${dia.fecha}${vista === "pasos" ? "&vista=pasos" : ""}` : "/inicio";
  let tarjeta: {
    pedido: Awaited<ReturnType<typeof obtenerPedido>>;
    avance: Awaited<ReturnType<typeof avanceDeTarjeta>>;
    notas: Awaited<ReturnType<typeof notasDe>>;
    historial: Awaited<ReturnType<typeof listarActividad>>;
  } | null = null;
  if (pedidoAbierto && UUID.test(pedidoAbierto) && puede("pedidos.ver")) {
    try {
      const [pedido, avance, notas, historial] = await Promise.all([
        obtenerPedido(db, sesion.authUserId, pedidoAbierto),
        avanceDeTarjeta(db, sesion.authUserId, pedidoAbierto),
        notasDe(db, sesion.authUserId, { tipo: "PEDIDO", id: pedidoAbierto }),
        listarActividad(db, sesion.authUserId, { entidad: { tipo: "PEDIDO", id: pedidoAbierto }, limite: 30 }),
      ]);
      tarjeta = { pedido, avance, notas, historial };
    } catch (error) {
      if (!esErrorDeNegocio(error, "NO_ENCONTRADO")) throw error;
    }
  }

  const sobre = enTablero;
  const tarjetaBlanca = "rounded-lg bg-superficie p-3 shadow-sm";
  const ahora = new Date();

  return (
    <div className={sobre ? "-m-4 flex min-h-[calc(100dvh-3.5rem)] flex-col gap-3 p-3 [background:var(--tablero-fondo)] sm:px-4" : "flex max-w-3xl flex-col gap-5"}>
      <header className={`flex flex-wrap items-end justify-between gap-3 ${sobre ? "text-white" : ""}`}>
        <div>
          <h1 className="text-2xl font-semibold">{dia ? (sobre ? `Pedidos · ${tituloDelDia(dia.fecha, dia.hoy)}` : tituloDelDia(dia.fecha, dia.hoy)) : `Hola, ${sesion.nombre.split(" ")[0]}`}</h1>
          {dia && (
            <p className={`text-sm ${sobre ? "text-white/85" : "text-texto-suave"}`}>
              {dia.panel.estado ? `Jornada ${ESTADOS_JORNADA[dia.panel.estado]?.toLowerCase()}` : "Todavía sin pedidos"} ·{" "}
              {dia.pasos.actual ? `${dia.pasos.hechos} de ${dia.pasos.pasos.length} pasos listos` : "día terminado"}
              {tablero?.lista.numero && ` · lista de compra ${tablero.lista.numero}`}
            </p>
          )}
        </div>
        {dia && puede("pedidos.ver") && (
          <div role="tablist" aria-label="Cómo ver el día" className={`flex rounded-lg p-1 ${sobre ? "bg-black/25" : "bg-fondo"}`}>
            <Link href={`/inicio?fecha=${dia.fecha}`} role="tab" aria-selected={vista === "tablero"} className={`min-h-9 rounded-md px-3 py-1.5 text-sm font-semibold ${vista === "tablero" ? "bg-white text-[#172b4d]" : sobre ? "text-white" : ""}`}>
              ▦ Tablero
            </Link>
            <Link href={`/inicio?fecha=${dia.fecha}&vista=pasos`} role="tab" aria-selected={vista === "pasos"} className={`min-h-9 rounded-md px-3 py-1.5 text-sm font-semibold ${vista === "pasos" ? "bg-marca text-marca-texto" : sobre ? "text-white" : ""}`}>
              ☰ Paso a paso
            </Link>
          </div>
        )}
      </header>

      {dia && <SelectorDeDia dia={dia} vista={vista} sobreTablero={sobre} />}

      {(pedidosDeAcceso > 0 || vencidas.length > 0 || porVencer.length > 0 || bandeja.sinLeer.length > 0) && (
        <div className={`grid grid-cols-1 gap-3 ${sobre ? "md:grid-cols-2 xl:grid-cols-3" : ""}`}>
          {bandeja.sinLeer.length > 0 && (
            <div className={`${tarjetaBlanca} flex flex-col gap-2`}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">💬 {plural(bandeja.sinLeer.length, "nota nueva para vos", "notas nuevas para vos")}</p>
                <BotonAccion accion={marcarTodasLeidasAccion} datos={{}} className="text-sm text-texto-suave underline underline-offset-2">
                  Marcar leídas
                </BotonAccion>
              </div>
              <ul className="flex flex-col gap-2">
                {bandeja.sinLeer.slice(0, 3).map((n) => (
                  <li key={n.id}>
                    <Link href={enlaceDeEntidad(n.entidad.tipo, n.entidad.id, n.entidad.fecha)} scroll={false} className="flex gap-2 rounded-md p-1 hover:bg-fondo">
                      <Avatar persona={n.autor} tamano="chico" />
                      <span className="min-w-0 text-sm">
                        <b>{n.autor.nombre.split(" ")[0]}</b> en {n.entidad.etiqueta} · <span className="text-texto-suave">{tiempoRelativo(n.en, ahora, sesion.zonaHoraria)}</span>
                        <span className="block truncate">“{n.texto}”</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {bandeja.sinLeer.length > 3 && (
                <Link href="/actividad?ver=notas" className="text-sm underline underline-offset-2">
                  Ver todas
                </Link>
              )}
            </div>
          )}
          {pedidosDeAcceso > 0 && (
            <Link href="/usuarios" className={`${tarjetaBlanca} font-semibold`}>
              {pedidosDeAcceso === 1 ? "Hay 1 persona esperando que la habilites" : `Hay ${pedidosDeAcceso} personas esperando que las habilites`} →
            </Link>
          )}
          {vencidas.length > 0 && (
            <div role="alert" className={`${tarjetaBlanca} flex flex-col gap-1 border-l-4 border-error`}>
              <p className="font-semibold text-error">⏰ Deuda vencida con proveedores</p>
              {vencidas.map((c) => (
                <Link key={c.proveedorId} href={`/cuentas-proveedores/${c.proveedorId}`} className="underline-offset-4 hover:underline">
                  {c.proveedor}: {formatearMoneda(c.vencimientos.vencida)} ({c.vencimientos.maxDiasAtraso} {c.vencimientos.maxDiasAtraso === 1 ? "día" : "días"} de atraso)
                </Link>
              ))}
            </div>
          )}
          {porVencer.length > 0 && (
            <div className={`${tarjetaBlanca} flex flex-col gap-1 border-l-4 border-amber-500`}>
              <p className="font-semibold text-amber-700 dark:text-amber-400">Vence en los próximos días</p>
              {porVencer.map((c) => (
                <Link key={c.proveedorId} href={`/cuentas-proveedores/${c.proveedorId}`} className="underline-offset-4 hover:underline">
                  {c.proveedor}: {formatearMoneda(c.vencimientos.porVencer)}
                  {c.vencimientos.proximo && ` (el ${formatearFecha(c.vencimientos.proximo.fecha).slice(0, 5)})`}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {tablero && dia ? (
        <TableroTrello
          fecha={dia.fecha}
          columnas={tablero.columnas}
          cancelados={tablero.cancelados}
          personas={tablero.personas}
          yo={tablero.yo}
          base={base}
          clientes={clientes}
          puede={{ crear: puede("pedidos.crear") && dia.fecha >= dia.hoy && dia.panel.estado !== "CERRADA", armar: puede("lista_compra.generar"), editar: puede("pedidos.editar") }}
          enlaces={{
            confirmados: { href: `/pedidos?fecha=${dia.fecha}`, texto: "Ver los pedidos" },
            en_lista: { href: `/lista-compra?fecha=${dia.fecha}`, texto: "Ver la lista de compra" },
            preparando: { href: `/preparacion/${dia.fecha}`, texto: "Ir a preparación" },
            en_camino: { href: `/viaje?fecha=${dia.fecha}`, texto: "🧭 Ver el viaje y el GPS" },
            entregados: { href: `/entregas?fecha=${dia.fecha}`, texto: "Ver las entregas" },
          }}
        />
      ) : (
        dia && <DiaPasoAPaso dia={dia} puede={puede} clientes={clientes} />
      )}

      {tarjeta && (
        <Modal cerrar={base} titulo={`${tarjeta.pedido.cliente} · ${tarjeta.pedido.numero}`}>
          <TarjetaAbierta
            pedido={tarjeta.pedido}
            avance={tarjeta.avance}
            notas={tarjeta.notas}
            historial={tarjeta.historial.entradas.filter((e) => e.clase === "ACTIVIDAD")}
            yo={sesion.usuarioId}
            zonaHoraria={sesion.zonaHoraria}
            puede={puede}
          />
        </Modal>
      )}
    </div>
  );
}
