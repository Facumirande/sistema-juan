CREATE TYPE "public"."estado_documento" AS ENUM('VIGENTE', 'REEMPLAZADO', 'ANULADO');--> statement-breakpoint
CREATE TYPE "public"."estado_entrega" AS ENUM('BORRADOR', 'EN_PREPARACION', 'PREPARADA', 'EN_REPARTO', 'ENTREGADA', 'ANULADA');--> statement-breakpoint
CREATE TYPE "public"."estado_facturacion" AS ENUM('SIN_FACTURAR', 'FACTURADA');--> statement-breakpoint
CREATE TYPE "public"."estado_reparto" AS ENUM('PLANIFICADO', 'EN_CURSO', 'FINALIZADO', 'ANULADO');--> statement-breakpoint
CREATE TYPE "public"."evento_documento" AS ENUM('EMISION', 'REIMPRESION');--> statement-breakpoint
CREATE TYPE "public"."motivo_diferencia" AS ENUM('RECHAZO_CALIDAD', 'FALTANTE', 'NO_CONSEGUIDO', 'ERROR_PREPARACION', 'CAMBIO_CLIENTE', 'OTRO');--> statement-breakpoint
CREATE TYPE "public"."tipo_documento" AS ENUM('DOC_01', 'DOC_02', 'DOC_03', 'DOC_04', 'DOC_05', 'DOC_06', 'DOC_07', 'DOC_08');--> statement-breakpoint
CREATE TABLE "documento_emitido" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	"anulado_en" timestamp with time zone,
	"anulado_por" uuid,
	"motivo_anulacion" text,
	"tipo" "tipo_documento" NOT NULL,
	"entidad" text NOT NULL,
	"entidad_id" uuid NOT NULL,
	"entrega_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"evento" "evento_documento" DEFAULT 'EMISION' NOT NULL,
	"numero_visible" text NOT NULL,
	"estado" "estado_documento" DEFAULT 'VIGENTE' NOT NULL,
	"emitido_en" timestamp with time zone DEFAULT now() NOT NULL,
	"emitido_por" uuid,
	"pdf_path" text,
	"pdf_sha256" text,
	"contenido" jsonb NOT NULL,
	"enviado_a" text,
	CONSTRAINT "documento_emitido_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "documento_emitido_version" CHECK ("documento_emitido"."version" >= 1),
	CONSTRAINT "documento_emitido_anulacion" CHECK ("documento_emitido"."estado" <> 'ANULADO' or char_length(trim(coalesce("documento_emitido"."motivo_anulacion", ''))) >= 5)
);
--> statement-breakpoint
CREATE TABLE "entrega" (
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
	"jornada_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"punto_entrega_id" uuid NOT NULL,
	"reparto_id" uuid,
	"orden_en_reparto" smallint,
	"estado" "estado_entrega" DEFAULT 'BORRADOR' NOT NULL,
	"con_diferencias" boolean DEFAULT false NOT NULL,
	"estado_facturacion" "estado_facturacion" DEFAULT 'SIN_FACTURAR' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"precios_congelados_en" timestamp with time zone,
	"cantidad_bultos" smallint,
	"referencia_cliente" text,
	"observaciones" text,
	"cliente_nombre" text,
	"cliente_razon_social" text,
	"cliente_identificacion_fiscal" text,
	"punto_entrega_nombre" text,
	"direccion_entrega" text,
	"importe_neto" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"importe_iva" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"importe_total" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"costo_total" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"recibido_por" text,
	"recibido_cargo" text,
	"recibido_en" timestamp with time zone,
	"firma_path" text,
	"foto_remito_path" text,
	"observaciones_recepcion" text,
	"confirmada_por" uuid,
	CONSTRAINT "entrega_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "entrega_empresa_numero" UNIQUE("empresa_id","numero"),
	CONSTRAINT "entrega_version" CHECK ("entrega"."version" >= 0),
	CONSTRAINT "entrega_bultos" CHECK ("entrega"."cantidad_bultos" is null or "entrega"."cantidad_bultos" >= 0),
	CONSTRAINT "entrega_importes" CHECK ("entrega"."importe_neto" >= 0 and "entrega"."importe_iva" >= 0 and "entrega"."importe_total" >= 0 and "entrega"."costo_total" >= 0),
	CONSTRAINT "entrega_recepcion" CHECK ("entrega"."estado" <> 'ENTREGADA' or char_length(trim(coalesce("entrega"."recibido_por", ''))) > 0),
	CONSTRAINT "entrega_anulacion" CHECK ("entrega"."estado" <> 'ANULADA' or char_length(trim(coalesce("entrega"."motivo_anulacion", ''))) >= 5)
);
--> statement-breakpoint
CREATE TABLE "entrega_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	"entrega_id" uuid NOT NULL,
	"linea" smallint NOT NULL,
	"pedido_item_id" uuid,
	"producto_id" uuid NOT NULL,
	"es_sustitucion" boolean DEFAULT false NOT NULL,
	"sustituye_producto_id" uuid,
	"sustitucion_autorizada_por" text,
	"presentacion_id" uuid,
	"factor_a_base" numeric(12, 3),
	"producto_nombre" text NOT NULL,
	"unidad_base" "unidad_medida" NOT NULL,
	"cantidad_pedida" numeric(12, 3) NOT NULL,
	"cantidad_propuesta" numeric(12, 3),
	"cantidad_preparada" numeric(12, 3),
	"motivo_faltante" "motivo_diferencia",
	"cantidad_entregada" numeric(12, 3),
	"motivo_diferencia" "motivo_diferencia",
	"detalle_diferencia" text,
	"costo_unitario" numeric(14, 4),
	"origen_costo" "origen_costo",
	"recargo_aplicado" numeric(7, 3),
	"origen_regla" "origen_precio_venta",
	"regla_precio_id" uuid,
	"precio_unitario" numeric(14, 4),
	"alicuota_iva" numeric(7, 3),
	"es_override" boolean DEFAULT false NOT NULL,
	"motivo_override" text,
	"importe" numeric(14, 2),
	"alertas" text[] DEFAULT '{}'::text[] NOT NULL,
	"observaciones" text,
	CONSTRAINT "entrega_item_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "entrega_item_linea" UNIQUE("entrega_id","linea"),
	CONSTRAINT "entrega_item_cantidades" CHECK ("entrega_item"."cantidad_pedida" >= 0 and coalesce("entrega_item"."cantidad_propuesta", 0) >= 0 and coalesce("entrega_item"."cantidad_preparada", 0) >= 0 and coalesce("entrega_item"."cantidad_entregada", 0) >= 0),
	CONSTRAINT "entrega_item_entregada" CHECK ("entrega_item"."cantidad_entregada" is null or "entrega_item"."cantidad_entregada" <= coalesce("entrega_item"."cantidad_preparada", 0)),
	CONSTRAINT "entrega_item_sustitucion" CHECK (not "entrega_item"."es_sustitucion" or "entrega_item"."sustituye_producto_id" is not null),
	CONSTRAINT "entrega_item_diferencia_otro" CHECK ("entrega_item"."motivo_diferencia" is distinct from 'OTRO' or char_length(trim(coalesce("entrega_item"."detalle_diferencia", ''))) > 0),
	CONSTRAINT "entrega_item_override" CHECK (not "entrega_item"."es_override" or char_length(trim(coalesce("entrega_item"."motivo_override", ''))) >= 5),
	CONSTRAINT "entrega_item_importes" CHECK (coalesce("entrega_item"."precio_unitario", 0) >= 0 and coalesce("entrega_item"."importe", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "reparto" (
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
	"jornada_id" uuid NOT NULL,
	"repartidor_id" uuid,
	"vehiculo" text,
	"estado" "estado_reparto" DEFAULT 'PLANIFICADO' NOT NULL,
	"salida_prevista_en" timestamp with time zone,
	"salida_en" timestamp with time zone,
	"regreso_en" timestamp with time zone,
	"observaciones" text,
	CONSTRAINT "reparto_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "reparto_empresa_jornada_id" UNIQUE("empresa_id","jornada_id","id"),
	CONSTRAINT "reparto_empresa_numero" UNIQUE("empresa_id","numero"),
	CONSTRAINT "reparto_anulacion" CHECK ("reparto"."estado" <> 'ANULADO' or char_length(trim(coalesce("reparto"."motivo_anulacion", ''))) >= 5)
);
--> statement-breakpoint
ALTER TABLE "documento_emitido" ADD CONSTRAINT "documento_emitido_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_emitido" ADD CONSTRAINT "documento_emitido_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_emitido" ADD CONSTRAINT "documento_emitido_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_emitido" ADD CONSTRAINT "documento_emitido_anulado_por_usuario_id_fk" FOREIGN KEY ("anulado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_emitido" ADD CONSTRAINT "documento_emitido_emitido_por_usuario_id_fk" FOREIGN KEY ("emitido_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_emitido" ADD CONSTRAINT "documento_emitido_entrega_fk" FOREIGN KEY ("empresa_id","entrega_id") REFERENCES "public"."entrega"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrega" ADD CONSTRAINT "entrega_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrega" ADD CONSTRAINT "entrega_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrega" ADD CONSTRAINT "entrega_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrega" ADD CONSTRAINT "entrega_anulado_por_usuario_id_fk" FOREIGN KEY ("anulado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrega" ADD CONSTRAINT "entrega_confirmada_por_usuario_id_fk" FOREIGN KEY ("confirmada_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrega" ADD CONSTRAINT "entrega_jornada_fk" FOREIGN KEY ("empresa_id","jornada_id") REFERENCES "public"."jornada"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrega" ADD CONSTRAINT "entrega_cliente_fk" FOREIGN KEY ("empresa_id","cliente_id") REFERENCES "public"."cliente"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrega" ADD CONSTRAINT "entrega_punto_entrega_fk" FOREIGN KEY ("empresa_id","cliente_id","punto_entrega_id") REFERENCES "public"."punto_entrega"("empresa_id","cliente_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrega" ADD CONSTRAINT "entrega_reparto_fk" FOREIGN KEY ("empresa_id","jornada_id","reparto_id") REFERENCES "public"."reparto"("empresa_id","jornada_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrega_item" ADD CONSTRAINT "entrega_item_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrega_item" ADD CONSTRAINT "entrega_item_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrega_item" ADD CONSTRAINT "entrega_item_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrega_item" ADD CONSTRAINT "entrega_item_entrega_fk" FOREIGN KEY ("empresa_id","entrega_id") REFERENCES "public"."entrega"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrega_item" ADD CONSTRAINT "entrega_item_pedido_item_fk" FOREIGN KEY ("empresa_id","pedido_item_id") REFERENCES "public"."pedido_item"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrega_item" ADD CONSTRAINT "entrega_item_producto_fk" FOREIGN KEY ("empresa_id","producto_id") REFERENCES "public"."producto"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrega_item" ADD CONSTRAINT "entrega_item_sustituye_fk" FOREIGN KEY ("empresa_id","sustituye_producto_id") REFERENCES "public"."producto"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrega_item" ADD CONSTRAINT "entrega_item_presentacion_fk" FOREIGN KEY ("presentacion_id") REFERENCES "public"."presentacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrega_item" ADD CONSTRAINT "entrega_item_regla_fk" FOREIGN KEY ("empresa_id","regla_precio_id") REFERENCES "public"."regla_precio"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reparto" ADD CONSTRAINT "reparto_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reparto" ADD CONSTRAINT "reparto_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reparto" ADD CONSTRAINT "reparto_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reparto" ADD CONSTRAINT "reparto_anulado_por_usuario_id_fk" FOREIGN KEY ("anulado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reparto" ADD CONSTRAINT "reparto_repartidor_id_usuario_id_fk" FOREIGN KEY ("repartidor_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reparto" ADD CONSTRAINT "reparto_jornada_fk" FOREIGN KEY ("empresa_id","jornada_id") REFERENCES "public"."jornada"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "documento_emitido_version" ON "documento_emitido" USING btree ("empresa_id","tipo","entidad_id","version") WHERE "documento_emitido"."evento" = 'EMISION';--> statement-breakpoint
CREATE INDEX "documento_emitido_entidad" ON "documento_emitido" USING btree ("empresa_id","entidad","entidad_id");--> statement-breakpoint
CREATE INDEX "documento_emitido_entrega" ON "documento_emitido" USING btree ("entrega_id");--> statement-breakpoint
CREATE INDEX "documento_emitido_fecha" ON "documento_emitido" USING btree ("empresa_id","emitido_en" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "entrega_jornada_estado" ON "entrega" USING btree ("empresa_id","jornada_id","estado");--> statement-breakpoint
CREATE INDEX "entrega_reparto" ON "entrega" USING btree ("reparto_id");--> statement-breakpoint
CREATE INDEX "entrega_cliente" ON "entrega" USING btree ("empresa_id","cliente_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entrega_cliente_punto_jornada" ON "entrega" USING btree ("empresa_id","jornada_id","cliente_id","punto_entrega_id") WHERE "entrega"."estado" <> 'ANULADA';--> statement-breakpoint
CREATE INDEX "entrega_item_pedido_item" ON "entrega_item" USING btree ("pedido_item_id");--> statement-breakpoint
CREATE INDEX "entrega_item_producto" ON "entrega_item" USING btree ("empresa_id","producto_id");--> statement-breakpoint
CREATE INDEX "entrega_item_presentacion" ON "entrega_item" USING btree ("presentacion_id");--> statement-breakpoint
CREATE INDEX "entrega_item_regla" ON "entrega_item" USING btree ("regla_precio_id");--> statement-breakpoint
CREATE INDEX "reparto_jornada" ON "reparto" USING btree ("empresa_id","jornada_id");--> statement-breakpoint
CREATE INDEX "reparto_repartidor" ON "reparto" USING btree ("repartidor_id");