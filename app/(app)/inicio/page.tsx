import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { dec } from "@/dominio/dinero/decimal";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { formatearFecha, hoyEnEmpresa } from "@/dominio/fechas/fechas";
import { listarCuentasProveedores } from "@/modulos/compras/cuenta-corriente";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { contarPedidosPendientes } from "@/modulos/usuarios/acceso";
import type { Permiso } from "@/seguridad/catalogo-permisos";

export const metadata: Metadata = { title: "Inicio · Sistema Juan" };

const ACCESOS: { titulo: string; detalle: string; ruta: string; permiso: Permiso }[] = [
  { titulo: "Pedidos", detalle: "Cargar y revisar lo que pidió cada cliente.", ruta: "/pedidos", permiso: "pedidos.ver" },
  { titulo: "Lista de compra", detalle: "Qué comprar mañana, cuánto y a qué puesto.", ruta: "/lista-compra", permiso: "lista_compra.ver" },
  { titulo: "Registrar compra", detalle: "Lo que se compró en cada puesto y cómo se pagó.", ruta: "/compras/nueva", permiso: "compras.registrar" },
  { titulo: "Deudas con proveedores", detalle: "Cuánto se le debe a cada uno y cuánto crédito queda.", ruta: "/cuentas-proveedores", permiso: "pagos.ver" },
  { titulo: "Actualizar precios en el puesto", detalle: "Desde el celular, puesto por puesto.", ruta: "/precios/compra/rapida", permiso: "precios.editar_compra" },
  { titulo: "Precios de compra", detalle: "Qué cuesta cada cosa en cada proveedor.", ruta: "/precios/compra", permiso: "precios.ver_costos" },
  { titulo: "Productos", detalle: "Lo que se compra y se vende.", ruta: "/productos", permiso: "productos.ver" },
  { titulo: "Proveedores", detalle: "Puestos y mayoristas.", ruta: "/proveedores", permiso: "proveedores.ver" },
  { titulo: "Clientes", detalle: "A quién se le vende y dónde se entrega.", ruta: "/clientes", permiso: "clientes.ver" },
  { titulo: "Precios de venta", detalle: "Recargos y la lista de precios de cada cliente.", ruta: "/precios/venta", permiso: "precios.ver_margenes" },
];

/** P-02 Inicio: por ahora, accesos directos a lo que ya funciona (08 §5.1 se completa con cada iteración). */
export default async function Inicio() {
  const sesion = await sesionParaPantalla(null);
  const hoy = formatearFecha(hoyEnEmpresa(new Date(), sesion.zonaHoraria));
  const accesos = ACCESOS.filter((a) => sesion.permisos.includes(a.permiso));
  const db = obtenerBaseDatos();
  const pedidos = sesion.permisos.includes("usuarios.administrar") ? await contarPedidosPendientes(db, sesion.authUserId) : 0;
  // Alertas de deuda con proveedores (RN-107): vencida en rojo, por vencer en ámbar.
  const cuentas = sesion.permisos.includes("pagos.ver") && sesion.permisos.includes("proveedores.ver_credito") ? (await listarCuentasProveedores(db, sesion.authUserId)).cuentas : [];
  const vencidas = cuentas.filter((c) => dec(c.vencimientos.vencida).gt(0));
  const porVencer = cuentas.filter((c) => dec(c.vencimientos.vencida).isZero() && dec(c.vencimientos.porVencer).gt(0));

  return (
    <section className="flex max-w-3xl flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Hola, {sesion.nombre.split(" ")[0]}</h1>
        <p className="text-texto-suave">Hoy es {hoy}.</p>
      </header>
      {pedidos > 0 && (
        <Link href="/usuarios" className="rounded-lg border border-marca bg-superficie p-4 font-semibold">
          {pedidos === 1 ? "Hay 1 persona esperando que la habilites" : `Hay ${pedidos} personas esperando que las habilites`} →
        </Link>
      )}
      {vencidas.length > 0 && (
        <div role="alert" className="flex flex-col gap-1 rounded-lg border border-error bg-superficie p-4">
          <p className="font-semibold text-error">⏰ Deuda vencida con proveedores</p>
          {vencidas.map((c) => (
            <Link key={c.proveedorId} href={`/cuentas-proveedores/${c.proveedorId}`} className="underline-offset-4 hover:underline">
              {c.proveedor}: {formatearMoneda(c.vencimientos.vencida)} ({c.vencimientos.maxDiasAtraso} {c.vencimientos.maxDiasAtraso === 1 ? "día" : "días"} de atraso)
            </Link>
          ))}
        </div>
      )}
      {porVencer.length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg border border-amber-500 bg-superficie p-4">
          <p className="font-semibold text-amber-600 dark:text-amber-400">Vence en los próximos días</p>
          {porVencer.map((c) => (
            <Link key={c.proveedorId} href={`/cuentas-proveedores/${c.proveedorId}`} className="underline-offset-4 hover:underline">
              {c.proveedor}: {formatearMoneda(c.vencimientos.porVencer)}
              {c.vencimientos.proximo && ` (el ${formatearFecha(c.vencimientos.proximo.fecha).slice(0, 5)})`}
            </Link>
          ))}
        </div>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {accesos.map((a) => (
          <li key={a.ruta}>
            <Link href={a.ruta} className="flex min-h-20 flex-col justify-center rounded-lg border border-borde bg-superficie p-4 hover:border-marca">
              <span className="text-lg font-semibold">{a.titulo}</span>
              <span className="text-texto-suave">{a.detalle}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
