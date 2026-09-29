import type { Metadata } from "next";

import { obtenerBaseDatos } from "@/db/cliente";
import { formatearFechaHora } from "@/dominio/fechas/fechas";
import { MENSAJE_FALTA_CLAVE_SECRETA, obtenerServicioCuentas } from "@/lib/supabase/cuentas";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { listarUsuarios } from "@/modulos/usuarios/usuarios";
import { DOMINIO_CUENTAS_INTERNAS } from "@/seguridad/identificacion";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Aviso, Encabezado, Tarjeta } from "@/ui/formularios";

import { cambiarEstadoAccion, responderPedidoAccion, restablecerClaveAccion } from "./acciones";

export const metadata: Metadata = { title: "Usuarios · Sistema Juan" };

/**
 * P-96 Usuarios, simplificada: cada persona entra por su cuenta (Google o "Crear una cuenta") y
 * acá se habilita. Todos los habilitados pueden hacer todo (ADMIN).
 */
export default async function PaginaUsuarios() {
  const sesion = await sesionParaPantalla("usuarios.administrar");
  const { usuarios } = await listarUsuarios(obtenerBaseDatos(), sesion.authUserId);
  const cuentasListas = obtenerServicioCuentas() !== null;
  const pedidos = usuarios.filter((u) => u.pendiente);
  const conAcceso = usuarios.filter((u) => !u.pendiente);

  return (
    <section className="flex max-w-2xl flex-col gap-6">
      <Encabezado titulo="Usuarios" descripcion="Quiénes pueden entrar al sistema. Cada persona se crea su cuenta y acá la habilitás; todos los habilitados pueden hacer todo." />

      {!cuentasListas && <Aviso>{MENSAJE_FALTA_CLAVE_SECRETA}</Aviso>}

      {pedidos.length > 0 && (
        <Tarjeta titulo={`Pedidos de acceso (${pedidos.length})`}>
          <p className="text-texto-suave">Habilitá solo a quien conozcas: una vez adentro puede ver y cambiar todo.</p>
          <ul className="flex flex-col gap-3">
            {pedidos.map((u) => (
              <li key={u.id} className="flex flex-col gap-2 rounded-lg border border-marca p-3">
                <p className="font-semibold">{u.nombre}</p>
                <p className="text-texto-suave">
                  {u.identificador}
                  {u.accesoPedidoEn && ` · pidió acceso el ${formatearFechaHora(u.accesoPedidoEn, sesion.zonaHoraria)}`}
                </p>
                <div className="flex flex-wrap gap-2">
                  <FormularioAccion accion={responderPedidoAccion} boton="Habilitar">
                    <input type="hidden" name="usuarioId" value={u.id} />
                    <input type="hidden" name="aprobar" value="true" />
                  </FormularioAccion>
                  <FormularioAccion accion={responderPedidoAccion} boton="Rechazar" variante="peligro" confirmar={`¿Rechazar el pedido de ${u.nombre}?`}>
                    <input type="hidden" name="usuarioId" value={u.id} />
                    <input type="hidden" name="aprobar" value="false" />
                  </FormularioAccion>
                </div>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      <ul className="flex flex-col gap-3">
        {conAcceso.map((u) => {
          // Las cuentas con usuario tienen contraseña del sistema; las de Google entran con Google.
          const conUsuario = !u.identificador.includes("@") || u.identificador.endsWith(`@${DOMINIO_CUENTAS_INTERNAS}`);
          return (
            <li key={u.id} className="flex flex-col gap-2 rounded-lg border border-borde bg-superficie p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-lg font-semibold">
                  {u.nombre}
                  {u.esUnoMismo && <span className="font-normal text-texto-suave"> (vos)</span>}
                </p>
                {!u.activo && <span className="rounded-full border border-error px-3 py-1 text-sm text-error">Sin acceso</span>}
                {u.activo && u.debeCambiarClave && (
                  <span className="rounded-full border border-borde px-3 py-1 text-sm text-texto-suave">Todavía no eligió su contraseña</span>
                )}
              </div>
              <p className="text-texto-suave">{conUsuario ? `Usuario: ${u.identificador}` : `Entra con Google: ${u.identificador}`}</p>

              {u.esUnoMismo ? (
                <p className="text-sm text-texto-suave">Tu contraseña la cambiás en Mi cuenta (tocando tu nombre, arriba).</p>
              ) : (
                <details>
                  <summary className="min-h-11 cursor-pointer py-2 font-medium">Opciones</summary>
                  <div className="flex flex-col gap-4">
                    {conUsuario && u.activo && (
                      <FormularioAccion accion={restablecerClaveAccion} boton="Darle una clave provisoria" variante="secundario">
                        <input type="hidden" name="usuarioId" value={u.id} />
                        <p className="text-sm text-texto-suave">Si se olvidó la contraseña: entra con esta clave y elige una nueva.</p>
                      </FormularioAccion>
                    )}
                    <FormularioAccion
                      accion={cambiarEstadoAccion}
                      boton={u.activo ? "Quitarle el acceso" : "Devolverle el acceso"}
                      variante={u.activo ? "peligro" : "secundario"}
                      confirmar={u.activo ? `¿Quitarle el acceso a ${u.nombre}? No va a poder entrar hasta que se lo devuelvas.` : undefined}
                    >
                      <input type="hidden" name="usuarioId" value={u.id} />
                      <input type="hidden" name="activo" value={String(!u.activo)} />
                    </FormularioAccion>
                  </div>
                </details>
              )}
            </li>
          );
        })}
      </ul>

      <Tarjeta titulo="¿Cómo entra alguien nuevo?">
        <p className="text-texto-suave">
          Que abra el sistema y toque <b>Entrar con Google</b> o <b>Creá una cuenta</b>. Su pedido aparece acá arriba para que lo
          habilites.
        </p>
      </Tarjeta>
    </section>
  );
}
