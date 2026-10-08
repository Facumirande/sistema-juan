DROP INDEX "entrega_cliente_punto_jornada";--> statement-breakpoint
ALTER TABLE "pedido" ADD COLUMN "frecuente" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lista_compra_item" ADD COLUMN "orden_manual" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "entrega_cliente_punto_jornada" ON "entrega" USING btree ("empresa_id","jornada_id","cliente_id","punto_entrega_id") WHERE "entrega"."estado" in ('BORRADOR', 'EN_PREPARACION', 'PREPARADA');