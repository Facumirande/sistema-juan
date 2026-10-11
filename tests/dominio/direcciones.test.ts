import { describe, expect, it } from "vitest";

import {
  casasDePhoton,
  comoSeUbico,
  consultasParaElMapa,
  esAOjo,
  esquinasEntre,
  leerCalleYNumero,
  leerEsquina,
  lugaresDePhoton,
  ordenarPorNumero,
  palabrasDeCalle,
  parecidoDeCalle,
  tramosDePhoton,
  ubicarPorNumeros,
} from "@/dominio/entregas/ubicacion";

// Las direcciones como se dicen (pedido del usuario, 11/10/2026): "Buenos Aires 778" y "Muñecas y San Juan".

/** Un tramo de calle como lo devuelve Photon: el punto va [lat, lng] y la caja [oeste, norte, este, sur]. */
const calle = (nombre: string, punto: [number, number], caja: [number, number, number, number], donde: { barrio?: string; ciudad?: string } = {}) => ({
  geometry: { type: "Point", coordinates: [punto[1], punto[0]] },
  properties: { name: nombre, osm_key: "highway", extent: caja, district: donde.barrio, city: donde.ciudad ?? "San Miguel de Tucumán", state: "Tucumán", countrycode: "AR" },
});
/** Una dirección con número (una casa o un local). */
const casa = (calleDeLaCasa: string, numero: string, punto: [number, number], extra: { nombre?: string; barrio?: string; ciudad?: string } = {}) => ({
  geometry: { type: "Point", coordinates: [punto[1], punto[0]] },
  properties: { name: extra.nombre, street: calleDeLaCasa, housenumber: numero, osm_key: extra.nombre ? "amenity" : "place", district: extra.barrio, city: extra.ciudad ?? "San Miguel de Tucumán", state: "Tucumán", countrycode: "AR" },
});

// Los tramos de verdad del centro de San Miguel de Tucumán (Photon, 11/10/2026).
const MUNECAS = {
  features: [
    calle("Muñecas", [-26.83003, -65.20609], [-65.20627, -26.8294, -65.20591, -26.83066], { barrio: "Centro" }),
    calle("Ildefonso de las Muñecas", [-26.82599, -65.20495], [-65.20515, -26.8253, -65.20476, -26.82668], { barrio: "Centro" }),
    calle("Peatonal Muñecas", [-26.82804, -65.20552], [-65.20591, -26.82668, -65.20515, -26.8294], { barrio: "Centro" }),
    calle("Ildefonso de las Muñecas", [-26.82189, -65.20391], [-65.20476, -26.81844, -65.20329, -26.8253], { barrio: "Barrio Norte" }),
    calle("Muñecas", [-26.81821, -65.13387], [-65.13784, -26.81748, -65.12992, -26.81901], { barrio: "Las Piedritas", ciudad: "Alderetes" }),
  ],
};
const SAN_JUAN = {
  features: [
    calle("San Juan", [-26.82563, -65.20336], [-65.20476, -26.8253, -65.20196, -26.82593], { barrio: "Centro" }),
    calle("San Juan", [-26.82638, -65.19889], [-65.20196, -26.82593, -65.19583, -26.8269], { barrio: "Barrio Norte" }),
    calle("San Juan", [-26.82476, -65.20715], [-65.20953, -26.8242, -65.20476, -26.8253], { barrio: "Centro" }),
    calle("San Juan Bautista", [-26.9, -65.3], [-65.301, -26.899, -65.299, -26.901], { ciudad: "Lules" }),
    // Un local con ese nombre no es una calle.
    casa("Muñecas", "354", [-26.82593, -65.20555], { nombre: "Tienda San Juan", barrio: "Centro" }),
  ],
};

describe("entender una dirección escrita", () => {
  it("una esquina: las dos calles y, después de la coma, la localidad", () => {
    expect(leerEsquina("Muñecas y San Juan")).toEqual({ a: "Muñecas", b: "San Juan", localidad: null });
    expect(leerEsquina("laprida esq. mendoza")).toEqual({ a: "laprida", b: "mendoza", localidad: null });
    expect(leerEsquina("  Av. Alem  /  Lavalle ,  Yerba Buena ")).toEqual({ a: "Av. Alem", b: "Lavalle", localidad: "Yerba Buena" });
    expect(leerEsquina("9 de julio e independencia")).toEqual({ a: "9 de julio", b: "independencia", localidad: null });
    expect(leerEsquina("san martin esquina 25 de mayo")).toEqual({ a: "san martin", b: "25 de mayo", localidad: null });
    // Todavía no: una sola calle, la segunda a medio empezar, tres calles o una con su número.
    expect(leerEsquina("muñecas")).toBeNull();
    expect(leerEsquina("muñecas y san")).toBeNull();
    expect(leerEsquina("av y lavalle")).toBeNull();
    expect(leerEsquina("laprida y mendoza y san juan")).toBeNull();
    expect(leerEsquina("muñecas 450 y san juan")).toBeNull();
    // La "y" de la localidad no arma una esquina.
    expect(leerEsquina("Mercofrut, Tafí Viejo y alrededores")).toBeNull();
  });

  it("una calle con su número, sin confundir el número que es parte del nombre", () => {
    expect(leerCalleYNumero("Buenos Aires 778")).toEqual({ calle: "Buenos Aires", numero: 778 });
    expect(leerCalleYNumero("Av. Aconquija al 1500, Yerba Buena")).toEqual({ calle: "Aconquija", numero: 1500 });
    expect(leerCalleYNumero("24 de Septiembre 500")).toEqual({ calle: "24 de Septiembre", numero: 500 });
    expect(leerCalleYNumero("calle lavalle n° 500")).toEqual({ calle: "lavalle", numero: 500 });
    expect(leerCalleYNumero("san martin 1200 yerba buena")).toEqual({ calle: "san martin", numero: 1200 });
    expect(leerCalleYNumero("9 de julio")).toBeNull();
    expect(leerCalleYNumero("Mercofrut")).toBeNull();
    // Un número que no es de puerta.
    expect(leerCalleYNumero("ruta 9")).toBeNull();
    expect(leerCalleYNumero("barrio 130 viviendas")).toBeNull();
    expect(leerCalleYNumero("country pinar II, tafi viejo")).toBeNull();
  });

  it("cómo se le pregunta al mapa: abreviaturas completas y las dos maneras de escribir septiembre", () => {
    expect(consultasParaElMapa("  gral  paz 1200 ")).toEqual(["General paz 1200"]);
    expect(consultasParaElMapa("Av. Aconquija 1500")).toEqual(["Avenida Aconquija 1500"]);
    expect(consultasParaElMapa("calle 24 de septiembre 500")).toEqual(["24 de septiembre 500", "24 de setiembre 500"]);
    expect(consultasParaElMapa("24 de Setiembre")).toEqual(["24 de Setiembre", "24 de septiembre"]);
    expect(consultasParaElMapa("pje. sta. rosa, cnel suarez")).toEqual(["Pasaje Santa rosa, Coronel suarez"]);
    // Lo que no trae nada de eso queda como se escribió.
    expect(consultasParaElMapa("country pinar II, tafi viejo")).toEqual(["country pinar II, tafi viejo"]);
    expect(consultasParaElMapa("Buenos Aires 778")).toEqual(["Buenos Aires 778"]);
  });

  it("si una calle del mapa es la que se escribió", () => {
    expect(palabrasDeCalle("Ildefonso de las Muñecas")).toEqual(["ildefonso", "munecas"]);
    expect(palabrasDeCalle("Av. Gral. Roca")).toEqual(["general", "roca"]);
    expect(palabrasDeCalle("24 de Septiembre")).toEqual(["24", "setiembre"]);
    expect(parecidoDeCalle("muñecas", "Muñecas")).toBe(2);
    expect(parecidoDeCalle("aconquija", "Avenida Aconquija")).toBe(2);
    expect(parecidoDeCalle("gral paz", "General Paz")).toBe(2);
    expect(parecidoDeCalle("av mate de luna", "Avenida Mate de Luna")).toBe(2);
    expect(parecidoDeCalle("munecas", "Ildefonso de las Muñecas")).toBe(1);
    expect(parecidoDeCalle("24 de septiembre", "24 de Setiembre de 1812")).toBe(1);
    expect(parecidoDeCalle("roca", "Avenida General Roca")).toBe(1);
    // La última palabra puede estar a medio escribir; y de más (la localidad pegada) también vale.
    expect(parecidoDeCalle("san ju", "San Juan")).toBe(2);
    expect(parecidoDeCalle("san juan yerba buena", "San Juan")).toBe(1);
    // Otra calle.
    expect(parecidoDeCalle("san juan", "Juan B. Justo")).toBe(0);
    expect(parecidoDeCalle("ju san", "San Juan")).toBe(0);
    expect(parecidoDeCalle("laprida", "Chazarreta")).toBe(0);
    expect(parecidoDeCalle("", "San Juan")).toBe(0);
  });
});

describe("lo que se saca de las respuestas del mapa", () => {
  it("los tramos de una calle, con la caja que ocupan (sin locales ni casas)", () => {
    const tramos = tramosDePhoton(SAN_JUAN);
    expect(tramos).toHaveLength(4);
    expect(tramos[0]).toEqual({ nombre: "San Juan", zona: "Centro, San Miguel de Tucumán", ciudad: "San Miguel de Tucumán", coordenada: { lat: -26.82563, lng: -65.20336 }, caja: { oeste: -65.20476, norte: -26.8253, este: -65.20196, sur: -26.82593 } });
    // Sin caja (o con una mal armada) el tramo queda, pero no sirve para calcular esquinas.
    expect(tramosDePhoton({ features: [{ geometry: { coordinates: [-65.2, -26.8] }, properties: { name: "Lavalle", osm_key: "highway", extent: [1, 2] } }] })[0]?.caja).toBeNull();
    expect(tramosDePhoton(null)).toEqual([]);
    expect(tramosDePhoton({ features: [{ geometry: { coordinates: [-58.4, -34.6] }, properties: { name: "Lavalle", osm_key: "highway", countrycode: "UY" } }] })).toEqual([]);
  });

  it("las direcciones con número", () => {
    expect(casasDePhoton(SAN_JUAN)).toEqual([{ calle: "Muñecas", numero: 354, zona: "Centro, San Miguel de Tucumán", ciudad: "San Miguel de Tucumán", coordenada: { lat: -26.82593, lng: -65.20555 } }]);
    // "450 bis" vale por 450; sin número, o con letras, no es una dirección con número.
    expect(casasDePhoton({ features: [casa("Lavalle", "450 bis", [-26.83, -65.21]), casa("Lavalle", "s/n", [-26.83, -65.21]), calle("Lavalle", [-26.83, -65.21], [-65.22, -26.82, -65.2, -26.84])] }).map((c) => c.numero)).toEqual([450]);
  });
});

describe("la esquina de dos calles, calculada con sus tramos", () => {
  it("Muñecas y San Juan: el punto donde se tocan, igual al del mapa", () => {
    const esquinas = esquinasEntre({ a: "muñecas", b: "san juan" }, tramosDePhoton(MUNECAS), tramosDePhoton(SAN_JUAN));
    expect(esquinas).toEqual([{ coordenada: { lat: -26.8253, lng: -65.20476 }, a: "Ildefonso de las Muñecas", b: "San Juan", zona: "Centro, San Miguel de Tucumán", segura: true }]);
    // Da lo mismo en qué orden se escriban.
    const alReves = esquinasEntre({ a: "san juan", b: "muñecas" }, tramosDePhoton(SAN_JUAN), tramosDePhoton(MUNECAS));
    expect(alReves.map((e) => e.coordenada)).toEqual([{ lat: -26.8253, lng: -65.20476 }]);
    expect(alReves[0]?.a).toBe("San Juan");
  });

  it("dos calles que se cruzan sin cortarse en la esquina", () => {
    // Una calle de norte a sur y otra de este a oeste, cada una de un solo tramo largo.
    const alberdi = tramosDePhoton({ features: [calle("Alberdi", [-26.805, -65.29995], [-65.3, -26.8, -65.2999, -26.81])] });
    const mitre = tramosDePhoton({ features: [calle("Avenida Mitre", [-26.80495, -65.3], [-65.305, -26.8049, -65.295, -26.805])] });
    const [esquina, ...otras] = esquinasEntre({ a: "alberdi", b: "mitre" }, alberdi, mitre);
    expect(otras).toEqual([]);
    expect(esquina?.segura).toBe(true);
    expect(esquina?.b).toBe("Avenida Mitre");
    expect(esquina!.coordenada.lat).toBeCloseTo(-26.80495, 4);
    expect(esquina!.coordenada.lng).toBeCloseTo(-65.29995, 4);
  });

  it("si de un tramo no se sabe hacia dónde corre, la esquina se ofrece como dudosa y una sola vez", () => {
    // Dos calles en diagonal, de un tramo cada una y sin otros que digan cuál de las dos diagonales es.
    const una = tramosDePhoton({ features: [calle("Diagonal Norte", [-26.805, -65.295], [-65.3, -26.8, -65.29, -26.81])] });
    const otra = tramosDePhoton({ features: [calle("Los Ceibos", [-26.805, -65.295], [-65.2975, -26.8, -65.2925, -26.81])] });
    const esquinas = esquinasEntre({ a: "diagonal norte", b: "los ceibos" }, una, otra);
    expect(esquinas).toHaveLength(1);
    expect(esquinas[0]?.segura).toBe(false);
  });

  it("primero la del centro; dos calles paralelas, o que no son las escritas, no tienen esquina", () => {
    const lules = { ciudad: "Lules" };
    const sanMartin = tramosDePhoton({
      features: [calle("San Martín", [-26.917, -65.3358], [-65.3359, -26.91, -65.3357, -26.924], lules), calle("San Martín", [-26.8297, -65.205], [-65.21, -26.82965, -65.2, -26.82975], { barrio: "Centro" })],
    });
    const mayo = tramosDePhoton({
      features: [calle("25 de Mayo", [-26.9174, -65.336], [-65.34, -26.91735, -65.33, -26.91745], lules), calle("25 de Mayo de 1810", [-26.83, -65.2044], [-65.20445, -26.82, -65.20435, -26.84], { barrio: "Centro" })],
    });
    const esquinas = esquinasEntre({ a: "san martin", b: "25 de mayo" }, sanMartin, mayo);
    expect(esquinas.map((e) => `${e.a} y ${e.b} — ${e.zona}`)).toEqual(["San Martín y 25 de Mayo de 1810 — Centro, San Miguel de Tucumán", "San Martín y 25 de Mayo — Lules"]);
    // Paralelas: los dos tramos del centro de "San Martín" contra sí mismos corridos media cuadra.
    const paralela = tramosDePhoton({ features: [calle("Mendoza", [-26.8302, -65.205], [-65.21, -26.83015, -65.2, -26.83025])] });
    expect(esquinasEntre({ a: "san martin", b: "mendoza" }, sanMartin, paralela)).toEqual([]);
    // El mapa devolvió otra calle parecida: no cuenta.
    expect(esquinasEntre({ a: "san martin", b: "belgrano" }, sanMartin, mayo)).toEqual([]);
    expect(esquinasEntre({ a: "san martin", b: "25 de mayo" }, [], mayo)).toEqual([]);
  });
});

describe("un número de calle que no está en el mapa", () => {
  const numeros = [
    { numero: 480, coordenada: { lat: -26.83, lng: -65.2 } },
    { numero: 520, coordenada: { lat: -26.831, lng: -65.2004 } },
    { numero: 1300, coordenada: { lat: -26.84, lng: -65.21 } },
  ];

  it("se ubica entre sus vecinos, en proporción", () => {
    expect(ubicarPorNumeros(numeros, 520)).toEqual({ coordenada: { lat: -26.831, lng: -65.2004 }, exacto: true, entre: [520] });
    expect(ubicarPorNumeros(numeros, 500)).toEqual({ coordenada: { lat: -26.8305, lng: -65.2002 }, exacto: false, entre: [480, 520] });
    expect(ubicarPorNumeros(numeros, 490)?.coordenada).toEqual({ lat: -26.83025, lng: -65.2001 });
    expect(comoSeUbico([480, 520])).toBe("entre el 480 y el 520");
  });

  it("con un solo vecino, solo si está en la cuadra; más lejos no se arriesga un punto", () => {
    expect(ubicarPorNumeros(numeros, 450)).toEqual({ coordenada: { lat: -26.83, lng: -65.2 }, exacto: false, entre: [480] });
    expect(comoSeUbico([480])).toBe("cerca del 480");
    expect(ubicarPorNumeros(numeros, 300)).toBeNull();
    // Entre el 520 y el 1300 hay demasiadas cuadras para repartir; el 560 queda junto al 520.
    expect(ubicarPorNumeros(numeros, 560)?.entre).toEqual([520]);
    expect(ubicarPorNumeros(numeros, 900)).toBeNull();
    expect(ubicarPorNumeros([], 500)).toBeNull();
    // Dos vecinos de calles distintas con el mismo nombre (lejos entre sí): vale solo el de al lado.
    const enDosCiudades = [numeros[0]!, { numero: 540, coordenada: { lat: -26.73, lng: -65.26 } }];
    expect(ubicarPorNumeros(enDosCiudades, 500)?.entre).toEqual([480]);
  });

  it("a ojo vale cualquier vecino: sirve para saber por dónde abrir el mapa", () => {
    expect(ubicarPorNumeros(numeros, 900, { aOjo: true })?.entre).toEqual([520, 1300]);
    expect(ubicarPorNumeros(numeros, 100, { aOjo: true })?.entre).toEqual([480]);
    expect(ubicarPorNumeros([], 100, { aOjo: true })).toBeNull();
  });
});

describe("las sugerencias de una calle con su número", () => {
  const aconquija = {
    features: [
      calle("Avenida Aconquija", [-26.81715, -65.27215], [-65.27322, -26.81695, -65.27107, -26.81735], { barrio: "Marcos Paz", ciudad: "Yerba Buena" }),
      casa("Avenida Aconquija", "889", [-26.81547, -65.27991], { nombre: "ANSES", barrio: "Marcos Paz", ciudad: "Yerba Buena" }),
      casa("Avenida Aconquija", "1991", [-26.81221, -65.29821], { nombre: "Municipalidad de Yerba Buena", barrio: "Marcos Paz", ciudad: "Yerba Buena" }),
      casa("Avenida Aconquija", "2099", [-26.81179, -65.30119], { nombre: "Farmacia", barrio: "Marcos Paz", ciudad: "Yerba Buena" }),
      casa("Lamadrid", "1500", [-26.84, -65.21], { barrio: "Barrio Sur" }),
    ],
  };
  const pedir = (numero: number) => ordenarPorNumero({ calle: "aconquija", numero }, [aconquija], lugaresDePhoton(aconquija));

  it("si el número está en el mapa, esa dirección va primero", () => {
    const lugares = pedir(1991);
    expect(lugares[0]?.etiqueta).toBe("Municipalidad de Yerba Buena");
    expect(lugares).toHaveLength(5);
    // El mismo número en otra calle no cuenta.
    expect(ordenarPorNumero({ calle: "aconquija", numero: 1500 }, [aconquija], lugaresDePhoton(aconquija)).some((l) => l.etiqueta === "Lamadrid 1500" && l === lugares[0])).toBe(false);
  });

  it("si no está, se lo ubica entre los vecinos cercanos o junto al de al lado", () => {
    const [entre] = pedir(2050);
    expect(entre).toMatchObject({ etiqueta: "Avenida Aconquija 2050", detalle: "Marcos Paz, Yerba Buena", nota: "entre el 1991 y el 2099" });
    expect(entre!.coordenada.lng).toBeCloseTo(-65.29984, 4);
    expect(esAOjo(entre!)).toBe(true);
    expect(pedir(1950)[0]).toMatchObject({ etiqueta: "Avenida Aconquija 1950", nota: "cerca del 1991", coordenada: { lat: -26.81221, lng: -65.29821 } });
    // La calle sola ya no se repite debajo: quedó arriba, con su número.
    expect(pedir(2050).map((l) => l.etiqueta)).toEqual(["Avenida Aconquija 2050", "ANSES", "Municipalidad de Yerba Buena", "Farmacia", "Lamadrid 1500"]);
  });

  it("sin vecinos cerca, se ofrece la calle como lugar aproximado: el mapa se abre por ahí y el punto se marca a mano", () => {
    const [aproximado] = pedir(1500);
    expect(aproximado).toMatchObject({ etiqueta: "Avenida Aconquija 1500", detalle: "Marcos Paz, Yerba Buena", aproximado: { falta: "el número 1500" } });
    expect(aproximado?.nota).toBeUndefined();
    // Por dónde abrirlo: a ojo, entre el 889 y el 1991.
    expect(aproximado!.coordenada.lng).toBeCloseTo(-65.29006, 4);
    // Sin ningún número cargado en esa calle, el punto de la calle.
    const sola = { features: [aconquija.features[0]] };
    expect(ordenarPorNumero({ calle: "aconquija", numero: 1500 }, [sola], lugaresDePhoton(sola))).toEqual([
      { etiqueta: "Avenida Aconquija 1500", detalle: "Marcos Paz, Yerba Buena", coordenada: { lat: -26.81715, lng: -65.27215 }, aproximado: { falta: "el número 1500" } },
    ]);
  });

  it("si el mapa no devolvió esa calle, las sugerencias quedan como vinieron", () => {
    const lugares = lugaresDePhoton(aconquija);
    expect(ordenarPorNumero({ calle: "corrientes", numero: 1234 }, [aconquija], lugares)).toEqual(lugares);
    expect(esAOjo({ etiqueta: "Laprida y Mendoza", detalle: null, coordenada: { lat: -26.8, lng: -65.2 }, nota: "esquina" })).toBe(false);
    expect(esAOjo({ etiqueta: "Lavalle 500", detalle: null, coordenada: { lat: -26.8, lng: -65.2 } })).toBe(false);
  });
});
