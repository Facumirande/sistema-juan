-- Aviso 0011 de Supabase: las funciones fijan su search_path. Todas usan nombres calificados
-- (interno.*) o funciones de pg_catalog, que siempre se resuelve.
ALTER FUNCTION interno.empresa_actual() SET search_path = '';
--> statement-breakpoint
ALTER FUNCTION interno.auth_usuario_actual() SET search_path = '';
--> statement-breakpoint
ALTER FUNCTION interno.tocar_actualizado_en() SET search_path = '';
--> statement-breakpoint
ALTER FUNCTION interno.impedir_modificacion() SET search_path = '';
--> statement-breakpoint
ALTER FUNCTION interno.habilitar_aislamiento(regclass, boolean) SET search_path = '';
