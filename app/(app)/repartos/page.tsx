import { redirect } from "next/navigation";

import { parametro } from "@/ui/parametros";

// Los repartos del día se arman y se ven en el viaje de entrega: esta dirección lleva ahí.
export default async function PaginaRepartos({ searchParams }: PageProps<"/repartos">) {
  const fecha = parametro((await searchParams).fecha);
  redirect(fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? `/viaje?fecha=${fecha}` : "/viaje");
}
