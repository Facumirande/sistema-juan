import type { Metadata } from "next";

import { obtenerBaseDatos } from "@/db/cliente";
import { enlaceWaze, enlacesGoogleMaps } from "@/dominio/entregas/navegacion";
import { obtenerCliente } from "@/modulos/clientes/clientes";
import { notasDe } from "@/modulos/colaboracion/notas";
import { ultimosPedidosDeCliente } from "@/modulos/pedidos/pedidos";
import { listarReglasCliente, recargosActuales } from "@/modulos/precios-venta/reglas";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { cargarFicha, idDeRuta } from "@/ui/accion-servidor";
import { DIAS_SEMANA, PERIODICIDADES, TIPOS_CLIENTE } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Aviso, Encabezado, Estado, Tarjeta } from "@/ui/formularios";

import { cambiarEstadoClienteAccion, cambiarEstadoPuntoAccion, editarClienteAccion, guardarPuntoAccion, marcarPrincipalAccion } from "../acciones";
import { HiloDeNotas } from "../../actividad/notas";
import { ubicarPuntoAccion } from "../../viaje/acciones";
import { MarcarUbicacion } from "../../viaje/ubicacion";
import { CamposCliente, CamposPunto } from "../campos-cliente";

import { PedidosDelCliente, PreciosDelCliente } from "./secciones";

export const metadata: Metadata = { title: "Cliente · Sistema Juan" };

function dias(diasEntrega: number[]): string {
  return diasEntrega.map((d) => DIAS_SEMANA[d - 1]?.etiqueta).join(", ");
}

/** P-16 Ficha de cliente: datos y puntos de entrega (08 §5.3). */
export default async function FichaDeCliente({ params }: PageProps<"/clientes/[id]">) {
  const sesion = await sesionParaPantalla("clientes.ver");
  const id = idDeRuta((await params).id);
  const db = obtenerBaseDatos();
  const c = await cargarFicha(obtenerCliente(db, sesion.authUserId, id));
  const [precios, objetivos, pedidos, notas] = await Promise.all([
    sesion.permisos.includes("precios.ver_margenes") ? listarReglasCliente(db, sesion.authUserId, id) : Promise.resolve(null),
    sesion.permisos.includes("precios.editar_reglas") ? recargosActuales(db, sesion.authUserId) : Promise.resolve(null),
    sesion.permisos.includes("pedidos.ver") ? ultimosPedidosDeCliente(db, sesion.authUserId, id) : Promise.resolve(null),
    notasDe(db, sesion.authUserId, { tipo: "CLIENTE", id }),
  ]);
  const puedeEditar = sesion.permisos.includes("clientes.editar");
  const activos = c.puntosEntrega.filter((p) => p.activo);

  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <Encabezado
        titulo={c.nombre}
        volver={{ ruta: "/clientes", texto: "Clientes" }}
        descripcion={`${TIPOS_CLIENTE[c.tipoCliente]} · comprobante de venta ${c.periodicidadFacturacion === "POR_ENTREGA" ? "en cada entrega" : PERIODICIDADES[c.periodicidadFacturacion]?.toLowerCase()}${c.prioridadFaltantes === 1 ? " · se le completa primero si falta mercadería" : ""}`}
      >
        <Estado activo={c.activo} />
      </Encabezado>

      {activos.length === 0 && <Aviso>Este cliente no tiene dónde entregarle: cargá un punto de entrega para poder confirmarle pedidos.</Aviso>}

      {pedidos && (
        <PedidosDelCliente clienteId={c.id} pedidos={pedidos} puedeCrear={sesion.permisos.includes("pedidos.crear") && c.activo && activos.length > 0} />
      )}
      {precios && <PreciosDelCliente clienteId={c.id} recargoCliente={precios.recargoCliente} reglas={precios.reglas} objetivos={objetivos} />}

      <Tarjeta titulo="Dónde se le entrega">
        {c.puntosEntrega.length === 0 && <p className="text-texto-suave">Sin puntos de entrega.</p>}
        <ul className="flex flex-col gap-3">
          {c.puntosEntrega.map((p) => (
            <li key={p.id} className="flex flex-col gap-1 rounded-lg border border-borde p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">
                  {p.nombre}
                  {p.esPrincipal && <span className="font-normal text-texto-suave"> · principal</span>}
                </p>
                <Estado activo={p.activo} />
              </div>
              <p>
                {p.direccion}
                {p.localidad && `, ${p.localidad}`}
              </p>
              <p className="text-sm text-texto-suave">
                {[
                  p.horarioDesde && p.horarioHasta ? `Recibe de ${p.horarioDesde} a ${p.horarioHasta}` : null,
                  p.diasEntrega.length > 0 ? dias(p.diasEntrega) : null,
                  p.contactoNombre,
                  p.contactoTelefono,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {p.instruccionesEntrega && <p className="text-sm">{p.instruccionesEntrega}</p>}
              <div className="flex flex-wrap gap-2 py-1">
                <a href={enlacesGoogleMaps([{ coordenada: p.coordenada, direccion: p.direccion, localidad: p.localidad }])[0]} target="_blank" rel="noreferrer" className="rounded-md bg-fondo px-3 py-1.5 text-sm font-medium hover:bg-borde">
                  🧭 Cómo llegar
                </a>
                <a href={enlaceWaze({ coordenada: p.coordenada, direccion: p.direccion, localidad: p.localidad })} target="_blank" rel="noreferrer" className="rounded-md bg-fondo px-3 py-1.5 text-sm font-medium hover:bg-borde">
                  Waze
                </a>
              </div>
              {(puedeEditar || sesion.permisos.includes("entregas.confirmar")) && p.activo && (
                <MarcarUbicacion accion={ubicarPuntoAccion} campos={{ puntoId: p.id }} actual={p.coordenada} direccion={[p.direccion, p.localidad].filter(Boolean).join(", ")} />
              )}
              {puedeEditar && (
                <details>
                  <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Editar</summary>
                  <div className="flex flex-col gap-3">
                    <FormularioAccion accion={guardarPuntoAccion} boton="Guardar" variante="secundario">
                      <input type="hidden" name="clienteId" value={c.id} />
                      <input type="hidden" name="id" value={p.id} />
                      <CamposPunto punto={p} />
                    </FormularioAccion>
                    <div className="flex flex-wrap gap-2">
                      {p.activo && !p.esPrincipal && (
                        <FormularioAccion accion={marcarPrincipalAccion} boton="Hacer principal" variante="secundario">
                          <input type="hidden" name="id" value={p.id} />
                        </FormularioAccion>
                      )}
                      <FormularioAccion accion={cambiarEstadoPuntoAccion} boton={p.activo ? "Desactivar" : "Reactivar"} variante={p.activo ? "peligro" : "secundario"}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="activo" value={String(!p.activo)} />
                      </FormularioAccion>
                    </div>
                  </div>
                </details>
              )}
            </li>
          ))}
        </ul>
        {puedeEditar && (
          <details open={c.puntosEntrega.length === 0}>
            <summary className="min-h-11 cursor-pointer py-2 font-medium">＋ Agregar otra dirección de entrega</summary>
            <FormularioAccion accion={guardarPuntoAccion} boton="Agregar">
              <input type="hidden" name="clienteId" value={c.id} />
              <CamposPunto />
            </FormularioAccion>
          </details>
        )}
      </Tarjeta>

      <Tarjeta titulo="💬 Notas">
        <HiloDeNotas entidadTipo="CLIENTE" entidadId={c.id} notas={notas.notas} personas={notas.personas} yo={notas.yo} zonaHoraria={sesion.zonaHoraria} />
      </Tarjeta>

      {puedeEditar && (
        <details className="rounded-lg border border-borde bg-superficie p-4">
          <summary className="min-h-11 cursor-pointer text-lg font-semibold">✏️ Editar los datos del cliente (o darlo de baja)</summary>
          <div className="mt-4 flex flex-col gap-3">
          <FormularioAccion accion={editarClienteAccion} boton="Guardar cambios">
            <input type="hidden" name="id" value={c.id} />
            <CamposCliente cliente={c} />
          </FormularioAccion>
          <FormularioAccion
            accion={cambiarEstadoClienteAccion}
            boton={c.activo ? "Desactivar cliente" : "Reactivar cliente"}
            variante={c.activo ? "peligro" : "secundario"}
            confirmar={c.activo ? `¿Desactivar a ${c.nombre}? No se le van a poder cargar pedidos nuevos.` : undefined}
          >
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="activo" value={String(!c.activo)} />
          </FormularioAccion>
          </div>
        </details>
      )}
    </section>
  );
}
