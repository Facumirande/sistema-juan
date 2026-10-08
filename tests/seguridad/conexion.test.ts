import { createServer } from "node:net";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { clienteRapido, esDeLectura } from "@/db/conexion";

// El cliente de la base que usa la aplicación (`src/db/conexion.ts`): postgres.js de verdad, por un
// puerto, contra un PostgreSQL en memoria. Las demás pruebas usan otro driver (PGlite directo), así
// que esta es la que cuida que las transacciones sin idas de más sigan guardando, deshaciendo y
// aislando como corresponde.

let pg: PGlite;
let servidor: PGLiteSocketServer;
let puerto: number;

const puertoLibre = () =>
  new Promise<number>((resolver, rechazar) => {
    const s = createServer();
    s.once("error", rechazar);
    s.listen(0, "127.0.0.1", () => {
      const direccion = s.address();
      s.close(() => (direccion && typeof direccion === "object" ? resolver(direccion.port) : rechazar(new Error("Sin puerto"))));
    });
  });

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec("create table t (id serial primary key, texto text unique, n int)");
  puerto = await puertoLibre();
  servidor = new PGLiteSocketServer({ db: pg, port: puerto, host: "127.0.0.1", maxConnections: 10 });
  await servidor.start();
});

afterAll(async () => {
  await servidor.stop();
  await pg.close();
});

const MODOS = [
  { nombre: "sin esperar el begin ni el commit de lo que solo lee", opciones: {} },
  { nombre: "esperando siempre el commit (como en Vercel)", opciones: { esperarCommit: true } },
  { nombre: "con las transacciones de postgres.js (vuelta atrás)", opciones: { transaccionSimple: true } },
] as const;

describe.each(MODOS)("el cliente rápido, $nombre", ({ opciones }) => {
  const abrir = () => {
    const crudo = postgres(`postgres://postgres:x@127.0.0.1:${puerto}/postgres`, { prepare: false, max: 3 });
    return { crudo, db: drizzle(clienteRapido(crudo, opciones)) };
  };
  const contar = async (db: ReturnType<typeof abrir>["db"]) => (await db.execute(sql`select count(*)::int as n from t`))[0];

  it("guarda, deshace y aísla como una transacción común", async () => {
    const { crudo, db } = abrir();
    try {
      await db.execute(sql`delete from t`);
      const raro = "O'Higgins \\ $1 ; drop table t; --";

      // Lo que se escribe queda guardado, y los valores raros vuelven igual.
      await db.transaction(async (tx) => {
        await tx.execute(sql`insert into t (texto, n) values (${raro}, ${7})`);
        const [a, b] = await Promise.all([tx.execute(sql`select count(*)::int as n from t`), tx.execute(sql`select ${"x"}::text as x, ${5}::int + ${2} as suma`)]);
        expect(a[0]).toEqual({ n: 1 });
        expect(b[0]).toEqual({ x: "x", suma: 7 });
      });
      expect((await db.execute(sql`select texto, n from t`))[0]).toEqual({ texto: raro, n: 7 });

      // Un error de la base o del código deshace todo, y la conexión queda sana.
      await expect(
        db.transaction(async (tx) => {
          await tx.execute(sql`insert into t (texto) values ('queda afuera')`);
          await tx.execute(sql`insert into t (texto) values (${raro})`); // repetido
        }),
      ).rejects.toThrow();
      await expect(
        db.transaction(async (tx) => {
          await tx.execute(sql`insert into t (texto) values ('tampoco')`);
          throw new Error("a propósito");
        }),
      ).rejects.toThrow("a propósito");
      // También si falla una de varias consultas que salieron juntas.
      await expect(db.transaction((tx) => Promise.all([tx.execute(sql`insert into t (texto) values ('uno')`), tx.execute(sql`select 1/0`), tx.execute(sql`insert into t (texto) values ('dos')`)]))).rejects.toThrow();
      expect(await contar(db)).toEqual({ n: 1 });

      // Muchas lecturas a la vez (más que conexiones): cada una ve lo suyo y nada queda tomado.
      const lecturas = await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          db.transaction(async (tx) => {
            await tx.execute(sql`select set_config('app.prueba', ${String(i)}, true)`);
            const [f] = await tx.execute(sql`select current_setting('app.prueba', true) as v, ${i}::int as i`);
            return f;
          }),
        ),
      );
      expect(lecturas).toEqual(Array.from({ length: 12 }, (_, i) => ({ v: String(i), i })));
      // Lo fijado dentro de una transacción no se ve afuera (así funciona el aislamiento por empresa).
      expect((await db.execute(sql`select coalesce(current_setting('app.prueba', true), '') as v`))[0]).toEqual({ v: "" });

      // Varias escrituras a la vez: quedan todas.
      await Promise.all(Array.from({ length: 8 }, (_, i) => db.transaction((tx) => tx.execute(sql`insert into t (texto, n) values (${`fila ${i}`}, ${i})`))));
      expect(await contar(db)).toEqual({ n: 9 });

      // Una transacción adentro de otra: lo de adentro se deshace solo.
      await db.transaction(async (tx) => {
        await tx.execute(sql`insert into t (texto) values ('afuera')`);
        await expect(
          tx.transaction(async (tx2) => {
            await tx2.execute(sql`insert into t (texto) values ('adentro')`);
            throw new Error("solo lo de adentro");
          }),
        ).rejects.toThrow("solo lo de adentro");
        await tx.transaction((tx2) => tx2.execute(sql`insert into t (texto) values ('adentro que queda')`));
      });
      expect((await db.execute(sql`select texto from t where texto like '%fuera%' or texto like 'adentro%' order by texto`)).map((f) => f.texto)).toEqual(["adentro que queda", "afuera"]);
    } finally {
      await crudo.end({ timeout: 2 });
    }
  });
});

describe("qué cuenta como lectura (no hace falta esperar su commit)", () => {
  it("leer y fijar valores de la transacción es lectura", () => {
    expect(esDeLectura("select 1")).toBe(true);
    expect(esDeLectura('  SELECT "id" from "pedido" where "id" = $1')).toBe(true);
    expect(esDeLectura("set local role app_negocio")).toBe(true);
    expect(esDeLectura("select set_config('app.empresa_id', 'x', true)")).toBe(true);
  });

  it("todo lo que escribe o bloquea, no; ante la duda, tampoco", () => {
    expect(esDeLectura('insert into "t" values (1)')).toBe(false);
    expect(esDeLectura('update "t" set n = 1')).toBe(false);
    expect(esDeLectura('delete from "t"')).toBe(false);
    expect(esDeLectura('select * from "t" for update')).toBe(false);
    expect(esDeLectura('select * from "t" for no key update of "t"')).toBe(false);
    expect(esDeLectura("with x as (update t set n = 1 returning *) select * from x")).toBe(false);
    expect(esDeLectura("savepoint punto_1")).toBe(false);
  });
});
