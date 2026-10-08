CREATE TABLE "destino_favorito" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	"nombre" text NOT NULL,
	"direccion" text,
	"latitud" numeric(9, 6),
	"longitud" numeric(9, 6),
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "destino_favorito_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "destino_favorito_nombre_no_vacio" CHECK (char_length(trim("destino_favorito"."nombre")) > 0),
	CONSTRAINT "destino_favorito_ubicacion" CHECK (("destino_favorito"."latitud" is null) = ("destino_favorito"."longitud" is null) and coalesce("destino_favorito"."latitud" between -90 and 90, true) and coalesce("destino_favorito"."longitud" between -180 and 180, true))
);
--> statement-breakpoint
CREATE TABLE "parada_extra" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	"jornada_id" uuid NOT NULL,
	"favorito_id" uuid,
	"nombre" text NOT NULL,
	"direccion" text,
	"latitud" numeric(9, 6),
	"longitud" numeric(9, 6),
	"orden" integer,
	"hecha" boolean DEFAULT false NOT NULL,
	CONSTRAINT "parada_extra_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "parada_extra_nombre_no_vacio" CHECK (char_length(trim("parada_extra"."nombre")) > 0),
	CONSTRAINT "parada_extra_ubicacion" CHECK (("parada_extra"."latitud" is null) = ("parada_extra"."longitud" is null) and coalesce("parada_extra"."latitud" between -90 and 90, true) and coalesce("parada_extra"."longitud" between -180 and 180, true))
);
--> statement-breakpoint
ALTER TABLE "entrega" ADD COLUMN "orden_en_recorrido" integer;--> statement-breakpoint
ALTER TABLE "destino_favorito" ADD CONSTRAINT "destino_favorito_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destino_favorito" ADD CONSTRAINT "destino_favorito_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destino_favorito" ADD CONSTRAINT "destino_favorito_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parada_extra" ADD CONSTRAINT "parada_extra_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parada_extra" ADD CONSTRAINT "parada_extra_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parada_extra" ADD CONSTRAINT "parada_extra_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parada_extra" ADD CONSTRAINT "parada_extra_jornada_fk" FOREIGN KEY ("empresa_id","jornada_id") REFERENCES "public"."jornada"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parada_extra" ADD CONSTRAINT "parada_extra_favorito_fk" FOREIGN KEY ("empresa_id","favorito_id") REFERENCES "public"."destino_favorito"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "destino_favorito_nombre_unico" ON "destino_favorito" USING btree ("empresa_id",lower("nombre")) WHERE "destino_favorito"."activo";--> statement-breakpoint
CREATE INDEX "parada_extra_jornada" ON "parada_extra" USING btree ("empresa_id","jornada_id");