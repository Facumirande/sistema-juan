# Sistema Repartos

Sistema de gestión para distribuidores de frutas y verduras: pedidos (tablero tipo Trello), lista de compras para el mercado, compras y lo que queda a pagar a los proveedores, preparación por cliente, recorrido de entrega con GPS, lo que queda a cobrar a los clientes, gastos e ingresos generales, facturación interna y balance (dinero real, pendiente y total). El plan completo está en [`docs/plan/`](docs/plan/README.md) y las decisiones fijas en [`PARAMETROS-DEL-PROYECTO.md`](PARAMETROS-DEL-PROYECTO.md).

## Requisitos

- Node.js 22 LTS (recomendado; funciona con 20.9 o superior).
- pnpm 10.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm install` | Instala dependencias. |
| `pnpm dev` | Levanta la aplicación en `http://localhost:3000`. |
| `pnpm test` | Pruebas del dominio y de base de datos (PGlite, sin Docker). |
| `pnpm test:cobertura` | Pruebas con cobertura (el dominio debe estar al 100 %). |
| `pnpm typecheck` · `pnpm lint` | Tipos y lint. |
| `pnpm build` | Build de producción. |
| `pnpm db:generar --name=<nombre>` | Genera la migración SQL a partir del esquema. |
| `pnpm db:aplicar` | Aplica las migraciones pendientes en la base de `DATABASE_MIGRACIONES_URL`. |

## Configuración

Copiar `.env.example` a `.env.local` y completar con los datos del proyecto de Supabase, incluida `SUPABASE_SECRET_KEY` (la usa solo el servidor para crear las cuentas). Sin esa configuración la aplicación arranca y muestra el aviso en la pantalla de ingreso.

Primer uso: `pnpm dev` y abrir `http://localhost:3000`. Mientras el sistema no está configurado, el ingreso lleva a la **configuración inicial** (nombre del negocio y usuario del dueño). Las demás personas entran con Google o con "Crear una cuenta" y se habilitan en **Usuarios** (Mi cuenta → Administración). Roles y conexión de la base: [`docs/tecnico/base-de-datos.md`](docs/tecnico/base-de-datos.md).

## Estructura

```text
app/                 Rutas de Next.js (pantallas)
src/dominio/         Cálculos puros con pruebas: dinero, precios, compras y crédito, entregas, pedidos, pasos del día
src/seguridad/       Catálogo de permisos y roles de sistema (02)
src/db/              Esquema Drizzle, migraciones, conexión afinada para ir pocas veces a la base, transacción con empresa fijada, numeración, auditoría
src/modulos/         Casos de uso por módulo (pedidos, compras, entregas, facturación, reportes…)
src/lib/supabase/    Clientes de Supabase Auth, cuentas (clave secreta) y proxy de sesión
src/ui/              Navegación y componentes compartidos
tests/               dominio/, seguridad/, integracion/
```

## Publicar

En Vercel: importar el repositorio, cargar las variables de `.env.example` (menos `DATABASE_MIGRACIONES_URL`, que solo se usa para aplicar migraciones desde la computadora) y desplegar. `vercel.json` fija la región São Paulo (`gru1`), la misma de la base. `DATABASE_URL` debe ser la del pooler de Supabase en modo transacción (puerto 6543). En Supabase → Authentication → URL Configuration, agregar la dirección de Vercel.

Los pasos para ponerlo en producción (proyecto de Supabase aparte, migraciones con `pnpm db:aplicar`, variables en Vercel, primer uso y carga de los datos reales) están en [`docs/plan/10-plan-de-implementacion.md`](docs/plan/10-plan-de-implementacion.md) §3 y §5. Nunca publicar entre las 02:00 y las 13:00.
