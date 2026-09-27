CREATE TYPE "public"."estado_compra" AS ENUM('REGISTRADA', 'ANULADA');--> statement-breakpoint
CREATE TYPE "public"."estado_lista_compra_item" AS ENUM('PENDIENTE', 'PARCIAL', 'COMPRADO', 'NO_CONSEGUIDO');--> statement-breakpoint
CREATE TYPE "public"."estado_registro" AS ENUM('REGISTRADO', 'ANULADO');--> statement-breakpoint
CREATE TYPE "public"."medio_pago" AS ENUM('EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'TARJETA', 'OTRO');--> statement-breakpoint
CREATE TYPE "public"."origen_pago" AS ENUM('EN_COMPRA', 'POSTERIOR');--> statement-breakpoint
CREATE TYPE "public"."tipo_compra" AS ENUM('MERCADERIA', 'SALDO_INICIAL');--> statement-breakpoint
CREATE TYPE "public"."tipo_movimiento_proveedor" AS ENUM('SALDO_INICIAL', 'CARGO_COMPRA', 'PAGO', 'ANULACION_COMPRA', 'ANULACION_PAGO', 'AJUSTE_DEBITO', 'AJUSTE_CREDITO');--> statement-breakpoint
CREATE TABLE "compra" (
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
	"tipo" "tipo_compra" DEFAULT 'MERCADERIA' NOT NULL,
	"jornada_id" uuid,
	"proveedor_id" uuid NOT NULL,
	"fecha_compra" timestamp with time zone DEFAULT now() NOT NULL,
	"condicion_pago" "condicion_pago" NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"monto_pagado_en_el_acto" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"medio_pago_en_el_acto" "medio_pago",
	"fecha_vencimiento" date,
	"numero_comprobante_proveedor" text,
	"foto_comprobante_path" text,
	"estado" "estado_compra" DEFAULT 'REGISTRADA' NOT NULL,
	"excede_limite" boolean DEFAULT false NOT NULL,
	"motivo_exceso_limite" text,
	"exceso_autorizado_por" uuid,
	"exceso_sin_autorizacion" boolean DEFAULT false NOT NULL,
	"registrada_sin_conexion" boolean DEFAULT false NOT NULL,
	"observaciones" text,
	"clave_idempotencia" uuid,
	CONSTRAINT "compra_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "compra_empresa_numero" UNIQUE("empresa_id","numero"),
	CONSTRAINT "compra_jornada_mercaderia" CHECK ("compra"."tipo" <> 'MERCADERIA' or "compra"."jornada_id" is not null),
	CONSTRAINT "compra_total" CHECK ("compra"."total" >= 0),
	CONSTRAINT "compra_pago_en_el_acto" CHECK (("compra"."condicion_pago" = 'CONTADO' and "compra"."monto_pagado_en_el_acto" = "compra"."total")
       or ("compra"."condicion_pago" = 'CREDITO' and "compra"."monto_pagado_en_el_acto" = 0)
       or ("compra"."condicion_pago" = 'MIXTA' and "compra"."monto_pagado_en_el_acto" > 0 and "compra"."monto_pagado_en_el_acto" < "compra"."total")),
	CONSTRAINT "compra_medio_pago" CHECK ("compra"."monto_pagado_en_el_acto" = 0 or "compra"."medio_pago_en_el_acto" is not null),
	CONSTRAINT "compra_exceso" CHECK (not "compra"."excede_limite" or "compra"."exceso_sin_autorizacion" or char_length(trim(coalesce("compra"."motivo_exceso_limite", ''))) >= 5),
	CONSTRAINT "compra_anulacion" CHECK ("compra"."estado" <> 'ANULADA' or char_length(trim(coalesce("compra"."motivo_anulacion", ''))) >= 5)
);
--> statement-breakpoint
CREATE TABLE "compra_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	"compra_id" uuid NOT NULL,
	"linea" smallint NOT NULL,
	"producto_id" uuid NOT NULL,
	"presentacion_id" uuid NOT NULL,
	"factor_a_base" numeric(12, 3) NOT NULL,
	"cantidad" numeric(12, 3) NOT NULL,
	"cantidad_base" numeric(12, 3) NOT NULL,
	"precio_unitario" numeric(14, 4) NOT NULL,
	"costo_base" numeric(14, 4) NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"lista_compra_item_id" uuid,
	"sin_pedido" boolean DEFAULT false NOT NULL,
	"proveedor_producto_id" uuid,
	"actualizo_precio_lista" boolean DEFAULT false NOT NULL,
	"observaciones" text,
	CONSTRAINT "compra_item_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "compra_item_linea" UNIQUE("compra_id","linea"),
	CONSTRAINT "compra_item_cantidades" CHECK ("compra_item"."cantidad" > 0 and "compra_item"."cantidad_base" > 0 and "compra_item"."factor_a_base" > 0),
	CONSTRAINT "compra_item_importes" CHECK ("compra_item"."precio_unitario" >= 0 and "compra_item"."costo_base" >= 0 and "compra_item"."subtotal" >= 0)
);
--> statement-breakpoint
CREATE TABLE "imputacion_pago_proveedor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	"proveedor_id" uuid NOT NULL,
	"pago_proveedor_id" uuid,
	"movimiento_acreedor_id" uuid,
	"compra_id" uuid,
	"movimiento_deudor_id" uuid,
	"monto" numeric(14, 2) NOT NULL,
	"modo" "modo_imputacion" DEFAULT 'FIFO' NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"desactivada_en" timestamp with time zone,
	"motivo_desactivacion" text,
	CONSTRAINT "imputacion_pago_proveedor_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "imputacion_acreedor_unico" CHECK (num_nonnulls("imputacion_pago_proveedor"."pago_proveedor_id", "imputacion_pago_proveedor"."movimiento_acreedor_id") = 1),
	CONSTRAINT "imputacion_deudor_unico" CHECK (num_nonnulls("imputacion_pago_proveedor"."compra_id", "imputacion_pago_proveedor"."movimiento_deudor_id") = 1),
	CONSTRAINT "imputacion_monto" CHECK ("imputacion_pago_proveedor"."monto" > 0),
	CONSTRAINT "imputacion_desactivacion" CHECK ("imputacion_pago_proveedor"."activa" or char_length(trim(coalesce("imputacion_pago_proveedor"."motivo_desactivacion", ''))) >= 5)
);
--> statement-breakpoint
CREATE TABLE "lista_compra" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	"numero" bigint NOT NULL,
	"jornada_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"desactualizada" boolean DEFAULT false NOT NULL,
	"generada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"generada_por" uuid,
	"costo_estimado_total" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"observaciones" text,
	CONSTRAINT "lista_compra_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "lista_compra_empresa_numero" UNIQUE("empresa_id","numero"),
	CONSTRAINT "lista_compra_empresa_jornada" UNIQUE("empresa_id","jornada_id")
);
--> statement-breakpoint
CREATE TABLE "lista_compra_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	"lista_compra_id" uuid NOT NULL,
	"producto_id" uuid NOT NULL,
	"necesidad_base" numeric(12, 3) NOT NULL,
	"sobrante_disponible_base" numeric(12, 3) DEFAULT '0.000' NOT NULL,
	"necesidad_neta_base" numeric(12, 3) NOT NULL,
	"comprado_base" numeric(12, 3) DEFAULT '0.000' NOT NULL,
	"presentacion_sugerida_id" uuid,
	"cantidad_presentaciones" numeric(12, 3),
	"a_comprar_base" numeric(12, 3),
	"sobrante_previsto_base" numeric(12, 3) DEFAULT '0.000' NOT NULL,
	"ajuste_manual" boolean DEFAULT false NOT NULL,
	"motivo_ajuste" text,
	"proveedor_sugerido_id" uuid,
	"proveedor_producto_sugerido_id" uuid,
	"asignacion_manual" boolean DEFAULT false NOT NULL,
	"precio_sugerido" numeric(14, 4),
	"costo_estimado" numeric(14, 2),
	"estado" "estado_lista_compra_item" DEFAULT 'PENDIENTE' NOT NULL,
	"motivo_no_conseguido" text,
	"sin_pedido" boolean DEFAULT false NOT NULL,
	"alertas" text[] DEFAULT '{}'::text[] NOT NULL,
	"comprador_asignado_id" uuid,
	"necesidad_modificada" boolean DEFAULT false NOT NULL,
	"justificacion" text,
	"observaciones" text,
	CONSTRAINT "lista_compra_item_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "lista_compra_item_producto" UNIQUE("lista_compra_id","producto_id"),
	CONSTRAINT "lista_compra_item_ajuste" CHECK (not "lista_compra_item"."ajuste_manual" or char_length(trim(coalesce("lista_compra_item"."motivo_ajuste", ''))) >= 3),
	CONSTRAINT "lista_compra_item_no_conseguido" CHECK ("lista_compra_item"."estado" <> 'NO_CONSEGUIDO' or char_length(trim(coalesce("lista_compra_item"."motivo_no_conseguido", ''))) >= 3)
);
--> statement-breakpoint
CREATE TABLE "movimiento_cuenta_proveedor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	"proveedor_id" uuid NOT NULL,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL,
	"tipo" "tipo_movimiento_proveedor" NOT NULL,
	"importe" numeric(14, 2) NOT NULL,
	"compra_id" uuid,
	"pago_proveedor_id" uuid,
	"movimiento_compensado_id" uuid,
	"fecha_vencimiento" date,
	"fecha_origen" date,
	"descripcion" text NOT NULL,
	"motivo" text,
	CONSTRAINT "movimiento_cuenta_proveedor_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "movimiento_signo" CHECK (("movimiento_cuenta_proveedor"."tipo" in ('SALDO_INICIAL', 'CARGO_COMPRA', 'ANULACION_PAGO', 'AJUSTE_DEBITO') and "movimiento_cuenta_proveedor"."importe" > 0)
       or ("movimiento_cuenta_proveedor"."tipo" in ('PAGO', 'ANULACION_COMPRA', 'AJUSTE_CREDITO') and "movimiento_cuenta_proveedor"."importe" < 0)),
	CONSTRAINT "movimiento_compra" CHECK ("movimiento_cuenta_proveedor"."tipo" not in ('SALDO_INICIAL', 'CARGO_COMPRA', 'ANULACION_COMPRA') or "movimiento_cuenta_proveedor"."compra_id" is not null),
	CONSTRAINT "movimiento_pago" CHECK ("movimiento_cuenta_proveedor"."tipo" not in ('PAGO', 'ANULACION_PAGO') or "movimiento_cuenta_proveedor"."pago_proveedor_id" is not null),
	CONSTRAINT "movimiento_motivo" CHECK ("movimiento_cuenta_proveedor"."tipo" not in ('AJUSTE_DEBITO', 'AJUSTE_CREDITO', 'ANULACION_COMPRA', 'ANULACION_PAGO') or char_length(trim(coalesce("movimiento_cuenta_proveedor"."motivo", ''))) >= 5)
);
--> statement-breakpoint
CREATE TABLE "pago_proveedor" (
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
	"proveedor_id" uuid NOT NULL,
	"fecha_pago" timestamp with time zone DEFAULT now() NOT NULL,
	"monto" numeric(14, 2) NOT NULL,
	"medio_pago" "medio_pago" NOT NULL,
	"referencia" text,
	"cheque_banco" text,
	"cheque_fecha_cobro" date,
	"origen" "origen_pago" DEFAULT 'POSTERIOR' NOT NULL,
	"compra_id" uuid,
	"modo_imputacion" "modo_imputacion" DEFAULT 'FIFO' NOT NULL,
	"comprobante_path" text,
	"estado" "estado_registro" DEFAULT 'REGISTRADO' NOT NULL,
	"observaciones" text,
	"clave_idempotencia" uuid,
	CONSTRAINT "pago_proveedor_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "pago_proveedor_empresa_numero" UNIQUE("empresa_id","numero"),
	CONSTRAINT "pago_proveedor_monto" CHECK ("pago_proveedor"."monto" > 0),
	CONSTRAINT "pago_proveedor_en_compra" CHECK ("pago_proveedor"."origen" <> 'EN_COMPRA' or "pago_proveedor"."compra_id" is not null),
	CONSTRAINT "pago_proveedor_anulacion" CHECK ("pago_proveedor"."estado" <> 'ANULADO' or char_length(trim(coalesce("pago_proveedor"."motivo_anulacion", ''))) >= 5)
);
--> statement-breakpoint
ALTER TABLE "compra" ADD CONSTRAINT "compra_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra" ADD CONSTRAINT "compra_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra" ADD CONSTRAINT "compra_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra" ADD CONSTRAINT "compra_anulado_por_usuario_id_fk" FOREIGN KEY ("anulado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra" ADD CONSTRAINT "compra_exceso_autorizado_por_usuario_id_fk" FOREIGN KEY ("exceso_autorizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra" ADD CONSTRAINT "compra_jornada_fk" FOREIGN KEY ("empresa_id","jornada_id") REFERENCES "public"."jornada"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra" ADD CONSTRAINT "compra_proveedor_fk" FOREIGN KEY ("empresa_id","proveedor_id") REFERENCES "public"."proveedor"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra_item" ADD CONSTRAINT "compra_item_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra_item" ADD CONSTRAINT "compra_item_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra_item" ADD CONSTRAINT "compra_item_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra_item" ADD CONSTRAINT "compra_item_compra_fk" FOREIGN KEY ("empresa_id","compra_id") REFERENCES "public"."compra"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra_item" ADD CONSTRAINT "compra_item_producto_fk" FOREIGN KEY ("empresa_id","producto_id") REFERENCES "public"."producto"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra_item" ADD CONSTRAINT "compra_item_presentacion_fk" FOREIGN KEY ("producto_id","presentacion_id") REFERENCES "public"."presentacion"("producto_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra_item" ADD CONSTRAINT "compra_item_lista_fk" FOREIGN KEY ("empresa_id","lista_compra_item_id") REFERENCES "public"."lista_compra_item"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra_item" ADD CONSTRAINT "compra_item_oferta_fk" FOREIGN KEY ("empresa_id","proveedor_producto_id") REFERENCES "public"."proveedor_producto"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imputacion_pago_proveedor" ADD CONSTRAINT "imputacion_pago_proveedor_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imputacion_pago_proveedor" ADD CONSTRAINT "imputacion_pago_proveedor_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imputacion_pago_proveedor" ADD CONSTRAINT "imputacion_pago_proveedor_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imputacion_pago_proveedor" ADD CONSTRAINT "imputacion_proveedor_fk" FOREIGN KEY ("empresa_id","proveedor_id") REFERENCES "public"."proveedor"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imputacion_pago_proveedor" ADD CONSTRAINT "imputacion_pago_fk" FOREIGN KEY ("empresa_id","pago_proveedor_id") REFERENCES "public"."pago_proveedor"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imputacion_pago_proveedor" ADD CONSTRAINT "imputacion_compra_fk" FOREIGN KEY ("empresa_id","compra_id") REFERENCES "public"."compra"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imputacion_pago_proveedor" ADD CONSTRAINT "imputacion_acreedor_fk" FOREIGN KEY ("empresa_id","movimiento_acreedor_id") REFERENCES "public"."movimiento_cuenta_proveedor"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imputacion_pago_proveedor" ADD CONSTRAINT "imputacion_deudor_fk" FOREIGN KEY ("empresa_id","movimiento_deudor_id") REFERENCES "public"."movimiento_cuenta_proveedor"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lista_compra" ADD CONSTRAINT "lista_compra_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lista_compra" ADD CONSTRAINT "lista_compra_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lista_compra" ADD CONSTRAINT "lista_compra_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lista_compra" ADD CONSTRAINT "lista_compra_generada_por_usuario_id_fk" FOREIGN KEY ("generada_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lista_compra" ADD CONSTRAINT "lista_compra_jornada_fk" FOREIGN KEY ("empresa_id","jornada_id") REFERENCES "public"."jornada"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lista_compra_item" ADD CONSTRAINT "lista_compra_item_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lista_compra_item" ADD CONSTRAINT "lista_compra_item_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lista_compra_item" ADD CONSTRAINT "lista_compra_item_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lista_compra_item" ADD CONSTRAINT "lista_compra_item_comprador_asignado_id_usuario_id_fk" FOREIGN KEY ("comprador_asignado_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lista_compra_item" ADD CONSTRAINT "lista_compra_item_lista_fk" FOREIGN KEY ("empresa_id","lista_compra_id") REFERENCES "public"."lista_compra"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lista_compra_item" ADD CONSTRAINT "lista_compra_item_producto_fk" FOREIGN KEY ("empresa_id","producto_id") REFERENCES "public"."producto"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lista_compra_item" ADD CONSTRAINT "lista_compra_item_presentacion_fk" FOREIGN KEY ("producto_id","presentacion_sugerida_id") REFERENCES "public"."presentacion"("producto_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lista_compra_item" ADD CONSTRAINT "lista_compra_item_proveedor_fk" FOREIGN KEY ("empresa_id","proveedor_sugerido_id") REFERENCES "public"."proveedor"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lista_compra_item" ADD CONSTRAINT "lista_compra_item_oferta_fk" FOREIGN KEY ("empresa_id","proveedor_producto_sugerido_id") REFERENCES "public"."proveedor_producto"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_cuenta_proveedor" ADD CONSTRAINT "movimiento_cuenta_proveedor_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_cuenta_proveedor" ADD CONSTRAINT "movimiento_cuenta_proveedor_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_cuenta_proveedor" ADD CONSTRAINT "movimiento_cuenta_proveedor_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_cuenta_proveedor" ADD CONSTRAINT "movimiento_proveedor_fk" FOREIGN KEY ("empresa_id","proveedor_id") REFERENCES "public"."proveedor"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_cuenta_proveedor" ADD CONSTRAINT "movimiento_compra_fk" FOREIGN KEY ("empresa_id","compra_id") REFERENCES "public"."compra"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_cuenta_proveedor" ADD CONSTRAINT "movimiento_pago_fk" FOREIGN KEY ("empresa_id","pago_proveedor_id") REFERENCES "public"."pago_proveedor"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_cuenta_proveedor" ADD CONSTRAINT "movimiento_compensado_fk" FOREIGN KEY ("empresa_id","movimiento_compensado_id") REFERENCES "public"."movimiento_cuenta_proveedor"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago_proveedor" ADD CONSTRAINT "pago_proveedor_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago_proveedor" ADD CONSTRAINT "pago_proveedor_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago_proveedor" ADD CONSTRAINT "pago_proveedor_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago_proveedor" ADD CONSTRAINT "pago_proveedor_anulado_por_usuario_id_fk" FOREIGN KEY ("anulado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago_proveedor" ADD CONSTRAINT "pago_proveedor_proveedor_fk" FOREIGN KEY ("empresa_id","proveedor_id") REFERENCES "public"."proveedor"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago_proveedor" ADD CONSTRAINT "pago_proveedor_compra_fk" FOREIGN KEY ("empresa_id","compra_id") REFERENCES "public"."compra"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "compra_clave_idempotencia" ON "compra" USING btree ("clave_idempotencia") WHERE "compra"."clave_idempotencia" is not null;--> statement-breakpoint
CREATE INDEX "compra_jornada" ON "compra" USING btree ("empresa_id","jornada_id");--> statement-breakpoint
CREATE INDEX "compra_proveedor_fecha" ON "compra" USING btree ("empresa_id","proveedor_id","fecha_compra" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "compra_vencimiento" ON "compra" USING btree ("empresa_id","proveedor_id","fecha_vencimiento") WHERE "compra"."estado" = 'REGISTRADA';--> statement-breakpoint
CREATE INDEX "compra_item_producto" ON "compra_item" USING btree ("empresa_id","producto_id");--> statement-breakpoint
CREATE INDEX "compra_item_lista" ON "compra_item" USING btree ("lista_compra_item_id");--> statement-breakpoint
CREATE INDEX "compra_item_presentacion" ON "compra_item" USING btree ("presentacion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "imputacion_pago_proveedor_unica" ON "imputacion_pago_proveedor" USING btree (coalesce("pago_proveedor_id", "movimiento_acreedor_id"),coalesce("compra_id", "movimiento_deudor_id")) WHERE "imputacion_pago_proveedor"."activa";--> statement-breakpoint
CREATE INDEX "imputacion_compra" ON "imputacion_pago_proveedor" USING btree ("compra_id") WHERE "imputacion_pago_proveedor"."activa";--> statement-breakpoint
CREATE INDEX "imputacion_pago" ON "imputacion_pago_proveedor" USING btree ("pago_proveedor_id") WHERE "imputacion_pago_proveedor"."activa";--> statement-breakpoint
CREATE INDEX "imputacion_deudor" ON "imputacion_pago_proveedor" USING btree ("movimiento_deudor_id") WHERE "imputacion_pago_proveedor"."activa";--> statement-breakpoint
CREATE INDEX "imputacion_acreedor" ON "imputacion_pago_proveedor" USING btree ("movimiento_acreedor_id") WHERE "imputacion_pago_proveedor"."activa";--> statement-breakpoint
CREATE INDEX "lista_compra_item_estado" ON "lista_compra_item" USING btree ("lista_compra_id","estado");--> statement-breakpoint
CREATE INDEX "lista_compra_item_proveedor" ON "lista_compra_item" USING btree ("proveedor_sugerido_id");--> statement-breakpoint
CREATE UNIQUE INDEX "movimiento_cuenta_proveedor_compensado" ON "movimiento_cuenta_proveedor" USING btree ("movimiento_compensado_id") WHERE "movimiento_cuenta_proveedor"."movimiento_compensado_id" is not null;--> statement-breakpoint
CREATE INDEX "movimiento_cuenta_proveedor_fecha" ON "movimiento_cuenta_proveedor" USING btree ("proveedor_id","fecha");--> statement-breakpoint
CREATE INDEX "movimiento_cuenta_proveedor_compra" ON "movimiento_cuenta_proveedor" USING btree ("compra_id");--> statement-breakpoint
CREATE INDEX "movimiento_cuenta_proveedor_pago" ON "movimiento_cuenta_proveedor" USING btree ("pago_proveedor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pago_proveedor_clave_idempotencia" ON "pago_proveedor" USING btree ("clave_idempotencia") WHERE "pago_proveedor"."clave_idempotencia" is not null;--> statement-breakpoint
CREATE INDEX "pago_proveedor_proveedor_fecha" ON "pago_proveedor" USING btree ("empresa_id","proveedor_id","fecha_pago" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "pago_proveedor_compra" ON "pago_proveedor" USING btree ("compra_id");