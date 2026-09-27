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

Copiar `.env.example` a `.env.local` y completar con los datos del proyecto de Supabase, incluida `SUPABASE_SECRET_KEY` (la usa solo el servidor para crear las cuentas). Sin esa configuración la aplicación arranca y muestra el aviso en la pantalla de ingreso.

Primer uso: `pnpm dev` y abrir `http://localhost:3000`. Mientras el sistema no está configurado, el ingreso lleva a la **configuración inicial** (nombre del negocio y usuario del dueño). Los demás usuarios se crean desde la pantalla **Usuarios**. Roles y conexión de la base: [`docs/tecnico/base-de-datos.md`](docs/tecnico/base-de-datos.md).

## Estructura

```text
app/                 Rutas de Next.js (pantallas)
src/dominio/         Cálculos puros con pruebas: dinero, fechas, unidades, numeración, precios de compra
src/seguridad/       Catálogo de permisos y roles de sistema (02)
src/db/              Esquema Drizzle, migraciones, transacción con empresa fijada, numeración, auditoría
src/modulos/         Casos de uso por módulo (usuarios, catálogo, proveedores, clientes, precios de compra…)
src/lib/supabase/    Clientes de Supabase Auth, cuentas (clave secreta) y proxy de sesión
src/ui/              Navegación y componentes compartidos
tests/               dominio/, seguridad/, integracion/
```
