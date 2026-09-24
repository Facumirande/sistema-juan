CREATE TYPE "public"."accion_auditoria" AS ENUM('CREAR', 'MODIFICAR', 'CAMBIO_ESTADO', 'CANCELAR', 'ANULAR', 'CAMBIO_PRECIO_COMPRA', 'CAMBIO_RECARGO', 'CAMBIO_REGLA_PRECIO', 'OVERRIDE_PRECIO', 'EXCESO_LIMITE', 'CAMBIO_LIMITE_CREDITO', 'CORRECCION_ENTREGA', 'EMISION_DOCUMENTO', 'REAPERTURA_JORNADA', 'CAMBIO_CONFIGURACION', 'CAMBIO_PERMISOS', 'INICIO_SESION', 'EXPORTACION');--> statement-breakpoint
CREATE TYPE "public"."estrategia_costo" AS ENUM('PREFERIDO', 'MINIMO', 'ULTIMO_COSTO_REAL');--> statement-breakpoint
CREATE TYPE "public"."modo_imputacion" AS ENUM('FIFO', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."modo_redondeo" AS ENUM('NINGUNO', 'CERCANO', 'ARRIBA', 'ABAJO');--> statement-breakpoint
CREATE TYPE "public"."politica_faltantes" AS ENUM('PRIORIDAD_CLIENTE', 'PROPORCIONAL', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."tipo_secuencia" AS ENUM('PEDIDO', 'LISTA_COMPRA', 'COMPRA', 'PAGO_PROVEEDOR', 'REPARTO', 'ENTREGA', 'FACTURA', 'COBRO_CLIENTE', 'AJUSTE_STOCK');--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"ocurrido_en" timestamp with time zone DEFAULT now() NOT NULL,
	"usuario_id" uuid,
	"accion" "accion_auditoria" NOT NULL,
	"entidad" text NOT NULL,
	"entidad_id" uuid,
	"resumen" text NOT NULL,
	"datos_antes" jsonb,
	"datos_despues" jsonb,
	"motivo" text,
	"ip" "inet",
	"user_agent" text,
	"request_id" uuid,
	CONSTRAINT "auditoria_motivo_obligatorio" CHECK ("auditoria"."accion" not in ('ANULAR','CANCELAR','OVERRIDE_PRECIO','EXCESO_LIMITE','CORRECCION_ENTREGA','REAPERTURA_JORNADA') or char_length(trim(coalesce("auditoria"."motivo", ''))) >= 5)
);
--> statement-breakpoint
CREATE TABLE "empresa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"razon_social" text,
	"identificacion_fiscal" text,
	"condicion_fiscal" text,
	"direccion" text,
	"telefono" text,
	"email" text,
	"logo_path" text,
	"pais" char(2) DEFAULT 'AR' NOT NULL,
	"moneda" char(3) DEFAULT 'ARS' NOT NULL,
	"simbolo_moneda" text DEFAULT '$' NOT NULL,
	"zona_horaria" text DEFAULT 'America/Argentina/Buenos_Aires' NOT NULL,
	"recargo_global" numeric(7, 3) DEFAULT '30.000' NOT NULL,
	"estrategia_costo" "estrategia_costo" DEFAULT 'PREFERIDO' NOT NULL,
	"redondeo_modo" "modo_redondeo" DEFAULT 'CERCANO' NOT NULL,
	"redondeo_multiplo" numeric(14, 4) DEFAULT '1.0000' NOT NULL,
	"precios_incluyen_iva" boolean DEFAULT false NOT NULL,
	"precios_compra_incluyen_iva" boolean DEFAULT false NOT NULL,
	"alicuota_iva_default" numeric(7, 3) DEFAULT '0.000' NOT NULL,
	"margen_minimo_pct" numeric(7, 3) DEFAULT '15.000' NOT NULL,
	"semaforo_amarillo_pct" numeric(7, 3) DEFAULT '70.000' NOT NULL,
	"semaforo_rojo_pct" numeric(7, 3) DEFAULT '90.000' NOT NULL,
	"dias_alerta_precio_desactualizado" integer DEFAULT 7 NOT NULL,
	"variacion_brusca_pct" numeric(7, 3) DEFAULT '30.000' NOT NULL,
	"preferido_caro_pct" numeric(7, 3) DEFAULT '10.000' NOT NULL,
	"dias_aviso_precio_fijo" integer DEFAULT 15 NOT NULL,
	"dias_aviso_vencimiento" integer DEFAULT 3 NOT NULL,
	"hora_corte_pedidos" time,
	"cantidad_atipica_multiplicador" numeric(7, 3) DEFAULT '3.000' NOT NULL,
	"cantidad_atipica_semanas" integer DEFAULT 8 NOT NULL,
	"tolerancia_peso_pct" numeric(7, 3) DEFAULT '3.000' NOT NULL,
	"politica_faltantes" "politica_faltantes" DEFAULT 'PRIORIDAD_CLIENTE' NOT NULL,
	"imputacion_pagos_default" "modo_imputacion" DEFAULT 'FIFO' NOT NULL,
	"aplicar_saldo_a_favor_auto" boolean DEFAULT true NOT NULL,
	"emitir_documentos_al_preparar" boolean DEFAULT true NOT NULL,
	"facturar_automatico_por_entrega" boolean DEFAULT true NOT NULL,
	"modulos_habilitados" text[] DEFAULT '{}'::text[] NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	CONSTRAINT "empresa_umbrales_semaforo" CHECK ("empresa"."semaforo_amarillo_pct" > 0 and "empresa"."semaforo_amarillo_pct" < "empresa"."semaforo_rojo_pct" and "empresa"."semaforo_rojo_pct" <= 100),
	CONSTRAINT "empresa_recargo_global" CHECK ("empresa"."recargo_global" > -100),
	CONSTRAINT "empresa_redondeo_multiplo" CHECK ("empresa"."redondeo_multiplo" > 0),
	CONSTRAINT "empresa_modulos" CHECK ("empresa"."modulos_habilitados" <@ array['COBRANZAS','STOCK','OFFLINE','FACTURACION_FISCAL','PORTAL_CLIENTES']::text[])
);
--> statement-breakpoint
CREATE TABLE "rol" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"permisos" text[] DEFAULT '{}'::text[] NOT NULL,
	"es_sistema" boolean DEFAULT false NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "rol_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "rol_empresa_codigo" UNIQUE("empresa_id","codigo"),
	CONSTRAINT "rol_codigo_formato" CHECK ("rol"."codigo" ~ '^[A-Z][A-Z0-9_]*$')
);
--> statement-breakpoint
CREATE TABLE "secuencia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	"tipo" "tipo_secuencia" NOT NULL,
	"prefijo" text NOT NULL,
	"ultimo_numero" bigint DEFAULT 0 NOT NULL,
	"relleno" smallint DEFAULT 6 NOT NULL,
	CONSTRAINT "secuencia_empresa_tipo" UNIQUE("empresa_id","tipo"),
	CONSTRAINT "secuencia_ultimo_numero" CHECK ("secuencia"."ultimo_numero" >= 0),
	CONSTRAINT "secuencia_relleno" CHECK ("secuencia"."relleno" between 1 and 12)
);
--> statement-breakpoint
CREATE TABLE "usuario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	"auth_user_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"email" text NOT NULL,
	"nombre_usuario" text,
	"telefono" text,
	"activo" boolean DEFAULT true NOT NULL,
	"invitacion_enviada_en" timestamp with time zone,
	"invitacion_aceptada_en" timestamp with time zone,
	"debe_cambiar_clave" boolean DEFAULT false NOT NULL,
	"ultimo_acceso_en" timestamp with time zone,
	"preferencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "usuario_auth_user_id_unique" UNIQUE("auth_user_id"),
	CONSTRAINT "usuario_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "usuario_nombre_no_vacio" CHECK (char_length(trim("usuario"."nombre")) > 0)
);
--> statement-breakpoint
CREATE TABLE "usuario_rol" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	"usuario_id" uuid NOT NULL,
	"rol_id" uuid NOT NULL,
	CONSTRAINT "usuario_rol_unico" UNIQUE("usuario_id","rol_id")
);
--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa" ADD CONSTRAINT "empresa_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rol" ADD CONSTRAINT "rol_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rol" ADD CONSTRAINT "rol_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rol" ADD CONSTRAINT "rol_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secuencia" ADD CONSTRAINT "secuencia_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secuencia" ADD CONSTRAINT "secuencia_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secuencia" ADD CONSTRAINT "secuencia_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_rol" ADD CONSTRAINT "usuario_rol_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_rol" ADD CONSTRAINT "usuario_rol_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_rol" ADD CONSTRAINT "usuario_rol_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_rol" ADD CONSTRAINT "usuario_rol_usuario_fk" FOREIGN KEY ("empresa_id","usuario_id") REFERENCES "public"."usuario"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_rol" ADD CONSTRAINT "usuario_rol_rol_fk" FOREIGN KEY ("empresa_id","rol_id") REFERENCES "public"."rol"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_empresa_fecha" ON "auditoria" USING btree ("empresa_id","ocurrido_en" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "auditoria_entidad" ON "auditoria" USING btree ("empresa_id","entidad","entidad_id","ocurrido_en" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "auditoria_usuario" ON "auditoria" USING btree ("usuario_id","ocurrido_en" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "usuario_email_unico" ON "usuario" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "usuario_nombre_usuario_unico" ON "usuario" USING btree ("empresa_id",lower("nombre_usuario"));--> statement-breakpoint
CREATE INDEX "usuario_rol_rol" ON "usuario_rol" USING btree ("rol_id");