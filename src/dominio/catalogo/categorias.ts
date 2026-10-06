// Categorías de productos (pedido del usuario, 06/10/2026): hay categorías preelegidas según cómo
// se manipula la mercadería (duras abajo, frágiles arriba), se puede elegir "Ninguna" y una
// categoría existe (se ve) solo si tiene al menos un producto (RN-154).

export type GrupoCategoria = "FRUTA" | "VERDURA" | "OTRO";

export interface CategoriaPreelegida {
  nombre: string;
  /** Orden del recorrido: lo duro primero (va abajo en el cajón), lo frágil al final (va arriba). */
  orden: number;
  grupo: GrupoCategoria;
  icono: string;
  ayuda: string;
}

export const CATEGORIAS_PREELEGIDAS: readonly CategoriaPreelegida[] = [
  { nombre: "Duras", orden: 1, grupo: "OTRO", icono: "🥔", ayuda: "Aguantan peso: van abajo (papa, cebolla, zanahoria, zapallo, manzana)." },
  { nombre: "Blandas", orden: 2, grupo: "OTRO", icono: "🍅", ayuda: "Se golpean fácil: van arriba de las duras (tomate, banana, durazno, palta)." },
  { nombre: "De hoja", orden: 3, grupo: "VERDURA", icono: "🥬", ayuda: "Lechuga, acelga, espinaca, rúcula: separadas y con aire." },
  { nombre: "Aromáticas", orden: 4, grupo: "VERDURA", icono: "🌿", ayuda: "Perejil, albahaca, cilantro, menta: en atados." },
  { nombre: "Frágiles", orden: 5, grupo: "OTRO", icono: "🍓", ayuda: "Se rompen o aplastan: van solas y arriba de todo (frutillas, uvas, huevos, hongos)." },
  { nombre: "Secos", orden: 6, grupo: "OTRO", icono: "🥜", ayuda: "Legumbres, frutos secos y ajo: no necesitan frío." },
];

/** La categoría de los productos para los que se eligió "Ninguna" (también se ve solo si tiene productos). */
export const SIN_CATEGORIA: CategoriaPreelegida = { nombre: "Sin categoría", orden: 99, grupo: "OTRO", icono: "📦", ayuda: "Productos sin categoría." };

/** Texto comparable: sin acentos, en minúsculas y con un solo espacio entre palabras. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** ¿Se eligió "ninguna" (o algo que lo dice)? */
export function esNinguna(texto: string): boolean {
  return ["ninguna", "ninguno", "sin categoria", "-", "no", "n/a", "nada"].includes(normalizar(texto));
}

/** "  de HOJA " → "De hoja"; si ya tiene mayúsculas a propósito ("Frutas del Norte") se respeta. */
export function nombreDeCategoria(texto: string): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (limpio === limpio.toLowerCase() || limpio === limpio.toUpperCase()) return limpio.charAt(0).toUpperCase() + limpio.slice(1).toLowerCase();
  return limpio;
}

/** La preelegida con ese nombre (o "Sin categoría"), sin importar mayúsculas ni acentos. */
export function preelegida(nombre: string): CategoriaPreelegida | null {
  const n = normalizar(nombre);
  return [...CATEGORIAS_PREELEGIDAS, SIN_CATEGORIA].find((c) => normalizar(c.nombre) === n) ?? null;
}

/** Palabra (o comienzo de palabra) del producto → categoría preelegida. Lo más específico primero. */
const POR_NOMBRE: readonly [string, string][] = [
  ["cherry", "Frágiles"],
  ["frutilla", "Frágiles"],
  ["frambuesa", "Frágiles"],
  ["arandano", "Frágiles"],
  ["mora", "Frágiles"],
  ["cereza", "Frágiles"],
  ["uva", "Frágiles"],
  ["higo", "Frágiles"],
  ["huevo", "Frágiles"],
  ["champi", "Frágiles"],
  ["hongo", "Frágiles"],
  ["girgola", "Frágiles"],
  ["brote", "Frágiles"],
  ["perejil", "Aromáticas"],
  ["albahaca", "Aromáticas"],
  ["cilantro", "Aromáticas"],
  ["menta", "Aromáticas"],
  ["romero", "Aromáticas"],
  ["oregano", "Aromáticas"],
  ["tomillo", "Aromáticas"],
  ["ciboulette", "Aromáticas"],
  ["eneldo", "Aromáticas"],
  ["laurel", "Aromáticas"],
  ["salvia", "Aromáticas"],
  ["lechuga", "De hoja"],
  ["espinaca", "De hoja"],
  ["acelga", "De hoja"],
  ["repollo", "De hoja"],
  ["rucula", "De hoja"],
  ["radicheta", "De hoja"],
  ["achicoria", "De hoja"],
  ["escarola", "De hoja"],
  ["kale", "De hoja"],
  ["berro", "De hoja"],
  ["apio", "De hoja"],
  ["verdeo", "De hoja"],
  ["puerro", "De hoja"],
  ["hinojo", "De hoja"],
  ["poroto", "Secos"],
  ["lenteja", "Secos"],
  ["garbanzo", "Secos"],
  ["nuez", "Secos"],
  ["nueces", "Secos"],
  ["almendra", "Secos"],
  ["mani", "Secos"],
  ["pasa", "Secos"],
  ["ajo", "Secos"],
  ["tomate", "Blandas"],
  ["banana", "Blandas"],
  ["durazno", "Blandas"],
  ["pelon", "Blandas"],
  ["ciruela", "Blandas"],
  ["damasco", "Blandas"],
  ["palta", "Blandas"],
  ["kiwi", "Blandas"],
  ["mango", "Blandas"],
  ["papaya", "Blandas"],
  ["pera", "Blandas"],
  ["berenjena", "Blandas"],
  ["zapallito", "Blandas"],
  ["zucchini", "Blandas"],
  ["pepino", "Blandas"],
  ["morron", "Blandas"],
  ["pimiento", "Blandas"],
  ["aji", "Blandas"],
  ["chaucha", "Blandas"],
  ["arveja", "Blandas"],
  ["brocoli", "Blandas"],
  ["coliflor", "Blandas"],
  ["choclo", "Blandas"],
  ["papa", "Duras"],
  ["batata", "Duras"],
  ["cebolla", "Duras"],
  ["zanahoria", "Duras"],
  ["zapallo", "Duras"],
  ["calabaza", "Duras"],
  ["anco", "Duras"],
  ["remolacha", "Duras"],
  ["nabo", "Duras"],
  ["rabanito", "Duras"],
  ["mandioca", "Duras"],
  ["jengibre", "Duras"],
  ["manzana", "Duras"],
  ["membrillo", "Duras"],
  ["naranja", "Duras"],
  ["mandarina", "Duras"],
  ["pomelo", "Duras"],
  ["limon", "Duras"],
  ["lima", "Duras"],
  ["anana", "Duras"],
  ["melon", "Duras"],
  ["sandia", "Duras"],
  ["coco", "Duras"],
];

/**
 * La categoría preelegida que le va a un producto según su nombre (o null si no se sabe). Manda la
 * primera palabra que se reconoce: "Cebolla morada" es una cebolla (no una mora).
 */
export function categoriaSugerida(nombreProducto: string): string | null {
  const palabras = normalizar(nombreProducto).split(/[^a-z0-9]+/).filter(Boolean);
  for (const p of palabras) {
    const encontrada = POR_NOMBRE.find(([clave]) => p === clave || (clave.length > 3 && p.startsWith(clave)));
    if (encontrada) return encontrada[1];
  }
  return null;
}
