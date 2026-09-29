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
];

const DIBUJO_DEL_GRUPO: Readonly<Record<string, string>> = { VERDURA: "🥦", FRUTA: "🍎" };

/** Un dibujo para reconocer el producto de un vistazo (por su nombre, o por su grupo). */
export function dibujoDeProducto(nombre: string, grupo?: string | null): string {
  const palabras = sinAcentos(nombre).split(/[^a-z0-9]+/).filter(Boolean);
  for (const [clave, dibujo] of DIBUJOS) {
    if (palabras.some((p) => p.startsWith(clave))) return dibujo;
  }
  return DIBUJO_DEL_GRUPO[grupo ?? ""] ?? "📦";
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
