-- El recorrido del día (07/10/2026): destinos favoritos y destinos extra, aislados por empresa (03 §15.7).
-- Los favoritos se desactivan (no se borran).
SELECT interno.habilitar_aislamiento('destino_favorito');
--> statement-breakpoint
-- Un destino extra no es un documento: se puede quitar del recorrido.
SELECT interno.habilitar_aislamiento('parada_extra', true);
