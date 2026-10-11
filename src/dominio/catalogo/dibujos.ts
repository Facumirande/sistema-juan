// Los dibujos que se pueden elegir para un producto (pedido del usuario, 11/10/2026). El dibujo
// sale solo del nombre o de la categoría (`dibujoDeProducto`); si no convence, se elige otro de
// esta lista: verduras, frutas, otras cosas que se venden y, para quien los prefiere más sobrios,
// colores y símbolos lisos. Solo se guarda un dibujo de esta lista.

export interface GrupoDeDibujos {
  titulo: string;
  dibujos: readonly string[];
}

export const DIBUJOS_PARA_ELEGIR: readonly GrupoDeDibujos[] = [
  {
    titulo: "Verduras",
    dibujos: ["🍅", "🥔", "🧅", "🧄", "🥕", "🌽", "🥒", "🥬", "🥦", "🫑", "🌶️", "🍆", "🥑", "🍠", "🍄", "🫛", "🫘", "🫚", "🥗", "🌿", "🌱", "☘️", "🍃", "🪴", "🫒", "🎃"],
  },
  {
    titulo: "Frutas",
    dibujos: ["🍎", "🍏", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍈", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝"],
  },
  {
    titulo: "Otros",
    dibujos: ["🥚", "🥜", "🌰", "🍯", "🧀", "🧃", "🥫", "🫙", "🍞", "🧂", "🌻", "💐", "🌾", "🧊"],
  },
  {
    titulo: "Más sobrios",
    dibujos: ["📦", "🧺", "🛍️", "🏷️", "⚖️", "🟢", "🟡", "🟠", "🔴", "🟣", "🟤", "⚪", "⚫", "🟩", "🟨", "🟧", "🟥", "🟪", "🟫", "⬜", "⬛", "🔷", "🔶", "▪️"],
  },
];

const TODOS: ReadonlySet<string> = new Set(DIBUJOS_PARA_ELEGIR.flatMap((g) => g.dibujos));

/** Si es uno de los dibujos que se ofrecen para elegir. */
export function esDibujoParaElegir(dibujo: string): boolean {
  return TODOS.has(dibujo);
}
