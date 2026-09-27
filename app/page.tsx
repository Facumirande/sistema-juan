import { redirect } from "next/navigation";

/**
 * Si Supabase devuelve el ingreso con Google a la dirección principal (su "Site URL"), el código
 * se reenvía a la ruta que lo procesa.
 */
export default async function Raiz({ searchParams }: PageProps<"/">) {
  const { code } = await searchParams;
  if (typeof code === "string") redirect(`/auth/callback?code=${encodeURIComponent(code)}`);
  redirect("/inicio");
}
