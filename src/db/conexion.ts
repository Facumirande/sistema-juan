import { conLiterales } from "./literales";

// El cliente de PostgreSQL (postgres.js) afinado para que cada pantalla y cada botón hagan las
// menos idas posibles a la base. Desde la oficina cada ida son unos 50 ms, y la aplicación se
// conecta por el pooler de Supabase en modo transacción, que no admite consultas preparadas.
//
//  1. Los valores van escritos dentro de la consulta (`literales.ts`): con parámetros sueltos el
//     driver hace dos idas por consulta y no puede mandar varias juntas.
//  2. Al abrir una transacción no se espera la respuesta del "begin": sale junto con las primeras
//     consultas (una ida menos en cada transacción).
//  3. Si la transacción solo leyó, tampoco se espera la respuesta del "commit": no hay nada que
//     guardar (otra ida menos en cada pantalla). Con un solo cambio, sí se espera.
//
// Medido el 07/10/2026 contra la base real: una transacción vacía bajó de 600 ms a 50 ms y la
// pantalla principal de 2,5 s a 0,4 s.

/** Una consulta de postgres.js: se manda al esperarla o al pedirle `execute()`. */
interface Consulta extends PromiseLike<unknown> {
  execute(): Consulta;
}

/** Lo que hace falta del cliente de postgres.js (y de una conexión reservada). */
interface ClientePostgres {
  unsafe(consulta: string, parametros?: unknown[], opciones?: object): Consulta;
}

interface ConexionReservada extends ClientePostgres {
  release(): void;
}

interface ClienteConReserva extends ClientePostgres {
  reserve(): Promise<ConexionReservada>;
  begin(...argumentos: unknown[]): Promise<unknown>;
}

/**
 * El pulso de los cambios (migración 0023): sube con cada transacción que guarda algo, y las
 * pantallas abiertas lo miran para redibujarse cuando la otra persona cambia algo. Si todavía no
 * existe o el rol no puede usarlo, no pasa nada: la transacción se guarda igual.
 */
export const SUBIR_PULSO = "do $$ begin perform nextval('interno.pulso'); exception when others then null; end $$";

const LEE = /^\s*(select|set|show)\b/i;
const BLOQUEA = /\bfor\s+(no\s+key\s+update|update|key\s+share|share)\b/i;

/**
 * Una consulta que no cambia nada en la base ni toma bloqueos. Ante la duda dice que no: lo peor
 * que pasa es esperar un "commit" de más.
 */
export function esDeLectura(consulta: string): boolean {
  return LEE.test(consulta) && !BLOQUEA.test(consulta);
}

/** La conexión se cortó: postgres.js ya la sacó de las reservadas y no hay que devolverla. */
function seCorto(error: unknown): boolean {
  const codigo = (error as { code?: unknown } | null)?.code;
  return typeof codigo === "string" && /^CONNECT/.test(codigo);
}

const mandar = (cliente: ClientePostgres, consulta: string, parametros?: unknown[], opciones?: object): Consulta =>
  parametros?.length ? cliente.unsafe(conLiterales(consulta, parametros), [], opciones) : cliente.unsafe(consulta, parametros, opciones);

interface Opciones {
  /**
   * Esperar siempre la respuesta del "commit", también cuando solo se leyó. Hace falta donde el
   * proceso se congela al terminar de responder (funciones serverless): ahí un "commit" sin
   * esperar podría quedar sin salir.
   */
  esperarCommit?: boolean;
  /** Abrir las transacciones como lo hace postgres.js (esperando el "begin"), por si hiciera falta volver atrás. */
  transaccionSimple?: boolean;
}

/** El cliente dentro de una transacción: anota si algo escribió y admite puntos de guardado. */
function dentroDeTransaccion<T extends ClientePostgres>(conexion: T, marca: { escribio: boolean; corte: boolean; puntos: number }): T {
  const tx: T = new Proxy(conexion, {
    get(objetivo, propiedad, receptor) {
      if (propiedad === "unsafe") {
        return (consulta: string, parametros?: unknown[], opciones?: object) => {
          if (!esDeLectura(consulta)) marca.escribio = true;
          const q = mandar(objetivo, consulta, parametros, opciones);
          // Sin tocar el resultado: solo se mira si la conexión se cortó (el error lo recibe quien espera la consulta).
          q.then(undefined, (e: unknown) => {
            if (seCorto(e)) marca.corte = true;
          });
          return q;
        };
      }
      if (propiedad === "savepoint") {
        return async (fn: (interno: T) => unknown) => {
          const nombre = `punto_${++marca.puntos}`;
          marca.escribio = true;
          await objetivo.unsafe(`savepoint ${nombre}`);
          try {
            const resultado = await fn(tx);
            await objetivo.unsafe(`release savepoint ${nombre}`);
            return resultado;
          } catch (error) {
            await objetivo.unsafe(`rollback to savepoint ${nombre}`);
            throw error;
          }
        };
      }
      if (propiedad === "begin") {
        return () => {
          throw new Error("Ya hay una transacción abierta en esta conexión.");
        };
      }
      return Reflect.get(objetivo, propiedad, receptor);
    },
  });
  return tx;
}

async function transaccion(cliente: ClienteConReserva, fn: (tx: ClientePostgres) => unknown, opciones: Opciones, modo = ""): Promise<unknown> {
  const conexion = await cliente.reserve();
  const marca = { escribio: false, corte: false, puntos: 0 };
  let devuelta = false;
  const devolver = () => {
    if (devuelta || marca.corte) return;
    devuelta = true;
    conexion.release();
  };
  const alFallar = (e: unknown) => {
    if (seCorto(e)) marca.corte = true;
  };
  let resultado: unknown;
  try {
    // El "begin" sale ya, sin esperar su respuesta: viaja junto con las primeras consultas.
    const inicio = conexion.unsafe(`begin ${modo.replace(/[^a-z ]/gi, "")}`).execute();
    const falloAlEmpezar = inicio.then(
      () => null,
      (e: unknown) => ({ error: e }),
    );
    resultado = await fn(dentroDeTransaccion(conexion, marca));
    const fallo = await falloAlEmpezar;
    if (fallo) throw fallo.error;
  } catch (error) {
    alFallar(error);
    if (!marca.corte) await conexion.unsafe("rollback").then(undefined, alFallar);
    devolver();
    throw error;
  }
  // Si guardó algo, sube el pulso (sale junto con el "commit", sin esperarlo).
  if (marca.escribio) conexion.unsafe(SUBIR_PULSO).execute().then(undefined, alFallar);
  const fin = conexion.unsafe("commit").execute();
  if (!marca.escribio && !opciones.esperarCommit) {
    // Solo se leyó: no hay nada que guardar, así que no se espera la respuesta.
    fin.then(devolver, (e: unknown) => {
      alFallar(e);
      devolver();
    });
    return resultado;
  }
  try {
    // Si algo había fallado sin que nadie se enterara, el "commit" termina en "rollback": se avisa.
    if (((await fin) as { command?: string } | null)?.command === "ROLLBACK") throw new Error("La base no guardó los cambios.");
  } catch (error) {
    alFallar(error);
    throw error;
  } finally {
    devolver();
  }
  return resultado;
}

/**
 * El cliente de postgres.js con los valores escritos en cada consulta y las transacciones sin idas
 * de más (ver el comentario de arriba). Drizzle lo usa igual que al cliente original.
 */
export function clienteRapido<T extends object>(cliente: T, opciones: Opciones = {}): T {
  const original = cliente as unknown as ClienteConReserva;
  return new Proxy(cliente, {
    get(objetivo, propiedad, receptor) {
      if (propiedad === "unsafe") return (consulta: string, parametros?: unknown[], opcionesDeConsulta?: object) => mandar(original, consulta, parametros, opcionesDeConsulta);
      if (propiedad === "begin") {
        return (...argumentos: unknown[]) => {
          const fn = argumentos.find((a): a is (tx: ClientePostgres) => unknown => typeof a === "function");
          if (!fn) throw new Error("Falta la función de la transacción.");
          if (opciones.transaccionSimple) {
            // Como lo hace postgres.js, pero con los valores en la consulta también adentro.
            const marca = { escribio: false, corte: false, puntos: 0 };
            const conPulso = async (interno: ClientePostgres) => {
              const resultado = await fn(dentroDeTransaccion(interno, marca));
              if (marca.escribio) await interno.unsafe(SUBIR_PULSO);
              return resultado;
            };
            return original.begin(...argumentos.map((a) => (a === fn ? conPulso : a)));
          }
          return transaccion(original, fn, opciones, typeof argumentos[0] === "string" ? argumentos[0] : "");
        };
      }
      return Reflect.get(objetivo, propiedad, receptor);
    },
  });
}
