-- Iteración 6: aislamiento por empresa de repartos, entregas y documentos emitidos (03 §15.7).
SELECT interno.habilitar_aislamiento('reparto');
--> statement-breakpoint
SELECT interno.habilitar_aislamiento('entrega');
--> statement-breakpoint
SELECT interno.habilitar_aislamiento('entrega_item');
--> statement-breakpoint
SELECT interno.habilitar_aislamiento('documento_emitido');
--> statement-breakpoint
-- Lo emitido no cambia (09 §1, principio 4): de un documento solo se registra su reemplazo o
-- anulación, el PDF generado después y a quién se envió.
REVOKE UPDATE ON documento_emitido FROM app_negocio;
--> statement-breakpoint
GRANT UPDATE (estado, anulado_en, anulado_por, motivo_anulacion, actualizado_por, pdf_path, pdf_sha256, enviado_a) ON documento_emitido TO app_negocio;
