import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { listarProveedores } from "@/modulos/proveedores/proveedores";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { CONDICIONES_PAGO } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Campo, Desplegable, Encabezado, Estado, Filtros, Selector, Tabla } from "@/ui/formularios";
import { OPCIONES_ESTADO, estadoFiltro, parametro } from "@/ui/parametros";

import { crearProveedorAccion } from "./acciones";
import { CamposProveedor } from "./campos-proveedor";

export const metadata: Metadata = { title: "Proveedores · Sistema Juan" };

/** P-20 Proveedores (08 §5.4). */
export default async function PaginaProveedores({ searchParams }: PageProps<"/proveedores">) {
  const sesion = await sesionParaPantalla("proveedores.ver");
  const filtros = await searchParams;
  const texto = parametro(filtros.texto);
  const estado = estadoFiltro(filtros.estado);
  const proveedores = await listarProveedores(obtenerBaseDatos(), sesion.authUserId, { texto, estado });
  const verCredito = sesion.permisos.includes("proveedores.ver_credito");

  return (
    <section className="flex max-w-5xl flex-col gap-6">
      <Encabezado titulo="Proveedores" descripcion="Puestos y mayoristas donde se compra." />

      {sesion.permisos.includes("proveedores.editar") && (
        <Desplegable titulo="+ Nuevo proveedor" abierto={proveedores.length === 0 && !texto}>
          <FormularioAccion accion={crearProveedorAccion} boton="Crear proveedor">
            <CamposProveedor editarCredito={sesion.permisos.includes("proveedores.editar_limite")} />
          </FormularioAccion>
        </Desplegable>
      )}

      <Filtros>
        <Campo etiqueta="Buscar" name="texto" defaultValue={texto} placeholder="Nombre o ubicación" />
        <Selector etiqueta="Estado" name="estado" opciones={OPCIONES_ESTADO} defaultValue={estado} />
      </Filtros>

      {proveedores.length === 0 ? (
        <p className="text-texto-suave">No hay proveedores {texto ? "con ese nombre" : "cargados todavía"}.</p>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Proveedor</th>
              <th>Teléfono</th>
              <th>Pago habitual</th>
              <th>Productos</th>
              {verCredito && <th>Límite</th>}
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {proveedores.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/proveedores/${p.id}`} className="font-medium underline-offset-4 hover:underline">
                    {p.nombre}
                  </Link>
                  {p.ubicacionMercado && <span className="block text-sm text-texto-suave">{p.ubicacionMercado}</span>}
                </td>
                <td>{p.telefono ?? "—"}</td>
                <td>{CONDICIONES_PAGO[p.condicionPagoHabitual]}</td>
                <td>{p.ofertas}</td>
                {verCredito && <td>{p.credito?.limiteCredito ? formatearMoneda(p.credito.limiteCredito) : "Sin límite"}</td>}
                <td>
                  <Estado activo={p.activo} />
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </section>
  );
}
