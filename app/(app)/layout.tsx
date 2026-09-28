import Link from "next/link";
import { redirect } from "next/navigation";

import { obtenerAuthUserId, obtenerSesion } from "@/modulos/seguridad/sesion";
import { menuDisponible, type GrupoMenu } from "@/ui/navegacion";

function Items({ grupo }: { grupo: GrupoMenu }) {
  return grupo.items.map((item) =>
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
  );
}

function Menu({ grupos }: { grupos: GrupoMenu[] }) {
  const titulo = "px-3 text-xs font-semibold uppercase tracking-wide text-texto-suave";
  return (
    <nav aria-label="Menú principal" className="flex flex-col gap-5">
      {grupos.map((g) =>
        g.plegado ? (
          <details key={g.grupo} className="group flex flex-col gap-1">
            <summary className={`${titulo} flex min-h-9 cursor-pointer list-none items-center justify-between`}>
              {g.grupo}
              <span aria-hidden className="text-base transition-transform group-open:rotate-90">›</span>
            </summary>
            <div className="mt-1 flex flex-col gap-1">
              <Items grupo={g} />
            </div>
          </details>
        ) : (
          <div key={g.grupo} className="flex flex-col gap-1">
            <p className={titulo}>{g.grupo}</p>
            <Items grupo={g} />
          </div>
        ),
      )}
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
  // Entró (con Google o su cuenta) pero todavía no está habilitado: pantalla de espera.
  if (!sesion) redirect("/acceso-pendiente");

  // Entró con una clave provisoria: primero elige la suya.
  if (sesion.debeCambiarClave) redirect("/crear-clave");

  const grupos = menuDisponible(sesion.permisos);

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="border-b border-borde bg-superficie md:w-64 md:border-b-0 md:border-r print:hidden">
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
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 items-center justify-between gap-3 border-b border-borde bg-superficie px-4 print:hidden">
          <Link href="/inicio" className="flex min-h-11 items-center font-semibold">
            Sistema Juan
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/mi-cuenta" className="flex min-h-11 items-center font-medium underline-offset-4 hover:underline">
              {sesion.nombre}
            </Link>
            <BotonSalir />
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 print:p-0">{children}</main>
      </div>
    </div>
  );
}
