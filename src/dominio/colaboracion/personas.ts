// Cómo se ve cada persona en el sistema (avatar con iniciales y color). El color lo elige cada
// uno en "Mi cuenta"; si no eligió, se le asigna uno fijo a partir de su id.

/** Colores del avatar: todos con contraste de al menos 5:1 contra las iniciales en blanco. */
export const PALETA_AVATAR = [
  { color: "#1f5fbf", nombre: "Azul" },
  { color: "#b3471d", nombre: "Naranja" },
  { color: "#1d7a46", nombre: "Verde" },
  { color: "#6a3fb5", nombre: "Violeta" },
  { color: "#b0306a", nombre: "Fucsia" },
  { color: "#0f6e78", nombre: "Petróleo" },
  { color: "#8a5a14", nombre: "Marrón" },
  { color: "#46505e", nombre: "Gris" },
] as const;

const COLORES = new Set<string>(PALETA_AVATAR.map((p) => p.color));

export function esColorDeAvatar(color: unknown): color is string {
  return typeof color === "string" && COLORES.has(color.toLowerCase());
}

/** "María Pérez" → "MP"; "juan" → "J"; sin letras → "?". */
export function iniciales(nombre: string): string {
  const palabras = nombre
    .trim()
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (palabras.length === 0) return "?";
  const primera = palabras[0]!.charAt(0);
  const ultima = palabras.length > 1 ? palabras[palabras.length - 1]!.charAt(0) : "";
  return (primera + ultima).toUpperCase();
}

/** El color elegido, o uno fijo según el id (el mismo en todas las pantallas). */
export function colorDePersona(id: string, elegido?: unknown): string {
  if (esColorDeAvatar(elegido)) return elegido.toLowerCase();
  let suma = 0;
  for (const letra of id) suma = (suma * 31 + letra.charCodeAt(0)) % 1_000_003;
  return PALETA_AVATAR[suma % PALETA_AVATAR.length]!.color;
}

/**
 * Colores de todas las personas sin que se repitan: cada una conserva el que eligió y las demás
 * reciben, en orden (de la más antigua a la más nueva), los primeros que queden libres. Con más
 * personas que colores, se vuelve a empezar la paleta.
 */
export function asignarColores(personas: readonly { id: string; elegido?: unknown }[]): Map<string, string> {
  const colores = new Map<string, string>();
  const usados = new Set<string>();
  for (const p of personas) {
    if (esColorDeAvatar(p.elegido)) {
      colores.set(p.id, p.elegido.toLowerCase());
      usados.add(p.elegido.toLowerCase());
    }
  }
  const libres = PALETA_AVATAR.map((c) => c.color as string).filter((c) => !usados.has(c));
  let i = 0;
  for (const p of personas) {
    if (colores.has(p.id)) continue;
    colores.set(p.id, libres.length > 0 ? libres[i % libres.length]! : colorDePersona(p.id));
    i++;
  }
  return colores;
}

/** "María" para "María Pérez": cómo se nombra a alguien en una frase ("María confirmó…"). */
export function nombreCorto(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] || nombre;
}
