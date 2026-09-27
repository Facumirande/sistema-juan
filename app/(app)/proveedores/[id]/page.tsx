import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { formatearFecha, hoyEnEmpresa } from "@/dominio/fechas/fechas";
import { listarPresentacionesDeCompra } from "@/modulos/catalogo/productos";
import { listarCompras } from "@/modulos/compras/compras";
import { cuentaDeProveedor } from "@/modulos/compras/cuenta";
import { listaGeneralPreciosCompra } from "@/modulos/precios-compra/ofertas";
import { obtenerProveedor } from "@/modulos/proveedores/proveedores";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { cargarFicha, idDeRuta } from "@/ui/accion-servidor";
import { CONDICIONES_COMPRA, CONDICIONES_PAGO, ESTADOS_PAGO } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { CampoNumero, Encabezado, Estado, Selector, Tabla, Tarjeta, clasesBoton } from "@/ui/formularios";
import { SemaforoCredito } from "@/ui/semaforo";

import { crearOfertaAccion } from "../../precios/compra/acciones";
import { TablaOfertas, permisosOfertas } from "../../precios/compra/tabla-ofertas";
import { cambiarEstadoProveedorAccion, editarProveedorAccion } from "../acciones";
import { CamposProveedor } from "../campos-proveedor";

export const metadata: Metadata = { title: "Proveedor · Sistema Juan" };

/** P-21 Ficha de proveedor: datos, productos y precios, crédito (08 §5.4). */
export default async function FichaDeProveedor({ params }: PageProps<"/proveedores/[id]">) {
  const sesion = await sesionParaPantalla("proveedores.ver");
  const id = idDeRuta((await params).id);
  const db = obtenerBaseDatos();
  const p = await cargarFicha(obtenerProveedor(db, sesion.authUserId, id));

  const verCostos = sesion.permisos.includes("precios.ver_costos");
  const puedeEditar = sesion.permisos.includes("proveedores.editar");
  const puedeCrearOferta = puedeEditar && sesion.permisos.includes("precios.editar_compra");
  const [ofertas, presentaciones, cuenta, compras] = await Promise.all([
    verCostos ? listaGeneralPreciosCompra(db, sesion.authUserId, { proveedorId: id }).then((r) => r.ofertas) : Promise.resolve([]),
    puedeCrearOferta ? listarPresentacionesDeCompra(db, sesion.authUserId) : Promise.resolve([]),
    p.credito ? cuentaDeProveedor(db, sesion.authUserId, id, 10) : Promise.resolve(null),
    sesion.permisos.includes("compras.ver") ? listarCompras(db, sesion.authUserId, { proveedorId: id }) : Promise.resolve([]),
  ]);
  const yaOfrecidas = new Set(ofertas.map((o) => o.presentacionId));
  const opcionesOferta = presentaciones
    .filter((pr) => !yaOfrecidas.has(pr.presentacionId))
    .map((pr) => ({ valor: `${pr.productoId}:${pr.presentacionId}`, etiqueta: `${pr.producto} · ${pr.presentacion}` }));

  const telefonoWhatsApp = p.telefono?.replace(/\D/g, "");

  return (
    <section className="flex max-w-5xl flex-col gap-6">
      <Encabezado
        titulo={p.nombre}
        volver={{ ruta: "/proveedores", texto: "Proveedores" }}
        descripcion={[p.ubicacionMercado, CONDICIONES_PAGO[p.condicionPagoHabitual]].filter(Boolean).join(" · ")}
      >
        <Estado activo={p.activo} />
        {telefonoWhatsApp && (
          <a href={`https://wa.me/${telefonoWhatsApp}`} className={clasesBoton("secundario")} target="_blank" rel="noreferrer">
            WhatsApp
          </a>
        )}
        {sesion.permisos.includes("precios.editar_compra") && ofertas.length > 0 && (
          <Link href={`/precios/compra/rapida?proveedor=${p.id}`} className={clasesBoton("principal")}>
            Actualizar precios
          </Link>
        )}
      </Encabezado>

      {p.credito && (
        <Tarjeta titulo="Cuenta">
          {cuenta && (
            <div className="flex flex-wrap items-center gap-2">
              <SemaforoCredito semaforo={cuenta.indicadores.semaforo} usoPct={cuenta.indicadores.usoPct?.toString()} />
              <span>
                {cuenta.indicadores.saldoAFavor.gt(0) ? (
                  <>
                    Tenemos <b>{formatearMoneda(cuenta.indicadores.saldoAFavor)}</b> a favor
                  </>
                ) : (
                  <>
                    Se le debe <b>{formatearMoneda(cuenta.indicadores.saldoPendiente)}</b>
                  </>
                )}
                {cuenta.indicadores.disponible !== null && ` · disponible ${formatearMoneda(cuenta.indicadores.disponible)}`}
              </span>
            </div>
          )}
          <p className="text-texto-suave">
            Límite: {p.credito.limiteCredito ? formatearMoneda(p.credito.limiteCredito) : "sin límite"}
            {" · "}Plazo de pago: {p.credito.plazoPagoDias !== null ? `${p.credito.plazoPagoDias} días` : "sin plazo"}
          </p>
          {cuenta && cuenta.movimientos.length > 0 && (
            <Tabla>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Movimiento</th>
                  <th className="text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {cuenta.movimientos.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap">{formatearFecha(hoyEnEmpresa(m.fecha, sesion.zonaHoraria))}</td>
                    <td>
                      {m.compraId ? (
                        <Link href={`/compras/${m.compraId}`} className="underline-offset-4 hover:underline">
                          {m.descripcion}
                        </Link>
                      ) : (
                        m.descripcion
                      )}
                      {m.motivo && <span className="block text-sm text-texto-suave">{m.motivo}</span>}
                    </td>
                    <td className="text-right whitespace-nowrap">{formatearMoneda(m.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
          {sesion.permisos.includes("pagos.ver") && (
            <div className="flex flex-wrap gap-2">
              <Link href={`/cuentas-proveedores/${p.id}`} className={clasesBoton("secundario")}>
                Ver la cuenta
              </Link>
              {sesion.permisos.includes("pagos.registrar") && (
                <Link href={`/cuentas-proveedores/${p.id}/pago`} className={clasesBoton("secundario")}>
                  Registrar pago
                </Link>
              )}
            </div>
          )}
        </Tarjeta>
      )}

      {compras.length > 0 && (
        <Tarjeta titulo="Últimas compras">
          <ul className="flex flex-col">
            {compras.slice(0, 8).map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-borde py-2 first:border-t-0">
                <Link href={`/compras/${c.id}`} className="font-medium underline-offset-4 hover:underline">
                  {c.numero}
                </Link>
                <span className="text-texto-suave">{formatearFecha(hoyEnEmpresa(c.fecha, sesion.zonaHoraria))}</span>
                <span>{c.estado === "ANULADA" ? "Anulada" : c.estadoPago ? ESTADOS_PAGO[c.estadoPago] : CONDICIONES_COMPRA[c.condicion]}</span>
                {c.total && <span className="font-semibold">{formatearMoneda(c.total)}</span>}
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      {verCostos && (
        <Tarjeta titulo="Productos y precios">
          {ofertas.length === 0 ? (
            <p className="text-texto-suave">Todavía no tiene productos con precio.</p>
          ) : (
            <TablaOfertas ofertas={ofertas} mostrar="producto" permisos={permisosOfertas(sesion.permisos)} />
          )}
          {puedeCrearOferta && p.activo && (
            <details open={ofertas.length === 0}>
              <summary className="min-h-11 cursor-pointer py-2 font-medium">+ Agregar un producto</summary>
              {opcionesOferta.length === 0 ? (
                <p className="text-texto-suave">
                  No hay más presentaciones de compra para ofrecer. Cargalas en{" "}
                  <Link href="/productos" className="underline">
                    Productos
                  </Link>
                  .
                </p>
              ) : (
                <FormularioAccion accion={crearOfertaAccion} boton="Agregar">
                  <input type="hidden" name="proveedorId" value={p.id} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Selector etiqueta="Producto y presentación" name="productoPresentacion" opciones={opcionesOferta} />
                    <CampoNumero etiqueta="Precio de la presentación" name="precio" placeholder="Ej. 21.600" />
                  </div>
                </FormularioAccion>
              )}
            </details>
          )}
        </Tarjeta>
      )}

      {puedeEditar && (
        <Tarjeta titulo="Datos del proveedor">
          <FormularioAccion accion={editarProveedorAccion} boton="Guardar cambios">
            <input type="hidden" name="id" value={p.id} />
            <CamposProveedor proveedor={p} editarCredito={sesion.permisos.includes("proveedores.editar_limite")} />
          </FormularioAccion>
          <FormularioAccion
            accion={cambiarEstadoProveedorAccion}
            boton={p.activo ? "Desactivar proveedor" : "Reactivar proveedor"}
            variante={p.activo ? "peligro" : "secundario"}
            confirmar={p.activo ? `¿Desactivar a ${p.nombre}? Sus precios dejan de aparecer para comprar.` : undefined}
          >
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="activo" value={String(!p.activo)} />
          </FormularioAccion>
        </Tarjeta>
      )}
    </section>
  );
}
