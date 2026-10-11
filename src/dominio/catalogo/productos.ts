import { dec, redondearPesos } from "../dinero/decimal";
import { interpretarNumero } from "../dinero/entrada";

// Ayudas para cargar y mostrar productos de forma simple: un dibujo según el nombre, un código
// que se arma solo y las presentaciones dichas en palabras ("1 cajón = 18 kg").

const sinAcentos = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Palabra (o comienzo de palabra) → dibujo. El orden importa: lo más específico primero. */
const DIBUJOS: readonly [string, string][] = [
  ["tomate", "🍅"],
  ["cherry", "🍅"],
  ["papaya", "🥭"],
  ["papa", "🥔"],
  ["batata", "🍠"],
  ["lechuga", "🥬"],
  ["espinaca", "🥬"],
  ["acelga", "🥬"],
  ["repollo", "🥬"],
  ["rucula", "🥬"],
  ["radicheta", "🥬"],
  ["kale", "🥬"],
  ["escarola", "🥬"],
  ["apio", "🥬"],
  ["banana", "🍌"],
  ["cebolla", "🧅"],
  ["verdeo", "🧅"],
  ["puerro", "🧅"],
  ["ajo", "🧄"],
  ["zanahoria", "🥕"],
  ["zapallito", "🥒"],
  ["zucchini", "🥒"],
  ["pepino", "🥒"],
  ["zapallo", "🎃"],
  ["calabaza", "🎃"],
  ["anco", "🎃"],
  ["berenjena", "🍆"],
  ["morron", "🫑"],
  ["pimiento", "🫑"],
  ["aji", "🌶️"],
  ["jalapeno", "🌶️"],
  ["choclo", "🌽"],
  ["maiz", "🌽"],
  ["brocoli", "🥦"],
  ["coliflor", "🥦"],
  ["palta", "🥑"],
  ["manzana", "🍎"],
  ["pera", "🍐"],
  ["naranja", "🍊"],
  ["mandarina", "🍊"],
  ["pomelo", "🍊"],
  ["limon", "🍋"],
  ["uva", "🍇"],
  ["frutilla", "🍓"],
  ["frambuesa", "🍓"],
  ["arandano", "🫐"],
  ["cereza", "🍒"],
  ["durazno", "🍑"],
  ["pelon", "🍑"],
  ["ciruela", "🍑"],
  ["damasco", "🍑"],
  ["sandia", "🍉"],
  ["melon", "🍈"],
  ["anana", "🍍"],
  ["kiwi", "🥝"],
  ["mango", "🥭"],
  ["coco", "🥥"],
  ["huevo", "🥚"],
  ["champi", "🍄"],
  ["hongo", "🍄"],
  ["girgola", "🍄"],
  ["perejil", "🌿"],
  ["albahaca", "🌿"],
  ["cilantro", "🌿"],
  ["menta", "🌿"],
  ["romero", "🌿"],
  ["oregano", "🌿"],
  ["poroto", "🫘"],
  ["lenteja", "🫘"],
  ["garbanzo", "🫘"],
  ["nuez", "🌰"],
  ["almendra", "🌰"],
  ["mani", "🥜"],
  ["pistacho", "🥜"],
  ["caju", "🥜"],
  ["castana", "🌰"],
  ["avellana", "🌰"],
  ["habanero", "🌶️"],
  ["chile", "🌶️"],
  ["locoto", "🌶️"],
  ["pimenton", "🫑"],
  ["arveja", "🫛"],
  ["chaucha", "🫛"],
  ["haba", "🫛"],
  ["jengibre", "🫚"],
  ["curcuma", "🫚"],
  ["aceituna", "🫒"],
  ["oliva", "🫒"],
  ["calabacin", "🥒"],
  ["zuchini", "🥒"],
  ["boniato", "🍠"],
  ["camote", "🍠"],
  ["cebollin", "🧅"],
  ["echalote", "🧅"],
  ["berro", "🥬"],
  ["achicoria", "🥬"],
  ["endivia", "🥬"],
  ["akusay", "🥬"],
  ["platano", "🍌"],
  ["pina", "🍍"],
  ["lima", "🍋"],
  ["bergamota", "🍋"],
  ["quinoto", "🍊"],
  ["tangerina", "🍊"],
  ["nectarin", "🍑"],
  ["guinda", "🍒"],
  ["mora", "🫐"],
  ["portobello", "🍄"],
  ["seta", "🍄"],
  ["hinojo", "🌿"],
  ["laurel", "🌿"],
  ["tomillo", "🌿"],
  ["salvia", "🌿"],
  ["eneldo", "🌿"],
  ["ciboulette", "🌿"],
  ["estragon", "🌿"],
  ["hierba", "🌿"],
  ["aromatica", "🌿"],
  ["brote", "🌱"],
  ["germinado", "🌱"],
  ["soja", "🫘"],
  ["pochoclo", "🌽"],
  ["ensalada", "🥗"],
  ["girasol", "🌻"],
  ["flor", "💐"],
  ["miel", "🍯"],
  ["queso", "🧀"],
  ["jugo", "🧃"],
  ["mandioca", "🍠"],
  ["membrillo", "🍐"],
  ["higo", "🍑"],
];

/** Lo que se reconoce como fruta por su nombre (lo demás que tiene dibujo, como verdura). */
const FRUTAS = new Set([
  "papaya", "banana", "palta", "manzana", "pera", "naranja", "mandarina", "pomelo", "limon", "lima", "uva", "frutilla", "frambuesa", "arandano",
  "cereza", "durazno", "pelon", "ciruela", "damasco", "sandia", "melon", "anana", "kiwi", "mango", "coco", "membrillo", "mora", "higo",
]);
const NO_VEGETALES = new Set(["huevo", "nuez", "almendra", "mani", "poroto", "lenteja", "garbanzo"]);

const DIBUJO_DEL_GRUPO: Readonly<Record<string, string>> = { VERDURA: "🥦", FRUTA: "🍎" };

const palabrasDe = (nombre: string) => sinAcentos(nombre).split(/[^a-z0-9]+/).filter(Boolean);
const claveDe = (nombre: string) => {
  const palabras = palabrasDe(nombre);
  return DIBUJOS.find(([clave]) => palabras.some((p) => p.startsWith(clave)));
};

/** Un dibujo para reconocer el producto de un vistazo (por su nombre, o por su grupo). */
export function dibujoDeProducto(nombre: string, grupo?: string | null): string {
  return claveDe(nombre)?.[1] ?? DIBUJO_DEL_GRUPO[grupo ?? ""] ?? "📦";
}

/**
 * Si es fruta o verdura según su nombre (para el color de su tarjeta); si el nombre no lo dice, el
 * grupo de su categoría.
 */
export function grupoDeProducto(nombre: string, grupoCategoria?: string | null): "FRUTA" | "VERDURA" | "OTRO" {
  const clave = claveDe(nombre)?.[0];
  if (clave && FRUTAS.has(clave)) return "FRUTA";
  if (clave && !NO_VEGETALES.has(clave)) return "VERDURA";
  if (clave) return "OTRO";
  return grupoCategoria === "FRUTA" || grupoCategoria === "VERDURA" ? grupoCategoria : "OTRO";
}

export type UnidadDeVenta = "KG" | "UNIDAD" | "ATADO" | "MAPLE" | "BANDEJA" | "DOCENA" | "PAQUETE" | "LITRO" | "CAJON" | "CAJA" | "BOLSA" | "JAULA" | "BOLSON" | "RISTRA";

/** Las que son un envase: el producto se cuenta en cajones, cajas… y no hace falta decir cuántos kilos traen. */
export const UNIDADES_ENVASE: ReadonlySet<UnidadDeVenta> = new Set(["CAJON", "CAJA", "BOLSA", "JAULA", "BOLSON", "RISTRA"]);

/** Cómo se dice cada forma de vender en la planilla (y las listas para elegir). */
export const UNIDADES_EN_PALABRAS: Readonly<Record<UnidadDeVenta, string>> = {
  KG: "Kilo",
  UNIDAD: "Unidad",
  ATADO: "Atado",
  MAPLE: "Maple",
  BANDEJA: "Bandeja",
  DOCENA: "Docena",
  PAQUETE: "Paquete",
  LITRO: "Litro",
  CAJON: "Cajón",
  CAJA: "Caja",
  BOLSA: "Bolsa",
  JAULA: "Jaula",
  BOLSON: "Bolsón",
  RISTRA: "Ristra",
};

const SINONIMOS_UNIDAD: readonly [UnidadDeVenta, readonly string[]][] = [
  ["KG", ["kilo", "kilos", "kg", "kgs", "k", "kilogramo", "kilogramos", "por kilo"]],
  ["UNIDAD", ["unidad", "unidades", "u", "un", "uni", "por unidad", "pieza", "piezas"]],
  ["ATADO", ["atado", "atados", "por atado"]],
  ["MAPLE", ["maple", "maples"]],
  ["BANDEJA", ["bandeja", "bandejas"]],
  ["DOCENA", ["docena", "docenas", "doc"]],
  ["PAQUETE", ["paquete", "paquetes", "paq"]],
  ["LITRO", ["litro", "litros", "l", "lt", "lts"]],
  ["CAJON", ["cajon", "cajones", "por cajon"]],
  ["CAJA", ["caja", "cajas", "por caja"]],
  ["BOLSA", ["bolsa", "bolsas", "por bolsa"]],
  ["JAULA", ["jaula", "jaulas", "por jaula"]],
  ["BOLSON", ["bolson", "bolsones", "por bolson"]],
  ["RISTRA", ["ristra", "ristras", "por ristra"]],
];

/**
 * La forma de vender escrita en la planilla: la unidad, "NINGUNA" si se dejó vacía o se eligió
 * "Ninguna", o null si no se entiende lo que dice.
 */
export function interpretarUnidad(texto: string): UnidadDeVenta | "NINGUNA" | null {
  const t = sinAcentos(texto).replace(/[.\s]+$/, "").replace(/\s+/g, " ").trim();
  if (!t || ["ninguna", "ninguno", "-", "nada"].includes(t)) return "NINGUNA";
  return SINONIMOS_UNIDAD.find(([, sinonimos]) => sinonimos.includes(t))?.[0] ?? null;
}

/**
 * Un envase escrito sin decir cuánto trae ("Cajón", "Bolsa"): si es uno de los que pueden ser
 * unidad, el producto se cuenta en ese envase y los kilos no hacen falta (10/10/2026). Si no, nulo.
 */
export function envaseComoUnidad(envase: string): UnidadDeVenta | null {
  const u = interpretarUnidad(envase);
  return u && u !== "NINGUNA" && UNIDADES_ENVASE.has(u) ? u : null;
}

const SE_VENDE_POR: readonly [string, UnidadDeVenta][] = [
  ["huevo", "MAPLE"],
  ["perejil", "ATADO"],
  ["albahaca", "ATADO"],
  ["cilantro", "ATADO"],
  ["menta", "ATADO"],
  ["acelga", "ATADO"],
  ["espinaca", "ATADO"],
  ["rucula", "ATADO"],
  ["radicheta", "ATADO"],
  ["berro", "ATADO"],
  ["verdeo", "ATADO"],
  ["achicoria", "ATADO"],
  ["ciboulette", "ATADO"],
  ["eneldo", "ATADO"],
  ["rabanito", "ATADO"],
  ["lechuga", "UNIDAD"],
  ["repollo", "UNIDAD"],
  ["coliflor", "UNIDAD"],
  ["brocoli", "UNIDAD"],
  ["choclo", "UNIDAD"],
  ["anana", "UNIDAD"],
  ["melon", "UNIDAD"],
  ["apio", "UNIDAD"],
];

/** Cómo se suele vender un producto según su nombre (por kilo si no se sabe). */
export function unidadSugerida(nombre: string): UnidadDeVenta {
  for (const p of palabrasDe(nombre)) {
    const encontrada = SE_VENDE_POR.find(([clave]) => p.startsWith(clave));
    if (encontrada) return encontrada[1];
  }
  return "KG";
}

const PALABRAS_VACIAS = new Set(["DE", "DEL", "LA", "EL", "LOS", "LAS", "X", "Y", "CON", "EN"]);

/**
 * Código corto que se arma solo con el nombre: "Tomate redondo" → "TOMA-R", "Papa" → "PAPA". Si
 * ya existe, se le agrega un número ("TOMA-R2").
 */
export function codigoSugerido(nombre: string, ocupados: ReadonlySet<string>): string {
  const palabras = sinAcentos(nombre)
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((p) => p && !PALABRAS_VACIAS.has(p));
  const base = palabras.length === 0 ? "PROD" : `${palabras[0]!.slice(0, 4)}${palabras.length > 1 ? `-${palabras[1]!.charAt(0)}` : ""}`;
  const libres = new Set([...ocupados].map((c) => c.toUpperCase()));
  if (!libres.has(base)) return base;
  let n = 2;
  while (libres.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

export interface EnvaseSugerido {
  envase: string;
  cantidad: string;
}

/** Cómo se suele comprar en el mercado, según en qué se cuenta el producto. */
export function envasesSugeridos(unidadBase: string): readonly EnvaseSugerido[] {
  switch (unidadBase) {
    case "KG":
      return [
        { envase: "Cajón", cantidad: "18" },
        { envase: "Cajón", cantidad: "20" },
        { envase: "Bolsa", cantidad: "25" },
        { envase: "Bolsa", cantidad: "20" },
        { envase: "Caja", cantidad: "20" },
        { envase: "Bolsa", cantidad: "10" },
      ];
    case "UNIDAD":
      return [
        { envase: "Jaula", cantidad: "12" },
        { envase: "Caja", cantidad: "24" },
        { envase: "Bolsa", cantidad: "50" },
      ];
    case "ATADO":
      return [{ envase: "Paquete", cantidad: "10" }];
    case "MAPLE":
      return [{ envase: "Caja", cantidad: "12" }];
    case "BANDEJA":
      return [{ envase: "Caja", cantidad: "10" }];
    case "DOCENA":
      return [{ envase: "Cajón", cantidad: "30" }];
    case "PAQUETE":
      return [{ envase: "Bulto", cantidad: "10" }];
    case "LITRO":
      return [{ envase: "Bidón", cantidad: "5" }];
    default:
      return [];
  }
}

/** "Cajón" + 18 + "kg" → "Cajón 18 kg". Si el nombre ya trae números, queda como está. */
export function nombreDePresentacion(envase: string, cantidad: string, unidadCorta: string): string {
  const e = envase.trim();
  if (!e) return "";
  if (/\d/.test(e)) return e;
  const n = interpretarNumero(cantidad);
  if (!n || !dec(n).gt(0)) return e;
  return `${e} ${dec(n).toString().replace(".", ",")} ${unidadCorta}`;
}

/** "1 cajón 18 kg = 18 kg" (o null si la cantidad no es válida). */
export function explicarPresentacion(nombre: string, cantidad: string, unidadCorta: string): string | null {
  const n = interpretarNumero(cantidad);
  if (!n || !dec(n).gt(0) || !nombre.trim()) return null;
  return `1 ${nombre.trim().toLowerCase()} = ${dec(n).toString().replace(".", ",")} ${unidadCorta}`;
}

/**
 * Ejemplo para entender los números al cargar un producto: con el precio del envase y lo que
 * trae, cuánto sale cada unidad y a cuánto se vendería con el recargo.
 */
export function ejemploDeCostos(datos: { precioEnvase: string; cantidad: string; recargoPct: string }): { costoUnidad: string; ventaUnidad: string } | null {
  const precio = interpretarNumero(datos.precioEnvase);
  const cantidad = interpretarNumero(datos.cantidad);
  const recargo = interpretarNumero(datos.recargoPct) ?? "0";
  if (!precio || !cantidad || !dec(cantidad).gt(0) || dec(precio).lt(0)) return null;
  const costo = dec(precio).div(cantidad);
  return { costoUnidad: redondearPesos(costo).toFixed(0), ventaUnidad: redondearPesos(costo.times(dec(1).plus(dec(recargo).div(100)))).toFixed(0) };
}
