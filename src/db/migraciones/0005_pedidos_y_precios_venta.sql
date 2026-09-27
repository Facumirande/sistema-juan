CREATE TYPE "public"."canal_pedido" AS ENUM('TELEFONO', 'WHATSAPP', 'EMAIL', 'PRESENCIAL', 'PORTAL');--> statement-breakpoint
CREATE TYPE "public"."estado_jornada" AS ENUM('ABIERTA', 'COMPRANDO', 'PREPARANDO', 'REPARTIENDO', 'CERRADA');--> statement-breakpoint
CREATE TYPE "public"."estado_pedido" AS ENUM('BORRADOR', 'CONFIRMADO', 'EN_COMPRA', 'EN_PREPARACION', 'PREPARADO', 'EN_REPARTO', 'ENTREGADO', 'CANCELADO');--> statement-breakpoint
CREATE TYPE "public"."origen_costo" AS ENUM('PREFERIDO', 'MINIMO', 'ULTIMO_COSTO_REAL', 'REAL_JORNADA', 'SIN_DATO');--> statement-breakpoint
CREATE TYPE "public"."origen_precio_venta" AS ENUM('PRECIO_FIJO_CLIENTE_PRODUCTO', 'RECARGO_CLIENTE_PRODUCTO', 'RECARGO_CLIENTE_CATEGORIA', 'RECARGO_CLIENTE', 'RECARGO_PRODUCTO', 'RECARGO_CATEGORIA', 'RECARGO_GLOBAL', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."tipo_regla_precio" AS ENUM('RECARGO', 'PRECIO_FIJO');--> statement-breakpoint
CREATE TABLE "jornada" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	"fecha" date NOT NULL,
	"estado" "estado_jornada" DEFAULT 'ABIERTA' NOT NULL,
	"compra_iniciada_en" timestamp with time zone,
	"preparacion_iniciada_en" timestamp with time zone,
	"reparto_iniciado_en" timestamp with time zone,
	"cerrada_en" timestamp with time zone,
	"cerrada_por" uuid,
	"resumen" jsonb,
	"observaciones" text,
	CONSTRAINT "jornada_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "jornada_empresa_fecha" UNIQUE("empresa_id","fecha")
);
--> statement-breakpoint
CREATE TABLE "pedido" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	"numero" bigint NOT NULL,
	"jornada_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"punto_entrega_id" uuid NOT NULL,
	"fecha_pedido" timestamp with time zone DEFAULT now() NOT NULL,
	"canal" "canal_pedido",
	"referencia_cliente" text,
	"estado" "estado_pedido" DEFAULT 'BORRADOR' NOT NULL,
	"es_tardio" boolean DEFAULT false NOT NULL,
	"entrega_desde" time,
	"entrega_hasta" time,
	"observaciones" text,
	"observaciones_internas" text,
	"total_estimado" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"confirmado_en" timestamp with time zone,
	"confirmado_por" uuid,
	"cancelado_en" timestamp with time zone,
	"cancelado_por" uuid,
	"motivo_cancelacion" text,
	"clave_idempotencia" uuid,
	CONSTRAINT "pedido_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "pedido_empresa_numero" UNIQUE("empresa_id","numero"),
	CONSTRAINT "pedido_total_estimado" CHECK ("pedido"."total_estimado" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pedido_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	"pedido_id" uuid NOT NULL,
	"linea" smallint NOT NULL,
	"producto_id" uuid NOT NULL,
	"presentacion_id" uuid,
	"cantidad" numeric(12, 3) NOT NULL,
	"cantidad_base" numeric(12, 3) NOT NULL,
	"costo_estimado" numeric(14, 4),
	"origen_costo_estimado" "origen_costo",
	"recargo_estimado" numeric(7, 3),
	"origen_regla_estimada" "origen_precio_venta",
	"regla_precio_id" uuid,
	"precio_estimado" numeric(14, 4),
	"subtotal_estimado" numeric(14, 2),
	"alertas" text[] DEFAULT '{}'::text[] NOT NULL,
	"precio_manual" numeric(14, 4),
	"motivo_precio_manual" text,
	"precio_calculado_en" timestamp with time zone,
	"observaciones" text,
	"cancelado" boolean DEFAULT false NOT NULL,
	"motivo_cancelacion" text,
	CONSTRAINT "pedido_item_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "pedido_item_linea" UNIQUE("pedido_id","linea"),
	CONSTRAINT "pedido_item_cantidades" CHECK ("pedido_item"."cantidad" > 0 and "pedido_item"."cantidad_base" > 0),
	CONSTRAINT "pedido_item_precio_manual" CHECK ("pedido_item"."precio_manual" is null or char_length(trim(coalesce("pedido_item"."motivo_precio_manual", ''))) >= 5),
	CONSTRAINT "pedido_item_cancelacion" CHECK (not "pedido_item"."cancelado" or char_length(trim(coalesce("pedido_item"."motivo_cancelacion", ''))) >= 5)
);
--> statement-breakpoint
CREATE TABLE "regla_precio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	"cliente_id" uuid NOT NULL,
	"producto_id" uuid,
	"categoria_id" uuid,
	"tipo" "tipo_regla_precio" NOT NULL,
	"valor" numeric(14, 4) NOT NULL,
	"vigente_desde" date DEFAULT current_date NOT NULL,
	"vigente_hasta" date,
	"referencia" text,
	"observaciones" text,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "regla_precio_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "regla_precio_un_solo_objetivo" CHECK (num_nonnulls("regla_precio"."producto_id", "regla_precio"."categoria_id") = 1),
	CONSTRAINT "regla_precio_fijo_por_producto" CHECK ("regla_precio"."tipo" <> 'PRECIO_FIJO' or "regla_precio"."producto_id" is not null),
	CONSTRAINT "regla_precio_valor" CHECK (("regla_precio"."tipo" = 'RECARGO' and "regla_precio"."valor" > -100) or ("regla_precio"."tipo" = 'PRECIO_FIJO' and "regla_precio"."valor" >= 0)),
	CONSTRAINT "regla_precio_vigencia" CHECK ("regla_precio"."vigente_hasta" is null or "regla_precio"."vigente_hasta" >= "regla_precio"."vigente_desde")
);
--> statement-breakpoint
ALTER TABLE "jornada" ADD CONSTRAINT "jornada_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jornada" ADD CONSTRAINT "jornada_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jornada" ADD CONSTRAINT "jornada_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jornada" ADD CONSTRAINT "jornada_cerrada_por_usuario_id_fk" FOREIGN KEY ("cerrada_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_confirmado_por_usuario_id_fk" FOREIGN KEY ("confirmado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_cancelado_por_usuario_id_fk" FOREIGN KEY ("cancelado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_jornada_fk" FOREIGN KEY ("empresa_id","jornada_id") REFERENCES "public"."jornada"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_cliente_fk" FOREIGN KEY ("empresa_id","cliente_id") REFERENCES "public"."cliente"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_punto_entrega_fk" FOREIGN KEY ("empresa_id","cliente_id","punto_entrega_id") REFERENCES "public"."punto_entrega"("empresa_id","cliente_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_item" ADD CONSTRAINT "pedido_item_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_item" ADD CONSTRAINT "pedido_item_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_item" ADD CONSTRAINT "pedido_item_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_item" ADD CONSTRAINT "pedido_item_pedido_fk" FOREIGN KEY ("empresa_id","pedido_id") REFERENCES "public"."pedido"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_item" ADD CONSTRAINT "pedido_item_producto_fk" FOREIGN KEY ("empresa_id","producto_id") REFERENCES "public"."producto"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_item" ADD CONSTRAINT "pedido_item_presentacion_fk" FOREIGN KEY ("producto_id","presentacion_id") REFERENCES "public"."presentacion"("producto_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_item" ADD CONSTRAINT "pedido_item_regla_fk" FOREIGN KEY ("empresa_id","regla_precio_id") REFERENCES "public"."regla_precio"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regla_precio" ADD CONSTRAINT "regla_precio_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regla_precio" ADD CONSTRAINT "regla_precio_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regla_precio" ADD CONSTRAINT "regla_precio_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regla_precio" ADD CONSTRAINT "regla_precio_cliente_fk" FOREIGN KEY ("empresa_id","cliente_id") REFERENCES "public"."cliente"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regla_precio" ADD CONSTRAINT "regla_precio_producto_fk" FOREIGN KEY ("empresa_id","producto_id") REFERENCES "public"."producto"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regla_precio" ADD CONSTRAINT "regla_precio_categoria_fk" FOREIGN KEY ("empresa_id","categoria_id") REFERENCES "public"."categoria"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pedido_clave_idempotencia" ON "pedido" USING btree ("clave_idempotencia") WHERE "pedido"."clave_idempotencia" is not null;--> statement-breakpoint
CREATE INDEX "pedido_jornada_estado" ON "pedido" USING btree ("empresa_id","jornada_id","estado");--> statement-breakpoint
CREATE INDEX "pedido_cliente_fecha" ON "pedido" USING btree ("empresa_id","cliente_id","fecha_pedido" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "pedido_item_producto" ON "pedido_item" USING btree ("empresa_id","producto_id");--> statement-breakpoint
CREATE INDEX "pedido_item_presentacion" ON "pedido_item" USING btree ("presentacion_id");--> statement-breakpoint
CREATE INDEX "pedido_item_regla" ON "pedido_item" USING btree ("regla_precio_id");--> statement-breakpoint
CREATE INDEX "regla_precio_cliente" ON "regla_precio" USING btree ("empresa_id","cliente_id") WHERE "regla_precio"."activo";--> statement-breakpoint
CREATE INDEX "regla_precio_producto" ON "regla_precio" USING btree ("producto_id");--> statement-breakpoint
CREATE INDEX "regla_precio_categoria" ON "regla_precio" USING btree ("categoria_id");