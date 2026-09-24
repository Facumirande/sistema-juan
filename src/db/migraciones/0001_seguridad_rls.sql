-- Seguridad base (01 §11, 02 §8, 03 §15.7).
-- La aplicación nunca usa el rol dueño de las tablas: se conecta como app_servidor
-- (LOGIN, NOINHERIT, sin BYPASSRLS; se crea a mano con su clave, ver docs/tecnico/base-de-datos.md)
-- y en cada transacción ejecuta SET LOCAL ROLE a uno de estos roles sin login.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_negocio') THEN
    CREATE ROLE app_negocio NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_operativo') THEN
    CREATE ROLE app_operativo NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_alta') THEN
    CREATE ROLE app_alta NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS interno;
--> statement-breakpoint
REVOKE ALL ON SCHEMA interno FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA interno TO app_negocio, app_operativo, app_alta;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA interno REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
--> statement-breakpoint
-- Empresa de la transacción. '' (valor que queda después de la primera transacción de la
-- sesión) se trata como nulo: sin empresa fijada, las políticas no devuelven filas.
CREATE OR REPLACE FUNCTION interno.empresa_actual() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.empresa_id', true), '')::uuid $$;
--> statement-breakpoint
-- Usuario de Supabase Auth verificado por el servidor; solo permite leer la propia fila de usuario.
CREATE OR REPLACE FUNCTION interno.auth_usuario_actual() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.auth_user_id', true), '')::uuid $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION interno.empresa_actual(), interno.auth_usuario_actual() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION interno.empresa_actual(), interno.auth_usuario_actual() TO app_negocio, app_operativo, app_alta;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION interno.tocar_actualizado_en() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN NEW.actualizado_en := now(); RETURN NEW; END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION interno.impedir_modificacion() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es un registro inmutable: no admite %.', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;
--> statement-breakpoint
-- Plantilla única de aislamiento por empresa (RT-02). Toda tabla de negocio nueva la llama
-- en su migración: habilita y fuerza RLS, crea la política, fija permisos y el trigger de
-- actualizado_en. Los documentos y libros no reciben DELETE (03 §15.7).
CREATE OR REPLACE FUNCTION interno.habilitar_aislamiento(p_tabla regclass, p_permite_borrar boolean DEFAULT false)
  RETURNS void
  LANGUAGE plpgsql
  AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', p_tabla);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', p_tabla);
  EXECUTE format('DROP POLICY IF EXISTS aislamiento_empresa ON %s', p_tabla);
  EXECUTE format(
    'CREATE POLICY aislamiento_empresa ON %s TO app_negocio, app_operativo '
    'USING (empresa_id = interno.empresa_actual()) WITH CHECK (empresa_id = interno.empresa_actual())',
    p_tabla);
  EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', p_tabla);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE%s ON %s TO app_negocio',
    CASE WHEN p_permite_borrar THEN ', DELETE' ELSE '' END, p_tabla);
  -- En Supabase, la API de datos expone el esquema public a estos roles: se les quita todo.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE format('REVOKE ALL ON %s FROM anon, authenticated', p_tabla);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = p_tabla AND attname = 'actualizado_en' AND NOT attisdropped) THEN
    EXECUTE format('DROP TRIGGER IF EXISTS tocar_actualizado_en ON %s', p_tabla);
    EXECUTE format(
      'CREATE TRIGGER tocar_actualizado_en BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION interno.tocar_actualizado_en()',
      p_tabla);
  END IF;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION interno.habilitar_aislamiento(regclass, boolean) FROM PUBLIC;
--> statement-breakpoint
-- empresa: la política compara su propio id. app_negocio la lee y modifica (configuración);
-- solo app_alta la crea (alta de una empresa nueva).
ALTER TABLE empresa ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE empresa FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_empresa ON empresa TO app_negocio, app_operativo, app_alta
  USING (id = interno.empresa_actual()) WITH CHECK (id = interno.empresa_actual());
--> statement-breakpoint
REVOKE ALL ON empresa FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, UPDATE ON empresa TO app_negocio;
--> statement-breakpoint
GRANT SELECT, INSERT ON empresa TO app_alta;
--> statement-breakpoint
CREATE TRIGGER tocar_actualizado_en BEFORE UPDATE ON empresa FOR EACH ROW EXECUTE FUNCTION interno.tocar_actualizado_en();
--> statement-breakpoint
SELECT interno.habilitar_aislamiento('usuario');
--> statement-breakpoint
SELECT interno.habilitar_aislamiento('rol');
--> statement-breakpoint
-- usuario_rol es una asignación: se borra físicamente y el cambio queda en auditoría (03 §1.5).
SELECT interno.habilitar_aislamiento('usuario_rol', true);
--> statement-breakpoint
SELECT interno.habilitar_aislamiento('secuencia');
--> statement-breakpoint
SELECT interno.habilitar_aislamiento('auditoria');
--> statement-breakpoint
-- La propia fila de usuario se puede leer antes de conocer la empresa (resolución de la sesión).
CREATE POLICY usuario_propio ON usuario FOR SELECT TO app_negocio, app_operativo
  USING (auth_user_id = interno.auth_usuario_actual());
--> statement-breakpoint
-- auditoría: solo SELECT e INSERT; el trigger impide modificarla o borrarla incluso al dueño.
REVOKE UPDATE ON auditoria FROM app_negocio;
--> statement-breakpoint
CREATE TRIGGER impedir_modificacion BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION interno.impedir_modificacion();
--> statement-breakpoint
-- En Supabase: que los roles de la API no lean funciones ni tipos del esquema interno.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON empresa FROM anon, authenticated;
    REVOKE ALL ON SCHEMA interno FROM anon, authenticated;
  END IF;
END
$$;
