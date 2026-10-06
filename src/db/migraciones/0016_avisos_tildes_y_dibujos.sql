ALTER TABLE "usuario" ADD COLUMN "avisos_vistos_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "producto" ADD COLUMN "dibujo" text;--> statement-breakpoint
ALTER TABLE "lista_compra_item" ADD COLUMN "tildado" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "actividad" ADD COLUMN "para_usuario_id" uuid;--> statement-breakpoint
ALTER TABLE "actividad" ADD CONSTRAINT "actividad_para_fk" FOREIGN KEY ("empresa_id","para_usuario_id") REFERENCES "public"."usuario"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producto" ADD CONSTRAINT "producto_dibujo" CHECK (char_length("producto"."dibujo") between 1 and 8);--> statement-breakpoint
ALTER TABLE "lista_compra_item" ADD CONSTRAINT "lista_compra_item_tildado" CHECK (not "lista_compra_item"."tildado" or "lista_compra_item"."estado" = 'COMPRADO');--> statement-breakpoint
-- El sistema pasa a llamarse "Sistema Repartos": el negocio que quedó con el nombre por defecto lo toma.
UPDATE "empresa" SET "nombre" = 'Sistema Repartos' WHERE "nombre" = 'Sistema Juan';
