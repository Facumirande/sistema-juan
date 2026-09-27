CREATE TYPE "public"."condicion_pago" AS ENUM('CONTADO', 'CREDITO', 'MIXTA');--> statement-breakpoint
CREATE TYPE "public"."grupo_producto" AS ENUM('FRUTA', 'VERDURA', 'OTRO');--> statement-breakpoint
CREATE TYPE "public"."origen_precio_compra" AS ENUM('MANUAL', 'COMPRA', 'IMPORTACION');--> statement-breakpoint
CREATE TYPE "public"."periodicidad_facturacion" AS ENUM('POR_ENTREGA', 'SEMANAL', 'QUINCENAL', 'MENSUAL');--> statement-breakpoint
CREATE TYPE "public"."tipo_cliente" AS ENUM('HOSPITAL', 'RESTAURANTE', 'COMERCIO', 'INSTITUCION', 'OTRO');--> statement-breakpoint
CREATE TYPE "public"."unidad_medida" AS ENUM('KG', 'UNIDAD', 'ATADO', 'MAPLE', 'BANDEJA', 'DOCENA', 'PAQUETE', 'LITRO');--> statement-breakpoint
CREATE TABLE "categoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	"nombre" text NOT NULL,
	"grupo" "grupo_producto" DEFAULT 'VERDURA' NOT NULL,
	"recargo_default" numeric(7, 3),
	"orden" integer DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "categoria_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "categoria_nombre_no_vacio" CHECK (char_length(trim("categoria"."nombre")) > 0),
	CONSTRAINT "categoria_recargo" CHECK ("categoria"."recargo_default" > -100)
);
--> statement-breakpoint
CREATE TABLE "presentacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	"producto_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"factor_a_base" numeric(12, 3) NOT NULL,
	"usable_en_compra" boolean DEFAULT true NOT NULL,
	"usable_en_venta" boolean DEFAULT true NOT NULL,
	"es_unidad_base" boolean DEFAULT false NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "presentacion_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "presentacion_producto_id_id" UNIQUE("producto_id","id"),
	CONSTRAINT "presentacion_nombre_no_vacio" CHECK (char_length(trim("presentacion"."nombre")) > 0),
	CONSTRAINT "presentacion_factor" CHECK ("presentacion"."factor_a_base" > 0),
	CONSTRAINT "presentacion_uso" CHECK ("presentacion"."usable_en_compra" or "presentacion"."usable_en_venta"),
	CONSTRAINT "presentacion_unidad_base_factor" CHECK (not "presentacion"."es_unidad_base" or "presentacion"."factor_a_base" = 1)
);
--> statement-breakpoint
CREATE TABLE "producto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"nombre_corto" text,
	"categoria_id" uuid NOT NULL,
	"unidad_base" "unidad_medida" NOT NULL,
	"admite_fraccion" boolean DEFAULT true NOT NULL,
	"recargo_default" numeric(7, 3),
	"alicuota_iva" numeric(7, 3) DEFAULT '0.000' NOT NULL,
	"proveedor_preferido_id" uuid,
	"presentacion_venta_default_id" uuid,
	"presentacion_compra_default_id" uuid,
	"observaciones" text,
	"imagen_path" text,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "producto_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "producto_codigo_no_vacio" CHECK (char_length(trim("producto"."codigo")) > 0),
	CONSTRAINT "producto_nombre_no_vacio" CHECK (char_length(trim("producto"."nombre")) > 0),
	CONSTRAINT "producto_recargo" CHECK ("producto"."recargo_default" > -100),
	CONSTRAINT "producto_alicuota_iva" CHECK ("producto"."alicuota_iva" >= 0)
);
--> statement-breakpoint
CREATE TABLE "historial_precio_compra" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	"proveedor_producto_id" uuid NOT NULL,
	"proveedor_id" uuid NOT NULL,
	"producto_id" uuid NOT NULL,
	"presentacion_id" uuid NOT NULL,
	"precio" numeric(14, 4) NOT NULL,
	"costo_base" numeric(14, 4) NOT NULL,
	"variacion_pct" numeric(10, 3),
	"vigente_desde" timestamp with time zone DEFAULT now() NOT NULL,
	"vigente_hasta" timestamp with time zone,
	"origen" "origen_precio_compra" NOT NULL,
	"compra_item_id" uuid,
	"lote_id" uuid,
	"referencia" text,
	"observacion" text,
	CONSTRAINT "historial_precio_compra_vigencia" CHECK ("historial_precio_compra"."vigente_hasta" is null or "historial_precio_compra"."vigente_hasta" >= "historial_precio_compra"."vigente_desde")
);
--> statement-breakpoint
CREATE TABLE "proveedor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	"codigo" text,
	"nombre" text NOT NULL,
	"razon_social" text,
	"identificacion_fiscal" text,
	"telefono" text,
	"email" text,
	"contacto_nombre" text,
	"ubicacion_mercado" text,
	"direccion" text,
	"datos_bancarios" text,
	"limite_credito" numeric(14, 2),
	"plazo_pago_dias" integer,
	"condicion_pago_habitual" "condicion_pago" DEFAULT 'CREDITO' NOT NULL,
	"observaciones" text,
	"saldo_actual" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "proveedor_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "proveedor_nombre_no_vacio" CHECK (char_length(trim("proveedor"."nombre")) > 0),
	CONSTRAINT "proveedor_limite_credito" CHECK ("proveedor"."limite_credito" >= 0),
	CONSTRAINT "proveedor_plazo_pago" CHECK ("proveedor"."plazo_pago_dias" >= 0)
);
--> statement-breakpoint
CREATE TABLE "proveedor_producto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	"proveedor_id" uuid NOT NULL,
	"producto_id" uuid NOT NULL,
	"presentacion_id" uuid NOT NULL,
	"precio_vigente" numeric(14, 4) NOT NULL,
	"costo_base" numeric(14, 4) NOT NULL,
	"precio_anterior" numeric(14, 4),
	"fecha_actualizacion" timestamp with time zone DEFAULT now() NOT NULL,
	"fuente_actualizacion" "origen_precio_compra" DEFAULT 'MANUAL' NOT NULL,
	"disponible" boolean DEFAULT true NOT NULL,
	"codigo_proveedor" text,
	"observaciones" text,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "proveedor_producto_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "proveedor_producto_unico" UNIQUE("empresa_id","proveedor_id","producto_id","presentacion_id"),
	CONSTRAINT "proveedor_producto_precio" CHECK ("proveedor_producto"."precio_vigente" >= 0 and "proveedor_producto"."costo_base" >= 0)
);
--> statement-breakpoint
CREATE TABLE "cliente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	"codigo" text,
	"nombre" text NOT NULL,
	"tipo_cliente" "tipo_cliente" DEFAULT 'OTRO' NOT NULL,
	"razon_social" text,
	"identificacion_fiscal" text,
	"condicion_fiscal" text,
	"direccion_fiscal" text,
	"telefono" text,
	"email" text,
	"email_contable" text,
	"contacto_nombre" text,
	"recargo_default" numeric(7, 3),
	"prioridad_faltantes" smallint DEFAULT 3 NOT NULL,
	"periodicidad_facturacion" "periodicidad_facturacion" DEFAULT 'POR_ENTREGA' NOT NULL,
	"requiere_orden_compra" boolean DEFAULT false NOT NULL,
	"acepta_sustituciones" boolean DEFAULT true NOT NULL,
	"requiere_firma" boolean DEFAULT false NOT NULL,
	"plazo_cobro_dias" integer,
	"limite_credito" numeric(14, 2),
	"observaciones" text,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "cliente_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "cliente_nombre_no_vacio" CHECK (char_length(trim("cliente"."nombre")) > 0),
	CONSTRAINT "cliente_prioridad_faltantes" CHECK ("cliente"."prioridad_faltantes" between 1 and 5),
	CONSTRAINT "cliente_recargo" CHECK ("cliente"."recargo_default" > -100)
);
--> statement-breakpoint
CREATE TABLE "punto_entrega" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	"cliente_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"direccion" text NOT NULL,
	"localidad" text,
	"referencias" text,
	"latitud" numeric(9, 6),
	"longitud" numeric(9, 6),
	"contacto_nombre" text,
	"contacto_telefono" text,
	"horario_desde" time,
	"horario_hasta" time,
	"dias_entrega" smallint[],
	"instrucciones_entrega" text,
	"es_principal" boolean DEFAULT false NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "punto_entrega_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "punto_entrega_empresa_cliente_id" UNIQUE("empresa_id","cliente_id","id"),
	CONSTRAINT "punto_entrega_nombre_no_vacio" CHECK (char_length(trim("punto_entrega"."nombre")) > 0),
	CONSTRAINT "punto_entrega_direccion_no_vacia" CHECK (char_length(trim("punto_entrega"."direccion")) > 0),
	CONSTRAINT "punto_entrega_dias" CHECK ("punto_entrega"."dias_entrega" <@ array[1,2,3,4,5,6,7]::smallint[])
);
--> statement-breakpoint
ALTER TABLE "categoria" ADD CONSTRAINT "categoria_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categoria" ADD CONSTRAINT "categoria_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categoria" ADD CONSTRAINT "categoria_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentacion" ADD CONSTRAINT "presentacion_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentacion" ADD CONSTRAINT "presentacion_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentacion" ADD CONSTRAINT "presentacion_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentacion" ADD CONSTRAINT "presentacion_producto_fk" FOREIGN KEY ("empresa_id","producto_id") REFERENCES "public"."producto"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producto" ADD CONSTRAINT "producto_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producto" ADD CONSTRAINT "producto_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producto" ADD CONSTRAINT "producto_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producto" ADD CONSTRAINT "producto_categoria_fk" FOREIGN KEY ("empresa_id","categoria_id") REFERENCES "public"."categoria"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producto" ADD CONSTRAINT "producto_proveedor_preferido_fk" FOREIGN KEY ("empresa_id","proveedor_preferido_id") REFERENCES "public"."proveedor"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producto" ADD CONSTRAINT "producto_presentacion_venta_fk" FOREIGN KEY ("id","presentacion_venta_default_id") REFERENCES "public"."presentacion"("producto_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producto" ADD CONSTRAINT "producto_presentacion_compra_fk" FOREIGN KEY ("id","presentacion_compra_default_id") REFERENCES "public"."presentacion"("producto_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historial_precio_compra" ADD CONSTRAINT "historial_precio_compra_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historial_precio_compra" ADD CONSTRAINT "historial_precio_compra_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historial_precio_compra" ADD CONSTRAINT "historial_precio_compra_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historial_precio_compra" ADD CONSTRAINT "historial_precio_compra_oferta_fk" FOREIGN KEY ("empresa_id","proveedor_producto_id") REFERENCES "public"."proveedor_producto"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proveedor" ADD CONSTRAINT "proveedor_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proveedor" ADD CONSTRAINT "proveedor_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proveedor" ADD CONSTRAINT "proveedor_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proveedor_producto" ADD CONSTRAINT "proveedor_producto_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proveedor_producto" ADD CONSTRAINT "proveedor_producto_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proveedor_producto" ADD CONSTRAINT "proveedor_producto_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proveedor_producto" ADD CONSTRAINT "proveedor_producto_proveedor_fk" FOREIGN KEY ("empresa_id","proveedor_id") REFERENCES "public"."proveedor"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proveedor_producto" ADD CONSTRAINT "proveedor_producto_producto_fk" FOREIGN KEY ("empresa_id","producto_id") REFERENCES "public"."producto"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proveedor_producto" ADD CONSTRAINT "proveedor_producto_presentacion_fk" FOREIGN KEY ("producto_id","presentacion_id") REFERENCES "public"."presentacion"("producto_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punto_entrega" ADD CONSTRAINT "punto_entrega_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punto_entrega" ADD CONSTRAINT "punto_entrega_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punto_entrega" ADD CONSTRAINT "punto_entrega_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punto_entrega" ADD CONSTRAINT "punto_entrega_cliente_fk" FOREIGN KEY ("empresa_id","cliente_id") REFERENCES "public"."cliente"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categoria_nombre_unico" ON "categoria" USING btree ("empresa_id",lower("nombre"));--> statement-breakpoint
CREATE UNIQUE INDEX "presentacion_nombre_unico" ON "presentacion" USING btree ("producto_id",lower("nombre"));--> statement-breakpoint
CREATE UNIQUE INDEX "presentacion_unidad_base_unica" ON "presentacion" USING btree ("producto_id") WHERE "presentacion"."es_unidad_base";--> statement-breakpoint
CREATE UNIQUE INDEX "producto_codigo_unico" ON "producto" USING btree ("empresa_id",upper("codigo"));--> statement-breakpoint
CREATE UNIQUE INDEX "producto_nombre_unico" ON "producto" USING btree ("empresa_id",lower("nombre"));--> statement-breakpoint
CREATE INDEX "producto_categoria" ON "producto" USING btree ("categoria_id");--> statement-breakpoint
CREATE INDEX "producto_proveedor_preferido" ON "producto" USING btree ("proveedor_preferido_id");--> statement-breakpoint
CREATE INDEX "historial_precio_compra_oferta" ON "historial_precio_compra" USING btree ("proveedor_producto_id","vigente_desde" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "historial_precio_compra_producto" ON "historial_precio_compra" USING btree ("empresa_id","producto_id","vigente_desde" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "proveedor_nombre_unico" ON "proveedor" USING btree ("empresa_id",lower("nombre"));--> statement-breakpoint
CREATE UNIQUE INDEX "proveedor_codigo_unico" ON "proveedor" USING btree ("empresa_id",upper("codigo")) WHERE "proveedor"."codigo" is not null;--> statement-breakpoint
CREATE INDEX "proveedor_producto_producto" ON "proveedor_producto" USING btree ("empresa_id","producto_id") WHERE "proveedor_producto"."activo";--> statement-breakpoint
CREATE INDEX "proveedor_producto_proveedor" ON "proveedor_producto" USING btree ("empresa_id","proveedor_id") WHERE "proveedor_producto"."activo";--> statement-breakpoint
CREATE INDEX "proveedor_producto_fecha" ON "proveedor_producto" USING btree ("empresa_id","fecha_actualizacion");--> statement-breakpoint
CREATE INDEX "proveedor_producto_presentacion" ON "proveedor_producto" USING btree ("presentacion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cliente_nombre_unico" ON "cliente" USING btree ("empresa_id",lower("nombre"));--> statement-breakpoint
CREATE UNIQUE INDEX "cliente_codigo_unico" ON "cliente" USING btree ("empresa_id",upper("codigo")) WHERE "cliente"."codigo" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "cliente_identificacion_fiscal_unica" ON "cliente" USING btree ("empresa_id","identificacion_fiscal") WHERE "cliente"."identificacion_fiscal" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "punto_entrega_nombre_unico" ON "punto_entrega" USING btree ("cliente_id",lower("nombre"));--> statement-breakpoint
CREATE UNIQUE INDEX "punto_entrega_principal_unico" ON "punto_entrega" USING btree ("cliente_id") WHERE "punto_entrega"."es_principal" and "punto_entrega"."activo";