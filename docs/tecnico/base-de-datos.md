# Base de datos: roles, aislamiento y migraciones

Cómo se implementa lo definido en `docs/plan/01-tipo-de-aplicacion-y-arquitectura.md` §11 y `docs/plan/02-usuarios-roles-y-permisos.md` §8.

## Roles de PostgreSQL

| Rol | Login | Para qué |
|---|---|---|
| Dueño de las tablas (`postgres` en Supabase) | Sí | Solo aplica migraciones (`DATABASE_MIGRACIONES_URL`). La aplicación nunca lo usa. |
| `app_servidor` | Sí, `NOINHERIT`, sin `BYPASSRLS` | Conexión de la aplicación (`DATABASE_URL`). Por sí mismo no puede leer ninguna tabla. |
| `app_negocio` | No | Rol de cada transacción normal: `SET LOCAL ROLE app_negocio`. |
| `app_operativo` | No | Rol de las pantallas y documentos sin precios (preparación, reparto; se completa en la iteración 6 con permisos por columna). |
| `app_alta` | No | Solo puede crear la fila de una empresa nueva (alta de empresa). |

Los tres roles sin login se crean en la migración `0001_seguridad_rls.sql`. `app_servidor` se crea a mano, una vez por entorno, porque lleva una clave:

```sql
create role app_servidor login noinherit nobypassrls password '<clave larga y aleatoria>';
grant app_negocio, app_operativo, app_alta to app_servidor;
```

En Supabase se conecta por el pooler en modo transacción con el usuario `app_servidor.<ref del proyecto>` (puerto 6543) y `prepare: false` (ver `src/db/cliente.ts`).

## Aislamiento por empresa

- Cada transacción hace `SET LOCAL ROLE` y `set_config('app.empresa_id', …, true)` (`src/db/transaccion.ts`).
- Toda tabla con `empresa_id` pasa por `interno.habilitar_aislamiento(tabla)`: RLS habilitada y forzada, política `aislamiento_empresa` para `app_negocio` y `app_operativo`, permisos `SELECT, INSERT, UPDATE` (y `DELETE` solo si se indica), sin permisos para `anon` y `authenticated` de Supabase y trigger de `actualizado_en`.
- Sin empresa fijada, `interno.empresa_actual()` es nulo y las políticas no devuelven filas (falla cerrada), también después de la primera transacción de una conexión reutilizada.
- La sesión se resuelve con la política `usuario_propio`: el servidor fija `app.auth_user_id` con el usuario verificado por Supabase Auth y solo puede leer esa fila de `usuario`; con ella obtiene la empresa (`src/modulos/seguridad/contexto.ts`).
- Nada depende de que el dueño de las tablas saltee RLS: la aplicación y el alta de empresas usan roles sin privilegios.

**Regla para cada migración nueva:** después de crear una tabla de negocio, llamar a `select interno.habilitar_aislamiento('<tabla>');` (con `true` como segundo argumento solo si la tabla admite borrado físico, 03 §1.5). La prueba `toda tabla con empresa_id tiene RLS habilitada, forzada y la política de aislamiento` falla si se olvida.

## Migraciones

- Esquema en `src/db/esquema/*.ts` (Drizzle). `pnpm db:generar --name=<nombre>` crea la migración SQL de los cambios de tablas.
- SQL que Drizzle no genera (políticas, funciones, triggers, permisos): `pnpm db:migracion-sql --name=<nombre>` crea un archivo vacío registrado en el orden de migraciones.
- La CI falla si el esquema cambió sin generar la migración.
- Aplicar en un entorno: `pnpm exec drizzle-kit migrate` con `DATABASE_MIGRACIONES_URL`.
- Proyecto de desarrollo `sistema-juan-dev` (ref `zdtbxsdgbkiaesjczgav`): las migraciones se aplicaron desde la integración de Supabase, con el mismo nombre y contenido que los archivos de `src/db/migraciones` (quedan registradas en `supabase_migrations.schema_migrations`, no en la tabla de Drizzle). Mientras sea así, cada migración nueva se aplica por esa vía. Pooler: `aws-0-sa-east-1.pooler.supabase.com`, puerto 6543.

## Pruebas sin Docker

Las pruebas de integración (`tests/integracion`) usan PGlite: PostgreSQL 18 en memoria dentro de Node. Aplican las mismas migraciones y corren como `app_servidor`, por lo que verifican RLS, permisos e inmutabilidad reales. Supabase usa PostgreSQL 17; las migraciones usan solo SQL estándar compatible con ambos.
