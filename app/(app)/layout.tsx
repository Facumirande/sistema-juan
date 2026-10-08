import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Fragment, Suspense, type ReactNode } from "react";

import { obtenerAuthUserId, obtenerSesion } from "@/modulos/seguridad/sesion";
import type { Permiso } from "@/seguridad/catalogo-permisos";
import { Avatar } from "@/ui/avatar";
import { EnlaceDeMenu } from "@/ui/enlace-menu";
import { MarcoConMenu } from "@/ui/marco";
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
    <nav aria-label="Menú principal" className="flex flex-col gap-3">
      {grupos.map((g, i) =>
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
          // Registros y Cuentas van cada uno en su bloque, con los renglones pegados (se leen como un grupo).
          <div key={g.grupo} className={i === 0 ? "flex flex-col gap-0.5" : "flex flex-col rounded-xl bg-fondo px-1 pt-2 pb-1"}>
            <p className={`${titulo} pb-1`}>{g.grupo}</p>
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
  // El menú queda como se lo dejó la última vez (abierto o guardado): la página ya llega así.
  const menuCerrado = (await cookies()).get("menu")?.value === "cerrado";
  return (
    <MarcoConMenu
      menuCerrado={menuCerrado}
      menu={<Menu grupos={grupos} authUserId={authUserId} permisos={sesion.permisos} />}
      barra={
        <>
          <Campanita zonaHoraria={sesion.zonaHoraria} />
          <Link href="/mi-cuenta" className="flex min-h-11 items-center gap-2 font-medium underline-offset-4 hover:underline">
            <Avatar persona={{ nombre: sesion.nombre, color: sesion.color }} />
            <span className="hidden sm:inline">{sesion.nombre}</span>
          </Link>
          <BotonSalir />
        </>
      }
    >
      {children}
    </MarcoConMenu>
  );
}
