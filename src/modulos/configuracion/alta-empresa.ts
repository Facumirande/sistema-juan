import { randomUUID } from "node:crypto";

import { z } from "zod";

import { auditar } from "@/db/auditoria";
import { empresa, rol, secuencia, usuario, usuarioRol } from "@/db/esquema";
import { PREFIJOS_SECUENCIA, type TipoSecuencia } from "@/db/secuencia";
import { cambiarRol, fijarEmpresa } from "@/db/transaccion";
import type { BaseDatos } from "@/db/tipos";
import { NOMBRE_ROL_ADMIN, ROLES_SISTEMA, TODOS_LOS_PERMISOS } from "@/seguridad/roles-sistema";

const esquemaAdministrador = z.object({
  authUserId: z.uuid(),
  nombre: z.string().trim().min(2).max(120),
  email: z.email(),
  nombreUsuario: z.string().nullish(),
});

export const esquemaAltaEmpresa = z.object({
  /** Solo la configuración inicial lo fija (empresa principal); si no, se genera. */
  empresaId: z.uuid().optional(),
  nombre: z.string().trim().min(2).max(120),
  pais: z.enum(["AR", "UY"]).default("AR"),
  moneda: z.enum(["ARS", "UYU"]).default("ARS"),
  zonaHoraria: z.string().trim().min(3).default("America/Argentina/Buenos_Aires"),
  administrador: esquemaAdministrador,
  /** Más usuarios ADMIN creados junto con la empresa (ej. las dos personas que usan el sistema). */
  otrosAdministradores: z.array(esquemaAdministrador).default([]),
});

export type DatosAltaEmpresa = z.input<typeof esquemaAltaEmpresa>;

export interface ResultadoAltaEmpresa {
  empresaId: string;
  administradorId: string;
  /** Todos los ADMIN creados, en el orden recibido. */
  administradorIds: string[];
}

/**
 * Crea una empresa lista para usar: configuración con los valores por defecto,
 * numeración de todos los documentos, los 6 roles de sistema (02 §2) y sus usuarios
 * ADMIN. Corre con los roles de base sin BYPASSRLS, en una sola transacción.
 */
export async function darDeAltaEmpresa(db: BaseDatos, datos: DatosAltaEmpresa): Promise<ResultadoAltaEmpresa> {
  const d = esquemaAltaEmpresa.parse(datos);
  const empresaId = d.empresaId ?? randomUUID();

  return db.transaction(async (tx) => {
    await cambiarRol(tx, "app_alta");
    await fijarEmpresa(tx, empresaId);
    await tx.insert(empresa).values({
      id: empresaId,
      nombre: d.nombre,
      pais: d.pais,
      moneda: d.moneda,
      zonaHoraria: d.zonaHoraria,
    });

    await cambiarRol(tx, "app_negocio");

    await tx.insert(secuencia).values(
      (Object.keys(PREFIJOS_SECUENCIA) as TipoSecuencia[]).map((tipo) => ({
        empresaId,
        tipo,
        prefijo: PREFIJOS_SECUENCIA[tipo],
      })),
    );

    const roles = await tx
      .insert(rol)
      .values([
        {
          empresaId,
          codigo: "ADMIN",
          nombre: NOMBRE_ROL_ADMIN,
          descripcion: "Dueño: todos los permisos.",
          permisos: [TODOS_LOS_PERMISOS],
          esSistema: true,
        },
        ...Object.entries(ROLES_SISTEMA).map(([codigo, definicion]) => ({
          empresaId,
          codigo,
          nombre: definicion.nombre,
          descripcion: definicion.descripcion,
          permisos: [...definicion.porDefecto],
          esSistema: true,
        })),
      ])
      .returning({ id: rol.id, codigo: rol.codigo });
    const rolAdmin = roles.find((r) => r.codigo === "ADMIN");
    if (!rolAdmin) throw new Error("No se creó el rol ADMIN.");

    const administradores = [d.administrador, ...d.otrosAdministradores];
    const creados = await tx
      .insert(usuario)
      .values(
        administradores.map((a) => ({
          empresaId,
          authUserId: a.authUserId,
          nombre: a.nombre,
          email: a.email,
          nombreUsuario: a.nombreUsuario ?? null,
        })),
      )
      .returning({ id: usuario.id });
    if (creados.length !== administradores.length) throw new Error("No se crearon los usuarios administradores.");

    await tx.insert(usuarioRol).values(creados.map((u) => ({ empresaId, usuarioId: u.id, rolId: rolAdmin.id })));

    await auditar(tx, {
      empresaId,
      usuarioId: null,
      accion: "CREAR",
      entidad: "empresa",
      entidadId: empresaId,
      resumen: `Alta de la empresa "${d.nombre}" con ${administradores.length === 1 ? `su administrador ${d.administrador.nombre}` : `${administradores.map((a) => a.nombre).join(" y ")} como administradores`}.`,
      datosDespues: { nombre: d.nombre, pais: d.pais, moneda: d.moneda, zonaHoraria: d.zonaHoraria },
    });

    return { empresaId, administradorId: creados[0]!.id, administradorIds: creados.map((u) => u.id) };
  });
}
