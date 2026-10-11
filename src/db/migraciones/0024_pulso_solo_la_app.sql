-- En Supabase, toda función nueva de "public" queda abierta a los roles de la API (anon y
-- authenticated). El pulso lo lee solo la aplicación: se les quita.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE EXECUTE ON FUNCTION public.pulso_de_cambios() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE EXECUTE ON FUNCTION public.pulso_de_cambios() FROM authenticated;
  END IF;
END
$$;
