import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { conLiterales, literalSql } from "@/db/literales";

// Los valores van escritos dentro de la consulta (ver src/db/literales.ts): el escapado tiene que
// ser exacto. Se prueba contra un PostgreSQL de verdad: lo que entra tiene que volver igual, sin
// que ningún texto pueda cambiar la consulta.

let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec("create table t (id serial primary key, texto text, n numeric(14,2), entero int, si boolean, cuando timestamptz, dia date, datos jsonb, lista text[], bytes bytea)");
});

const unaFila = async <T>(consulta: string, parametros: unknown[] = []) => (await pg.query<T>(conLiterales(consulta, parametros))).rows[0]!;

describe("un valor como literal de SQL", () => {
  it("cada tipo se escribe como corresponde", () => {
    expect(literalSql(null)).toBe("null");
    expect(literalSql(true)).toBe("true");
    expect(literalSql(false)).toBe("false");
    expect(literalSql(17550)).toBe("'17550'");
    expect(literalSql(-1.5)).toBe("'-1.5'");
    expect(literalSql(10n)).toBe("'10'::int8");
    expect(literalSql("Hola")).toBe("E'Hola'");
    expect(literalSql("O'Higgins")).toBe("E'O''Higgins'");
    expect(literalSql("a\\b")).toBe("E'a\\\\b'");
    expect(literalSql(new Date("2026-10-07T12:30:00.000Z"))).toBe("E'2026-10-07T12:30:00.000Z'::timestamptz");
    expect(literalSql({ a: 1, b: "x'y" })).toBe(`E'{"a":1,"b":"x''y"}'`);
    expect(literalSql(["a", "b c", null, 'co"mi', "ba\\rra"])).toBe(`E'{"a","b c",NULL,"co\\\\"mi","ba\\\\\\\\rra"}'`);
    expect(literalSql(new Uint8Array([0, 255, 16]))).toBe("decode('00ff10', 'hex')");
  });

  it("lo que no se puede mandar se rechaza con un error claro", () => {
    expect(() => literalSql("con\0nulo")).toThrow(/carácter nulo/);
    expect(() => literalSql(undefined)).toThrow(/undefined/);
    expect(() => literalSql(() => 1)).toThrow(/function/);
    expect(() => literalSql(new Date("no es fecha"))).toThrow(/fecha inválida/);
  });
});

describe("los $n de una consulta", () => {
  it("se reemplazan en orden, también repetidos y de dos cifras", () => {
    expect(conLiterales("select $1, $2, $1", ["a", 2])).toBe("select E'a', '2', E'a'");
    const once = Array.from({ length: 11 }, (_, i) => i + 1);
    expect(conLiterales("select $11, $1, $10", once)).toBe("select '11', '1', '10'");
    expect(conLiterales("select 1", [])).toBe("select 1");
  });

  it("no se tocan dentro de textos, nombres entre comillas, comentarios ni textos entre $$", () => {
    const p = ["X"];
    expect(conLiterales(`select '$1', 'it''s $1', E'\\'$1', "col$1", $1`, p)).toBe(`select '$1', 'it''s $1', E'\\'$1', "col$1", E'X'`);
    expect(conLiterales("select $1 -- $1 acá no\n, $1", p)).toBe("select E'X' -- $1 acá no\n, E'X'");
    expect(conLiterales("select /* $1 /* anidado $1 */ sigue $1 */ $1", p)).toBe("select /* $1 /* anidado $1 */ sigue $1 */ E'X'");
    expect(conLiterales("select $$ $1 $$, $cuerpo$ $1 $$ $cuerpo$, $1", p)).toBe("select $$ $1 $$, $cuerpo$ $1 $$ $cuerpo$, E'X'");
    // Un $ que es parte de un nombre o no es un parámetro queda como está.
    expect(conLiterales("select a$1, precio$, $1", p)).toBe("select a$1, precio$, E'X'");
  });

  it("un parámetro que no existe es un error (no se manda una consulta rota)", () => {
    expect(() => conLiterales("select $2", ["a"])).toThrow(/\$2/);
    expect(() => conLiterales("select $0", ["a"])).toThrow(/\$0/);
  });
});

describe("contra una base de verdad: lo que entra vuelve igual", () => {
  const TEXTOS_BRAVOS = [
    "O'Higgins",
    "'; drop table t; --",
    "\\'; drop table t; --",
    "\\\\' or 1=1 --",
    "dos ''comillas'' y \\ barras \\\\",
    "$1 $2 $$ $x$",
    "línea 1\nlínea 2\ttab\r",
    "ñandú, café, 🍅, 日本",
    "E'x' /* c */ -- d",
    "",
    "   espacios   ",
  ];

  it("ningún texto puede cambiar la consulta: se guarda tal cual", async () => {
    for (const s of TEXTOS_BRAVOS) {
      const r = await unaFila<{ texto: string; largo: number }>("insert into t (texto) values ($1) returning texto, length(texto) as largo", [s]);
      expect(r.texto).toBe(s);
      expect(r.largo).toBe([...s].length);
    }
    // La tabla sigue ahí y tiene una fila por texto.
    expect((await unaFila<{ n: number }>("select count(*)::int as n from t")).n).toBe(TEXTOS_BRAVOS.length);
  });

  it("los tipos se resuelven por el contexto, como con parámetros", async () => {
    const cuando = new Date("2026-10-07T09:15:00.000Z");
    const fila = await unaFila<{ n: string; entero: number; si: boolean; cuando: Date; dia: string; datos: unknown; lista: string[]; bytes: Uint8Array }>(
      "insert into t (n, entero, si, cuando, dia, datos, lista, bytes) values ($1, $2, $3, $4, $5, $6, $7, $8) returning n::text, entero, si, cuando, dia::text, datos, lista, bytes",
      ["17550.50", 7, true, cuando, "2026-10-07", JSON.stringify({ a: [1, 2], b: "x'y\\z" }), ["uno", "dos, tres", 'co"mi', "ba\\rra", "{llaves}"], new Uint8Array([1, 2, 250])],
    );
    expect(fila.n).toBe("17550.50");
    expect(fila.entero).toBe(7);
    expect(fila.si).toBe(true);
    expect(new Date(fila.cuando).toISOString()).toBe(cuando.toISOString());
    expect(fila.dia).toBe("2026-10-07");
    expect(fila.datos).toEqual({ a: [1, 2], b: "x'y\\z" });
    expect(fila.lista).toEqual(["uno", "dos, tres", 'co"mi', "ba\\rra", "{llaves}"]);
    expect([...fila.bytes]).toEqual([1, 2, 250]);
  });

  it("números y textos sirven donde antes iba un parámetro: límites, cuentas, comparaciones y nulos", async () => {
    expect((await pg.query(conLiterales("select id from t order by id limit $1 offset $2", [2, 1]))).rows).toHaveLength(2);
    expect(await unaFila("select $1::int + $2 as suma, coalesce($3, $4) as texto, $5 = any($6::text[]) as esta", [2, 3, null, "x", "b", ["a", "b"]])).toEqual({ suma: 5, texto: "x", esta: true });
    expect(await unaFila("select (select count(*)::int from t where entero = $1) as con, (select count(*)::int from t where si = $2) as verdaderos, set_config('app.prueba', $3, true) as c", [7, true, "valor"])).toEqual({ con: 1, verdaderos: 1, c: "valor" });
    expect((await unaFila<{ n: string }>("select sum(n) filter (where n > $1)::text as n from t", ["0"])).n).toBe("17550.50");
  });
});
