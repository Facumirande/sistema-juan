import { notFound, redirect } from "next/navigation";

// El resumen de un día ya lo muestra el paso a paso del tablero: esta dirección lleva ahí.
export default async function DiaDeTrabajo({ params }: PageProps<"/jornadas/[fecha]">) {
  const { fecha } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) notFound();
  redirect(`/inicio?fecha=${fecha}&vista=pasos`);
}
