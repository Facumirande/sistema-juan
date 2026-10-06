import { redirect } from "next/navigation";

import { parametro } from "@/ui/parametros";

// Los pedidos de un día se ven en el tablero: esta dirección lleva ahí (con el día, si viene).
export default async function PaginaPedidos({ searchParams }: PageProps<"/pedidos">) {
  const fecha = parametro((await searchParams).fecha);
  redirect(fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? `/inicio?fecha=${fecha}` : "/inicio");
}
