CREATE TYPE "public"."prioridad_pedido" AS ENUM('ALTA', 'NORMAL', 'BAJA');--> statement-breakpoint
CREATE TYPE "public"."tipo_entidad" AS ENUM('PEDIDO', 'CLIENTE', 'PROVEEDOR', 'PRODUCTO', 'COMPRA', 'PAGO', 'ENTREGA', 'REPARTO', 'JORNADA', 'LISTA_COMPRA', 'FACTURA', 'USUARIO');--> statement-breakpoint
CREATE TABLE "actividad" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"ocurrida_en" timestamp with time zone DEFAULT now() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"accion" text NOT NULL,
	"entidad_tipo" "tipo_entidad" NOT NULL,
	"entidad_id" uuid,
	"jornada_id" uuid,
	"resumen" text NOT NULL,
	CONSTRAINT "actividad_resumen" CHECK (char_length(trim("actividad"."resumen")) > 0)
);
--> statement-breakpoint
CREATE TABLE "nota" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	"entidad_tipo" "tipo_entidad" NOT NULL,
	"entidad_id" uuid NOT NULL,
	"texto" text NOT NULL,
	"para_usuario_id" uuid,
	CONSTRAINT "nota_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "nota_texto" CHECK (char_length(trim("nota"."texto")) between 1 and 2000)
);
--> statement-breakpoint
CREATE TABLE "nota_lectura" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nota_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"leida_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nota_lectura_unica" UNIQUE("nota_id","usuario_id")
);
--> statement-breakpoint
ALTER TABLE "empresa" ADD COLUMN "latitud" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "empresa" ADD COLUMN "longitud" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "pedido" ADD COLUMN "prioridad" "prioridad_pedido" DEFAULT 'NORMAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "pedido" ADD COLUMN "responsable_id" uuid;--> statement-breakpoint
ALTER TABLE "actividad" ADD CONSTRAINT "actividad_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actividad" ADD CONSTRAINT "actividad_usuario_fk" FOREIGN KEY ("empresa_id","usuario_id") REFERENCES "public"."usuario"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actividad" ADD CONSTRAINT "actividad_jornada_fk" FOREIGN KEY ("empresa_id","jornada_id") REFERENCES "public"."jornada"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota" ADD CONSTRAINT "nota_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota" ADD CONSTRAINT "nota_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota" ADD CONSTRAINT "nota_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota" ADD CONSTRAINT "nota_para_fk" FOREIGN KEY ("empresa_id","para_usuario_id") REFERENCES "public"."usuario"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota_lectura" ADD CONSTRAINT "nota_lectura_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota_lectura" ADD CONSTRAINT "nota_lectura_nota_fk" FOREIGN KEY ("empresa_id","nota_id") REFERENCES "public"."nota"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota_lectura" ADD CONSTRAINT "nota_lectura_usuario_fk" FOREIGN KEY ("empresa_id","usuario_id") REFERENCES "public"."usuario"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actividad_empresa_fecha" ON "actividad" USING btree ("empresa_id","ocurrida_en" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "actividad_entidad" ON "actividad" USING btree ("empresa_id","entidad_tipo","entidad_id","ocurrida_en" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "actividad_usuario" ON "actividad" USING btree ("empresa_id","usuario_id","ocurrida_en" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "nota_entidad" ON "nota" USING btree ("empresa_id","entidad_tipo","entidad_id","creado_en");--> statement-breakpoint
CREATE INDEX "nota_para" ON "nota" USING btree ("empresa_id","para_usuario_id","creado_en" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "nota_lectura_usuario" ON "nota_lectura" USING btree ("empresa_id","usuario_id");--> statement-breakpoint
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_responsable_fk" FOREIGN KEY ("empresa_id","responsable_id") REFERENCES "public"."usuario"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa" ADD CONSTRAINT "empresa_coordenadas" CHECK (("empresa"."latitud" is null) = ("empresa"."longitud" is null) and coalesce("empresa"."latitud" between -90 and 90, true) and coalesce("empresa"."longitud" between -180 and 180, true));--> statement-breakpoint
ALTER TABLE "punto_entrega" ADD CONSTRAINT "punto_entrega_coordenadas" CHECK (("punto_entrega"."latitud" is null) = ("punto_entrega"."longitud" is null) and coalesce("punto_entrega"."latitud" between -90 and 90, true) and coalesce("punto_entrega"."longitud" between -180 and 180, true));