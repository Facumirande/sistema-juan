// Aplica en Supabase las migraciones pendientes de src/db/migraciones con el rol dueño de las
// tablas (DATABASE_MIGRACIONES_URL, conexión "Session pooler"). Uso: pnpm db:aplicar
//
// Las migraciones 0000 a 0008 se aplicaron con el conector de Supabase y se registraron a mano en
// drizzle.__drizzle_migrations (26/09 y 27/09): desde la 0009, este script aplica solo lo nuevo.
// Si alguna vez se arma una base desde cero con las 0000 a 0002 hechas por el conector y la tabla
// de Drizzle vacía, las registra antes de migrar para que Drizzle no intente repetirlas.
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const CARPETA = "src/db/migraciones";
const APLICADAS_CON_EL_CONECTOR = 3; // 0000, 0001 y 0002

const url = process.env.DATABASE_MIGRACIONES_URL;
if (!url) {
  console.error("Falta DATABASE_MIGRACIONES_URL en .env.local (panel de Supabase → Connect → Session pooler).");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  const migraciones = readMigrationFiles({ migrationsFolder: CARPETA });
  const [{ existe }] = await sql`select to_regclass('public.empresa') is not null as existe`;
  await sql`create schema if not exists drizzle`;
  await sql`create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`;
  const [{ registradas }] = await sql`select count(*)::int as registradas from drizzle.__drizzle_migrations`;
  if (existe && registradas === 0) {
    for (const m of migraciones.slice(0, APLICADAS_CON_EL_CONECTOR)) {
      await sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${m.hash}, ${m.folderMillis})`;
    }
    console.log(`Registradas como ya aplicadas: ${APLICADAS_CON_EL_CONECTOR} migraciones iniciales.`);
  }
  const antes = (await sql`select count(*)::int as n from drizzle.__drizzle_migrations`)[0].n;
  await migrate(drizzle(sql), { migrationsFolder: CARPETA });
  const despues = (await sql`select count(*)::int as n from drizzle.__drizzle_migrations`)[0].n;
  console.log(despues > antes ? `Listo: se aplicaron ${despues - antes} migración(es).` : "No había migraciones pendientes.");
} catch (error) {
  console.error("No se pudieron aplicar las migraciones:", error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
