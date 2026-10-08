CREATE TYPE "public"."tipo_movimiento_extra" AS ENUM('GASTO', 'INGRESO');--> statement-breakpoint
CREATE TABLE "cobro_cliente" (
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
	"cliente_id" uuid NOT NULL,
	"entrega_id" uuid,
	"fecha" date NOT NULL,
	"monto" numeric(14, 2) NOT NULL,
	"medio_pago" "medio_pago" DEFAULT 'EFECTIVO' NOT NULL,
	"estado" "estado_registro" DEFAULT 'REGISTRADO' NOT NULL,
	"observaciones" text,
	CONSTRAINT "cobro_cliente_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "cobro_cliente_empresa_numero" UNIQUE("empresa_id","numero"),
	CONSTRAINT "cobro_cliente_monto" CHECK ("cobro_cliente"."monto" > 0),
	CONSTRAINT "cobro_cliente_anulacion" CHECK ("cobro_cliente"."estado" <> 'ANULADO' or char_length(trim(coalesce("cobro_cliente"."motivo_anulacion", ''))) >= 3)
);
--> statement-breakpoint
CREATE TABLE "movimiento_extra" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	"anulado_en" timestamp with time zone,
	"anulado_por" uuid,
	"motivo_anulacion" text,
	"rubro_id" uuid NOT NULL,
	"tipo" "tipo_movimiento_extra" NOT NULL,
	"fecha" date NOT NULL,
	"monto" numeric(14, 2) NOT NULL,
	"cantidad" numeric(12, 3),
	"detalle" text,
	"medio_pago" "medio_pago" DEFAULT 'EFECTIVO' NOT NULL,
	"estado" "estado_registro" DEFAULT 'REGISTRADO' NOT NULL,
	CONSTRAINT "movimiento_extra_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "movimiento_extra_monto" CHECK ("movimiento_extra"."monto" > 0),
	CONSTRAINT "movimiento_extra_cantidad" CHECK ("movimiento_extra"."cantidad" is null or "movimiento_extra"."cantidad" > 0),
	CONSTRAINT "movimiento_extra_anulacion" CHECK ("movimiento_extra"."estado" <> 'ANULADO' or char_length(trim(coalesce("movimiento_extra"."motivo_anulacion", ''))) >= 3)
);
--> statement-breakpoint
CREATE TABLE "rubro_gasto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	"nombre" text NOT NULL,
	"dibujo" text DEFAULT '🧾' NOT NULL,
	"tipo" "tipo_movimiento_extra" DEFAULT 'GASTO' NOT NULL,
	"unidad" text,
	"orden" integer DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "rubro_gasto_empresa_id_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "rubro_gasto_nombre_no_vacio" CHECK (char_length(trim("rubro_gasto"."nombre")) > 0)
);
--> statement-breakpoint
ALTER TABLE "cliente" ADD COLUMN "saldo_inicial" numeric(14, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "cobro_cliente" ADD CONSTRAINT "cobro_cliente_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobro_cliente" ADD CONSTRAINT "cobro_cliente_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobro_cliente" ADD CONSTRAINT "cobro_cliente_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobro_cliente" ADD CONSTRAINT "cobro_cliente_anulado_por_usuario_id_fk" FOREIGN KEY ("anulado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobro_cliente" ADD CONSTRAINT "cobro_cliente_cliente_fk" FOREIGN KEY ("empresa_id","cliente_id") REFERENCES "public"."cliente"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobro_cliente" ADD CONSTRAINT "cobro_cliente_entrega_fk" FOREIGN KEY ("empresa_id","entrega_id") REFERENCES "public"."entrega"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_extra" ADD CONSTRAINT "movimiento_extra_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_extra" ADD CONSTRAINT "movimiento_extra_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_extra" ADD CONSTRAINT "movimiento_extra_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_extra" ADD CONSTRAINT "movimiento_extra_anulado_por_usuario_id_fk" FOREIGN KEY ("anulado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_extra" ADD CONSTRAINT "movimiento_extra_rubro_fk" FOREIGN KEY ("empresa_id","rubro_id") REFERENCES "public"."rubro_gasto"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubro_gasto" ADD CONSTRAINT "rubro_gasto_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubro_gasto" ADD CONSTRAINT "rubro_gasto_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubro_gasto" ADD CONSTRAINT "rubro_gasto_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cobro_cliente_cliente_fecha" ON "cobro_cliente" USING btree ("empresa_id","cliente_id","fecha");--> statement-breakpoint
CREATE INDEX "cobro_cliente_fecha" ON "cobro_cliente" USING btree ("empresa_id","fecha");--> statement-breakpoint
CREATE INDEX "movimiento_extra_fecha" ON "movimiento_extra" USING btree ("empresa_id","fecha");--> statement-breakpoint
CREATE INDEX "movimiento_extra_rubro" ON "movimiento_extra" USING btree ("empresa_id","rubro_id","fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "rubro_gasto_nombre_unico" ON "rubro_gasto" USING btree ("empresa_id","tipo",lower("nombre"));--> statement-breakpoint
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_saldo_inicial" CHECK ("cliente"."saldo_inicial" >= 0);