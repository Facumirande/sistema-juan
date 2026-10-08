// ARCHIVO TEMPORAL (no se sube): sirve una base PGlite con datos de ejemplo por un puerto local,
// para recorrer las pantallas con `next start` sin tocar los datos de Supabase.
import { writeFileSync } from "node:fs";

import { AuthAdminApi } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { it } from "vitest";

import { empresa, usuario } from "@/db/esquema";

import { prepararJornada2409 } from "./escenario-24-09";

const SALIDA = process.env.SALIDA_LOCAL ?? "";
const CORREO = "prueba.compras@sistema-juan.interno";

it.skipIf(!SALIDA)("servidor local de ejemplo", async () => {
  const { PGLiteSocketServer } = (await import(/* @vite-ignore */ process.env.SOCKET_LOCAL!)) as { PGLiteSocketServer: new (o: object) => { start(): Promise<void> } };
  const j = await prepararJornada2409();
  const [admin] = await j.base.comoSuperusuario(() => j.base.db.select({ id: usuario.id }).from(usuario).where(eq(usuario.authUserId, j.admin)));
  // Con la empresa principal creada, el ingreso no manda a la configuración inicial.
  await j.base.comoSuperusuario(() => j.base.db.insert(empresa).values({ id: "00000000-0000-4000-8000-000000000001", nombre: "Principal de prueba" }));

  const secreta = process.env.SUPABASE_SECRET_KEY!;
  const cuentas = new AuthAdminApi({ url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`, headers: { apikey: secreta, Authorization: `Bearer ${secreta}` } });
  const lista = await cuentas.listUsers({ perPage: 200 });
  const vieja = lista.data.users.find((u) => u.email === CORREO);
  if (vieja) await cuentas.deleteUser(vieja.id);
  const clave = `Prueba-${Math.random().toString(36).slice(2, 10)}`;
  const creada = await cuentas.createUser({ email: CORREO, password: clave, email_confirm: true });
  if (creada.error || !creada.data.user) throw new Error(`No se pudo crear la cuenta de prueba: ${creada.error?.message}`);
  await j.base.comoSuperusuario(() => j.base.db.update(usuario).set({ authUserId: creada.data.user.id }).where(eq(usuario.id, admin!.id)));

  const servidor = new PGLiteSocketServer({ db: j.base.pg, port: 5544, host: "127.0.0.1", maxConnections: 20 });
  await servidor.start();
  writeFileSync(SALIDA, JSON.stringify({ usuario: "prueba.compras", clave, authUserId: creada.data.user.id }));
  await new Promise((resolver) => setTimeout(resolver, 3 * 3600_000));
});
