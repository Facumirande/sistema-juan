import { entrarConGoogle } from "./acciones";

// "Entrar con Google", siempre a la vista en el ingreso y al crear una cuenta (pedido del usuario,
// 06/10/2026). Si Google todavía no está activado en Supabase, al tocarlo vuelve con un aviso.

export function BotonGoogle({ texto = "Entrar con Google" }: { texto?: string }) {
  return (
    <form action={entrarConGoogle}>
      <button type="submit" className="flex h-12 w-full items-center justify-center gap-3 rounded-lg border-2 border-borde bg-superficie font-semibold hover:border-marca">
        <span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-fondo text-lg font-bold text-navegacion">
          G
        </span>
        {texto}
      </button>
    </form>
  );
}

/** Los avisos que trae la vuelta de Google. */
export function AvisoGoogle({ error }: { error: string | undefined }) {
  if (error === "google-sin-activar") {
    return (
      <p role="alert" className="rounded-lg border border-error px-3 py-2 text-error">
        Entrar con Google todavía no está activado en este sistema. Por ahora entrá con tu usuario y contraseña (o creá una cuenta) y avisale a Facundo para que lo active.
      </p>
    );
  }
  if (error === "google") {
    return (
      <p role="alert" className="rounded-lg border border-error px-3 py-2 text-error">
        No se pudo entrar con Google. Probá de nuevo.
      </p>
    );
  }
  return null;
}
