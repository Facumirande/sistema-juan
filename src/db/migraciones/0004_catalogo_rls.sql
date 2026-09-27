-- Aislamiento por empresa de las tablas de la iteración 2 (01 §11, plantilla de 0001).
-- Son maestros: se desactivan, no se borran (03 §1.5).
SELECT interno.habilitar_aislamiento('categoria');
--> statement-breakpoint
SELECT interno.habilitar_aislamiento('producto');
--> statement-breakpoint
SELECT interno.habilitar_aislamiento('presentacion');
--> statement-breakpoint
SELECT interno.habilitar_aislamiento('proveedor');
--> statement-breakpoint
SELECT interno.habilitar_aislamiento('proveedor_producto');
--> statement-breakpoint
SELECT interno.habilitar_aislamiento('cliente');
--> statement-breakpoint
SELECT interno.habilitar_aislamiento('punto_entrega');
--> statement-breakpoint
SELECT interno.habilitar_aislamiento('historial_precio_compra');
--> statement-breakpoint
-- historial_precio_compra es un libro: solo se completa vigente_hasta de la fila anterior (03 §15.7).
REVOKE UPDATE ON historial_precio_compra FROM app_negocio;
--> statement-breakpoint
GRANT UPDATE (vigente_hasta, actualizado_por) ON historial_precio_compra TO app_negocio;
