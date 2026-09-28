-- Iteración 7: aislamiento por empresa de los comprobantes (03 §15.7).
SELECT interno.habilitar_aislamiento('factura');
--> statement-breakpoint
SELECT interno.habilitar_aislamiento('factura_entrega');
--> statement-breakpoint
-- Un comprobante emitido no se edita: se anula (RN-139). Solo cambian la anulación, la exportación
-- para el contador, el PDF y las observaciones.
REVOKE UPDATE ON factura FROM app_negocio;
--> statement-breakpoint
GRANT UPDATE (estado, anulado_en, anulado_por, motivo_anulacion, actualizado_por, exportada_en, pdf_path, observaciones) ON factura TO app_negocio;
--> statement-breakpoint
-- De una entrega facturada solo se registra que dejó de estar vigente (al anular el comprobante).
REVOKE UPDATE ON factura_entrega FROM app_negocio;
--> statement-breakpoint
GRANT UPDATE (activa, actualizado_por) ON factura_entrega TO app_negocio;
