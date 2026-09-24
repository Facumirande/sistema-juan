# Sistema Juan

Sistema de gestión para distribuidores de frutas y verduras: pedidos, lista de compra, compras y crédito con proveedores, preparación, entregas y facturación interna. El plan completo está en [`docs/plan/`](docs/plan/README.md) y las decisiones fijas en [`PARAMETROS-DEL-PROYECTO.md`](PARAMETROS-DEL-PROYECTO.md).

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

## Configuración

Copiar `.env.example` a `.env.local` y completar con los datos del proyecto de Supabase. Sin esa configuración la aplicación arranca y muestra el aviso en la pantalla de ingreso. Roles y conexión de la base: [`docs/tecnico/base-de-datos.md`](docs/tecnico/base-de-datos.md).

## Estructura

```text
app/                 Rutas de Next.js (pantallas)
src/dominio/         Cálculos puros con pruebas: dinero, fechas, unidades, numeración
src/seguridad/       Catálogo de permisos y roles de sistema (02)
src/db/              Esquema Drizzle, migraciones, transacción con empresa fijada, numeración, auditoría
src/modulos/         Casos de uso por módulo (sesión, alta de empresa…)
src/lib/supabase/    Clientes de Supabase Auth y proxy de sesión
src/ui/              Navegación y componentes compartidos
tests/               dominio/, seguridad/, integracion/
```
