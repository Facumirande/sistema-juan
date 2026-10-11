import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Fragment, Suspense, type ReactNode } from "react";

import { hoyEnEmpresa } from "@/dominio/fechas/fechas";
import { obtenerAuthUserId, obtenerSesion } from "@/modulos/seguridad/sesion";
import type { Permiso } from "@/seguridad/catalogo-permisos";
import { Avatar } from "@/ui/avatar";
import { EnlaceDeMenu } from "@/ui/enlace-menu";
import { diaElegido } from "@/ui/dia-elegido";
import { MarcoConMenu } from "@/ui/marco";
import { InstalarApp } from "@/ui/instalar-app";
import { Pulso } from "@/ui/pulso";
import { menuDisponible, type GrupoMenu } from "@/ui/navegacion";

import { Campanita } from "./actividad/campanita";
import { EtapasDelDia, EtapasSueltas } from "./etapas-del-dia";
import { InsigniaDePendientes } from "./pendientes-del-menu";

/** En el menú, junto a estas pantallas va el número de pendientes (clientes que deben, proveedores a los que se les debe). */
const CON_PENDIENTES: Readonly<Record<string, "aCobrar" | "aPagar">> = { "P-65": "aCobrar", "P-60": "aPagar" };

function Items({ grupo, etapas, authUserId }: { grupo: GrupoMenu; etapas: ReactNode; authUserId: string }) {
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
      <EnlaceDeMenu
        key={item.pantalla}
        href={item.ruta}
        icono={item.icono}
        etiqueta={item.etiqueta}
        destacado={item.destacado}
        insignia={
          CON_PENDIENTES[item.pantalla] ? (
            <Suspense fallback={null}>
              <InsigniaDePendientes authUserId={authUserId} cual={CON_PENDIENTES[item.pantalla]!} />
            </Suspense>
          ) : undefined
        }
      />
    );
  });
}

function Menu({ grupos, authUserId, permisos, dia, hoy }: { grupos: GrupoMenu[]; authUserId: string; permisos: readonly Permiso[]; dia: string | null; hoy: string }) {
  const titulo = "px-3 text-xs font-semibold uppercase tracking-wide text-texto-suave";
  const etapasDe = (g: GrupoMenu) => {
    const items = g.items.filter((i) => i.etapa);
    if (items.length === 0) return null;
    return (
      <Suspense fallback={<EtapasSueltas items={items} />}>
        <EtapasDelDia authUserId={authUserId} permisos={permisos} items={items} dia={dia} hoy={hoy} />
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
              <Items grupo={g} etapas={etapasDe(g)} authUserId={authUserId} />
            </div>
          </details>
        ) : (
          // Registros y Cuentas van cada uno en su bloque, con los renglones pegados (se leen como un grupo).
          <div key={g.grupo} className={i === 0 ? "flex flex-col gap-0.5" : "flex flex-col rounded-xl bg-fondo px-1 pt-2 pb-1"}>
            <p className={`${titulo} pb-1`}>{g.grupo}</p>
            <Items grupo={g} etapas={etapasDe(g)} authUserId={authUserId} />
          </div>
        ),
      )}
      <InstalarApp />
      <BotonSalir enMenu />
    </nav>
  );
}

/** "Salir": en la barra de arriba; en el celular, donde la barra es angosta, al final del menú. */
function BotonSalir({ enMenu = false }: { enMenu?: boolean }) {
  return (
    <form action="/auth/salir" method="post" className={enMenu ? "sm:hidden" : "hidden sm:block"}>
      <button type="submit" className={enMenu ? "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left font-medium text-texto-suave hover:bg-marca/10" : "min-h-11 rounded-lg border border-borde px-3 font-medium"}>
        {enMenu && (
          <span aria-hidden className="w-6 text-center text-lg leading-none">
            🚪
          </span>
        )}
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
      menu={<Menu grupos={grupos} authUserId={authUserId} permisos={sesion.permisos} dia={await diaElegido()} hoy={hoyEnEmpresa(new Date(), sesion.zonaHoraria)} />}
      barra={
        <>
          <Campanita zonaHoraria={sesion.zonaHoraria} />
          <Pulso />
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
