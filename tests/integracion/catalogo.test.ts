import { and, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { auditoria, historialPrecioCompra, presentacion, proveedorProducto } from "@/db/esquema";
import { enEmpresa } from "@/db/transaccion";
import { cambiarEstadoCategoria, guardarCategoria, listarCategorias } from "@/modulos/catalogo/categorias";
import {
  agregarPresentacion,
  cambiarEstadoPresentacion,
  crearProducto,
  editarPresentacion,
  editarProducto,
  listarProductos,
  marcarProveedorPreferido,
  obtenerProducto,
} from "@/modulos/catalogo/productos";
import {
  cambiarEstadoPuntoEntrega,
  guardarCliente,
  guardarPuntoEntrega,
  marcarPuntoPrincipal,
  obtenerCliente,
} from "@/modulos/clientes/clientes";
import {
  actualizacionRapida,
  actualizarPrecioOferta,
  cambiarDisponibilidadOferta,
  cambiarEstadoOferta,
  confirmarPreciosSinCambios,
  crearOferta,
  historialDeOferta,
  listaGeneralPreciosCompra,
} from "@/modulos/precios-compra/ofertas";
import { guardarProveedor, listarProveedores, obtenerProveedor } from "@/modulos/proveedores/proveedores";

import { codigoDeError, crearBaseDePrueba, crearEmpresaDePrueba, crearUsuarioDePrueba, type BaseDePrueba } from "./base-de-prueba";

// Escenario de 04 §2 y lista general de 05 §2.1.

let base: BaseDePrueba;
let empresa: Awaited<ReturnType<typeof crearEmpresaDePrueba>>;
let admin: string;
let comprador: string;
let vendedor: string;
const ids: Record<string, string> = {};

const mensajeDeError = async (promesa: Promise<unknown>) => {
  try {
    await promesa;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  return "SIN_ERROR";
};

async function presentacionDe(productoId: string, nombre: string): Promise<string> {
  const ficha = await obtenerProducto(base.db, admin, productoId);
  const pr = ficha.presentaciones.find((p) => p.nombre === nombre);
  if (!pr) throw new Error(`Sin presentación ${nombre}`);
  return pr.id;
}

async function oferta(proveedor: string, producto: string, presentacionNombre: string, precio: string) {
  const id = await crearOferta(base.db, admin, {
    proveedorId: ids[proveedor]!,
    productoId: ids[producto]!,
    presentacionId: await presentacionDe(ids[producto]!, presentacionNombre),
    precio,
  });
  ids[`${producto}-${proveedor}`] = id;
  return id;
}

const filaDe = async (clave: string) => {
  const { ofertas } = await listaGeneralPreciosCompra(base.db, admin);
  return ofertas.find((o) => o.id === ids[clave]);
};

beforeAll(async () => {
  base = await crearBaseDePrueba();
  empresa = await crearEmpresaDePrueba(base.db, "Frutas Juan");
  admin = empresa.authUserIdAdmin;
  comprador = await crearUsuarioDePrueba(base.db, empresa.empresaId, "Pedro", ["COMPRADOR"]);
  vendedor = await crearUsuarioDePrueba(base.db, empresa.empresaId, "Vale", ["VENDEDOR"]);
});

describe("categorías (P-12)", () => {
  it("crea categorías con nombre único sin distinguir mayúsculas", async () => {
    ids.verduras = await guardarCategoria(base.db, admin, { nombre: "Verduras", grupo: "VERDURA", orden: "1" });
    ids.frutas = await guardarCategoria(base.db, admin, { nombre: "Frutas", grupo: "FRUTA", orden: "2" });
    expect(await mensajeDeError(guardarCategoria(base.db, admin, { nombre: "verduras", grupo: "VERDURA" }))).toMatch(/Ya existe/);
    expect((await listarCategorias(base.db, vendedor)).map((c) => c.nombre)).toEqual(["Verduras", "Frutas"]);
    expect(await codigoDeError(guardarCategoria(base.db, vendedor, { nombre: "Otra", grupo: "OTRO" }))).toBe("SIN_PERMISO");
  });
});

describe("productos y presentaciones (RN-001 a RN-009)", () => {
  it("crea el producto con su presentación de unidad base y la de compra; toma el IVA de la empresa (RN-006)", async () => {
    ids.tomate = await crearProducto(base.db, admin, {
      codigo: "tom-r",
      nombre: "Tomate redondo",
      categoriaId: ids.verduras!,
      unidadBase: "KG",
      admiteFraccion: true,
      presentacionCompraNombre: "Cajón 18 kg",
      presentacionCompraFactor: "18",
    });
    const ficha = await obtenerProducto(base.db, admin, ids.tomate);
    expect(ficha).toMatchObject({ codigo: "TOM-R", unidadBase: "KG", alicuotaIva: "0.000", unidadBaseEditable: false });
    expect(ficha.presentaciones.map((p) => [p.nombre, p.factorABase, p.esUnidadBase])).toEqual([
      ["kg", "1.000", true],
      ["Cajón 18 kg", "18.000", false],
    ]);
    expect(ficha.presentacionVentaDefaultId).toBe(ficha.presentaciones[0]!.id);
    expect(ficha.presentacionCompraDefaultId).toBe(ficha.presentaciones[1]!.id);
  });

  it("carga el resto del escenario", async () => {
    const nuevo = (codigo: string, nombre: string, categoria: string, unidadBase: "KG" | "UNIDAD", compra?: [string, string]) =>
      crearProducto(base.db, admin, {
        codigo,
        nombre,
        categoriaId: ids[categoria]!,
        unidadBase,
        admiteFraccion: unidadBase === "KG",
        presentacionCompraNombre: compra?.[0],
        presentacionCompraFactor: compra?.[1],
      });
    ids.papa = await nuevo("PAPA", "Papa", "verduras", "KG", ["Bolsa 25 kg", "25"]);
    ids.lechuga = await nuevo("LECH", "Lechuga criolla", "verduras", "UNIDAD", ["Jaula 12 u", "12"]);
    ids.banana = await nuevo("BAN", "Banana", "frutas", "KG", ["Caja 20 kg", "20"]);
    ids.cebolla = await nuevo("CEB", "Cebolla", "verduras", "KG", ["Cajón 18 kg", "18"]);
    await agregarPresentacion(base.db, admin, { productoId: ids.cebolla, nombre: "Bolsa 20 kg", factorABase: "20", usableEnCompra: true, usableEnVenta: true });
    await agregarPresentacion(base.db, admin, { productoId: ids.cebolla, nombre: "Bolsa 10 kg", factorABase: "10", usableEnCompra: true, usableEnVenta: false });
    const lista = await listarProductos(base.db, vendedor);
    expect(lista.map((p) => [p.nombre, p.presentaciones])).toEqual([
      ["Cebolla", 4],
      ["Lechuga criolla", 2],
      ["Papa", 2],
      ["Tomate redondo", 2],
      ["Banana", 2],
    ]);
  });

  it("código y nombre únicos (RN-004), categoría obligatoria y activa (RN-005)", async () => {
    const base_ = { nombre: "Otro", categoriaId: ids.verduras!, unidadBase: "KG" as const, admiteFraccion: true };
    expect(await mensajeDeError(crearProducto(base.db, admin, { ...base_, codigo: "Tom-R" }))).toMatch(/código TOM-R/);
    expect(await mensajeDeError(crearProducto(base.db, admin, { ...base_, codigo: "X1", nombre: "tomate REDONDO" }))).toMatch(/nombre/);
    expect(await codigoDeError(crearProducto(base.db, admin, { ...base_, codigo: "X2", categoriaId: "no-es-un-id" }))).toBe("VALIDACION");
  });

  it("presentaciones: factor mayor que 0 y al menos un uso (RN-002); nombre único por producto", async () => {
    const p = { productoId: ids.tomate!, usableEnCompra: true, usableEnVenta: true };
    expect(await codigoDeError(agregarPresentacion(base.db, admin, { ...p, nombre: "Caja", factorABase: "0" }))).toBe("VALIDACION");
    expect(await codigoDeError(agregarPresentacion(base.db, admin, { ...p, nombre: "Caja", factorABase: "10", usableEnCompra: false, usableEnVenta: false }))).toBe(
      "VALIDACION",
    );
    expect(await mensajeDeError(agregarPresentacion(base.db, admin, { ...p, nombre: "cajón 18 KG", factorABase: "18" }))).toMatch(/ya tiene/);
  });

  it("la unidad base se puede corregir mientras no haya otras presentaciones ni ofertas (RN-001)", async () => {
    const id = await crearProducto(base.db, admin, { codigo: "ACEL", nombre: "Acelga", categoriaId: ids.verduras!, unidadBase: "KG", admiteFraccion: true });
    const ficha = await obtenerProducto(base.db, admin, id);
    expect(ficha.unidadBaseEditable).toBe(true);
    await editarProducto(base.db, admin, { ...ficha, id, unidadBase: "ATADO", admiteFraccion: false });
    expect((await obtenerProducto(base.db, admin, id)).presentaciones.map((p) => p.nombre)).toEqual(["atado"]);

    const tomate = await obtenerProducto(base.db, admin, ids.tomate!);
    expect(await mensajeDeError(editarProducto(base.db, admin, { ...tomate, id: ids.tomate!, unidadBase: "UNIDAD" }))).toMatch(/RN-001/);
  });
});

describe("proveedores (P-20, P-21)", () => {
  it("crea los proveedores del escenario; el límite solo con proveedores.editar_limite", async () => {
    const alta = (nombre: string, ubicacion: string | null, limite: string | null, plazo: string | null) =>
      guardarProveedor(base.db, admin, {
        nombre,
        ubicacionMercado: ubicacion,
        condicionPagoHabitual: "CREDITO",
        limiteCredito: limite,
        plazoPagoDias: plazo,
      });
    ids.A = await alta("Hnos. García", "Puesto 14", "500.000", "7");
    ids.B = await alta("La Quinta", "Puesto 32", "400000", "15");
    ids.C = await alta("Papas del Sur", null, null, null);
    ids.D = await alta("Frutas Tropicales", null, "150.000", "10");
    ids.E = await alta("Mayorista Norte", null, "300.000", "7");

    expect((await obtenerProveedor(base.db, admin, ids.A)).credito).toEqual({ limiteCredito: "500000.00", plazoPagoDias: 7, saldoActual: "0.00" });
    expect((await obtenerProveedor(base.db, admin, ids.C)).credito?.limiteCredito).toBeNull();

    // El COMPRADOR edita datos del proveedor pero no su límite.
    const datosB = { id: ids.B, nombre: "La Quinta", ubicacionMercado: "Puesto 32 (nave 2)", condicionPagoHabitual: "CREDITO" as const };
    expect(await codigoDeError(guardarProveedor(base.db, comprador, { ...datosB, limiteCredito: "999999" }))).toBe("SIN_PERMISO");
    await guardarProveedor(base.db, comprador, datosB);
    expect((await obtenerProveedor(base.db, comprador, ids.B)).credito?.limiteCredito).toBe("400000.00");
    expect(await codigoDeError(listarProveedores(base.db, vendedor))).toBe("SIN_PERMISO");
  });

  it("el cambio de límite queda auditado aparte (CAMBIO_LIMITE_CREDITO)", async () => {
    await guardarProveedor(base.db, admin, { id: ids.D!, nombre: "Frutas Tropicales", condicionPagoHabitual: "CREDITO", limiteCredito: "200000" });
    const [registro] = await enEmpresa(base.db, empresa.empresaId, (tx) =>
      tx.select().from(auditoria).where(and(eq(auditoria.accion, "CAMBIO_LIMITE_CREDITO"), eq(auditoria.entidadId, ids.D!))),
    );
    expect(registro).toMatchObject({ datosAntes: { limiteCredito: "150000.00" }, datosDespues: { limiteCredito: "200000.00" } });
  });
});

describe("ofertas y lista general de precios de compra (05 §2.1, RN-067 a RN-075)", () => {
  it("carga las ofertas vigentes del 23/09", async () => {
    await oferta("A", "tomate", "Cajón 18 kg", "16.200");
    await oferta("A", "papa", "Bolsa 25 kg", "13.000");
    await oferta("A", "cebolla", "Cajón 18 kg", "12.600");
    await oferta("B", "tomate", "Cajón 18 kg", "17.100");
    await oferta("B", "lechuga", "Jaula 12 u", "9.600");
    await oferta("B", "cebolla", "Bolsa 20 kg", "13.600");
    await oferta("C", "papa", "Bolsa 25 kg", "12.500");
    await oferta("D", "banana", "Caja 20 kg", "24.000");
    await oferta("E", "banana", "Caja 20 kg", "25.000");
    await oferta("E", "cebolla", "Bolsa 10 kg", "7.300");
    await marcarProveedorPreferido(base.db, admin, { productoId: ids.tomate!, proveedorId: ids.A! });
    await marcarProveedorPreferido(base.db, admin, { productoId: ids.banana!, proveedorId: ids.D! });
    // La papa de A se actualizó hace 11 días.
    await base.comoSuperusuario(() =>
      base.db.update(proveedorProducto).set({ fechaActualizacion: sql`now() - interval '11 days'` }).where(eq(proveedorProducto.id, ids["papa-A"]!)),
    );
  });

  it("compara proveedores por costo por unidad base, marca el mejor y los desactualizados", async () => {
    const { ofertas, parametros } = await listaGeneralPreciosCompra(base.db, comprador);
    expect(parametros).toEqual({ diasAlertaDesactualizado: 7, variacionBruscaPct: "30.000" });
    const resumen = ofertas.map((o) => [o.producto, o.proveedor, o.costoBase, o.pctSobreMejor, o.esMejor, o.esPreferido, o.desactualizada]);
    expect(resumen).toEqual([
      ["Cebolla", "La Quinta", "680.0000", "0.00", true, false, false],
      ["Cebolla", "Hnos. García", "700.0000", "2.94", false, false, false],
      ["Cebolla", "Mayorista Norte", "730.0000", "7.35", false, false, false],
      ["Lechuga criolla", "La Quinta", "800.0000", "0.00", true, false, false],
      ["Papa", "Papas del Sur", "500.0000", "0.00", true, false, false],
      ["Papa", "Hnos. García", "520.0000", "4.00", false, false, true],
      ["Tomate redondo", "Hnos. García", "900.0000", "0.00", true, true, false],
      ["Tomate redondo", "La Quinta", "950.0000", "5.56", false, false, false],
      ["Banana", "Frutas Tropicales", "1200.0000", "0.00", true, true, false],
      ["Banana", "Mayorista Norte", "1250.0000", "4.17", false, false, false],
    ]);
    expect((await filaDe("papa-A"))?.diasSinActualizar).toBe(11);
  });

  it("filtra por proveedor sin perder la comparación contra los demás", async () => {
    const { ofertas } = await listaGeneralPreciosCompra(base.db, admin, { proveedorId: ids.A! });
    expect(ofertas.map((o) => [o.producto, o.esMejor])).toEqual([
      ["Cebolla", false],
      ["Papa", false],
      ["Tomate redondo", true],
    ]);
    const soloDesact = await listaGeneralPreciosCompra(base.db, admin, { soloDesactualizadas: true });
    expect(soloDesact.ofertas.map((o) => o.id)).toEqual([ids["papa-A"]]);
  });

  it("los costos no se muestran sin precios.ver_costos (RN-074)", async () => {
    expect(await codigoDeError(listaGeneralPreciosCompra(base.db, vendedor))).toBe("SIN_PERMISO");
    expect(await codigoDeError(actualizarPrecioOferta(base.db, vendedor, { ofertaId: ids["tomate-B"]!, precio: "1" }))).toBe("SIN_PERMISO");
  });

  it("una sola oferta por proveedor + producto + presentación (RN-067), solo en presentaciones de compra", async () => {
    expect(await mensajeDeError(oferta("A", "tomate", "Cajón 18 kg", "1"))).toMatch(/RN-067/);
    const soloVenta = await agregarPresentacion(base.db, admin, {
      productoId: ids.tomate!,
      nombre: "Bandeja 1 kg",
      factorABase: "1",
      usableEnCompra: false,
      usableEnVenta: true,
    });
    expect(
      await mensajeDeError(crearOferta(base.db, admin, { proveedorId: ids.B!, productoId: ids.tomate!, presentacionId: soloVenta, precio: "1000" })),
    ).toMatch(/no está habilitada para compras/);
  });

  it("cambiar un precio agrega historial, cierra el anterior y audita (RN-068)", async () => {
    const r = await actualizarPrecioOferta(base.db, comprador, { ofertaId: ids["tomate-B"]!, precio: "17.550" });
    expect(r).toEqual({ cambio: true, variacionPct: "2.63" });
    const fila = await filaDe("tomate-B");
    expect(fila).toMatchObject({ precioVigente: "17550.0000", costoBase: "975.0000", precioAnterior: "17100.0000", variacionPct: "2.63", actualizadoPor: "Pedro" });

    const historial = await historialDeOferta(base.db, comprador, ids["tomate-B"]!);
    expect(historial.map((h) => [h.precio, h.variacionPct, h.vigenteHasta === null])).toEqual([
      ["17550.0000", "2.632", true],
      ["17100.0000", null, false],
    ]);
    const [registro] = await enEmpresa(base.db, empresa.empresaId, (tx) =>
      tx.select().from(auditoria).where(and(eq(auditoria.accion, "CAMBIO_PRECIO_COMPRA"), eq(auditoria.entidadId, ids["tomate-B"]!))).orderBy(sql`ocurrido_en desc`).limit(1),
    );
    expect(registro?.resumen).toBe("Tomate redondo en La Quinta: $17.100,00 → $17.550,00.");
  });

  it("una variación brusca pide confirmación (RN-070)", async () => {
    const sinConfirmar = await mensajeDeError(actualizarPrecioOferta(base.db, admin, { ofertaId: ids["tomate-B"]!, precio: "25000" }));
    expect(sinConfirmar).toMatch(/\+42,45 %.*Confirmar/);
    expect((await filaDe("tomate-B"))?.precioVigente).toBe("17550.0000");
    await actualizarPrecioOferta(base.db, admin, { ofertaId: ids["tomate-B"]!, precio: "25000", confirmarVariacion: true });
    expect((await filaDe("tomate-B"))?.precioVigente).toBe("25000.0000");
  });

  it("el mismo precio o 'confirmar sin cambios' renuevan la fecha sin historial (RN-075)", async () => {
    const antes = (await historialDeOferta(base.db, admin, ids["papa-A"]!)).length;
    expect(await confirmarPreciosSinCambios(base.db, comprador, [ids["papa-A"]!])).toBe(1);
    expect(await filaDe("papa-A")).toMatchObject({ desactualizada: false, diasSinActualizar: 0 });
    await actualizarPrecioOferta(base.db, comprador, { ofertaId: ids["papa-A"]!, precio: "13000" });
    expect((await historialDeOferta(base.db, admin, ids["papa-A"]!)).length).toBe(antes);
  });

  it("'no hay hoy' saca la oferta del mínimo sin desactivarla (RN-075)", async () => {
    await cambiarDisponibilidadOferta(base.db, comprador, { ofertaId: ids["papa-C"]!, disponible: false });
    expect(await filaDe("papa-A")).toMatchObject({ esMejor: true, pctSobreMejor: "0.00" });
    expect(await filaDe("papa-C")).toMatchObject({ esMejor: false, disponible: false, ranking: 2 });
    await cambiarDisponibilidadOferta(base.db, comprador, { ofertaId: ids["papa-C"]!, disponible: true });
  });

  it("actualización rápida en el puesto: precios, 'no hay hoy' y 'sin cambios en el resto' en una sola transacción", async () => {
    const r = await actualizacionRapida(base.db, comprador, {
      proveedorId: ids.B!,
      cambios: [
        { ofertaId: ids["tomate-B"]!, precio: "24.500" },
        { ofertaId: ids["lechuga-B"]!, precio: "", noHay: true },
      ],
      confirmarResto: true,
    });
    expect(r).toEqual({ precios: 1, confirmadas: 1, sinStock: 1 });
    expect(await filaDe("lechuga-B")).toMatchObject({ disponible: false });

    // Una variación brusca frena todo el lote hasta confirmarla.
    const intento = actualizacionRapida(base.db, comprador, {
      proveedorId: ids.B!,
      cambios: [
        { ofertaId: ids["cebolla-B"]!, precio: "14000" },
        { ofertaId: ids["tomate-B"]!, precio: "40000" },
      ],
    });
    expect(await mensajeDeError(intento)).toMatch(/cambian mucho: Tomate redondo/);
    expect((await filaDe("cebolla-B"))?.precioVigente).toBe("13600.0000");
    expect(
      await codigoDeError(
        actualizacionRapida(base.db, comprador, { proveedorId: ids.B!, cambios: [{ ofertaId: ids["tomate-A"]!, precio: "1" }] }),
      ),
    ).toBe("VALIDACION");
  });

  it("el historial es un libro: no se modifica ni se borra", async () => {
    const modificar = enEmpresa(base.db, empresa.empresaId, (tx) => tx.update(historialPrecioCompra).set({ precio: "1" }));
    expect(await codigoDeError(modificar)).toBe("PERMISO_BD");
    const borrar = enEmpresa(base.db, empresa.empresaId, (tx) => tx.delete(historialPrecioCompra));
    expect(await codigoDeError(borrar)).toBe("PERMISO_BD");
  });

  it("el factor de una presentación con ofertas no cambia (RN-003)", async () => {
    const cajon = await presentacionDe(ids.tomate!, "Cajón 18 kg");
    const cambio = editarPresentacion(base.db, admin, { id: cajon, nombre: "Cajón 18 kg", factorABase: "20", usableEnCompra: true, usableEnVenta: true });
    expect(await mensajeDeError(cambio)).toMatch(/RN-003/);
    await editarPresentacion(base.db, admin, { id: cajon, nombre: "Cajón grande", factorABase: "18", usableEnCompra: true, usableEnVenta: true });
    expect(await mensajeDeError(cambiarEstadoPresentacion(base.db, admin, { id: cajon, activo: false }))).toMatch(/desactivá esas ofertas/);
  });

  it("preferido: tiene que ofrecer el producto (RN-073); al desactivar su oferta el producto queda sin preferido", async () => {
    expect(await mensajeDeError(marcarProveedorPreferido(base.db, admin, { productoId: ids.tomate!, proveedorId: ids.C! }))).toMatch(/ofrezca/);
    await cambiarEstadoOferta(base.db, admin, { ofertaId: ids["banana-D"]!, activo: false });
    expect((await obtenerProducto(base.db, admin, ids.banana!)).proveedorPreferidoId).toBeNull();
    const [fila] = await enEmpresa(base.db, empresa.empresaId, (tx) => tx.select().from(proveedorProducto).where(eq(proveedorProducto.id, ids["banana-D"]!)));
    expect(fila?.activo).toBe(false);

    // Volver a agregarla la reactiva con el precio nuevo y conserva su historial.
    const deNuevo = await oferta("D", "banana", "Caja 20 kg", "26.000");
    expect(deNuevo).toBe(fila?.id);
    expect((await filaDe("banana-D"))?.precioVigente).toBe("26000.0000");
    expect((await historialDeOferta(base.db, admin, deNuevo)).map((h) => h.precio)).toEqual(["26000.0000", "24000.0000"]);
  });

  it("una categoría con productos activos no se desactiva", async () => {
    expect(await mensajeDeError(cambiarEstadoCategoria(base.db, admin, { id: ids.frutas!, activo: false }))).toMatch(/producto\(s\) activo/);
  });
});

describe("clientes y puntos de entrega (RN-010 a RN-016)", () => {
  const hospital = {
    nombre: "Hospital San Martín",
    tipoCliente: "HOSPITAL" as const,
    identificacionFiscal: "30-71234567-8",
    prioridadFaltantes: 1,
    periodicidadFacturacion: "MENSUAL" as const,
    requiereOrdenCompra: true,
    aceptaSustituciones: false,
    requiereFirma: true,
  };

  it("crea el cliente con su primer punto de entrega como principal", async () => {
    ids.hospital = await guardarCliente(base.db, vendedor, {
      ...hospital,
      primerPunto: { nombre: "Cocina central", direccion: "Av. Siempreviva 742", horarioDesde: "06:30", horarioHasta: "08:00", diasEntrega: [1, 3, 5] },
    });
    const ficha = await obtenerCliente(base.db, vendedor, ids.hospital);
    expect(ficha).toMatchObject({ identificacionFiscal: "30712345678", prioridadFaltantes: 1, periodicidadFacturacion: "MENSUAL" });
    expect(ficha.puntosEntrega).toMatchObject([{ nombre: "Cocina central", esPrincipal: true, horarioDesde: "06:30", diasEntrega: [1, 3, 5] }]);
  });

  it("el CUIT es único aunque se escriba distinto (RN-011); valores por defecto (RN-013, RN-014)", async () => {
    const repetido = guardarCliente(base.db, vendedor, { ...hospital, nombre: "Otro hospital", identificacionFiscal: "30712345678" });
    expect(await mensajeDeError(repetido)).toMatch(/RN-011/);
    ids.pepe = await guardarCliente(base.db, vendedor, {
      nombre: "Verdulería Don Pepe",
      tipoCliente: "COMERCIO",
      prioridadFaltantes: 3,
      periodicidadFacturacion: "POR_ENTREGA",
      requiereOrdenCompra: false,
      aceptaSustituciones: true,
      requiereFirma: false,
    });
    expect((await obtenerCliente(base.db, vendedor, ids.pepe)).puntosEntrega).toEqual([]);
  });

  it("puntos de entrega: uno solo principal; si se desactiva el principal pasa a otro", async () => {
    const pediatria = await guardarPuntoEntrega(base.db, vendedor, { clienteId: ids.hospital!, nombre: "Cocina pediatría", direccion: "Pabellón 3" });
    let ficha = await obtenerCliente(base.db, vendedor, ids.hospital!);
    expect(ficha.puntosEntrega.map((p) => [p.nombre, p.esPrincipal])).toEqual([
      ["Cocina central", true],
      ["Cocina pediatría", false],
    ]);
    await marcarPuntoPrincipal(base.db, vendedor, pediatria);
    const central = ficha.puntosEntrega.find((p) => p.nombre === "Cocina central")!.id;
    await cambiarEstadoPuntoEntrega(base.db, vendedor, { id: pediatria, activo: false });
    ficha = await obtenerCliente(base.db, vendedor, ids.hospital!);
    expect(ficha.puntosEntrega.find((p) => p.id === central)?.esPrincipal).toBe(true);
    expect(await mensajeDeError(guardarPuntoEntrega(base.db, vendedor, { clienteId: ids.hospital!, nombre: "Otro", direccion: "X", horarioDesde: "10:00", horarioHasta: "09:00" }))).toMatch(
      /termina antes/,
    );
  });

  it("el PREPARADOR no carga clientes", async () => {
    const preparador = await crearUsuarioDePrueba(base.db, empresa.empresaId, "Marta", ["PREPARADOR"]);
    expect(await codigoDeError(guardarCliente(base.db, preparador, { ...hospital, nombre: "X", identificacionFiscal: null }))).toBe("SIN_PERMISO");
  });
});

describe("aislamiento entre empresas", () => {
  it("otra empresa no ve productos, proveedores, ofertas ni clientes de esta", async () => {
    const otra = await crearEmpresaDePrueba(base.db, "Otra");
    expect(await listarProductos(base.db, otra.authUserIdAdmin)).toEqual([]);
    expect(await listarProveedores(base.db, otra.authUserIdAdmin)).toEqual([]);
    expect((await listaGeneralPreciosCompra(base.db, otra.authUserIdAdmin)).ofertas).toEqual([]);
    expect(await codigoDeError(obtenerProducto(base.db, otra.authUserIdAdmin, ids.tomate!))).toBe("NO_ENCONTRADO");
    expect(await codigoDeError(actualizarPrecioOferta(base.db, otra.authUserIdAdmin, { ofertaId: ids["tomate-A"]!, precio: "1" }))).toBe("NO_ENCONTRADO");
    const presentaciones = await enEmpresa(base.db, otra.empresaId, (tx) => tx.select().from(presentacion));
    expect(presentaciones).toEqual([]);
  });
});
