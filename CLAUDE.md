# Sistema Repartos

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

## Documentación siempre al día (pedido del usuario, 05/10/2026)

- Todo lo necesario e importante se registra en los `.md` **automáticamente, sin que el usuario lo pida**, en el mismo trabajo en que se hace el cambio (no al final ni "después").
- Qué actualizar según el cambio: pantallas y botones → `docs/plan/08-pantallas-y-acciones.md`; circuito y procesos → `04`; reglas → `07` (regla nueva con su número); tablas y columnas → `03` y `docs/tecnico/base-de-datos.md` (tabla de migraciones); dónde está cada cálculo → `docs/tecnico/base-de-datos.md`; estado del proyecto y puesta en marcha → `10`; decisiones, interfaz y registro de cambios → `PARAMETROS-DEL-PROYECTO.md`.
- Los `.md` describen solo lo que existe: lo que se saca del sistema se borra de la documentación; nada de bloques "antes/después" ni "plan original" (la historia queda en git y en el registro de cambios de PARAMETROS).
- Hallazgos que quedan pendientes (problemas, mejoras propuestas, datos que faltan del usuario) se anotan en `docs/plan/10-plan-de-implementacion.md` §3 o §7 para no perderlos.

