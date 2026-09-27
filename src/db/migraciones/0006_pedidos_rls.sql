-- Iteración 3: aislamiento por empresa, vigencias sin superposición (RN-079) y líneas de pedido.
-- btree_gist permite mezclar "=" sobre uuid con "&&" sobre rangos en una restricción de exclusión.
-- En Supabase las extensiones van en el esquema "extensions" (aviso 0014 del asesor).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
    CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
  ELSE
    CREATE EXTENSION IF NOT EXISTS btree_gist;
  END IF;
END
$$;
--> statement-breakpoint
-- RN-079: no hay dos reglas activas del mismo tipo para el mismo cliente y producto (o categoría)
-- con vigencias superpuestas. daterange con fin nulo es "sin vencimiento".
ALTER TABLE regla_precio ADD CONSTRAINT regla_precio_sin_superposicion_fijo EXCLUDE USING gist (
  cliente_id WITH =,
  producto_id WITH =,
  daterange(vigente_desde, vigente_hasta, '[]') WITH &&
) WHERE (activo AND tipo = 'PRECIO_FIJO');
--> statement-breakpoint
ALTER TABLE regla_precio ADD CONSTRAINT regla_precio_sin_superposicion_recargo EXCLUDE USING gist (
  cliente_id WITH =,
  (coalesce(producto_id, categoria_id)) WITH =,
  daterange(vigente_desde, vigente_hasta, '[]') WITH &&
) WHERE (activo AND tipo = 'RECARGO');
--> statement-breakpoint
SELECT interno.habilitar_aislamiento('regla_precio');
--> statement-breakpoint
SELECT interno.habilitar_aislamiento('jornada');
--> statement-breakpoint
SELECT interno.habilitar_aislamiento('pedido');
--> statement-breakpoint
-- Las líneas de un pedido en BORRADOR se borran; desde CONFIRMADO solo se cancelan (03 §1.5, §15.7).
SELECT interno.habilitar_aislamiento('pedido_item', true);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION interno.pedido_item_solo_borrador() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
BEGIN
  IF (SELECT p.estado FROM public.pedido p WHERE p.id = OLD.pedido_id) <> 'BORRADOR' THEN
    RAISE EXCEPTION 'Solo se borran líneas de pedidos en BORRADOR: las demás se cancelan.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN OLD;
END
$$;
--> statement-breakpoint
CREATE TRIGGER pedido_item_solo_borrador BEFORE DELETE ON pedido_item
  FOR EACH ROW EXECUTE FUNCTION interno.pedido_item_solo_borrador();
