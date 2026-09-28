CREATE TYPE "public"."estado_factura" AS ENUM('EMITIDA', 'ANULADA');--> statement-breakpoint
CREATE TYPE "public"."tipo_comprobante" AS ENUM('INTERNO');--> statement-breakpoint
CREATE TABLE "factura" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	"anulado_en" timestamp with time zone,
	"anulado_por" uuid,
	"motivo_anulacion" text,
	"numero" bigint NOT NULL,
	"tipo_comprobante" "tipo_comprobante" DEFAULT 'INTERNO' NOT NULL,
	"cliente_id" uuid NOT NULL,
	"fecha_emision" date NOT NULL,
	"periodo_desde" date,
	"periodo_hasta" date,
	"fecha_vencimiento" date,
	"cliente_nombre" text,
	"cliente_razon_social" text,
	"cliente_identificacion_fiscal" text,
	"cliente_condicion_fiscal" text,
	"cliente_direccion_fiscal" text,
	"importe_neto" numeric(14, 2) NOT NULL,
	"importe_iva" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"importe_total" numeric(14, 2) NOT NULL,
	"estado" "estado_factura" DEFAULT 'EMITIDA' NOT NULL,
	"exportada_en" timestamp with time zone,
	"pdf_path" text,
	"observaciones" text,
	"punto_venta" integer,
	"tipo_fiscal" text,
	"numero_fiscal" bigint,
	"cae" text,
	"cae_vencimiento" date,
	"datos_fiscales" jsonb,
	CONSTRAINT "factura_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "factura_empresa_numero" UNIQUE("empresa_id","numero"),
	CONSTRAINT "factura_importes" CHECK ("factura"."importe_neto" >= 0 and "factura"."importe_iva" >= 0 and "factura"."importe_total" = "factura"."importe_neto" + "factura"."importe_iva"),
	CONSTRAINT "factura_periodo" CHECK ("factura"."periodo_desde" is null or "factura"."periodo_hasta" is null or "factura"."periodo_hasta" >= "factura"."periodo_desde"),
	CONSTRAINT "factura_anulacion" CHECK ("factura"."estado" <> 'ANULADA' or char_length(trim(coalesce("factura"."motivo_anulacion", ''))) >= 5)
);
--> statement-breakpoint
CREATE TABLE "factura_entrega" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	"factura_id" uuid NOT NULL,
	"entrega_id" uuid NOT NULL,
	"entrega_version" integer NOT NULL,
	"importe_total" numeric(14, 2) NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	CONSTRAINT "factura_entrega_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "factura_entrega_importe" CHECK ("factura_entrega"."importe_total" > 0),
	CONSTRAINT "factura_entrega_version" CHECK ("factura_entrega"."entrega_version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "factura" ADD CONSTRAINT "factura_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factura" ADD CONSTRAINT "factura_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factura" ADD CONSTRAINT "factura_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factura" ADD CONSTRAINT "factura_anulado_por_usuario_id_fk" FOREIGN KEY ("anulado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factura" ADD CONSTRAINT "factura_cliente_fk" FOREIGN KEY ("empresa_id","cliente_id") REFERENCES "public"."cliente"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factura_entrega" ADD CONSTRAINT "factura_entrega_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factura_entrega" ADD CONSTRAINT "factura_entrega_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factura_entrega" ADD CONSTRAINT "factura_entrega_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factura_entrega" ADD CONSTRAINT "factura_entrega_factura_fk" FOREIGN KEY ("empresa_id","factura_id") REFERENCES "public"."factura"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factura_entrega" ADD CONSTRAINT "factura_entrega_entrega_fk" FOREIGN KEY ("empresa_id","entrega_id") REFERENCES "public"."entrega"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "factura_cliente_fecha" ON "factura" USING btree ("empresa_id","cliente_id","fecha_emision");--> statement-breakpoint
CREATE INDEX "factura_fecha" ON "factura" USING btree ("empresa_id","fecha_emision");--> statement-breakpoint
CREATE UNIQUE INDEX "factura_entrega_vigente" ON "factura_entrega" USING btree ("entrega_id") WHERE "factura_entrega"."activa";--> statement-breakpoint
CREATE INDEX "factura_entrega_factura" ON "factura_entrega" USING btree ("factura_id");