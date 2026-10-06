// Datos para transferirle a un proveedor (uso interno, 05/10/2026): alias, CBU o CVU y a nombre
// de quién está la cuenta. Se validan al guardar para no transferir a una cuenta equivocada.

/** El CBU o CVU sin espacios, puntos ni guiones (como se suele pegar desde el banco). */
export function normalizarCbu(valor: string): string {
  return valor.replace(/[\s.-]/g, "");
}

const PESOS_BLOQUE_1 = [7, 1, 3, 9, 7, 1, 3];
const PESOS_BLOQUE_2 = [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3];

function digitoVerificador(digitos: string, pesos: readonly number[]): number {
  const suma = pesos.reduce((s, peso, i) => s + Number(digitos[i]) * peso, 0);
  return (10 - (suma % 10)) % 10;
}

/**
 * ¿Es un CBU o CVU bien escrito? 22 dígitos en dos bloques (8 y 14), cada uno con su dígito
 * verificador al final. Ataja un número mal copiado o con un dígito cambiado.
 */
export function cbuValido(valor: string): boolean {
  const cbu = normalizarCbu(valor);
  if (!/^\d{22}$/.test(cbu)) return false;
  const bloque1 = cbu.slice(0, 8);
  const bloque2 = cbu.slice(8);
  return digitoVerificador(bloque1, PESOS_BLOQUE_1) === Number(bloque1[7]) && digitoVerificador(bloque2, PESOS_BLOQUE_2) === Number(bloque2[13]);
}

/** El alias sin espacios alrededor y en minúsculas (los bancos no distinguen mayúsculas). */
export function normalizarAlias(valor: string): string {
  return valor.trim().toLowerCase();
}

/** Un alias tiene de 6 a 20 caracteres: letras sin tilde, números, puntos y guiones. */
export function aliasValido(valor: string): boolean {
  return /^[a-z0-9.-]{6,20}$/.test(normalizarAlias(valor));
}

/** El CBU en grupos para leerlo y dictarlo sin equivocarse: "2850590 9 4009041813520 1". */
export function cbuParaLeer(valor: string): string {
  const cbu = normalizarCbu(valor);
  if (cbu.length !== 22) return cbu;
  return `${cbu.slice(0, 7)} ${cbu[7]} ${cbu.slice(8, 21)} ${cbu[21]}`;
}
