ALTER TABLE "proveedor" ADD COLUMN "alias_transferencia" text;--> statement-breakpoint
ALTER TABLE "proveedor" ADD COLUMN "cbu" text;--> statement-breakpoint
ALTER TABLE "proveedor" ADD COLUMN "titular_cuenta" text;--> statement-breakpoint
ALTER TABLE "proveedor" ADD CONSTRAINT "proveedor_cbu" CHECK ("proveedor"."cbu" ~ '^[0-9]{22}$');--> statement-breakpoint
ALTER TABLE "proveedor" ADD CONSTRAINT "proveedor_alias" CHECK ("proveedor"."alias_transferencia" ~ '^[a-z0-9.-]{6,20}$');