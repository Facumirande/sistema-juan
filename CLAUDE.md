# Sistema Juan

Sistema de gestión para distribuidores de frutas y verduras. Idioma del proyecto: español.

@PARAMETROS-DEL-PROYECTO.md

@AGENTS.md

## Código

- Estructura, convenciones y orden de construcción: `docs/plan/01-tipo-de-aplicacion-y-arquitectura.md` §9–§10 y `docs/plan/10-plan-de-implementacion.md`.
- Nombres de tablas, campos y enums: `docs/plan/03-modelo-de-datos.md`. Permisos: `docs/plan/02-usuarios-roles-y-permisos.md` §4.
- Dinero, precios y cantidades siempre con `decimal.js` (nunca `number`). Cálculos en `src/dominio` como funciones puras con pruebas.
- Pruebas: `pnpm test` (Vitest; las de base de datos usan PGlite, sin Docker). Antes de dar algo por terminado: `pnpm typecheck`, `pnpm lint`, `pnpm test`.

## Mantenimiento de PARAMETROS-DEL-PROYECTO.md

- Es la fuente de verdad de las decisiones fijas del proyecto. Mantenerlo actualizado sin esperar a que el usuario lo pida.
- Actualizarlo cada vez que se tome, cambie o descarte una decisión: stack, tipo de aplicación, entidades, estados, roles y permisos, reglas de precios o créditos, valores por defecto, alcance por fases, respuestas a decisiones pendientes o cambio de etapa del proyecto.
- En cada actualización: modificar la sección afectada, cambiar la fecha de "Última actualización" y agregar una fila al registro de cambios.
- Si una decisión contradice el plan en `docs/plan/`, actualizar también el documento del plan afectado.
