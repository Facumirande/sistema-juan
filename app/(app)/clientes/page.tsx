import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { listarClientes, type ClienteListado } from "@/modulos/clientes/clientes";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { Dato, Grupo, TarjetaRegistro, VistaTarjetasOLista } from "@/ui/cuadricula";
import { PERIODICIDADES, TIPOS_CLIENTE, fechaConDia } from "@/ui/etiquetas";
import { etiquetaDeTipo } from "@/ui/etiquetas-tablero";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Campo, Desplegable, Encabezado, Estado, Filtros, Selector, Tabla } from "@/ui/formularios";
import { OPCIONES_ESTADO, estadoFiltro, parametro } from "@/ui/parametros";

import { crearClienteAccion } from "./acciones";
import { CamposCliente, CamposPunto } from "./campos-cliente";

export const metadata: Metadata = { title: "Clientes · Sistema Juan" };

const DIBUJO: Readonly<Record<string, string>> = { HOSPITAL: "🏥", RESTAURANTE: "🍽️", COMERCIO: "🏪", INSTITUCION: "🏫", OTRO: "👤" };
const ORDEN_TIPOS = ["HOSPITAL", "RESTAURANTE", "COMERCIO", "INSTITUCION", "OTRO"];

function TarjetaCliente({ c }: { c: ClienteListado }) {
  const etiqueta = etiquetaDeTipo(c.tipoCliente);
  return (
    <TarjetaRegistro
      href={`/clientes/${c.id}`}
      franja={`var(--etiqueta-${etiqueta.color})`}
      dibujo={DIBUJO[c.tipoCliente] ?? "👤"}
      titulo={c.nombre}
      subtitulo={`${TIPOS_CLIENTE[c.tipoCliente]} · factura ${PERIODICIDADES[c.periodicidadFacturacion]?.toLowerCase()}`}
      inactivo={!c.activo}
    >
      {c.direccion ? (
        <Dato icono="📍">
          {c.direccion}
          {!c.ubicado && <span className="block text-xs">Sin ubicación en el mapa</span>}
        </Dato>
      ) : (
        <span className="flex items-center gap-2 font-semibold text-error">
          <span aria-hidden className="w-4 text-center">
            ⚠
          </span>
          Falta dónde se entrega
        </span>
      )}
      {c.horario && <Dato icono="🕘">Recibe {c.horario}</Dato>}
      {c.telefono && <Dato icono="📞">{c.telefono}</Dato>}
      {c.proximoPedido ? (
        <Dato icono="📅" destacado>
          Pedido para el {fechaConDia(c.proximoPedido)}
        </Dato>
      ) : (
        c.ultimaEntrega && <Dato icono="📅">Última entrega: {fechaConDia(c.ultimaEntrega)}</Dato>
      )}
      {c.prioridadFaltantes === 1 && <Dato icono="⭐">Prioridad máxima si falta mercadería</Dato>}
    </TarjetaRegistro>
  );
}

/** P-15 Clientes (08 §5.3): en tarjetas por tipo o en lista. */
export default async function PaginaClientes({ searchParams }: PageProps<"/clientes">) {
  const sesion = await sesionParaPantalla("clientes.ver");
  const filtros = await searchParams;
  const texto = parametro(filtros.texto);
  const estado = estadoFiltro(filtros.estado);
  const vista = parametro(filtros.vista) === "lista" ? "lista" : "tarjetas";
  const clientes = await listarClientes(obtenerBaseDatos(), sesion.authUserId, { texto, estado });
  const porTipo = ORDEN_TIPOS.map((t) => [t, clientes.filter((c) => c.tipoCliente === t)] as const).filter(([, lista]) => lista.length > 0);
  const enlaceVista = (v: "tarjetas" | "lista") => {
    const q = new URLSearchParams();
    if (texto) q.set("texto", texto);
    if (estado !== "activos") q.set("estado", estado);
    if (v === "lista") q.set("vista", "lista");
    return `/clientes${q.size ? `?${q.toString()}` : ""}`;
  };

  return (
    <section className="flex max-w-6xl flex-col gap-6">
      <Encabezado titulo="Clientes" descripcion="A quién se le vende y dónde se entrega, agrupados por tipo." />

      {sesion.permisos.includes("clientes.editar") && (
        <Desplegable titulo="+ Nuevo cliente" abierto={clientes.length === 0 && !texto}>
          <FormularioAccion accion={crearClienteAccion} boton="Crear cliente">
            <CamposCliente />
            <fieldset className="flex flex-col gap-4 rounded-lg border border-borde p-3">
              <legend className="px-1 font-medium">Dónde se entrega</legend>
              <p className="text-sm text-texto-suave">Sin una dirección de entrega no se le pueden confirmar pedidos. Después podés agregar más y marcarla en el mapa.</p>
              <CamposPunto prefijo="punto_" />
            </fieldset>
          </FormularioAccion>
        </Desplegable>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <Filtros>
          {vista === "lista" && <input type="hidden" name="vista" value="lista" />}
          <Campo etiqueta="Buscar" name="texto" defaultValue={texto} placeholder="Nombre o CUIT" />
          <Selector etiqueta="Estado" name="estado" opciones={OPCIONES_ESTADO} defaultValue={estado} />
        </Filtros>
        <VistaTarjetasOLista vista={vista} enlace={enlaceVista} />
      </div>

      {clientes.length === 0 ? (
        <p className="text-texto-suave">No hay clientes {texto ? "con ese nombre" : "cargados todavía"}.</p>
      ) : vista === "tarjetas" ? (
        porTipo.map(([tipo, lista]) => (
          <Grupo key={tipo} titulo={TIPOS_CLIENTE[tipo] ?? tipo} icono={DIBUJO[tipo]} cantidad={lista.length}>
            {lista.map((c) => (
              <TarjetaCliente key={c.id} c={c} />
            ))}
          </Grupo>
        ))
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Teléfono</th>
              <th>Puntos de entrega</th>
              <th>Prioridad</th>
              <th>Facturación</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/clientes/${c.id}`} className="font-medium underline-offset-4 hover:underline">
                    {c.nombre}
                  </Link>
                  <span className="block text-sm text-texto-suave">{TIPOS_CLIENTE[c.tipoCliente]}</span>
                </td>
                <td>{c.telefono ?? "—"}</td>
                <td className={c.puntosEntrega === 0 ? "text-error" : ""}>{c.puntosEntrega === 0 ? "Falta cargar" : c.puntosEntrega}</td>
                <td>{c.prioridadFaltantes}</td>
                <td>{PERIODICIDADES[c.periodicidadFacturacion]}</td>
                <td>
                  <Estado activo={c.activo} />
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </section>
  );
}
