-- Los envases como unidad propia (10/10/2026): un producto que se compra y se vende por cajón, caja,
-- bolsa, jaula, bolsón o ristra se cuenta en esos envases, sin decir cuántos kilos traen.
ALTER TYPE "public"."unidad_medida" ADD VALUE IF NOT EXISTS 'CAJON';--> statement-breakpoint
ALTER TYPE "public"."unidad_medida" ADD VALUE IF NOT EXISTS 'CAJA';--> statement-breakpoint
ALTER TYPE "public"."unidad_medida" ADD VALUE IF NOT EXISTS 'BOLSA';--> statement-breakpoint
ALTER TYPE "public"."unidad_medida" ADD VALUE IF NOT EXISTS 'JAULA';--> statement-breakpoint
ALTER TYPE "public"."unidad_medida" ADD VALUE IF NOT EXISTS 'BOLSON';--> statement-breakpoint
ALTER TYPE "public"."unidad_medida" ADD VALUE IF NOT EXISTS 'RISTRA';