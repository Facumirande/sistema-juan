import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { actividad, compra, entrega, proveedor, usuario } from "@/db/esquema";
import { crearProducto } from "@/modulos/catalogo/productos";
import { avisosPara } from "@/modulos/colaboracion/avisos";
import { comprarDeLaLista, destildarConCompra } from "@/modulos/compras/compra-desde-lista";
import { elegirPuestoDeLinea, generarListaCompra, obtenerListaCompra, tildarLinea } from "@/modulos/compras/lista-compra";
import { guardarResponsables, responsablesDelNegocio } from "@/modulos/configuracion/empresa";
import { iniciarPreparacion } from "@/modulos/entregas/preparacion";
import { eliminarPedido, recuperarPedido } from "@/modulos/entregas/volver-atras";
import { sugerirLugares } from "@/modulos/entregas/viaje";
import { agregarLinea, confirmarPedido, crearPedido, obtenerPedido, ponerPrecioALinea } from "@/modulos/pedidos/pedidos";

import { codigoDeError, crearUsuarioDePrueba } from "./base-de-prueba";
import { prepararJornada2409, type Jornada2409 } from "./escenario-24-09";

// Lo que se agregó al proceso del día el 10/10/2026: elegir el puesto en la lista, comprar sin
// puesto, destildar una compra anotada, ponerle precio sobre la marcha a un producto, eliminar y
// recuperar un pedido en proceso, quién se encarga de cada paso y las sugerencias de lugares.

let j: Jornada2409;
const linea = async (nombre: string) => (await obtenerListaCompra(j.base.db, j.admin, j.manana))!.plan.flatMap((p) => p.lineas).find((l) => l.producto === nombre)!;

beforeAll(async () => {
  j = await prepararJornada2409();
});

describe("lista de compras: el puesto de cada renglón, sin puesto y destildar", () => {
  it("el puesto elegido a mano queda, también al rearmar la lista (RN-187)", async () => {
    const banana = await linea("Banana");
    await elegirPuestoDeLinea(j.base.db, j.admin, { itemId: banana.id, proveedorId: j.ids.C! });
    expect((await linea("Banana")).proveedorId).toBe(j.ids.C);
    await generarListaCompra(j.base.db, j.comprador, j.manana);
    expect((await linea("Banana")).proveedorId).toBe(j.ids.C);
    // Sin puesto: se compra en efectivo donde sea.
    await elegirPuestoDeLinea(j.base.db, j.admin, { itemId: banana.id, proveedorId: null });
    expect((await linea("Banana")).proveedorId).toBeNull();
  });

  it("lo que se compra sin decir el puesto va al puesto genérico y queda pagado (en efectivo)", async () => {
    const banana = await linea("Banana");
    const r = await comprarDeLaLista(j.base.db, j.comprador, { itemId: banana.id, sinPuesto: true, presentacionId: j.presentaciones["banana:Caja 20 kg"]!, cantidad: "1", precio: "20000", pagado: false });
    expect(r.proveedor).toBe("Sin puesto (efectivo)");
    const [k] = await j.base.comoSuperusuario(() => j.base.db.select({ condicion: compra.condicionPago }).from(compra).where(eq(compra.id, r.compraId)));
    expect(k?.condicion).toBe("CONTADO");
    // La segunda vez usa el mismo puesto genérico.
    const otra = await comprarDeLaLista(j.base.db, j.comprador, { itemId: banana.id, sinPuesto: true, presentacionId: j.presentaciones["banana:Caja 20 kg"]!, cantidad: "1", precio: "20000", pagado: true });
    expect(otra.proveedor).toBe(r.proveedor);
    const genericos = await j.base.comoSuperusuario(() => j.base.db.select({ id: proveedor.id }).from(proveedor).where(eq(proveedor.nombre, "Sin puesto (efectivo)")));
    expect(genericos).toHaveLength(1);
  });

  it("destildar algo con la compra anotada pide confirmar y la anula; si la compra tiene otros productos, se explica (RN-186)", async () => {
    const papa = await linea("Papa");
    expect(papa.estado).toBe("COMPRADO");
    expect(await codigoDeError(tildarLinea(j.base.db, j.admin, { itemId: papa.id, tildado: false }))).toBe("VALIDACION");
    expect((await destildarConCompra(j.base.db, j.admin, { itemId: papa.id })).anuladas).toBe(1);
    expect((await linea("Papa")).estado).toBe("PENDIENTE");
    // El tomate se compró en parte junto con lechuga y cebolla: esa compra no se toca desde acá.
    const tomate = await linea("Tomate redondo");
    expect(await codigoDeError(destildarConCompra(j.base.db, j.admin, { itemId: tomate.id }))).toBe("VALIDACION");
  });
});

describe("pedidos en proceso", () => {
  it("a un producto sin precio se le pone sobre la marcha (RN-188)", async () => {
    const productoId = await crearProducto(j.base.db, j.admin, { codigo: "JENG", nombre: "Jengibre", categoriaId: j.ids.verduras!, unidadBase: "KG", admiteFraccion: true, presentacionCompraNombre: "", presentacionCompraFactor: "" });
    const { pedidoId } = await crearPedido(j.base.db, j.admin, { fecha: j.manana, clienteId: j.ids.hospital! });
    await agregarLinea(j.base.db, j.admin, { pedidoId, productoId, cantidad: "2" });
    await confirmarPedido(j.base.db, j.admin, pedidoId);
    const antes = (await obtenerPedido(j.base.db, j.admin, pedidoId)).lineas[0]!;
    expect(antes.precio?.precio).toBeNull();
    expect(await codigoDeError(ponerPrecioALinea(j.base.db, j.admin, { itemId: antes.id, precio: "0" }))).toBe("VALIDACION");
    await ponerPrecioALinea(j.base.db, j.admin, { itemId: antes.id, precio: "3500" });
    const despues = (await obtenerPedido(j.base.db, j.admin, pedidoId)).lineas[0]!;
    expect(Number(despues.precio?.precio)).toBe(3500);
    expect(despues.precio?.manual).toBe(true);
  });

  it("un pedido que ya se está preparando se elimina con lo que se hizo, y se recupera (RN-189)", async () => {
    await iniciarPreparacion(j.base.db, j.admin, j.manana, { pedidoIds: [j.ids.pedRestaurante!] });
    const armadas = await j.base.comoSuperusuario(() => j.base.db.select({ estado: entrega.estado }).from(entrega).where(eq(entrega.clienteId, j.ids.restaurante!)));
    expect(armadas.some((e) => e.estado !== "ANULADA")).toBe(true);
    await eliminarPedido(j.base.db, j.admin, { pedidoId: j.ids.pedRestaurante! });
    expect((await obtenerPedido(j.base.db, j.admin, j.ids.pedRestaurante!)).estado).toBe("CANCELADO");
    const entregas = await j.base.comoSuperusuario(() => j.base.db.select({ estado: entrega.estado }).from(entrega).where(eq(entrega.clienteId, j.ids.restaurante!)));
    expect(entregas.every((e) => e.estado === "ANULADA")).toBe(true);
    const registro = await j.base.comoSuperusuario(() => j.base.db.select({ accion: actividad.accion }).from(actividad).where(eq(actividad.entidadId, j.ids.pedRestaurante!)));
    expect(registro.map((r) => r.accion)).toContain("ELIMINAR");
    await recuperarPedido(j.base.db, j.admin, { pedidoId: j.ids.pedRestaurante! });
    expect((await obtenerPedido(j.base.db, j.admin, j.ids.pedRestaurante!)).estado).toBe("CONFIRMADO");
  });
});

describe("quién se encarga de cada paso (RN-190)", () => {
  it("se elige una persona por etapa y le llega el aviso cuando le toca", async () => {
    const maria = await crearUsuarioDePrueba(j.base.db, j.empresaId, "María Compras", ["ADMIN"]);
    const [m] = await j.base.comoSuperusuario(() => j.base.db.select({ id: usuario.id }).from(usuario).where(eq(usuario.authUserId, maria)));
    await guardarResponsables(j.base.db, j.admin, { en_lista: m!.id, preparando: null });
    expect((await responsablesDelNegocio(j.base.db, j.admin)).responsables).toEqual({ en_lista: m!.id });
    await generarListaCompra(j.base.db, j.admin, j.manana);
    const bandeja = await avisosPara(j.base.db, maria, 40);
    expect(bandeja.avisos.some((a) => a.paraMi && a.resumen.includes("lista de compras"))).toBe(true);
    expect(await codigoDeError(guardarResponsables(j.base.db, j.admin, { pedidos: "0b9f6c1e-3f5a-4d2b-9c1a-7e8d6f5a4b3c" }))).toBe("VALIDACION");
  });
});

describe("sugerencias de lugares mientras se escribe (sin salir a internet)", () => {
  it("primero en Tucumán y, si ahí no aparece nada, en todo el país", async () => {
    const pedidas: string[] = [];
    const photon = async (url: string) => {
      pedidas.push(url);
      const enTucuman = new URL(url).searchParams.has("bbox");
      const lugar = { geometry: { coordinates: enTucuman ? [-65.2141, -26.8236] : [-58.38, -34.6] }, properties: { street: "Avenida Mitre", housenumber: "450", city: enTucuman ? "San Miguel de Tucumán" : "Buenos Aires", countrycode: "AR" } };
      return new Response(JSON.stringify({ features: url.includes("Mitre") || !enTucuman ? [lugar] : [] }));
    };
    expect((await sugerirLugares("Mitre 450", photon))[0]?.detalle).toBe("San Miguel de Tucumán");
    expect(new URL(pedidas[0]!).searchParams.get("bbox")).toBe("-66.25,-28.05,-64.45,-26.05");
    expect((await sugerirLugares("Corrientes 1234", photon))[0]?.detalle).toBe("Buenos Aires");
    expect(pedidas).toHaveLength(3);
    expect(await sugerirLugares("ab", photon)).toEqual([]);
    expect(await codigoDeError(sugerirLugares("Mitre 450", async () => new Response("", { status: 503 })))).toBe("VALIDACION");
    expect(await codigoDeError(sugerirLugares("Mitre 450", async () => Promise.reject(new Error("sin red"))))).toBe("VALIDACION");
  });

  it("si el lugar no figura en el mapa, ofrece la zona donde queda para marcarlo a mano", async () => {
    const pedidas: string[] = [];
    // Un mapa donde no está el country, pero sí la ciudad (y una estación con el mismo nombre, que no sirve de zona).
    const photon = async (url: string) => {
      const q = new URL(url).searchParams.get("q")!;
      pedidas.push(q);
      const features =
        q === "tafi viejo"
          ? [
              { geometry: { coordinates: [-65.26, -26.73] }, properties: { name: "Tafi Viejo", street: "Alsina", city: "Tafí Viejo", state: "Tucumán", osm_key: "railway" } },
              { geometry: { coordinates: [-65.2592, -26.7343] }, properties: { name: "Tafí Viejo", county: "Departamento Tafí Viejo", state: "Tucumán", osm_key: "place" } },
            ]
          : [];
      return new Response(JSON.stringify({ features }));
    };
    expect(await sugerirLugares("country pinar II, tafi viejo", photon)).toEqual([
      { etiqueta: "Tafí Viejo", detalle: "Departamento Tafí Viejo, Tucumán", coordenada: { lat: -26.7343, lng: -65.2592 }, aproximado: { falta: "country pinar II" } },
    ]);
    // Primero lo escrito tal cual (en Tucumán y en el país) y recién después la zona.
    expect(pedidas).toEqual(["country pinar II, tafi viejo", "country pinar II, tafi viejo", "tafi viejo"]);
    // Si tampoco aparece la zona, no hay nada para ofrecer.
    expect(await sugerirLugares("quinta los nogales, paraje perdido", photon)).toEqual([]);
  });
});

describe("las direcciones como se dicen: la esquina y la calle con su número (sin salir a internet)", () => {
  /** Un tramo de calle como lo devuelve Photon: el punto va [lat, lng] y la caja [oeste, norte, este, sur]. */
  const calle = (nombre: string, punto: [number, number], caja: [number, number, number, number], barrio?: string) => ({
    geometry: { coordinates: [punto[1], punto[0]] },
    properties: { name: nombre, osm_key: "highway", extent: caja, district: barrio, city: "San Miguel de Tucumán", state: "Tucumán", countrycode: "AR" },
  });
  const local = (nombre: string | undefined, enCalle: string, numero: string, punto: [number, number], ciudad = "San Miguel de Tucumán") => ({
    geometry: { coordinates: [punto[1], punto[0]] },
    properties: { name: nombre, street: enCalle, housenumber: numero, osm_key: nombre ? "shop" : "place", city: ciudad, state: ciudad === "San Miguel de Tucumán" ? "Tucumán" : "Jujuy", countrycode: "AR" },
  });
  const responder = (features: unknown[]) => new Response(JSON.stringify({ features }));
  const PROVINCIA = "-66.25,-28.05,-64.45,-26.05";

  it("una esquina se calcula con los tramos de las dos calles y va arriba de todo, en tres consultas al mapa", async () => {
    const pedidas: { q: string; soloCalles: boolean }[] = [];
    const photon = async (url: string) => {
      const p = new URL(url).searchParams;
      const q = p.get("q")!;
      pedidas.push({ q, soloCalles: p.get("layer") === "street" && p.get("dedupe") === "0" });
      if (p.get("layer") !== "street") return responder([local("Tienda San Juan", "Muñecas", "354", [-26.82593, -65.20555]), local("Panadería San Juan", "Muñecas", "10", [-24.25, -65.2], "Palpalá")]);
      if (q === "muñecas")
        return responder([
          calle("Ildefonso de las Muñecas", [-26.82599, -65.20495], [-65.20515, -26.8253, -65.20476, -26.82668], "Centro"),
          calle("Peatonal Muñecas", [-26.82804, -65.20552], [-65.20591, -26.82668, -65.20515, -26.8294], "Centro"),
        ]);
      return responder([calle("San Juan", [-26.82563, -65.20336], [-65.20476, -26.8253, -65.20196, -26.82593], "Centro"), calle("San Juan", [-26.82476, -65.20715], [-65.20953, -26.8242, -65.20476, -26.8253], "Centro")]);
    };
    expect(await sugerirLugares("  muñecas  y san juan ", photon)).toEqual([
      { etiqueta: "Ildefonso de las Muñecas y San Juan", detalle: "Centro, San Miguel de Tucumán", coordenada: { lat: -26.8253, lng: -65.20476 }, nota: "esquina" },
      // Debajo, lo que coincide de la zona (lo de otra provincia no).
      { etiqueta: "Tienda San Juan", detalle: "Muñecas 354, San Miguel de Tucumán, Tucumán", coordenada: { lat: -26.82593, lng: -65.20555 } },
    ]);
    expect(pedidas).toHaveLength(3);
    expect(pedidas.filter((p) => p.soloCalles).map((p) => p.q).sort()).toEqual(["muñecas", "san juan"]);
  });

  it("si las calles no se cruzan, o el mapa no las devuelve, quedan las sugerencias de siempre", async () => {
    const comun = local("Frutas y Verduras Don José", "Lavalle", "500", [-26.83, -65.21]);
    // Dos calles paralelas.
    const paralelas = async (url: string) => {
      const p = new URL(url).searchParams;
      if (p.get("layer") !== "street") return responder([comun]);
      return responder([p.get("q") === "frutas" ? calle("Frutas", [-26.83, -65.205], [-65.21, -26.82995, -65.2, -26.83005]) : calle("Verduras Don José", [-26.84, -65.205], [-65.21, -26.83995, -65.2, -26.84005])]);
    };
    expect((await sugerirLugares("frutas y verduras don josé", paralelas)).map((l) => l.etiqueta)).toEqual(["Frutas y Verduras Don José"]);
    // El mapa falla solo al pedir las calles: no se pierde lo demás.
    const sinCalles = async (url: string) => (new URL(url).searchParams.get("layer") === "street" ? new Response("", { status: 503 }) : responder([comun]));
    expect((await sugerirLugares("frutas y verduras don josé", sinCalles)).map((l) => l.etiqueta)).toEqual(["Frutas y Verduras Don José"]);
    // Si falla todo, se avisa como siempre.
    expect(await codigoDeError(sugerirLugares("muñecas y san juan", async () => new Response("", { status: 503 })))).toBe("VALIDACION");
  });

  it("una calle con muchos tramos se vuelve a pedir solo alrededor de la otra", async () => {
    const cajas: string[] = [];
    const photon = async (url: string) => {
      const p = new URL(url).searchParams;
      const q = p.get("q")!;
      if (p.get("layer") !== "street") return responder([]);
      if (q === "catamarca") return responder([calle("Catamarca", [-26.815, -65.2094], [-65.20945, -26.81, -65.20935, -26.82])]);
      cajas.push(p.get("bbox")!);
      // En toda la provincia: cincuenta tramos de otras localidades, que llenan la consulta.
      if (p.get("bbox") === PROVINCIA) return responder(Array.from({ length: 50 }, (_, i) => calle("Sarmiento", [-27 - i * 0.01, -65.3], [-65.31, -27 - i * 0.01 + 0.00005, -65.29, -27 - i * 0.01 - 0.00005])));
      return responder([calle("Avenida Sarmiento", [-26.8172, -65.209], [-65.215, -26.81715, -65.2, -26.81725], "Barrio Norte")]);
    };
    const [esquina] = await sugerirLugares("sarmiento y catamarca", photon);
    expect(esquina).toMatchObject({ etiqueta: "Avenida Sarmiento y Catamarca", detalle: "Barrio Norte, San Miguel de Tucumán", nota: "esquina" });
    expect(esquina!.coordenada.lat).toBeCloseTo(-26.8172, 4);
    expect(esquina!.coordenada.lng).toBeCloseTo(-65.2094, 4);
    // La segunda vez, en una caja chica alrededor de Catamarca.
    expect(cajas).toHaveLength(2);
    expect(cajas[0]).toBe(PROVINCIA);
    const [oeste, sur, este, norte] = cajas[1]!.split(",").map(Number);
    expect(este! - oeste!).toBeLessThan(0.01);
    expect(norte! - sur!).toBeLessThan(0.02);
  });

  it("la calle con su número se pregunta también con su otro nombre; si el número no está, se ofrece la calle para marcarlo", async () => {
    const pedidas: string[] = [];
    const photon = async (url: string) => {
      const q = new URL(url).searchParams.get("q")!;
      pedidas.push(q);
      if (q === "24 de septiembre 500") return responder([{ geometry: { coordinates: [-65.14094, -26.81571] }, properties: { name: "24 de Septiembre", osm_key: "highway", city: "Alderetes", state: "Tucumán", countrycode: "AR" } }]);
      if (q === "24 de setiembre 500") return responder([local(undefined, "24 de Setiembre de 1812", "500", [-26.83109, -65.20453])]);
      if (q === "General paz 9000") return responder([calle("General Paz", [-26.834, -65.215], [-65.23, -26.8339, -65.2, -26.8341], "Ciudadela"), local("Kiosco", "General Paz", "1200", [-26.83429, -65.21671])]);
      return responder([]);
    };
    // "septiembre" y "setiembre": la dirección exacta va primero, aunque haya venido en la segunda respuesta.
    expect((await sugerirLugares("24 de septiembre 500", photon)).map((l) => l.etiqueta)).toEqual(["24 de Setiembre de 1812 500", "24 de Septiembre"]);
    expect(pedidas).toEqual(["24 de septiembre 500", "24 de setiembre 500"]);
    // "gral" va completo; el 9000 no existe: la calle con ese número, como lugar aproximado.
    pedidas.length = 0;
    expect(await sugerirLugares("gral paz 9000", photon)).toEqual([
      { etiqueta: "General Paz 9000", detalle: "Ciudadela, San Miguel de Tucumán", coordenada: { lat: -26.83429, lng: -65.21671 }, aproximado: { falta: "el número 9000" } },
      { etiqueta: "Kiosco", detalle: "General Paz 1200, San Miguel de Tucumán, Tucumán", coordenada: { lat: -26.83429, lng: -65.21671 } },
    ]);
    expect(pedidas).toEqual(["General paz 9000"]);
  });
});
