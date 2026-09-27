import { eq } from "drizzle-orm";

import { empresa } from "@/db/esquema";
import { hoyEnEmpresa, sumarDias } from "@/dominio/fechas/fechas";
import { guardarCategoria } from "@/modulos/catalogo/categorias";
import { agregarPresentacion, crearProducto, marcarProveedorPreferido, obtenerProducto } from "@/modulos/catalogo/productos";
import { guardarCliente } from "@/modulos/clientes/clientes";
import { registrarCompra, registrarSaldoInicial } from "@/modulos/compras/compras";
import { generarListaCompra } from "@/modulos/compras/lista-compra";
import { agregarLinea, confirmarPedido, crearPedido } from "@/modulos/pedidos/pedidos";
import { crearOferta } from "@/modulos/precios-compra/ofertas";
import { cambiarRecargo, crearRegla } from "@/modulos/precios-venta/reglas";
import { guardarProveedor } from "@/modulos/proveedores/proveedores";

import { crearBaseDePrueba, crearEmpresaDePrueba, crearUsuarioDePrueba, type BaseDePrueba } from "./base-de-prueba";

// Jornada del 24/09 de 04 §2 hasta el final de las compras (04 §5.d): los pedidos de los tres
// clientes, la lista de compra y las compras por $653.050. La usan las pruebas de entregas.

export interface Jornada2409 {
  base: BaseDePrueba;
  empresaId: string;
  admin: string;
  comprador: string;
  manana: string;
  ids: Record<string, string>;
  presentaciones: Record<string, string>;
}

export async function prepararJornada2409(): Promise<Jornada2409> {
  const base = await crearBaseDePrueba();
  const e = await crearEmpresaDePrueba(base.db, "Frutas Juan");
  const empresaId = e.empresaId;
  const admin = e.authUserIdAdmin;
  const comprador = await crearUsuarioDePrueba(base.db, empresaId, "Pedro", ["COMPRADOR"]);
  await base.comoSuperusuario(() => base.db.update(empresa).set({ redondeoModo: "ARRIBA", redondeoMultiplo: "10.0000" }).where(eq(empresa.id, empresaId)));
  const manana = sumarDias(hoyEnEmpresa(new Date(), "America/Argentina/Buenos_Aires"), 1);
  const ids: Record<string, string> = {};
  const presentaciones: Record<string, string> = {};

  ids.verduras = await guardarCategoria(base.db, admin, { nombre: "Verduras", grupo: "VERDURA", orden: "1" });
  ids.frutas = await guardarCategoria(base.db, admin, { nombre: "Frutas", grupo: "FRUTA", orden: "2" });
  const producto = async (clave: string, nombre: string, categoria: string, unidad: "KG" | "UNIDAD", compra: [string, string]) => {
    ids[clave] = await crearProducto(base.db, admin, {
      codigo: clave.toUpperCase(),
      nombre,
      categoriaId: ids[categoria]!,
      unidadBase: unidad,
      admiteFraccion: unidad === "KG",
      presentacionCompraNombre: compra[0],
      presentacionCompraFactor: compra[1],
    });
  };
  await producto("tomate", "Tomate redondo", "verduras", "KG", ["Cajón 18 kg", "18"]);
  await producto("papa", "Papa", "verduras", "KG", ["Bolsa 25 kg", "25"]);
  await producto("lechuga", "Lechuga criolla", "verduras", "UNIDAD", ["Jaula 12 u", "12"]);
  await producto("banana", "Banana", "frutas", "KG", ["Caja 20 kg", "20"]);
  await producto("cebolla", "Cebolla", "verduras", "KG", ["Cajón 18 kg", "18"]);
  await agregarPresentacion(base.db, admin, { productoId: ids.cebolla!, nombre: "Bolsa 20 kg", factorABase: "20", usableEnCompra: true, usableEnVenta: true });
  await agregarPresentacion(base.db, admin, { productoId: ids.cebolla!, nombre: "Bolsa 10 kg", factorABase: "10", usableEnCompra: true, usableEnVenta: false });
  for (const clave of ["tomate", "papa", "lechuga", "banana", "cebolla"]) {
    for (const pr of (await obtenerProducto(base.db, admin, ids[clave]!)).presentaciones) presentaciones[`${clave}:${pr.nombre}`] = pr.id;
  }

  const proveedor = async (clave: string, nombre: string, limite: string | null, plazo: string | null, saldo: string) => {
    ids[clave] = await guardarProveedor(base.db, admin, { nombre, condicionPagoHabitual: "CREDITO", limiteCredito: limite, plazoPagoDias: plazo });
    if (saldo !== "0") await registrarSaldoInicial(base.db, admin, { proveedorId: ids[clave]!, monto: saldo, fecha: sumarDias(manana, -10) });
  };
  await proveedor("A", "Hnos. García", "500000", "7", "15000");
  await proveedor("B", "La Quinta", "400000", "15", "150000");
  await proveedor("C", "Papas del Sur", null, null, "0");
  await proveedor("D", "Frutas Tropicales", "150000", "10", "60000");
  await proveedor("E", "Mayorista Norte", "300000", "7", "40000");
  const oferta = (prov: string, prod: string, pres: string, precio: string) =>
    crearOferta(base.db, admin, { proveedorId: ids[prov]!, productoId: ids[prod]!, presentacionId: presentaciones[`${prod}:${pres}`]!, precio });
  await oferta("A", "tomate", "Cajón 18 kg", "16200");
  await oferta("A", "papa", "Bolsa 25 kg", "13000");
  await oferta("A", "cebolla", "Cajón 18 kg", "12600");
  await oferta("B", "tomate", "Cajón 18 kg", "17100");
  await oferta("B", "lechuga", "Jaula 12 u", "9600");
  await oferta("B", "cebolla", "Bolsa 20 kg", "13600");
  await oferta("C", "papa", "Bolsa 25 kg", "12500");
  await oferta("D", "banana", "Caja 20 kg", "24000");
  await oferta("E", "banana", "Caja 20 kg", "25000");
  await oferta("E", "cebolla", "Bolsa 10 kg", "7300");
  await marcarProveedorPreferido(base.db, admin, { productoId: ids.tomate!, proveedorId: ids.A! });
  await marcarProveedorPreferido(base.db, admin, { productoId: ids.banana!, proveedorId: ids.D! });

  const cliente = (nombre: string, prioridad: number) =>
    guardarCliente(base.db, admin, {
      nombre,
      tipoCliente: "OTRO",
      prioridadFaltantes: prioridad,
      periodicidadFacturacion: "POR_ENTREGA",
      requiereOrdenCompra: false,
      aceptaSustituciones: true,
      requiereFirma: false,
      primerPunto: { nombre: "Local", direccion: `${nombre} 1` },
    });
  ids.hospital = await cliente("Hospital San Martín", 1);
  ids.restaurante = await cliente("Restaurante La Esquina", 2);
  ids.verduleria = await cliente("Verdulería Don Pepe", 2);
  await crearRegla(base.db, admin, { clienteId: ids.hospital!, tipo: "PRECIO_FIJO", productoId: ids.tomate!, valor: "1150" });
  await cambiarRecargo(base.db, admin, { ambito: "CLIENTE", id: ids.restaurante!, valor: "35" });
  // Recargo de cada producto (04 §2): la verdulería usa estos.
  for (const [clave, valor] of [["tomate", "25"], ["papa", "30"], ["lechuga", "35"], ["banana", "35"], ["cebolla", "30"]] as const) {
    await cambiarRecargo(base.db, admin, { ambito: "PRODUCTO", id: ids[clave]!, valor });
  }

  const pedidoDe = async (clienteId: string, lineas: [string, string][]) => {
    const { pedidoId } = await crearPedido(base.db, admin, { fecha: manana, clienteId });
    for (const [prod, cantidad] of lineas) await agregarLinea(base.db, admin, { pedidoId, productoId: ids[prod]!, cantidad });
    await confirmarPedido(base.db, admin, pedidoId);
    return pedidoId;
  };
  ids.pedHospital = await pedidoDe(ids.hospital!, [["tomate", "180"], ["papa", "140"], ["lechuga", "48"], ["banana", "60"], ["cebolla", "40"]]);
  ids.pedRestaurante = await pedidoDe(ids.restaurante!, [["tomate", "36"], ["papa", "50"], ["lechuga", "20"], ["cebolla", "15"]]);
  ids.pedVerduleria = await pedidoDe(ids.verduleria!, [["tomate", "54"], ["papa", "75"], ["lechuga", "30"], ["banana", "40"], ["cebolla", "18"]]);

  await generarListaCompra(base.db, comprador, manana);
  const comprar = (prov: string, condicion: "CONTADO" | "CREDITO" | "MIXTA", items: [string, string, string, string][], extra: Record<string, unknown> = {}) =>
    registrarCompra(base.db, comprador, {
      fecha: manana,
      proveedorId: ids[prov]!,
      condicion,
      items: items.map(([producto, presentacion, cantidad, precio]) => ({ productoId: ids[producto]!, presentacionId: presentaciones[`${producto}:${presentacion}`]!, cantidad, precio })),
      ...extra,
    });
  await comprar("A", "CREDITO", [["tomate", "Cajón 18 kg", "10", "16.200"]]);
  await comprar(
    "B",
    "MIXTA",
    [
      ["tomate", "Cajón 18 kg", "5", "17.550"],
      ["lechuga", "Jaula 12 u", "9", "9.600"],
      ["cebolla", "Bolsa 20 kg", "4", "13.600"],
    ],
    { pagadoEnElActo: "100.000", medioPago: "EFECTIVO" },
  );
  await comprar("C", "CONTADO", [["papa", "Bolsa 25 kg", "11", "12.500"]]);
  await comprar("E", "CREDITO", [["banana", "Caja 20 kg", "5", "25.000"]]);
  return { base, empresaId, admin, comprador, manana, ids, presentaciones };
}
