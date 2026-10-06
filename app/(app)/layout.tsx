import Link from "next/link";
import { redirect } from "next/navigation";
import { Fragment, Suspense, type ReactNode } from "react";

import { obtenerBaseDatos } from "@/db/cliente";
import { avisosPara, type BandejaDeAvisos } from "@/modulos/colaboracion/avisos";
import { obtenerAuthUserId, obtenerSesion } from "@/modulos/seguridad/sesion";
import type { Permiso } from "@/seguridad/catalogo-permisos";
import { Avatar } from "@/ui/avatar";
import { EnlaceDeMenu } from "@/ui/enlace-menu";
import { menuDisponible, type GrupoMenu } from "@/ui/navegacion";

import { Campanita } from "./actividad/campanita";
import { EtapasDelDia, EtapasSueltas } from "./etapas-del-dia";

function Items({ grupo, etapas }: { grupo: GrupoMenu; etapas: ReactNode }) {
  const primeraEtapa = grupo.items.findIndex((i) => i.etapa);
  return grupo.items.map((item, i) => {
    // Las etapas del día van todas juntas donde está la primera (debajo del tablero).
    if (item.etapa) return i === primeraEtapa ? <Fragment key="etapas">{etapas}</Fragment> : null;
    return item.enConstruccion ? (
      <span key={item.pantalla} className="flex min-h-11 items-center justify-between rounded-lg px-3 text-texto-suave">
        {item.etiqueta}
        <span className="text-xs">próximamente</span>
      </span>
    ) : (
      <EnlaceDeMenu key={item.pantalla} href={item.ruta} icono={item.icono} etiqueta={item.etiqueta} destacado={item.destacado} />
    );
  });
}

function Menu({ grupos, authUserId, permisos }: { grupos: GrupoMenu[]; authUserId: string; permisos: readonly Permiso[] }) {
  const titulo = "px-3 text-xs font-semibold uppercase tracking-wide text-texto-suave";
  const etapasDe = (g: GrupoMenu) => {
    const items = g.items.filter((i) => i.etapa);
    if (items.length === 0) return null;
    return (
      <Suspense fallback={<EtapasSueltas items={items} />}>
        <EtapasDelDia authUserId={authUserId} permisos={permisos} items={items} />
      </Suspense>
    );
  };
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
              <Items grupo={g} etapas={etapasDe(g)} />
            </div>
          </details>
        ) : (
          <div key={g.grupo} className="flex flex-col gap-1">
            <p className={titulo}>{g.grupo}</p>
            <Items grupo={g} etapas={etapasDe(g)} />
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
  // Si los avisos fallan, la pantalla se muestra igual (con la campanita vacía).
  const avisos = await avisosPara(obtenerBaseDatos(), authUserId).catch((error: unknown): BandejaDeAvisos => {
    console.error("No se pudieron leer los avisos:", error);
    return { nuevos: 0, notasSinLeer: 0, avisos: [], personas: [] };
  });

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="border-b border-borde bg-superficie md:w-60 md:shrink-0 md:border-b-0 md:border-r print:hidden">
        <details className="md:hidden">
          <summary className="flex min-h-12 cursor-pointer items-center px-4 font-semibold">Menú</summary>
          <div className="px-2 pb-4">
            <Menu grupos={grupos} authUserId={authUserId} permisos={sesion.permisos} />
          </div>
        </details>
        <div className="hidden p-3 md:block">
          <Menu grupos={grupos} authUserId={authUserId} permisos={sesion.permisos} />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 items-center justify-between gap-3 border-b border-borde bg-superficie px-4 print:hidden">
          <Link href="/inicio" className="flex min-h-11 items-center font-semibold">
            Sistema Repartos
          </Link>
          <div className="flex items-center gap-3">
            <Campanita inicial={avisos} zonaHoraria={sesion.zonaHoraria} />
            <Link href="/mi-cuenta" className="flex min-h-11 items-center gap-2 font-medium underline-offset-4 hover:underline">
              <Avatar persona={{ nombre: sesion.nombre, color: sesion.color }} />
              <span className="hidden sm:inline">{sesion.nombre}</span>
            </Link>
            <BotonSalir />
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 print:p-0">{children}</main>
      </div>
    </div>
  );
}
