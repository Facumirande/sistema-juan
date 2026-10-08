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
import { obtenerListaCompra } from "@/modulos/compras/lista-compra";
import { obtenerPedido } from "@/modulos/pedidos/pedidos";
import { avanceDeTarjeta } from "@/modulos/pedidos/tablero";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { contarPedidosPendientes } from "@/modulos/usuarios/acceso";
import type { Permiso } from "@/seguridad/catalogo-permisos";
import { enlaceDeEntidad } from "@/ui/enlaces";
import { parametro } from "@/ui/parametros";
import { BotonAccion } from "@/ui/boton-accion";
import { SelectorDeDia } from "@/ui/selector-de-dia";

import { reabrirDiaAccion } from "./acciones";
import { Modal } from "./modal";
import { DiaPasoAPaso, TITULOS, plural, tituloDelDia } from "./paso-a-paso";
import { TableroTrello } from "./tablero";
import { datosParaComprar } from "../lista-compra/datos-para-comprar";

import type { ParaComprar } from "./checklist-vivo";
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

  // La tarjeta abierta (si hay una) se carga junto con todo lo demás, no después.
  const cargarTarjeta = async (id: string) => {
    try {
      // La lista de compras del día viene a la vez: con ella, cada producto de la tarjeta tiene su
      // "$" para anotar a quién se le compró y a cuánto.
      const fechaPedida = parametro(sp.fecha);
      const fechaDeLista = fechaPedida && /^\d{4}-\d{2}-\d{2}$/.test(fechaPedida) && puede("lista_compra.ver") && puede("compras.registrar") ? fechaPedida : null;
      const [pedido, avance, notas, historial, lista] = await Promise.all([
        obtenerPedido(db, sesion.authUserId, id),
        avanceDeTarjeta(db, sesion.authUserId, id),
        notasDe(db, sesion.authUserId, { tipo: "PEDIDO", id }),
        listarActividad(db, sesion.authUserId, { entidad: { tipo: "PEDIDO", id }, limite: 30 }),
        fechaDeLista ? obtenerListaCompra(db, sesion.authUserId, fechaDeLista, { paraComprar: true }) : null,
      ]);
      const suyos = new Set(avance.lineas.map((l) => l.listaItemId));
      const paraComprar: ParaComprar | null =
        lista && lista.fecha === pedido.fecha && lista.estadoJornada !== "CERRADA"
          ? {
              compras: Object.fromEntries(
                lista.plan
                  .flatMap((plan) => plan.lineas)
                  .filter((l) => suyos.has(l.id))
                  .map((l) => [l.id, { productoId: l.productoId, producto: l.producto, datos: datosParaComprar(l), anotada: l.compras.length > 0 }]),
              ),
              proveedores: lista.proveedores,
              puedeExceder: puede("compras.exceder_limite"),
            }
          : null;
      return { pedido, avance, notas, historial, paraComprar };
    } catch (error) {
      if (!esErrorDeNegocio(error, "NO_ENCONTRADO")) throw error;
      return null;
    }
  };
  const [pedidosDeAcceso, cuentas, dia, bandeja, tarjeta] = await Promise.all([
    puede("usuarios.administrar") ? contarPedidosPendientes(db, sesion.authUserId) : Promise.resolve(0),
    puede("pagos.ver") && puede("proveedores.ver_credito") ? listarCuentasProveedores(db, sesion.authUserId).then((r) => r.cuentas) : Promise.resolve([]),
    // El tablero viene en la misma transacción que el día: toda la pantalla sale con pocas idas a la base.
    puede("jornada.ver") ? diaDeTrabajo(db, sesion.authUserId, parametro(sp.fecha), { conTablero: vista === "tablero" }) : Promise.resolve(null),
    bandejaDeNotas(db, sesion.authUserId, 0),
    pedidoAbierto && UUID.test(pedidoAbierto) && puede("pedidos.ver") ? cargarTarjeta(pedidoAbierto) : Promise.resolve(null),
  ]);
  const vencidas = cuentas.filter((c) => dec(c.vencimientos.vencida).gt(0));
  const porVencer = cuentas.filter((c) => dec(c.vencimientos.vencida).isZero() && dec(c.vencimientos.porVencer).gt(0));
  const enTablero = vista === "tablero" && dia !== null;
  const puedeCargar = dia !== null && puede("pedidos.crear") && dia.fecha >= dia.hoy && dia.panel.estado !== "CERRADA";

  const base = dia ? `/inicio?fecha=${dia.fecha}${vista === "pasos" ? "&vista=pasos" : ""}` : "/inicio";
  const tablero = enTablero ? dia.tablero : null;

  // El fondo con la imagen va en las dos vistas del día (tablero y paso a paso).
  const sobre = dia !== null;
  const aviso = sobre
    ? "flex min-h-11 items-center gap-2 rounded-full bg-white/95 px-4 text-sm font-semibold text-[#172b4d] shadow-sm hover:bg-white"
    : "flex min-h-11 items-center gap-2 rounded-full border border-borde bg-superficie px-4 text-sm font-semibold";
  const unaNota = bandeja.sinLeer.length === 1 ? bandeja.sinLeer[0]! : null;

  return (
    <div
      // El tablero ocupa justo la pantalla (la página no se desplaza); el paso a paso, lo que necesite.
      className={
        sobre
          ? `-m-4 flex flex-col gap-3 p-3 [background:var(--tablero-fondo)] sm:px-4 ${enTablero ? "h-[calc(100dvh-3.5rem)] overflow-hidden" : "min-h-[calc(100dvh-3.5rem)]"}`
          : "flex max-w-3xl flex-col gap-5"
      }
    >
      <header className={`flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 ${sobre ? "text-white" : ""}`}>
        <div>
          <h1 className="text-xl leading-tight font-semibold sm:text-3xl">{dia ? (enTablero ? `Pedidos · ${tituloDelDia(dia.fecha, dia.hoy)}` : tituloDelDia(dia.fecha, dia.hoy)) : `Hola, ${sesion.nombre.split(" ")[0]}`}</h1>
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
              className={`min-h-12 items-center gap-2 rounded-xl px-4 font-semibold ${enTablero ? "hidden sm:flex" : "flex"} ${sobre ? "bg-white/20 text-white hover:bg-white/30" : "border border-borde bg-superficie"}`}
            >
              💰 Balance del día
            </Link>
          )}
          {puedeCargar && (
            <Link
              href={`/pedidos/nuevo?fecha=${dia.fecha}`}
              // En el tablero, con el menú a la vista, "＋ Nuevo pedido" ya está ahí: no se repite acá.
              className={`${sobre ? "hidden bg-white text-[#172b4d] hover:bg-white/90 sm:flex md:hidden" : "flex bg-marca text-marca-texto"} min-h-12 items-center gap-2 rounded-xl px-5 text-lg font-semibold shadow-sm`}
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
          puede={{ crear: puedeCargar, armar: puede("lista_compra.generar"), editar: puede("pedidos.editar"), tildar: puede("lista_compra.editar"), salir: puede("repartos.gestionar") && dia.panel.estado !== "CERRADA", preparar: puede("preparacion.registrar"), entregar: puede("entregas.confirmar"), cerrar: puede("jornada.cerrar") }}
          cerrado={dia.panel.estado === "CERRADA"}
          enlaces={{
            // El acceso a la pantalla de cada etapa, chico, arriba de la columna (abajo va solo el botón verde de cada tarjeta).
            en_lista: { href: `/lista-compra?fecha=${dia.fecha}`, texto: "Lista" },
            preparando: { href: `/preparacion/${dia.fecha}`, texto: "Abrir" },
            en_camino: { href: `/viaje?fecha=${dia.fecha}`, texto: "Ver recorrido" },
            entregados: { href: `/entregas/remitos?fecha=${dia.fecha}`, texto: "Remitos" },
          }}
        />
      ) : (
        dia && <DiaPasoAPaso dia={dia} puede={puede} />
      )}

      {/* Con el día cerrado: abajo, siempre a la vista. */}
      {dia?.panel.estado === "CERRADA" && (
        <div className="sticky bottom-3 z-30 mt-auto flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl bg-black/75 px-4 py-2 text-white shadow-lg backdrop-blur">
          <p className="text-lg font-semibold">🔒 Día cerrado.</p>
          {puede("jornada.reabrir") && (
            <BotonAccion accion={reabrirDiaAccion} datos={{ fecha: dia.fecha }} className="flex min-h-12 items-center justify-center rounded-xl bg-white px-5 text-lg font-bold text-[#172b4d] shadow-sm hover:bg-white/90">
              🔓 Reabrir el día
            </BotonAccion>
          )}
        </div>
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
            paraComprar={tarjeta.paraComprar}
          />
        </Modal>
      )}
    </div>
  );
}
