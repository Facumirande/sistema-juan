import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { documentoEmitido, jornada } from "@/db/esquema";
import { enEmpresa } from "@/db/transaccion";
import { crearProducto, obtenerProducto } from "@/modulos/catalogo/productos";
import { anularEntrega, confirmarEntrega, corregirEntrega, documentoDeEntrega, emitirDocumentos, entregaParaConfirmar, listarEntregas, obtenerEntrega } from "@/modulos/entregas/entregas";
import { iniciarPreparacion, marcarPreparada, obtenerEntregaParaPreparar, obtenerPreparacion, prepararTodoComoPropuesto, registrarPreparado, sustituirProducto } from "@/modulos/entregas/preparacion";
import { agregarAlReparto, crearReparto, obtenerReparto, proponerOrden, quitarDelReparto, salirDeReparto } from "@/modulos/entregas/repartos";
import { anularComprobante, listarComprobantes } from "@/modulos/facturacion/facturacion";
import { obtenerPedido } from "@/modulos/pedidos/pedidos";
import { crearOferta } from "@/modulos/precios-compra/ofertas";

import { codigoDeError, crearUsuarioDePrueba } from "./base-de-prueba";
import { prepararJornada2409, type Jornada2409 } from "./escenario-24-09";

// Preparación, repartos, entregas y documentos de la jornada del 24/09 (04 §5.e y §5.f; 09 §8).

let j: Jornada2409;
const entregas: Record<string, string> = {};

const mensajeDeError = async (promesa: Promise<unknown>) => {
  try {
    await promesa;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  return "SIN_ERROR";
};

const lineaDe = async (entregaId: string, producto: string) => (await obtenerEntregaParaPreparar(j.base.db, j.admin, entregaId)).lineas.find((l) => l.producto === producto && !l.esSustitucion)!;

beforeAll(async () => {
  j = await prepararJornada2409();
});

describe("preparación (04 §5.e, RN-111 a RN-119)", () => {
  it("iniciar crea una entrega por cliente con cada línea de pedido; la jornada pasa a PREPARANDO", async () => {
    const r = await iniciarPreparacion(j.base.db, j.admin, j.manana);
    expect(r).toMatchObject({ entregasNuevas: 3, lineasNuevas: 14, borradores: 0 });
    const p = await obtenerPreparacion(j.base.db, j.admin, j.manana);
    expect(p.jornada?.estado).toBe("PREPARANDO");
    for (const e of p.entregas) entregas[e.cliente] = e.id;
    expect(p.entregas.map((e) => [e.cliente, e.lineas, e.estado])).toEqual(
      expect.arrayContaining([
        ["Hospital San Martín", 5, "BORRADOR"],
        ["Restaurante La Esquina", 4, "BORRADOR"],
        ["Verdulería Don Pepe", 5, "BORRADOR"],
      ]),
    );
    // Se compró todo lo necesario: se propone lo pedido y queda el sobrante de la papa y la lechuga.
    const papa = p.productos.find((x) => x.producto === "Papa")!;
    expect([papa.comprado, papa.necesidad, papa.propuesto]).toEqual(["275.000", "265", "265"]);
    // Volver a iniciar no duplica nada.
    expect(await iniciarPreparacion(j.base.db, j.admin, j.manana)).toMatchObject({ entregasNuevas: 0, lineasNuevas: 0 });
  });

  it("peso real dentro de la tolerancia; faltante con motivo; de más, con confirmación (RN-113, RN-114)", async () => {
    const hospital = entregas["Hospital San Martín"]!;
    const tomate = await lineaDe(hospital, "Tomate redondo");
    await registrarPreparado(j.base.db, j.admin, { itemId: tomate.id, cantidad: "181,2" });
    expect((await lineaDe(hospital, "Tomate redondo")).evaluacion).toEqual({ diferenciaPct: "0.67", dentro: true, menor: false });
    expect((await obtenerEntregaParaPreparar(j.base.db, j.admin, hospital)).estado).toBe("EN_PREPARACION");
    expect((await obtenerPedido(j.base.db, j.admin, j.ids.pedHospital!)).estado).toBe("EN_PREPARACION");

    const banana = await lineaDe(hospital, "Banana");
    expect(await mensajeDeError(registrarPreparado(j.base.db, j.admin, { itemId: banana.id, cantidad: "0" }))).toMatch(/motivo/);
    await registrarPreparado(j.base.db, j.admin, { itemId: banana.id, cantidad: "0", motivo: "NO_CONSEGUIDO" });

    const papa = await lineaDe(hospital, "Papa");
    expect(await mensajeDeError(registrarPreparado(j.base.db, j.admin, { itemId: papa.id, cantidad: "300" }))).toMatch(/más de lo pedido/);
    await registrarPreparado(j.base.db, j.admin, { itemId: papa.id, cantidad: "140" });
  });

  it("marcar preparada exige todas las líneas (RN-118)", async () => {
    expect(await mensajeDeError(marcarPreparada(j.base.db, j.admin, { entregaId: entregas["Hospital San Martín"]! }))).toMatch(/Faltan cargar 2 líneas/);
  });

  it("una sustitución sin precio deja la entrega preparada con los documentos pendientes (RN-087, RN-117)", async () => {
    const hospital = entregas["Hospital San Martín"]!;
    const kale = await crearProducto(j.base.db, j.admin, { codigo: "KALE", nombre: "Kale", categoriaId: j.ids.verduras!, unidadBase: "KG", admiteFraccion: true, presentacionCompraNombre: "Bolsa 5 kg", presentacionCompraFactor: "5" });
    j.ids.kale = kale;
    const banana = await lineaDe(hospital, "Banana");
    await sustituirProducto(j.base.db, j.admin, { itemId: banana.id, productoId: kale, cantidad: "10" });
    await prepararTodoComoPropuesto(j.base.db, j.admin, hospital);
    const r = await marcarPreparada(j.base.db, j.admin, { entregaId: hospital, bultos: "22" });
    expect(r.documentos).toEqual({ resultado: "SIN_PRECIO", productos: ["Kale"] });
    const e = await obtenerEntregaParaPreparar(j.base.db, j.admin, hospital);
    expect([e.estado, e.documentosPendientes, e.bultos]).toEqual(["PREPARADA", true, 22]);
    expect(e.lineas.find((l) => l.esSustitucion)).toMatchObject({ producto: "Kale", reemplazaA: "Banana", preparada: "10.000" });
    expect(await codigoDeError(emitirDocumentos(j.base.db, j.admin, { entregaId: hospital, confirmaMargenNegativo: false }))).toBe("PRECIO_SIN_COSTO");
    // Con precio de compra se emite.
    const bolsa = (await obtenerProducto(j.base.db, j.admin, kale)).presentaciones[0]!.id;
    await crearOferta(j.base.db, j.admin, { proveedorId: j.ids.B!, productoId: kale, presentacionId: bolsa, precio: "4000" });
    expect(await emitirDocumentos(j.base.db, j.admin, { entregaId: hospital, confirmaMargenNegativo: false })).toEqual({ resultado: "EMITIDOS", version: 1 });
  });

  it("el restaurante: DOC-02 y DOC-03 v1 juntos; lista contable $114.400 (04 §5.f.2; 09 §8 caso 1)", async () => {
    const restaurante = entregas["Restaurante La Esquina"]!;
    await prepararTodoComoPropuesto(j.base.db, j.admin, restaurante);
    const r = await marcarPreparada(j.base.db, j.admin, { entregaId: restaurante, bultos: "8" });
    expect(r.documentos).toEqual({ resultado: "EMITIDOS", version: 1 });
    const doc03 = await documentoDeEntrega(j.base.db, j.admin, { entregaId: restaurante, tipo: "DOC_03" });
    expect(doc03?.tipo).toBe("DOC_03");
    if (doc03?.tipo !== "DOC_03") return;
    expect(doc03.contenido.lineas.map((l) => [l.producto, l.cantidad, l.precioUnitario, l.importe])).toEqual([
      ["Tomate redondo", "36.000", "1250.0000", "45000.00"],
      ["Papa", "50.000", "680.0000", "34000.00"],
      ["Lechuga criolla", "20.000", "1080.0000", "21600.00"],
      ["Cebolla", "15.000", "920.0000", "13800.00"],
    ]);
    expect(doc03.contenido.total).toBe("114400.00");
    expect((await obtenerPedido(j.base.db, j.admin, j.ids.pedRestaurante!)).estado).toBe("PREPARADO");
  });

  it("los documentos sin precios no tienen ningún importe (RN-124; 09 §8 caso 2)", async () => {
    const doc02 = await documentoDeEntrega(j.base.db, j.admin, { entregaId: entregas["Restaurante La Esquina"]!, tipo: "DOC_02" });
    const texto = JSON.stringify(doc02?.contenido);
    expect(texto).toContain("Tomate redondo");
    expect(texto).not.toMatch(/precio|costo|importe|total|recargo|margen|saldo|\$\s?\d/i);
    const preparacion = JSON.stringify(await obtenerPreparacion(j.base.db, j.admin, j.manana));
    expect(preparacion).not.toMatch(/precio|costo|importe|recargo|margen|saldo/i);
  });

  it("quien no ve precios no puede abrir la lista contable (09 §8 caso 4)", async () => {
    const preparador = await crearUsuarioDePrueba(j.base.db, j.empresaId, "Marta", ["PREPARADOR"]);
    expect(await codigoDeError(documentoDeEntrega(j.base.db, preparador, { entregaId: entregas["Restaurante La Esquina"]!, tipo: "DOC_03" }))).toBe("SIN_PERMISO");
    expect((await documentoDeEntrega(j.base.db, preparador, { entregaId: entregas["Restaurante La Esquina"]!, tipo: "DOC_02" }))?.tipo).toBe("DOC_02");
  });

  it("la verdulería: v1 $227.410", async () => {
    const verduleria = entregas["Verdulería Don Pepe"]!;
    await prepararTodoComoPropuesto(j.base.db, j.admin, verduleria);
    await marcarPreparada(j.base.db, j.admin, { entregaId: verduleria, bultos: "12" });
    const doc03 = await documentoDeEntrega(j.base.db, j.admin, { entregaId: verduleria, tipo: "DOC_03" });
    expect(doc03?.tipo === "DOC_03" && doc03.contenido.total).toBe("227410.00");
  });
});

describe("repartos y entregas (04 §5.f, RN-120 a RN-134)", () => {
  it("una entrega va en un solo reparto (RN-123)", async () => {
    const usuario = (await obtenerEntrega(j.base.db, j.admin, entregas["Hospital San Martín"]!)).confirmadaPor;
    expect(usuario).toBeNull();
    entregas.reparto = await crearReparto(j.base.db, j.admin, { fecha: j.manana, vehiculo: "Camioneta AB123CD", salida: "07:00" });
    for (const c of ["Hospital San Martín", "Verdulería Don Pepe", "Restaurante La Esquina"]) await agregarAlReparto(j.base.db, j.admin, { repartoId: entregas.reparto, entregaId: entregas[c]! });
    await proponerOrden(j.base.db, j.admin, entregas.reparto);
    // Una entrega no está en dos repartos (RN-123).
    const otro = await crearReparto(j.base.db, j.admin, { fecha: j.manana });
    expect(await mensajeDeError(agregarAlReparto(j.base.db, j.admin, { repartoId: otro, entregaId: entregas["Hospital San Martín"]! }))).toMatch(/otro reparto/);
  });

  it("sale el reparto: entregas y pedidos EN_REPARTO, jornada REPARTIENDO (RN-039)", async () => {
    const { actualizarReparto } = await import("@/modulos/entregas/repartos");
    const [yo] = await enEmpresa(j.base.db, j.empresaId, (tx) => tx.select({ id: documentoEmitido.emitidoPor }).from(documentoEmitido).limit(1));
    await actualizarReparto(j.base.db, j.admin, { repartoId: entregas.reparto!, repartidorId: yo!.id, vehiculo: "Camioneta AB123CD", salida: "07:00" });
    await salirDeReparto(j.base.db, j.admin, entregas.reparto!);
    const r = await obtenerReparto(j.base.db, j.admin, entregas.reparto!);
    expect([r.estado, r.paradas.map((p) => p.estado)]).toEqual(["EN_CURSO", ["EN_REPARTO", "EN_REPARTO", "EN_REPARTO"]]);
    expect(r.paradas.every((p) => p.documentosAlDia)).toBe(true);
    const [jor] = await enEmpresa(j.base.db, j.empresaId, (tx) => tx.select().from(jornada).where(eq(jornada.fecha, j.manana)));
    expect(jor?.estado).toBe("REPARTIENDO");
    expect((await obtenerPedido(j.base.db, j.admin, j.ids.pedVerduleria!)).estado).toBe("EN_REPARTO");
  });

  it("un repartidor no ve repartos ajenos (RN-131; 09 §8 caso 5)", async () => {
    const carlos = await crearUsuarioDePrueba(j.base.db, j.empresaId, "Carlos", ["REPARTIDOR"]);
    expect(await codigoDeError(obtenerReparto(j.base.db, carlos, entregas.reparto!))).toBe("NO_ENCONTRADO");
    expect(await codigoDeError(entregaParaConfirmar(j.base.db, carlos, entregas["Verdulería Don Pepe"]!))).toBe("NO_ENCONTRADO");
  });

  it("verdulería con 4 kg de tomate rechazados: versión 2 de $222.770; la v1 queda REEMPLAZADO (04 §5.f.4; 09 §8 caso 6)", async () => {
    const verduleria = entregas["Verdulería Don Pepe"]!;
    const lineas = (await entregaParaConfirmar(j.base.db, j.admin, verduleria)).lineas;
    const tomate = lineas.find((l) => l.producto === "Tomate redondo")!;
    expect(await mensajeDeError(confirmarEntrega(j.base.db, j.admin, { entregaId: verduleria, modo: "COMPLETA" }))).toMatch(/quién recibió/);
    expect(
      await mensajeDeError(confirmarEntrega(j.base.db, j.admin, { entregaId: verduleria, modo: "DIFERENCIAS", recibidoPor: "Pepe", lineas: [{ itemId: tomate.id, entregada: "60" }] })),
    ).toMatch(/más de lo preparado/);
    const r = await confirmarEntrega(j.base.db, j.admin, {
      entregaId: verduleria,
      modo: "DIFERENCIAS",
      recibidoPor: "Pepe",
      recibidoCargo: "dueño",
      lineas: [{ itemId: tomate.id, entregada: "50", motivo: "RECHAZO_CALIDAD", detalle: "4 kg golpeados" }],
    });
    // La verdulería factura por entrega: el comprobante sale solo con la versión 2 (RN-143).
    expect(r).toEqual({ documentos: { resultado: "EMITIDOS", version: 2 }, conDiferencias: true, factura: "FAC-000001" });
    const doc03 = await documentoDeEntrega(j.base.db, j.admin, { entregaId: verduleria, tipo: "DOC_03" });
    expect(doc03?.tipo === "DOC_03" && [doc03.version, doc03.contenido.total, doc03.contenido.recibido?.por]).toEqual([2, "222770.00", "Pepe"]);
    const v1 = await enEmpresa(j.base.db, j.empresaId, (tx) =>
      tx.select({ tipo: documentoEmitido.tipo, estado: documentoEmitido.estado }).from(documentoEmitido).where(and(eq(documentoEmitido.entregaId, verduleria), eq(documentoEmitido.version, 1))),
    );
    expect(v1.map((d) => d.estado)).toEqual(["REEMPLAZADO", "REEMPLAZADO"]);
    expect((await obtenerPedido(j.base.db, j.admin, j.ids.pedVerduleria!)).estado).toBe("ENTREGADO");
  });

  it("entregado completo no cambia la versión; con la última parada el reparto termina", async () => {
    const restaurante = entregas["Restaurante La Esquina"]!;
    expect(await confirmarEntrega(j.base.db, j.admin, { entregaId: restaurante, modo: "COMPLETA", recibidoPor: "Sergio" })).toEqual({ documentos: null, conDiferencias: false, factura: "FAC-000002" });
    await confirmarEntrega(j.base.db, j.admin, { entregaId: entregas["Hospital San Martín"]!, modo: "COMPLETA", recibidoPor: "Graciela" });
    const r = await obtenerReparto(j.base.db, j.admin, entregas.reparto!);
    expect(r.estado).toBe("FINALIZADO");
    expect((await obtenerEntrega(j.base.db, j.admin, restaurante)).version).toBe(1);
    // El hospital tuvo una sustitución: queda con diferencias (RN-127).
    expect((await obtenerEntrega(j.base.db, j.admin, entregas["Hospital San Martín"]!)).conDiferencias).toBe(true);
  });

  it("la oficina corrige lo entregado con motivo: versión nueva y auditoría (RN-128)", async () => {
    const restaurante = entregas["Restaurante La Esquina"]!;
    const papa = (await obtenerEntrega(j.base.db, j.admin, restaurante)).lineas.find((l) => l.producto === "Papa")!;
    // Facturada no se corrige: primero se anula el comprobante (RN-138, RN-139).
    expect(await codigoDeError(corregirEntrega(j.base.db, j.admin, { entregaId: restaurante, motivo: "Faltó una bolsa de papa", lineas: [{ itemId: papa.id, entregada: "25", motivo: "FALTANTE" }] }))).toBe("DOCUMENTO_EMITIDO");
    const [fac] = await listarComprobantes(j.base.db, j.admin, { desde: "2000-01-01", hasta: "2999-12-31" }).then((l) => l.filter((f) => f.cliente === "Restaurante La Esquina"));
    await anularComprobante(j.base.db, j.admin, { facturaId: fac!.id, motivo: "Hay que corregir la papa" });
    const r = await corregirEntrega(j.base.db, j.admin, { entregaId: restaurante, motivo: "Faltó una bolsa de papa", lineas: [{ itemId: papa.id, entregada: "25,0", motivo: "FALTANTE" }] });
    expect(r).toEqual({ resultado: "EMITIDOS", version: 2 });
    const doc03 = await documentoDeEntrega(j.base.db, j.admin, { entregaId: restaurante, tipo: "DOC_03" });
    expect(doc03?.tipo === "DOC_03" && doc03.contenido.total).toBe("97400.00");
    const lista = await listarEntregas(j.base.db, j.admin, j.manana);
    expect(lista.find((e) => e.id === restaurante)).toMatchObject({ version: 2, estado: "ENTREGADA", conDiferencias: true, documentosAlDia: true, total: "97400.00" });
  });

  it("anular una entrega sin facturar deja sus documentos ANULADO (RN-132)", async () => {
    const restaurante = entregas["Restaurante La Esquina"]!;
    expect(await mensajeDeError(anularEntrega(j.base.db, j.admin, { entregaId: restaurante, motivo: "no" }))).toMatch(/por qué/);
    await anularEntrega(j.base.db, j.admin, { entregaId: restaurante, motivo: "Se cargó al cliente equivocado" });
    const e = await obtenerEntrega(j.base.db, j.admin, restaurante);
    expect([e.estado, e.documentos.every((d) => d.estado === "ANULADO")]).toEqual(["ANULADA", true]);
    // Sacar del reparto una entrega entregada no se puede.
    expect(await mensajeDeError(quitarDelReparto(j.base.db, j.admin, { repartoId: entregas.reparto!, entregaId: entregas["Verdulería Don Pepe"]! }))).toMatch(/ya se entregó/);
  });
});
