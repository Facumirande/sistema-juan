-- Iteración 4: aislamiento por empresa e inmutabilidad de documentos y libros (03 §15.7).
SELECT interno.habilitar_aislamiento('lista_compra');
--> statement-breakpoint
SELECT interno.habilitar_aislamiento('lista_compra_item');
--> statement-breakpoint
SELECT interno.habilitar_aislamiento('compra');
--> statement-breakpoint
SELECT interno.habilitar_aislamiento('compra_item');
--> statement-breakpoint
SELECT interno.habilitar_aislamiento('pago_proveedor');
--> statement-breakpoint
SELECT interno.habilitar_aislamiento('movimiento_cuenta_proveedor');
--> statement-breakpoint
SELECT interno.habilitar_aislamiento('imputacion_pago_proveedor');
--> statement-breakpoint
-- La cuenta corriente es un libro: nunca se modifica ni se borra, se compensa (RN-092).
REVOKE UPDATE ON movimiento_cuenta_proveedor FROM app_negocio;
--> statement-breakpoint
CREATE TRIGGER impedir_modificacion BEFORE UPDATE OR DELETE ON movimiento_cuenta_proveedor
  FOR EACH ROW EXECUTE FUNCTION interno.impedir_modificacion();
--> statement-breakpoint
-- Una compra o un pago registrados no se editan: solo se anulan (RN-064).
REVOKE UPDATE ON compra FROM app_negocio;
--> statement-breakpoint
GRANT UPDATE (estado, anulado_en, anulado_por, motivo_anulacion, actualizado_por) ON compra TO app_negocio;
--> statement-breakpoint
REVOKE UPDATE ON compra_item FROM app_negocio;
--> statement-breakpoint
REVOKE UPDATE ON pago_proveedor FROM app_negocio;
--> statement-breakpoint
GRANT UPDATE (estado, anulado_en, anulado_por, motivo_anulacion, actualizado_por) ON pago_proveedor TO app_negocio;
--> statement-breakpoint
-- Una imputación solo se desactiva (al anular o reimputar); nunca cambia su monto.
REVOKE UPDATE ON imputacion_pago_proveedor FROM app_negocio;
--> statement-breakpoint
GRANT UPDATE (activa, desactivada_en, motivo_desactivacion, actualizado_por) ON imputacion_pago_proveedor TO app_negocio;
--> statement-breakpoint
-- El historial de precios apunta al ítem de la compra que cambió el precio (origen COMPRA).
ALTER TABLE historial_precio_compra ADD CONSTRAINT historial_precio_compra_item_fk
  FOREIGN KEY (empresa_id, compra_item_id) REFERENCES compra_item (empresa_id, id);
--> statement-breakpoint
CREATE INDEX historial_precio_compra_item ON historial_precio_compra (compra_item_id);
