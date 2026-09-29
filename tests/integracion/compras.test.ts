import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { auditoria, compra, compraItem, empresa, historialPrecioCompra, jornada, movimientoCuentaProveedor } from "@/db/esquema";
import { enEmpresa } from "@/db/transaccion";
import { dec } from "@/dominio/dinero/decimal";
import { hoyEnEmpresa, sumarDias } from "@/dominio/fechas/fechas";
import { guardarCategoria } from "@/modulos/catalogo/categorias";
import { agregarPresentacion, crearProducto, marcarProveedorPreferido, obtenerProducto } from "@/modulos/catalogo/productos";
import { guardarCliente } from "@/modulos/clientes/clientes";
import { anularCompra, listarCompras, obtenerCompra, registrarCompra, registrarSaldoInicial } from "@/modulos/compras/compras";
import { comprarDeLaLista } from "@/modulos/compras/compra-desde-lista";
import { cuentaDeProveedor } from "@/modulos/compras/cuenta";
import { cambiarLineaLista, generarListaCompra, marcarNoConseguido, obtenerListaCompra } from "@/modulos/compras/lista-compra";
import { agregarLinea, confirmarPedido, crearPedido, obtenerPedido } from "@/modulos/pedidos/pedidos";
import { crearOferta } from "@/modulos/precios-compra/ofertas";
import { cambiarRecargo, crearRegla } from "@/modulos/precios-venta/reglas";
import { guardarProveedor } from "@/modulos/proveedores/proveedores";

import { codigoDeError, crearBaseDePrueba, crearEmpresaDePrueba, crearUsuarioDePrueba, type BaseDePrueba } from "./base-de-prueba";

// Jornada del 24/09 de 04 §2, §5.c y §5.d: pedidos, lista de $646.300 y compras por $653.050.

let base: BaseDePrueba;
let empresaId: string;
let admin: string;
let comprador: string;
let manana: string;
const ids: Record<string, string> = {};
const presentaciones: Record<string, string> = {};

const mensajeDeError = async (promesa: Promise<unknown>) => {
  try {
    await promesa;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  return "SIN_ERROR";
};

const linea = async (producto: string) => {
  const lista = await obtenerListaCompra(base.db, admin, manana);
  return lista!.plan.flatMap((p) => p.lineas).find((l) => l.producto === producto)!;
};

const cuenta = (proveedor: string) => cuentaDeProveedor(base.db, admin, ids[proveedor]!);

async function comprar(proveedor: string, condicion: "CONTADO" | "CREDITO" | "MIXTA", items: [string, string, string, string][], extra: Record<string, unknown> = {}) {
  return registrarCompra(base.db, comprador, {
    fecha: manana,
    proveedorId: ids[proveedor]!,
    condicion,
    items: items.map(([producto, presentacion, cantidad, precio]) => ({
      productoId: ids[producto]!,
      presentacionId: presentaciones[`${producto}:${presentacion}`]!,
      cantidad,
      precio,
    })),
    ...extra,
  });
}

beforeAll(async () => {
  base = await crearBaseDePrueba();
  const e = await crearEmpresaDePrueba(base.db, "Frutas Juan");
  empresaId = e.empresaId;
  admin = e.authUserIdAdmin;
  comprador = await crearUsuarioDePrueba(base.db, empresaId, "Pedro", ["COMPRADOR"]);
  await base.comoSuperusuario(() => base.db.update(empresa).set({ redondeoModo: "ARRIBA", redondeoMultiplo: "10.0000" }).where(eq(empresa.id, empresaId)));
  manana = sumarDias(hoyEnEmpresa(new Date(), "America/Argentina/Buenos_Aires"), 1);

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
  ids.ofertaBtomate = await oferta("B", "tomate", "Cajón 18 kg", "17100");
  await oferta("B", "lechuga", "Jaula 12 u", "9600");
  await oferta("B", "cebolla", "Bolsa 20 kg", "13600");
  await oferta("C", "papa", "Bolsa 25 kg", "12500");
  await oferta("D", "banana", "Caja 20 kg", "24000");
  await oferta("E", "banana", "Caja 20 kg", "25000");
  await oferta("E", "cebolla", "Bolsa 10 kg", "7300");
  await marcarProveedorPreferido(base.db, admin, { productoId: ids.tomate!, proveedorId: ids.A! });
  await marcarProveedorPreferido(base.db, admin, { productoId: ids.banana!, proveedorId: ids.D! });

  const cliente = (nombre: string) =>
    guardarCliente(base.db, admin, {
      nombre,
      tipoCliente: "OTRO",
      prioridadFaltantes: 3,
      periodicidadFacturacion: "POR_ENTREGA",
      requiereOrdenCompra: false,
      aceptaSustituciones: true,
      requiereFirma: false,
      primerPunto: { nombre: "Local", direccion: `${nombre} 1` },
    });
  ids.hospital = await cliente("Hospital San Martín");
  ids.restaurante = await cliente("Restaurante La Esquina");
  ids.verduleria = await cliente("Verdulería Don Pepe");
  await crearRegla(base.db, admin, { clienteId: ids.hospital!, tipo: "PRECIO_FIJO", productoId: ids.tomate!, valor: "1150" });
  await cambiarRecargo(base.db, admin, { ambito: "CLIENTE", id: ids.restaurante!, valor: "35" });
  await cambiarRecargo(base.db, admin, { ambito: "PRODUCTO", id: ids.tomate!, valor: "25" });

  const pedidoDe = async (clienteId: string, lineas: [string, string][]) => {
    const { pedidoId } = await crearPedido(base.db, admin, { fecha: manana, clienteId });
    for (const [prod, cantidad] of lineas) await agregarLinea(base.db, admin, { pedidoId, productoId: ids[prod]!, cantidad });
    await confirmarPedido(base.db, admin, pedidoId);
    return pedidoId;
  };
  ids.pedHospital = await pedidoDe(ids.hospital!, [["tomate", "180"], ["papa", "140"], ["lechuga", "48"], ["banana", "60"], ["cebolla", "40"]]);
  ids.pedRestaurante = await pedidoDe(ids.restaurante!, [["tomate", "36"], ["papa", "50"], ["lechuga", "20"], ["cebolla", "15"]]);
  ids.pedVerduleria = await pedidoDe(ids.verduleria!, [["tomate", "54"], ["papa", "75"], ["lechuga", "30"], ["banana", "40"], ["cebolla", "18"]]);
});

describe("lista de compra de la jornada (04 §5.c, RN-043 a RN-052)", () => {
  it("genera la lista de $646.300 con los proveedores y el crédito del plan", async () => {
    const r = await generarListaCompra(base.db, comprador, manana);
    expect(r).toMatchObject({ numero: "LC-000001", version: 1, borradores: 0 });
    const lista = (await obtenerListaCompra(base.db, comprador, manana))!;
    expect(lista.costoEstimadoTotal).toBe("646300.00");
    const lineas = lista.plan.flatMap((p) => p.lineas.map((l) => [l.producto, p.proveedor, l.cantidadPresentaciones, l.presentacion, l.costoEstimado]));
    expect(lineas).toEqual([
      ["Tomate redondo", "Hnos. García", "15.000", "Cajón 18 kg", "243000.00"],
      ["Cebolla", "La Quinta", "4.000", "Bolsa 20 kg", "54400.00"],
      ["Lechuga criolla", "La Quinta", "9.000", "Jaula 12 u", "86400.00"],
      ["Banana", "Mayorista Norte", "5.000", "Caja 20 kg", "125000.00"],
      ["Papa", "Papas del Sur", "11.000", "Bolsa 25 kg", "137500.00"],
    ]);
    expect((await linea("Banana")).alertas).toEqual(["CREDITO_INSUFICIENTE"]);
    expect((await linea("Papa")).sobrantePrevistoBase).toBe("10.000");
    const credito = Object.fromEntries(lista.plan.map((p) => [p.proveedor, p.credito]));
    expect(credito["Hnos. García"]).toEqual({ disponibleHoy: "485000", disponibleDespues: "242000", semaforoProyectado: "VERDE" });
    expect(credito["La Quinta"]).toMatchObject({ disponibleDespues: "109200", semaforoProyectado: "AMARILLO" });
    expect(credito["Papas del Sur"]?.semaforoProyectado).toBe("SIN_LIMITE");
  });

  it("los pedidos pasan a EN_COMPRA y la jornada a COMPRANDO", async () => {
    expect((await obtenerPedido(base.db, admin, ids.pedHospital!)).estado).toBe("EN_COMPRA");
    const [j] = await enEmpresa(base.db, empresaId, (tx) => tx.select().from(jornada).where(eq(jornada.fecha, manana)));
    expect(j?.estado).toBe("COMPRANDO");
  });
});

describe("compras en el mercado (04 §5.d, 06 §3 y §9)", () => {
  it("A: 10 cajones de tomate a crédito; la línea queda parcial", async () => {
    const r = await comprar("A", "CREDITO", [["tomate", "Cajón 18 kg", "10", "16.200"]]);
    expect(r).toMatchObject({ numero: "COM-000005", total: "162000.00", advertencia: null });
    expect(r.credito.saldoNeto.toString()).toBe("177000");
    const tomate = await linea("Tomate redondo");
    expect([tomate.compradoBase, tomate.pendienteBase, tomate.estado]).toEqual(["180.000", "90", "PARCIAL"]);
  });

  it("B: mixta con $100.000 en efectivo; el tomate a $17.550 actualiza la oferta de B (RN-059)", async () => {
    const r = await comprar(
      "B",
      "MIXTA",
      [
        ["tomate", "Cajón 18 kg", "5", "17.550"],
        ["lechuga", "Jaula 12 u", "9", "9.600"],
        ["cebolla", "Bolsa 20 kg", "4", "13.600"],
      ],
      { pagadoEnElActo: "100.000", medioPago: "EFECTIVO" },
    );
    expect(r.total).toBe("228550.00");
    expect([r.credito.saldoNeto.toString(), r.credito.usoPct?.toString(), r.credito.semaforo]).toEqual(["278550", "69.64", "VERDE"]);
    expect((await linea("Tomate redondo")).estado).toBe("COMPRADO");
    // Comprado: el sobrante es el real (108 u compradas para 98 pedidas).
    expect(await linea("Lechuga criolla")).toMatchObject({ estado: "COMPRADO", sobrantePrevistoBase: "10.000" });

    const historial = await enEmpresa(base.db, empresaId, (tx) =>
      tx.select().from(historialPrecioCompra).where(and(eq(historialPrecioCompra.proveedorProductoId, ids.ofertaBtomate!), eq(historialPrecioCompra.origen, "COMPRA"))),
    );
    expect(historial).toHaveLength(1);
    expect(historial[0]).toMatchObject({ precio: "17550.0000", referencia: "COM-000006" });
    expect(historial[0]!.compraItemId).not.toBeNull();
  });

  it("con compras del día, los precios estimados usan el costo real: tomate $925/kg (RN-080)", async () => {
    const precio = async (pedidoId: string) => (await obtenerPedido(base.db, admin, pedidoId)).lineas.find((l) => l.producto === "Tomate redondo")!.precio!;
    expect(await precio(ids.pedVerduleria!)).toMatchObject({ precio: "1160.0000", costo: "925.0000" });
    expect((await precio(ids.pedRestaurante!)).precio).toBe("1250.0000");
    expect((await precio(ids.pedHospital!)).precio).toBe("1150.0000");
  });

  it("C al contado y E a crédito: total del día $653.050", async () => {
    const c = await comprar("C", "CONTADO", [["papa", "Bolsa 25 kg", "11", "12.500"]]);
    expect(c.credito.semaforo).toBe("SIN_LIMITE");
    expect(c.credito.saldoNeto.toString()).toBe("0");
    await comprar("E", "CREDITO", [["banana", "Caja 20 kg", "5", "25.000"]]);
    const compras = await listarCompras(base.db, admin, { fecha: manana });
    expect(compras.map((x) => [x.numero, x.total, x.estadoPago])).toEqual([
      ["COM-000008", "125000.00", "PENDIENTE"],
      ["COM-000007", "137500.00", "PAGADA"],
      ["COM-000006", "228550.00", "PARCIAL"],
      ["COM-000005", "162000.00", "PENDIENTE"],
    ]);
    expect(compras.reduce((s, x) => s + Number(x.total), 0)).toBe(653050);
  });

  it("el límite de crédito bloquea y dice cuánto pagar; superarlo requiere permiso y motivo (RN-063)", async () => {
    // A debe $177.000 de $500.000: una compra de $330.000 a crédito lo pasa por $7.000.
    const intento = comprar("A", "CREDITO", [["tomate", "Cajón 18 kg", "20", "16.500"]]);
    expect(await mensajeDeError(intento)).toMatch(/Pagá al menos \$7\.000 ahora/);
    const sinPermiso = comprar("A", "CREDITO", [["tomate", "Cajón 18 kg", "20", "16.500"]], { motivoExceso: "Hay que abastecer al hospital" });
    expect(await codigoDeError(sinPermiso)).toBe("SIN_PERMISO");
    const conPermiso = await registrarCompra(base.db, admin, {
      fecha: manana,
      proveedorId: ids.A!,
      condicion: "CREDITO",
      items: [{ productoId: ids.tomate!, presentacionId: presentaciones["tomate:Cajón 18 kg"]!, cantidad: "20", precio: "16500" }],
      motivoExceso: "Hay que abastecer al hospital",
    });
    expect(conPermiso.credito.semaforo).toBe("EXCEDIDO");
    ids.compraExceso = conPermiso.compraId;
    const [registro] = await enEmpresa(base.db, empresaId, (tx) => tx.select().from(auditoria).where(eq(auditoria.accion, "EXCESO_LIMITE")));
    expect(registro?.motivo).toBe("Hay que abastecer al hospital");
  });

  it("anular deja la cuenta como estaba con un movimiento compensatorio (RN-065)", async () => {
    await anularCompra(base.db, admin, { compraId: ids.compraExceso!, motivo: "Se cargó de más" });
    expect((await cuenta("A")).indicadores.saldoNeto.toString()).toBe("177000");
    const { movimientos } = await cuenta("A");
    expect(movimientos.slice(0, 2).map((m) => [m.tipo, m.importe])).toEqual([
      ["ANULACION_COMPRA", "-330000.00"],
      ["CARGO_COMPRA", "330000.00"],
    ]);
    expect((await obtenerCompra(base.db, admin, ids.compraExceso!)).estado).toBe("ANULADA");
  });

  it("anular una compra pagada deja lo pagado a favor del puesto", async () => {
    const [c] = await enEmpresa(base.db, empresaId, (tx) => tx.select().from(compra).where(eq(compra.numero, 7)));
    await anularCompra(base.db, admin, { compraId: c!.id, motivo: "Devolvimos la papa" });
    const { indicadores } = await cuenta("C");
    expect([indicadores.saldoNeto.toString(), indicadores.saldoAFavor.toString()]).toEqual(["-137500", "137500"]);
    expect((await linea("Papa")).estado).toBe("PENDIENTE");
  });

  it("un precio muy distinto al vigente pide confirmación (RN-058); la misma compra no se duplica", async () => {
    const brusca = comprar("B", "CREDITO", [["tomate", "Cajón 18 kg", "1", "30.000"]]);
    expect(await mensajeDeError(brusca)).toMatch(/cambian mucho.*Confirmar/);
    const clave = randomUUID();
    const primera = await comprar("B", "CREDITO", [["lechuga", "Jaula 12 u", "1", "9.600"]], { claveIdempotencia: clave });
    const segunda = await comprar("B", "CREDITO", [["lechuga", "Jaula 12 u", "1", "9.600"]], { claveIdempotencia: clave });
    expect(segunda.compraId).toBe(primera.compraId);
  });

  it("la cuenta y las compras registradas no se pueden tocar (RN-064, RN-092)", async () => {
    const tocarLibro = enEmpresa(base.db, empresaId, (tx) => tx.update(movimientoCuentaProveedor).set({ importe: "1" }));
    expect(await codigoDeError(tocarLibro)).toBe("PERMISO_BD");
    const tocarItem = enEmpresa(base.db, empresaId, (tx) => tx.update(compraItem).set({ precioUnitario: "1" }));
    expect(await codigoDeError(tocarItem)).toBe("PERMISO_BD");
    const tocarTotal = enEmpresa(base.db, empresaId, (tx) => tx.update(compra).set({ total: "1" }));
    expect(await codigoDeError(tocarTotal)).toBe("PERMISO_BD");
  });
});

describe("cambios después de armar la lista (04 §5.c.4, RN-049 a RN-052)", () => {
  it("un pedido que cambia deja la lista desactualizada; regenerar conserva lo comprado", async () => {
    await agregarLinea(base.db, admin, { pedidoId: ids.pedRestaurante!, productoId: ids.cebolla!, cantidad: "10" });
    expect((await obtenerListaCompra(base.db, admin, manana))!.desactualizada).toBe(true);
    const r = await generarListaCompra(base.db, comprador, manana);
    expect(r.version).toBe(2);
    expect(r.cambios).toEqual(["Cebolla: 73 → 83"]);
    const cebolla = await linea("Cebolla");
    expect([cebolla.compradoBase, cebolla.pendienteBase, cebolla.cantidadPresentaciones, cebolla.sobrantePrevistoBase, cebolla.estado, cebolla.necesidadModificada]).toEqual([
      "80.000",
      "3",
      "1.000",
      "17.000",
      "PARCIAL",
      true,
    ]);
  });

  it("el comprador cambia cantidades con motivo, elige otro puesto y marca lo que no consiguió", async () => {
    const banana = await linea("Banana");
    expect(await mensajeDeError(cambiarLineaLista(base.db, comprador, { itemId: banana.id, cantidad: "6" }))).toMatch(/por qué/);
    await cambiarLineaLista(base.db, comprador, { itemId: banana.id, cantidad: "6", motivo: "Una caja de más" });
    expect((await linea("Banana")).cantidadPresentaciones).toBe("6.000");
    const papa = await linea("Papa");
    await marcarNoConseguido(base.db, comprador, { itemId: papa.id, motivo: "No había en el mercado" });
    expect((await linea("Papa")).estado).toBe("NO_CONSEGUIDO");
    await generarListaCompra(base.db, comprador, manana);
    expect(((await linea("Banana")).cantidadPresentaciones)).toBe("6.000");
    expect((await linea("Papa")).estado).toBe("NO_CONSEGUIDO");
  });
});

describe("✓ Lo compré, desde la lista de compras", () => {
  it("anota la compra en el puesto elegido y la línea suma lo comprado", async () => {
    const banana = await linea("Banana");
    const r = await comprarDeLaLista(base.db, comprador, { itemId: banana.id, proveedorId: ids.D!, presentacionId: presentaciones["banana:Caja 20 kg"]!, cantidad: "1", precio: "24000", pagado: true });
    expect([r.producto, r.proveedor, r.total]).toEqual(["Banana", "Frutas Tropicales", "24000.00"]);
    expect(dec((await linea("Banana")).compradoBase).minus(banana.compradoBase).toString()).toBe("20");
    const compra = await obtenerCompra(base.db, admin, r.compraId);
    expect([compra.condicion, compra.fechaJornada]).toEqual(["CONTADO", manana]);
  });

  it("no deja anotar en un puesto o un envase de otro producto", async () => {
    const banana = await linea("Banana");
    expect(await codigoDeError(comprarDeLaLista(base.db, comprador, { itemId: banana.id, ofertaId: ids.ofertaBtomate!, cantidad: "1", precio: "17100", pagado: false }))).toBe("VALIDACION");
    expect(await codigoDeError(comprarDeLaLista(base.db, comprador, { itemId: banana.id, proveedorId: ids.D!, presentacionId: presentaciones["tomate:Cajón 18 kg"]!, cantidad: "1", precio: "100", pagado: true }))).toBe("VALIDACION");
    expect(await codigoDeError(comprarDeLaLista(base.db, comprador, { itemId: banana.id, cantidad: "1", precio: "100", pagado: true }))).toBe("VALIDACION");
  });
});
