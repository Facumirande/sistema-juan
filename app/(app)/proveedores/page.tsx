import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import type { Semaforo } from "@/dominio/compras/credito";
import { dec } from "@/dominio/dinero/decimal";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { listarProveedores, type ProveedorListado } from "@/modulos/proveedores/proveedores";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { CampoBuscar } from "@/ui/buscador";
import { Dato, Grupo, TarjetaRegistro, VistaTarjetasOLista } from "@/ui/cuadricula";
import { CONDICIONES_PAGO } from "@/ui/etiquetas";
import { Encabezado, Estado, Filtros, Selector, Tabla, clasesBoton } from "@/ui/formularios";
import { OPCIONES_ESTADO, estadoFiltro, parametro } from "@/ui/parametros";
import { SemaforoCredito } from "@/ui/semaforo";

export const metadata: Metadata = { title: "Proveedores · Sistema Repartos" };

const FRANJA: Readonly<Record<Semaforo, string>> = {
  VERDE: "var(--etiqueta-verde)",
  AMARILLO: "var(--etiqueta-amarillo)",
  ROJO: "var(--etiqueta-rojo)",
  EXCEDIDO: "var(--etiqueta-rojo)",
  SIN_LIMITE: "var(--etiqueta-gris)",
};

function TarjetaProveedor({ p }: { p: ProveedorListado }) {
  const c = p.credito;
  return (
    <TarjetaRegistro href={`/proveedores/${p.id}`} franja={c ? FRANJA[c.semaforo] : "var(--etiqueta-gris)"} dibujo="🏬" titulo={p.nombre} subtitulo={p.ubicacionMercado ?? "Sin puesto anotado"} inactivo={!p.activo}>
      <Dato icono="💳">Paga {CONDICIONES_PAGO[p.condicionPagoHabitual]?.toLowerCase()}</Dato>
      <Dato icono="🧺">{p.ofertas === 0 ? "Todavía sin productos con precio" : p.ofertas === 1 ? "Vende 1 producto" : `Vende ${p.ofertas} productos`}</Dato>
      {c && (
        <span className="flex flex-wrap items-center gap-2">
          <span aria-hidden className="w-4 text-center">
            💰
          </span>
          <span className={dec(c.saldoActual).gt(0) ? "font-semibold" : "text-tarjeta-suave"}>{dec(c.saldoActual).gt(0) ? `Le debemos ${formatearMoneda(c.saldoActual)}` : "No le debemos nada"}</span>
          <SemaforoCredito semaforo={c.semaforo} usoPct={c.usoPct} />
        </span>
      )}
      {p.telefono && <Dato icono="📞">{p.telefono}</Dato>}
    </TarjetaRegistro>
  );
}

/** P-20 Proveedores (08 §5.4): en tarjetas (con el semáforo de crédito) o en lista. */
export default async function PaginaProveedores({ searchParams }: PageProps<"/proveedores">) {
  const sesion = await sesionParaPantalla("proveedores.ver");
  const filtros = await searchParams;
  const texto = parametro(filtros.texto);
  const estado = estadoFiltro(filtros.estado);
  const vista = parametro(filtros.vista) === "lista" ? "lista" : "tarjetas";
  const proveedores = await listarProveedores(obtenerBaseDatos(), sesion.authUserId, { texto, estado });
  const verCredito = sesion.permisos.includes("proveedores.ver_credito");
  const conDeuda = proveedores.filter((p) => p.credito && dec(p.credito.saldoActual).gt(0));
  const sinDeuda = proveedores.filter((p) => !conDeuda.includes(p));
  const enlaceVista = (v: "tarjetas" | "lista") => {
    const q = new URLSearchParams();
    if (texto) q.set("texto", texto);
    if (estado !== "activos") q.set("estado", estado);
    if (v === "lista") q.set("vista", "lista");
    return `/proveedores${q.size ? `?${q.toString()}` : ""}`;
  };

  return (
    <section className="flex max-w-6xl flex-col gap-6">
      <Encabezado titulo="Proveedores" descripcion="Los puestos y mayoristas donde se compra. El color de arriba de cada tarjeta muestra cuánto le debemos comparado con su límite: verde tranquilo, amarillo cerca del límite, rojo al límite.">
        {sesion.permisos.includes("proveedores.editar") && (
          <Link href="/proveedores/nuevo" className={clasesBoton("principal")}>
            ＋ Nuevo proveedor
          </Link>
        )}
      </Encabezado>


      <div className="flex flex-wrap items-end justify-between gap-3">
        <Filtros>
          {vista === "lista" && <input type="hidden" name="vista" value="lista" />}
          <label className="flex min-w-56 flex-1 flex-col gap-1">
            <span className="font-medium">Buscar</span>
            <CampoBuscar name="texto" defaultValue={texto ?? ""} placeholder="Nombre o ubicación" />
          </label>
          <Selector etiqueta="Estado" name="estado" opciones={OPCIONES_ESTADO} defaultValue={estado} />
        </Filtros>
        <VistaTarjetasOLista vista={vista} enlace={enlaceVista} />
      </div>

      {proveedores.length === 0 ? (
        <p className="text-texto-suave">No hay proveedores {texto ? "con ese nombre" : "cargados todavía"}.</p>
      ) : vista === "tarjetas" ? (
        verCredito ? (
          <>
            {conDeuda.length > 0 && (
              <Grupo titulo="Con deuda" icono="💰" cantidad={conDeuda.length}>
                {conDeuda.map((p) => (
                  <TarjetaProveedor key={p.id} p={p} />
                ))}
              </Grupo>
            )}
            {sinDeuda.length > 0 && (
              <Grupo titulo="Al día" icono="✅" cantidad={sinDeuda.length}>
                {sinDeuda.map((p) => (
                  <TarjetaProveedor key={p.id} p={p} />
                ))}
              </Grupo>
            )}
          </>
        ) : (
          <Grupo titulo="Todos" cantidad={proveedores.length}>
            {proveedores.map((p) => (
              <TarjetaProveedor key={p.id} p={p} />
            ))}
          </Grupo>
        )
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
