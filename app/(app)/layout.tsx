import Link from "next/link";
import { redirect } from "next/navigation";

import { obtenerAuthUserId, obtenerSesion } from "@/modulos/seguridad/sesion";
import { menuPara, type GrupoMenu } from "@/ui/navegacion";

function Menu({ grupos }: { grupos: GrupoMenu[] }) {
  return (
    <nav aria-label="Menú principal" className="flex flex-col gap-5">
      {grupos.map((g) => (
        <div key={g.grupo} className="flex flex-col gap-1">
          <p className="px-3 text-xs font-semibold uppercase tracking-wide text-texto-suave">{g.grupo}</p>
          {g.items.map((item) =>
            item.enConstruccion ? (
              <span key={item.pantalla} className="flex min-h-11 items-center justify-between rounded-lg px-3 text-texto-suave">
                {item.etiqueta}
                <span className="text-xs">próximamente</span>
              </span>
            ) : (
              <Link key={item.pantalla} href={item.ruta} className="flex min-h-11 items-center rounded-lg px-3 font-medium hover:bg-fondo">
                {item.etiqueta}
              </Link>
            ),
          )}
        </div>
      ))}
    </nav>
  );
}

function BotonSalir() {
  return (
    <form action="/auth/salir" method="post">
      <button type="submit" className="min-h-11 rounded-lg border border-borde px-3 font-medium">
        Salir
      </button>
    </form>
  );
}

export default async function LayoutAplicacion({ children }: LayoutProps<"/">) {
  const authUserId = await obtenerAuthUserId();
  if (!authUserId) redirect("/login");

  const sesion = await obtenerSesion();
  if (!sesion) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4">
        <h1 className="text-xl font-semibold">Tu usuario no está habilitado</h1>
        <p className="text-texto-suave">
          Tu cuenta existe, pero no está activa en el sistema de ninguna empresa. Pedile a un administrador que te invite o te reactive.
        </p>
        <BotonSalir />
      </main>
    );
  }

  const grupos = menuPara(sesion.permisos);

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="border-b border-borde bg-superficie md:w-64 md:border-b-0 md:border-r">
        <details className="md:hidden">
          <summary className="flex min-h-12 cursor-pointer items-center px-4 font-semibold">Menú</summary>
          <div className="px-2 pb-4">
            <Menu grupos={grupos} />
          </div>
        </details>
        <div className="hidden p-3 md:block">
          <Menu grupos={grupos} />
        </div>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex min-h-14 items-center justify-between gap-3 border-b border-borde bg-superficie px-4">
          <span className="font-semibold">Sistema Juan</span>
          <div className="flex items-center gap-3">
            <span className="text-texto-suave">{sesion.nombre}</span>
            <BotonSalir />
          </div>
        </header>
        <main className="flex-1 p-4">{children}</main>
      </div>
    </div>
  );
}
