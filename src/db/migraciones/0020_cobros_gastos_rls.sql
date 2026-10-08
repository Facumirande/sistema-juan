-- Cobros de clientes y gastos e ingresos generales (07/10/2026): aislamiento por empresa (03 §15.7).
SELECT interno.habilitar_aislamiento('cobro_cliente');
--> statement-breakpoint
-- Un cobro no se edita: se anula con motivo.
REVOKE UPDATE ON cobro_cliente FROM app_negocio;
--> statement-breakpoint
GRANT UPDATE (estado, anulado_en, anulado_por, motivo_anulacion, actualizado_por) ON cobro_cliente TO app_negocio;
--> statement-breakpoint
-- Los rubros se editan libremente (nombre, dibujo, en qué se cuenta) y se desactivan; no se borran.
SELECT interno.habilitar_aislamiento('rubro_gasto');
--> statement-breakpoint
SELECT interno.habilitar_aislamiento('movimiento_extra');
--> statement-breakpoint
-- Un gasto o un ingreso anotado tampoco se edita: se anula con motivo y se anota de nuevo.
REVOKE UPDATE ON movimiento_extra FROM app_negocio;
--> statement-breakpoint
GRANT UPDATE (estado, anulado_en, anulado_por, motivo_anulacion, actualizado_por) ON movimiento_extra TO app_negocio;
