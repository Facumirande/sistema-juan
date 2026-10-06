import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { dec, sumar } from "@/dominio/dinero/decimal";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { esErrorDeNegocio } from "@/dominio/errores";
import { listarActividad } from "@/modulos/colaboracion/actividad";
import { bandejaDeNotas, notasDe } from "@/modulos/colaboracion/notas";
import { listarCuentasProveedores } from "@/modulos/compras/cuenta-corriente";
import { diaDeTrabajo } from "@/modulos/jornadas/dia";
import { obtenerPedido } from "@/modulos/pedidos/pedidos";
import { avanceDeTarjeta, tableroDePedidos } from "@/modulos/pedidos/tablero";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { contarPedidosPendientes } from "@/modulos/usuarios/acceso";
import type { Permiso } from "@/seguridad/catalogo-permisos";
import { enlaceDeEntidad } from "@/ui/enlaces";
import { parametro } from "@/ui/parametros";
import { SelectorDeDia } from "@/ui/selector-de-dia";

import { Modal } from "./modal";
import { DiaPasoAPaso, TITULOS, plural, tituloDelDia } from "./paso-a-paso";
import { TableroTrello } from "./tablero";
import { TarjetaAbierta } from "./tarjeta-abierta";

export const metadata: Metadata = { title: "Tablero de pedidos · Sistema Repartos" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** P-02: el tablero de pedidos del día (estilo Trello) o el día paso a paso. */
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
  const puedeCargar = dia !== null && puede("pedidos.crear") && dia.fecha >= dia.hoy && dia.panel.estado !== "CERRADA";

  const base = dia ? `/inicio?fecha=${dia.fecha}${vista === "pasos" ? "&vista=pasos" : ""}` : "/inicio";
  // La tarjeta abierta (si hay una) se carga junto con el tablero, no después.
  const cargarTarjeta = async (id: string) => {
    try {
      const [pedido, avance, notas, historial] = await Promise.all([
        obtenerPedido(db, sesion.authUserId, id),
        avanceDeTarjeta(db, sesion.authUserId, id),
        notasDe(db, sesion.authUserId, { tipo: "PEDIDO", id }),
        listarActividad(db, sesion.authUserId, { entidad: { tipo: "PEDIDO", id }, limite: 30 }),
      ]);
      return { pedido, avance, notas, historial };
    } catch (error) {
      if (!esErrorDeNegocio(error, "NO_ENCONTRADO")) throw error;
      return null;
    }
  };
  const [tablero, tarjeta] = await Promise.all([
    enTablero ? tableroDePedidos(db, sesion.authUserId, dia.fecha) : Promise.resolve(null),
    pedidoAbierto && UUID.test(pedidoAbierto) && puede("pedidos.ver") ? cargarTarjeta(pedidoAbierto) : Promise.resolve(null),
  ]);

  // El fondo con la imagen va en las dos vistas del día (tablero y paso a paso).
  const sobre = dia !== null;
  const aviso = sobre
    ? "flex min-h-11 items-center gap-2 rounded-full bg-white/95 px-4 text-sm font-semibold text-[#172b4d] shadow-sm hover:bg-white"
    : "flex min-h-11 items-center gap-2 rounded-full border border-borde bg-superficie px-4 text-sm font-semibold";
  const unaNota = bandeja.sinLeer.length === 1 ? bandeja.sinLeer[0]! : null;

  return (
    <div className={sobre ? "-m-4 flex min-h-[calc(100dvh-3.5rem)] flex-col gap-4 p-4 [background:var(--tablero-fondo)] sm:px-5" : "flex max-w-3xl flex-col gap-5"}>
      <header className={`flex flex-wrap items-center justify-between gap-3 ${sobre ? "text-white" : ""}`}>
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">{dia ? (enTablero ? `Pedidos · ${tituloDelDia(dia.fecha, dia.hoy)}` : tituloDelDia(dia.fecha, dia.hoy)) : `Hola, ${sesion.nombre.split(" ")[0]}`}</h1>
          {dia && (
            <p className={`hidden sm:block ${sobre ? "text-white/85" : "text-texto-suave"}`}>
              {!dia.panel.estado ? "Todavía sin pedidos para este día" : dia.pasos.actual ? `Ahora toca: ${TITULOS[dia.pasos.actual].toLowerCase()}` : "Día terminado"}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dia && puede("pedidos.ver") && (
            <div role="tablist" aria-label="Cómo ver el día" className={`flex rounded-xl p-1 ${sobre ? "bg-black/25" : "bg-fondo"}`}>
              <Link href={`/inicio?fecha=${dia.fecha}`} role="tab" aria-selected={vista === "tablero"} className={`min-h-10 rounded-lg px-3 py-2 text-sm font-semibold ${vista === "tablero" ? "bg-white text-[#172b4d]" : sobre ? "text-white" : ""}`}>
                ▦ Tablero
              </Link>
              <Link href={`/inicio?fecha=${dia.fecha}&vista=pasos`} role="tab" aria-selected={vista === "pasos"} className={`min-h-10 rounded-lg px-3 py-2 text-sm font-semibold ${vista === "pasos" ? "bg-white text-[#172b4d]" : sobre ? "text-white" : ""}`}>
                ☰ Paso a paso
              </Link>
            </div>
          )}
          {dia && puede("reportes.ver") && (
            <Link
              href={`/balance?dia=${dia.fecha}`}
              title="Lo que se vendió, se compró y quedó ese día"
              className={`flex min-h-12 items-center gap-2 rounded-xl px-4 font-semibold ${sobre ? "bg-white/20 text-white hover:bg-white/30" : "border border-borde bg-superficie"}`}
            >
              💰 Balance del día
            </Link>
          )}
          {puedeCargar && (
            <Link
              href={`/pedidos/nuevo?fecha=${dia.fecha}`}
              className={`${sobre ? "hidden bg-white text-[#172b4d] hover:bg-white/90 sm:flex" : "flex bg-marca text-marca-texto"} min-h-12 items-center gap-2 rounded-xl px-5 text-lg font-semibold shadow-sm`}
            >
              <span aria-hidden className="text-xl leading-none">
                ＋
              </span>
              Nuevo pedido
            </Link>
          )}
        </div>
      </header>

      {dia && <SelectorDeDia dias={dia.dias} fecha={dia.fecha} hoy={dia.hoy} enlace={(f) => `/inicio?fecha=${f}${vista === "pasos" ? "&vista=pasos" : ""}`} sobreFondo={sobre} />}

      {(pedidosDeAcceso > 0 || vencidas.length > 0 || porVencer.length > 0 || bandeja.sinLeer.length > 0) && (
        <div className="flex flex-wrap gap-2" aria-label="Avisos">
          {unaNota ? (
            unaNota.entidad.tipo === "USUARIO" ? (
              <Link href="/actividad?ver=notas" className={aviso}>
                💬 {unaNota.autor.nombre.split(" ")[0]} te dejó un aviso: “{unaNota.texto.length > 60 ? `${unaNota.texto.slice(0, 60)}…` : unaNota.texto}”
              </Link>
            ) : (
              <Link href={enlaceDeEntidad(unaNota.entidad.tipo, unaNota.entidad.id, unaNota.entidad.fecha)} scroll={false} className={aviso}>
                💬 {unaNota.autor.nombre.split(" ")[0]} te dejó una nota en {unaNota.entidad.etiqueta}
              </Link>
            )
          ) : (
            bandeja.sinLeer.length > 1 && (
              <Link href="/actividad?ver=notas" className={aviso}>
                💬 {plural(bandeja.sinLeer.length, "nota nueva para vos", "notas nuevas para vos")}
              </Link>
            )
          )}
          {pedidosDeAcceso > 0 && (
            <Link href="/usuarios" className={aviso}>
              👤 {pedidosDeAcceso === 1 ? "1 persona espera que la habilites" : `${pedidosDeAcceso} personas esperan que las habilites`}
            </Link>
          )}
          {vencidas.length > 0 && (
            <Link href="/cuentas-proveedores" className={`${aviso} ring-2 ring-error`}>
              ⏰ Deuda vencida: {formatearMoneda(sumar(vencidas.map((c) => c.vencimientos.vencida)))} con {plural(vencidas.length, "proveedor", "proveedores")}
            </Link>
          )}
          {porVencer.length > 0 && (
            <Link href="/cuentas-proveedores" className={aviso}>
              📅 Vence en los próximos días: {formatearMoneda(sumar(porVencer.map((c) => c.vencimientos.porVencer)))}
            </Link>
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
          puede={{ crear: puedeCargar, armar: puede("lista_compra.generar"), editar: puede("pedidos.editar"), tildar: puede("lista_compra.editar"), salir: puede("repartos.gestionar") && dia.panel.estado !== "CERRADA" }}
          enlaces={{
            en_lista: { href: `/lista-compra?fecha=${dia.fecha}`, texto: "🛒 Ir a la lista de compras" },
            comprados: { href: `/preparacion/${dia.fecha}`, texto: "📦 Ir a preparar" },
            preparando: { href: `/preparacion/${dia.fecha}`, texto: "📦 Ir a preparación" },
            en_camino: { href: `/viaje?fecha=${dia.fecha}`, texto: "Ver el viaje y el GPS" },
            entregados: { href: `/entregas/remitos?fecha=${dia.fecha}`, texto: "🧾 Ver los remitos" },
          }}
        />
      ) : (
        dia && <DiaPasoAPaso dia={dia} puede={puede} />
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
