import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/esquema/index.ts",
  out: "./src/db/migraciones",
  dbCredentials: { url: process.env.DATABASE_MIGRACIONES_URL ?? "" },
  strict: true,
  verbose: true,
});
