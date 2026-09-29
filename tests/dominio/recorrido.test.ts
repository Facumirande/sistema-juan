import { describe, expect, it } from "vitest";

import { enlaceVerEnMapa, enlaceWaze, enlacesGoogleMaps, textoDeDestino } from "@/dominio/entregas/navegacion";
import { FACTOR_CALLES, distanciaKm, estimarTramo, planearRecorrido, type Coordenada, type ParadaRecorrido } from "@/dominio/entregas/recorrido";
import { coordenadaValida, esEnlaceCortoDeMapa, leerCoordenadas, mostrarCoordenadas } from "@/dominio/entregas/ubicacion";

const OBELISCO: Coordenada = { lat: -34.6037, lng: -58.3816 };
const PLAZA_DE_MAYO: Coordenada = { lat: -34.6083, lng: -58.3712 };

/** Un punto a `km` kilómetros al este del Obelisco (sobre el mismo paralelo). */
const alEste = (km: number): Coordenada => ({ lat: OBELISCO.lat, lng: OBELISCO.lng + km / (111.32 * Math.cos((OBELISCO.lat * Math.PI) / 180)) });
const parada = (id: string, coordenada: Coordenada | null): ParadaRecorrido => ({ id, coordenada });

describe("distancias y tiempos del viaje", () => {
  it("la distancia en línea recta y la estimación por calle", () => {
    expect(distanciaKm(OBELISCO, PLAZA_DE_MAYO)).toBeCloseTo(1.07, 1);
    expect(distanciaKm(OBELISCO, alEste(5))).toBeCloseTo(5, 1);
    expect(estimarTramo(OBELISCO, alEste(10))).toEqual({ km: Math.round(10 * FACTOR_CALLES * 10) / 10, minutos: 31 });
    expect(estimarTramo(OBELISCO, OBELISCO)).toEqual({ km: 0, minutos: 1 });
  });
});

describe("el mejor orden de las paradas", () => {
  it("sin paradas no hay viaje", () => {
    expect(planearRecorrido([], { salida: OBELISCO, volver: true })).toEqual({ orden: [], tramos: [], kmTotal: 0, minutosTotal: 0, sinUbicacion: [] });
  });

  it("ordena de la más cercana a la más lejana cuando están en fila, y vuelve si se pide", () => {
    const r = planearRecorrido([parada("c", alEste(3)), parada("a", alEste(1)), parada("b", alEste(2))], { salida: OBELISCO, volver: true });
    expect(r.orden).toEqual(["a", "b", "c"]);
    expect(r.tramos.map((t) => t.hastaId)).toEqual(["a", "b", "c", null]);
    expect(r.kmTotal).toBeCloseTo(6 * FACTOR_CALLES, 0);
    expect(r.minutosTotal).toBeGreaterThan(0);
  });

  it("la primera parada elegida a mano va primero y el resto se ordena desde ahí", () => {
    const r = planearRecorrido([parada("a", alEste(1)), parada("b", alEste(2)), parada("c", alEste(3))], { salida: OBELISCO, primeraId: "c" });
    expect(r.orden).toEqual(["c", "b", "a"]);
    expect(r.tramos[0]).toMatchObject({ hastaId: "c" });
  });

  it("las paradas sin ubicación van al final y sus tramos no tienen distancia", () => {
    const r = planearRecorrido([parada("x", null), parada("b", alEste(2)), parada("a", alEste(1))], { salida: OBELISCO, volver: true });
    expect(r.orden).toEqual(["a", "b", "x"]);
    expect(r.sinUbicacion).toEqual(["x"]);
    expect(r.tramos.at(-2)).toEqual({ hastaId: "x", km: null, minutos: null });
    expect(r.tramos.at(-1)).toEqual({ hastaId: null, km: null, minutos: null });
  });

  it("una primera parada sin ubicación va primero igual; el resto se ordena desde la salida", () => {
    const r = planearRecorrido([parada("a", alEste(2)), parada("x", null), parada("b", alEste(1))], { salida: OBELISCO, primeraId: "x" });
    expect(r.orden).toEqual(["x", "b", "a"]);
    expect(r.tramos[0]).toEqual({ hastaId: "x", km: null, minutos: null });
    expect(r.tramos[1]).toEqual({ hastaId: "b", km: null, minutos: null });
  });

  it("sin punto de salida, el viaje empieza en una de las paradas", () => {
    const r = planearRecorrido([parada("c", alEste(3)), parada("a", alEste(1)), parada("b", alEste(2))], { salida: null });
    expect([["a", "b", "c"], ["c", "b", "a"]]).toContainEqual(r.orden);
    expect(r.tramos).toHaveLength(2);
    expect(planearRecorrido([parada("a", alEste(1))], { salida: null, volver: true }).tramos).toEqual([]);
  });

  it("con muchas paradas se busca un buen orden sin probarlos todos", () => {
    // Una cuadrícula de 3 × 4 en desorden: el recorrido encontrado no puede ser más largo que
    // recorrerla fila por fila en zigzag.
    const puntos: ParadaRecorrido[] = [];
    const orden = [7, 2, 11, 0, 5, 9, 3, 10, 1, 6, 4, 8];
    for (const i of orden) {
      const fila = Math.floor(i / 4);
      const col = i % 4;
      puntos.push(parada(`p${i}`, { lat: OBELISCO.lat - fila * 0.01, lng: OBELISCO.lng + col * 0.01 }));
    }
    const r = planearRecorrido(puntos, { salida: OBELISCO });
    expect(new Set(r.orden)).toEqual(new Set(puntos.map((p) => p.id)));
    const zigzag = [0, 1, 2, 3, 7, 6, 5, 4, 8, 9, 10, 11].map((i) => `p${i}`);
    const largo = (ids: string[]) => {
      let total = 0;
      let previo = OBELISCO;
      for (const id of ids) {
        const c = puntos.find((p) => p.id === id)!.coordenada!;
        total += distanciaKm(previo, c);
        previo = c;
      }
      return total;
    };
    expect(largo(r.orden)).toBeLessThanOrEqual(largo(zigzag) + 1e-6);
  });

  it("con paradas desparramadas, el orden aproximado corrige los cruces", () => {
    // Puntos al azar (siempre los mismos): el primero que se agarra "el más cercano" deja cruces
    // que después se destraban. El resultado no puede ser más largo que el orden en que llegaron.
    let semilla = 7;
    const azar = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647;
    const puntos = Array.from({ length: 14 }, (_, i) => parada(`r${i}`, { lat: OBELISCO.lat + (azar() - 0.5) * 0.08, lng: OBELISCO.lng + (azar() - 0.5) * 0.08 }));
    const largo = (ids: readonly string[]) => {
      let total = 0;
      let previo = OBELISCO;
      for (const id of ids) {
        const c = puntos.find((p) => p.id === id)!.coordenada!;
        total += distanciaKm(previo, c);
        previo = c;
      }
      return total;
    };
    const r = planearRecorrido(puntos, { salida: OBELISCO });
    expect(new Set(r.orden).size).toBe(14);
    expect(largo(r.orden)).toBeLessThan(largo(puntos.map((p) => p.id)));
  });

  it("una primera parada que no está en el reparto se ignora, y sin salida también se ordenan muchas", () => {
    const fila = [4, 1, 3, 2].map((km) => parada(`k${km}`, alEste(km)));
    expect(planearRecorrido(fila, { salida: OBELISCO, primeraId: "otra" }).orden).toEqual(["k1", "k2", "k3", "k4"]);
    const muchas = [9, 3, 7, 1, 5, 2, 8, 4, 6, 10].map((km) => parada(`k${km}`, alEste(km)));
    const r = planearRecorrido(muchas, { salida: null });
    expect(r.tramos).toHaveLength(9);
    expect(r.kmTotal).toBeCloseTo(Math.round(((9 * FACTOR_CALLES * 10) / 10) * 10) / 10, 0);
  });

  it("con muchas paradas, el orden aproximado también puede volver a la salida", () => {
    // En desorden a lo largo de una calle: al volver conviene ir primero a lo más lejano o
    // terminar cerca; en cualquier caso, el viaje de vuelta cuenta.
    const puntos = [9, 3, 7, 1, 5, 2, 8, 4, 6, 10].map((km) => parada(`k${km}`, alEste(km)));
    const ida = planearRecorrido(puntos, { salida: OBELISCO });
    const idaYVuelta = planearRecorrido(puntos, { salida: OBELISCO, volver: true });
    expect(ida.orden).toEqual(["k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8", "k9", "k10"]);
    expect(idaYVuelta.tramos.at(-1)).toMatchObject({ hastaId: null });
    expect(idaYVuelta.kmTotal).toBeGreaterThan(ida.kmTotal);
  });
});

describe("ir con el GPS", () => {
  const hospital = { coordenada: OBELISCO, direccion: "Av. 9 de Julio 1000", localidad: "CABA" };
  const verduleria = { coordenada: null, direccion: "Calle Falsa 123", localidad: "Lanús" };
  const restaurante = { coordenada: PLAZA_DE_MAYO, direccion: "Balcarce 50" };

  it("el destino va con coordenadas si las tiene; si no, con la dirección", () => {
    expect(textoDeDestino(hospital)).toBe("-34.603700,-58.381600");
    expect(textoDeDestino(verduleria)).toBe("Calle Falsa 123, Lanús, Argentina");
    expect(textoDeDestino({ coordenada: null, direccion: "Balcarce 50", localidad: " " })).toBe("Balcarce 50, Argentina");
  });

  it("un viaje de Google Maps con paradas intermedias, desde donde está el celular o desde un origen", () => {
    const [solo] = enlacesGoogleMaps([hospital]);
    expect(solo).toBe("https://www.google.com/maps/dir/?api=1&destination=-34.603700%2C-58.381600&travelmode=driving");
    const [conParadas] = enlacesGoogleMaps([hospital, verduleria, restaurante], restaurante);
    const u = new URL(conParadas!);
    expect(u.searchParams.get("origin")).toBe("-34.608300,-58.371200");
    expect(u.searchParams.get("destination")).toBe("-34.608300,-58.371200");
    expect(u.searchParams.get("waypoints")).toBe("-34.603700,-58.381600|Calle Falsa 123, Lanús, Argentina");
  });

  it("con más de 10 paradas se parte en varios viajes encadenados", () => {
    const paradas = Array.from({ length: 12 }, (_, i) => ({ coordenada: alEste(i + 1), direccion: `Calle ${i + 1}` }));
    const enlaces = enlacesGoogleMaps(paradas);
    expect(enlaces).toHaveLength(2);
    const segundo = new URL(enlaces[1]!);
    expect(segundo.searchParams.get("origin")).toBe(textoDeDestino(paradas[9]!));
    expect(segundo.searchParams.get("destination")).toBe(textoDeDestino(paradas[11]!));
    expect(enlacesGoogleMaps([])).toEqual([]);
  });

  it("Waze a un destino y ver un lugar en el mapa", () => {
    expect(enlaceWaze(hospital)).toBe("https://waze.com/ul?ll=-34.603700%2C-58.381600&navigate=yes");
    expect(enlaceWaze(verduleria)).toBe("https://waze.com/ul?q=Calle+Falsa+123%2C+Lan%C3%BAs%2C+Argentina&navigate=yes");
    expect(enlaceVerEnMapa(hospital)).toBe("https://www.google.com/maps/search/?api=1&query=-34.603700%2C-58.381600");
  });
});

describe("leer una ubicación pegada", () => {
  it("coordenadas escritas de distintas formas", () => {
    expect(leerCoordenadas("-34.6037, -58.3816")).toEqual(OBELISCO);
    expect(leerCoordenadas("-34.6037,-58.3816")).toEqual(OBELISCO);
    expect(leerCoordenadas("-34.6037 -58.3816")).toEqual(OBELISCO);
    expect(leerCoordenadas("-34,6037; -58,3816")).toEqual(OBELISCO);
    expect(leerCoordenadas("-34,6037 -58,3816")).toEqual(OBELISCO);
  });

  it("enlaces de Google Maps: el lugar marcado antes que el centro del mapa", () => {
    expect(leerCoordenadas("https://www.google.com/maps/place/Obelisco/@-34.6,-58.38,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-34.603722!4d-58.381592")).toEqual({ lat: -34.603722, lng: -58.381592 });
    expect(leerCoordenadas("https://www.google.com/maps/@-34.6037,-58.3816,15z")).toEqual(OBELISCO);
    expect(leerCoordenadas("https://maps.google.com/?q=-34.6037%2C-58.3816")).toEqual(OBELISCO);
    // Si el primer patrón da algo imposible, se prueba el siguiente.
    expect(leerCoordenadas("x!3d95.0!4d-58.0 y @-34.6037,-58.3816")).toEqual(OBELISCO);
  });

  it("lo que no es una ubicación", () => {
    expect(leerCoordenadas("hola")).toBeNull();
    expect(leerCoordenadas("95, 200")).toBeNull();
    expect(leerCoordenadas("0, 0")).toBeNull();
    expect(leerCoordenadas("-95,1; -58,3")).toBeNull();
    expect(leerCoordenadas("%E0%A4%A")).toBeNull();
    expect(coordenadaValida(Number.NaN, 1)).toBe(false);
  });

  it("mostrarla y reconocer los enlaces cortos que hay que seguir", () => {
    expect(mostrarCoordenadas(OBELISCO)).toBe("-34,603700; -58,381600");
    expect(esEnlaceCortoDeMapa("https://maps.app.goo.gl/AbC123")).toBe(true);
    expect(esEnlaceCortoDeMapa("https://goo.gl/maps/xyz")).toBe(true);
    expect(esEnlaceCortoDeMapa("https://goo.gl/otra")).toBe(false);
    expect(esEnlaceCortoDeMapa("http://maps.app.goo.gl/x")).toBe(false);
    expect(esEnlaceCortoDeMapa("no es un enlace")).toBe(false);
  });
});
