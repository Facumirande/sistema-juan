// Parámetros escritos dentro de la consulta, como literales de SQL.
//
// La aplicación se conecta por el pooler de Supabase en modo transacción, que no admite consultas
// preparadas. Sin ellas, el driver hace DOS idas a la base por cada consulta con parámetros
// (primero pregunta los tipos, después la ejecuta) y no puede mandar varias juntas. Con los valores
// escritos en la consulta, cada una es una sola ida y las que no dependen entre sí viajan juntas
// (medido el 07/10/2026: una transacción vacía bajó de 600 ms a 150 ms desde la oficina).
//
// El punto delicado es el escapado, y por eso es chico y estricto:
//  - Todo texto va como E'…' con las barras invertidas y las comillas duplicadas: así no depende de
//    cómo esté configurado el servidor (standard_conforming_strings).
//  - Un texto con el carácter nulo se rechaza (cortaría la consulta).
//  - Los números y los textos van como literales sin tipo, igual que un parámetro: el servidor
//    resuelve el tipo por el contexto, como lo hacía antes.
//  - Los $1, $2… se reemplazan solo fuera de textos, nombres entre comillas y comentarios.

/** Un texto como literal de SQL (tipo "unknown", como un parámetro). */
function texto(valor: string): string {
  if (valor.includes("\0")) throw new Error("Un texto con el carácter nulo no se puede guardar en la base.");
  return `E'${valor.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

/** Un elemento dentro de un arreglo de PostgreSQL ({…}). */
function elementoDeArreglo(valor: unknown): string {
  if (valor === null || valor === undefined) return "NULL";
  if (Array.isArray(valor)) return arreglo(valor);
  if (typeof valor === "number" || typeof valor === "bigint" || typeof valor === "boolean") return String(valor);
  const comoTexto = valor instanceof Date ? valor.toISOString() : typeof valor === "string" ? valor : JSON.stringify(valor);
  return `"${comoTexto.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

const arreglo = (valores: readonly unknown[]): string => `{${valores.map(elementoDeArreglo).join(",")}}`;

/** Un valor de JavaScript como literal de SQL. */
export function literalSql(valor: unknown): string {
  if (valor === null) return "null";
  switch (typeof valor) {
    case "string":
      return texto(valor);
    case "number":
      // Sin tipo (entre comillas), como un parámetro: sirve para enteros, decimales y también NaN.
      return `'${String(valor)}'`;
    case "boolean":
      return valor ? "true" : "false";
    case "bigint":
      return `'${valor.toString()}'::int8`;
    case "object":
      if (valor instanceof Date) {
        if (Number.isNaN(valor.getTime())) throw new Error("Una fecha inválida no se puede mandar a la base.");
        return `${texto(valor.toISOString())}::timestamptz`;
      }
      if (valor instanceof Uint8Array) return `decode('${Buffer.from(valor).toString("hex")}', 'hex')`;
      if (Array.isArray(valor)) return texto(arreglo(valor));
      return texto(JSON.stringify(valor));
    default:
      throw new Error(`No se puede mandar a la base un valor de tipo ${typeof valor}.`);
  }
}

const esLetra = (c: string | undefined) => c !== undefined && /[A-Za-z_\u0080-￿]/.test(c);
const esLetraODigito = (c: string | undefined) => c !== undefined && /[A-Za-z0-9_\u0080-￿]/.test(c);
const esDigito = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";

/**
 * La consulta con cada $n reemplazado por su valor como literal. Los $n que están dentro de un
 * texto ('…', E'…', $$…$$), de un nombre entre comillas ("…") o de un comentario no se tocan.
 */
export function conLiterales(consulta: string, parametros: readonly unknown[]): string {
  if (parametros.length === 0) return consulta;
  let salida = "";
  let i = 0;
  const n = consulta.length;
  const copiarHasta = (fin: number) => {
    salida += consulta.slice(i, fin);
    i = fin;
  };
  while (i < n) {
    const c = consulta[i]!;
    if (c === "'") {
      // Texto: con E adelante, la barra invertida escapa el carácter que sigue.
      const conEscapes = (consulta[i - 1] === "E" || consulta[i - 1] === "e") && !esLetraODigito(consulta[i - 2]);
      let j = i + 1;
      while (j < n) {
        if (conEscapes && consulta[j] === "\\") j += 2;
        else if (consulta[j] === "'") {
          if (consulta[j + 1] === "'") j += 2;
          else break;
        } else j++;
      }
      copiarHasta(Math.min(j + 1, n));
    } else if (c === '"') {
      let j = i + 1;
      while (j < n) {
        if (consulta[j] === '"') {
          if (consulta[j + 1] === '"') j += 2;
          else break;
        } else j++;
      }
      copiarHasta(Math.min(j + 1, n));
    } else if (c === "-" && consulta[i + 1] === "-") {
      const fin = consulta.indexOf("\n", i);
      copiarHasta(fin < 0 ? n : fin);
    } else if (c === "/" && consulta[i + 1] === "*") {
      // Los comentarios de bloque se pueden anidar.
      let nivel = 1;
      let j = i + 2;
      while (j < n && nivel > 0) {
        if (consulta[j] === "/" && consulta[j + 1] === "*") {
          nivel++;
          j += 2;
        } else if (consulta[j] === "*" && consulta[j + 1] === "/") {
          nivel--;
          j += 2;
        } else j++;
      }
      copiarHasta(j);
    } else if (c === "$") {
      if (esDigito(consulta[i + 1]) && !esLetraODigito(consulta[i - 1])) {
        let j = i + 1;
        while (esDigito(consulta[j])) j++;
        const indice = Number(consulta.slice(i + 1, j));
        if (indice < 1 || indice > parametros.length) throw new Error(`La consulta usa el parámetro $${indice} y solo hay ${parametros.length}.`);
        salida += literalSql(parametros[indice - 1]);
        i = j;
      } else if (consulta[i + 1] === "$" || esLetra(consulta[i + 1])) {
        // Texto entre signos de pesos: $$…$$ o $etiqueta$…$etiqueta$.
        let j = i + 1;
        while (esLetraODigito(consulta[j])) j++;
        if (consulta[j] === "$") {
          const etiqueta = consulta.slice(i, j + 1);
          const cierre = consulta.indexOf(etiqueta, j + 1);
          copiarHasta(cierre < 0 ? n : cierre + etiqueta.length);
        } else copiarHasta(i + 1);
      } else copiarHasta(i + 1);
    } else {
      // Lo que no es especial se copia de corrido hasta el próximo carácter que sí lo es.
      let j = i + 1;
      while (j < n && !"'\"-/$".includes(consulta[j]!)) j++;
      copiarHasta(j);
    }
  }
  return salida;
}
