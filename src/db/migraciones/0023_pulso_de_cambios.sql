-- El pulso de los cambios (08/10/2026): un número que sube cada vez que una transacción guarda algo.
-- Las pantallas abiertas lo preguntan cada pocos segundos y, si cambió, se vuelven a dibujar: así
-- lo que hace una persona le aparece enseguida a la otra. No guarda datos del negocio.
CREATE SEQUENCE IF NOT EXISTS interno.pulso;
--> statement-breakpoint
GRANT USAGE ON SEQUENCE interno.pulso TO app_negocio, app_operativo, app_alta;
--> statement-breakpoint
-- Se lee con una sola consulta, sin abrir una transacción ni cambiar de rol.
CREATE OR REPLACE FUNCTION public.pulso_de_cambios() RETURNS bigint
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
  AS $$ SELECT CASE WHEN is_called THEN last_value ELSE 0 END FROM interno.pulso $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.pulso_de_cambios() FROM PUBLIC;
--> statement-breakpoint
-- app_servidor se crea a mano antes de aplicar las migraciones (docs/tecnico/base-de-datos.md).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_servidor') THEN
    GRANT EXECUTE ON FUNCTION public.pulso_de_cambios() TO app_servidor;
  END IF;
END
$$;
