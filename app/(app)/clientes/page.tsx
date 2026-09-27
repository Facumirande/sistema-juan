import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { listarClientes } from "@/modulos/clientes/clientes";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { PERIODICIDADES, TIPOS_CLIENTE } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Campo, Desplegable, Encabezado, Estado, Filtros, Selector, Tabla } from "@/ui/formularios";
import { OPCIONES_ESTADO, estadoFiltro, parametro } from "@/ui/parametros";

import { crearClienteAccion } from "./acciones";
import { CamposCliente, CamposPunto } from "./campos-cliente";

export const metadata: Metadata = { title: "Clientes · Sistema Juan" };

/** P-15 Clientes (08 §5.3). */
export default async function PaginaClientes({ searchParams }: PageProps<"/clientes">) {
  const sesion = await sesionParaPantalla("clientes.ver");
  const filtros = await searchParams;
  const texto = parametro(filtros.texto);
  const estado = estadoFiltro(filtros.estado);
  const clientes = await listarClientes(obtenerBaseDatos(), sesion.authUserId, { texto, estado });

  return (
    <section className="flex max-w-5xl flex-col gap-6">
      <Encabezado titulo="Clientes" descripcion="A quién se le vende y dónde se entrega." />

      {sesion.permisos.includes("clientes.editar") && (
        <Desplegable titulo="+ Nuevo cliente" abierto={clientes.length === 0 && !texto}>
          <FormularioAccion accion={crearClienteAccion} boton="Crear cliente">
            <CamposCliente />
            <fieldset className="flex flex-col gap-4 rounded-lg border border-borde p-3">
              <legend className="px-1 font-medium">Dónde se entrega</legend>
              <p className="text-sm text-texto-suave">Sin una dirección de entrega no se le pueden confirmar pedidos. Después podés agregar más.</p>
              <CamposPunto prefijo="punto_" />
            </fieldset>
          </FormularioAccion>
        </Desplegable>
      )}

      <Filtros>
        <Campo etiqueta="Buscar" name="texto" defaultValue={texto} placeholder="Nombre o CUIT" />
        <Selector etiqueta="Estado" name="estado" opciones={OPCIONES_ESTADO} defaultValue={estado} />
      </Filtros>

      {clientes.length === 0 ? (
        <p className="text-texto-suave">No hay clientes {texto ? "con ese nombre" : "cargados todavía"}.</p>
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
