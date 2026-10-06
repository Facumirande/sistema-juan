import { randomInt } from "node:crypto";

import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { z } from "zod";

import { auditar } from "@/db/auditoria";
import { rol, usuario, usuarioRol } from "@/db/esquema";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { ErrorDeNegocio } from "@/dominio/errores";
import { registrarActividad } from "@/modulos/colaboracion/registro";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";
import type { ServicioCuentas } from "@/modulos/seguridad/cuentas";
import { validar } from "@/modulos/validacion";
import { interpretarIdentificador, LARGO_MINIMO_CLAVE, MENSAJE_IDENTIFICADOR_INVALIDO } from "@/seguridad/identificacion";

// P-96 Usuarios (02 §10). Sin invitaciones por correo: el ADMIN crea cada cuenta con un
// nombre de usuario y una contraseña. La pantalla no muestra roles (todos son ADMIN); los
// roles siguen disponibles aquí por si algún día hace falta alguien con acceso limitado.

export interface UsuarioListado {
  id: string;
  nombre: string;
  /** Nombre de usuario o, si ingresa con correo, el correo. */
  identificador: string;
  roles: string[];
  activo: boolean;
  esUnoMismo: boolean;
  /** Todavía no entró a elegir su contraseña (tiene una clave provisoria). */
  debeCambiarClave: boolean;
  /** Pidió acceso (Google o "Crear una cuenta") y espera que lo habiliten. */
  pendiente: boolean;
  accesoPedidoEn: Date | null;
}

export interface RolDisponible {
  codigo: string;
  nombre: string;
  descripcion: string | null;
}

const ORDEN_ROLES = ["ADMIN", "VENDEDOR", "COMPRADOR", "PREPARADOR", "REPARTIDOR", "ADMINISTRATIVO"];

const ALFABETO_CLAVE = "abcdefghjkmnpqrstuvwxyz23456789";

/** Clave provisoria fácil de dictar (sin 0/o, 1/l/i): sirve para el primer ingreso, después cada uno elige la suya. */
export function generarClave(): string {
  return Array.from({ length: 8 }, () => ALFABETO_CLAVE[randomInt(ALFABETO_CLAVE.length)]).join("");
}

const esquemaClaveOpcional = z
  .string()
  .optional()
  .transform((c) => (c?.trim() ? c : undefined))
  .refine((c) => c === undefined || (c.length >= LARGO_MINIMO_CLAVE && c.length <= 72), {
    message: `La contraseña tiene que tener al menos ${LARGO_MINIMO_CLAVE} caracteres (o dejala vacía y el sistema genera una).`,
  });

const esquemaRoles = z.array(z.string()).min(1, "Elegí al menos un rol.");

const esquemaNuevoUsuario = z.object({
  nombre: z.string().trim().min(2, "Escribí el nombre de la persona.").max(120),
  identificador: z.string(),
  clave: esquemaClaveOpcional,
  /** Sin roles elegidos, administrador: hoy el sistema lo usan dos personas que hacen todo. */
  roles: esquemaRoles.default(["ADMIN"]),
});

function ordenarRoles(codigos: string[]): string[] {
  const posicion = (c: string) => (ORDEN_ROLES.includes(c) ? ORDEN_ROLES.indexOf(c) : ORDEN_ROLES.length);
  return [...codigos].sort((a, b) => posicion(a) - posicion(b) || a.localeCompare(b));
}

async function buscarUsuario(tx: Transaccion, usuarioId: string) {
  const [u] = await tx
    .select({
      id: usuario.id,
      nombre: usuario.nombre,
      authUserId: usuario.authUserId,
      activo: usuario.activo,
      pendiente: sql<boolean>`not ${usuario.activo} and ${usuario.accesoPedidoEn} is not null and ${usuario.accesoAprobadoEn} is null`,
    })
    .from(usuario)
    .where(eq(usuario.id, usuarioId));
  if (!u) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el usuario.");
  return u;
}

async function rolesDeUsuario(tx: Transaccion, usuarioId: string) {
  return tx
    .select({ rolId: rol.id, codigo: rol.codigo })
    .from(usuarioRol)
    .innerJoin(rol, eq(rol.id, usuarioRol.rolId))
    .where(eq(usuarioRol.usuarioId, usuarioId));
}

/** Roles activos de la empresa con esos códigos; falla si alguno no existe. */
async function rolesPorCodigo(tx: Transaccion, codigos: string[]) {
  const unicos = [...new Set(codigos)];
  const roles = await tx
    .select({ id: rol.id, codigo: rol.codigo })
    .from(rol)
    .where(and(inArray(rol.codigo, unicos), eq(rol.activo, true)));
  if (roles.length !== unicos.length) throw new ErrorDeNegocio("VALIDACION", "Alguno de los roles elegidos no existe.");
  return roles;
}

/**
 * Bloquea las filas de usuario de la empresa hasta el final de la transacción: dos cambios
 * simultáneos no pueden dejar a la empresa sin ADMIN activo.
 */
async function bloquearUsuarios(tx: Transaccion): Promise<void> {
  await tx.select({ id: usuario.id }).from(usuario).for("update");
}

/** 02 §10.3 reglas 2 y 3: siempre queda al menos un ADMIN activo además de `usuarioId`. */
async function exigirOtroAdmin(tx: Transaccion, usuarioId: string): Promise<void> {
  const [otro] = await tx
    .select({ id: usuario.id })
    .from(usuario)
    .innerJoin(usuarioRol, eq(usuarioRol.usuarioId, usuario.id))
    .innerJoin(rol, eq(rol.id, usuarioRol.rolId))
    .where(and(eq(rol.codigo, "ADMIN"), eq(rol.activo, true), eq(usuario.activo, true), ne(usuario.id, usuarioId)))
    .limit(1);
  if (!otro) {
    throw new ErrorDeNegocio("VALIDACION", "Tiene que quedar al menos un administrador activo: primero hacé administrador a otra persona.");
  }
}

export async function listarUsuarios(
  db: BaseDatos,
  authUserId: string,
): Promise<{ usuarios: UsuarioListado[]; roles: RolDisponible[] }> {
  return ejecutarComoUsuario(db, authUserId, "usuarios.administrar", async (tx, c) => {
    const filas = await tx
      .select({
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        nombreUsuario: usuario.nombreUsuario,
        activo: usuario.activo,
        debeCambiarClave: usuario.debeCambiarClave,
        accesoPedidoEn: usuario.accesoPedidoEn,
        accesoAprobadoEn: usuario.accesoAprobadoEn,
      })
      .from(usuario)
      .orderBy(desc(usuario.activo), asc(usuario.nombre));
    const asignaciones = await tx
      .select({ usuarioId: usuarioRol.usuarioId, codigo: rol.codigo })
      .from(usuarioRol)
      .innerJoin(rol, eq(rol.id, usuarioRol.rolId));
    const roles = await tx
      .select({ codigo: rol.codigo, nombre: rol.nombre, descripcion: rol.descripcion })
      .from(rol)
      .where(eq(rol.activo, true));

    const orden = ordenarRoles(roles.map((r) => r.codigo));
    return {
      usuarios: filas.map((u) => ({
        id: u.id,
        nombre: u.nombre,
        identificador: u.nombreUsuario ?? u.email,
        roles: ordenarRoles(asignaciones.filter((a) => a.usuarioId === u.id).map((a) => a.codigo)),
        activo: u.activo,
        esUnoMismo: u.id === c.usuarioId,
        debeCambiarClave: u.debeCambiarClave,
        pendiente: !u.activo && u.accesoPedidoEn !== null && u.accesoAprobadoEn === null,
        accesoPedidoEn: u.accesoPedidoEn,
      })),
      roles: [...roles].sort((a, b) => orden.indexOf(a.codigo) - orden.indexOf(b.codigo)),
    };
  });
}

export async function crearUsuario(
  db: BaseDatos,
  cuentas: ServicioCuentas,
  authUserId: string,
  datos: z.input<typeof esquemaNuevoUsuario>,
): Promise<{ usuarioId: string; identificador: string; clave: string }> {
  const d = validar(esquemaNuevoUsuario, datos);
  const identificador = interpretarIdentificador(d.identificador);
  if (!identificador) throw new ErrorDeNegocio("VALIDACION", MENSAJE_IDENTIFICADOR_INVALIDO);
  const clave = d.clave ?? generarClave();

  return ejecutarComoUsuario(db, authUserId, "usuarios.administrar", async (tx, c) => {
    const roles = await rolesPorCodigo(tx, d.roles);
    const [repetido] = await tx
      .select({ id: usuario.id })
      .from(usuario)
      .where(
        or(
          eq(sql`lower(${usuario.email})`, identificador.email),
          identificador.nombreUsuario ? eq(sql`lower(${usuario.nombreUsuario})`, identificador.nombreUsuario) : undefined,
        ),
      );
    if (repetido) throw new ErrorDeNegocio("VALIDACION", "Ya hay un usuario con ese nombre de usuario o correo.");

    const nuevoAuthUserId = await cuentas.crear(identificador.email, clave);
    try {
      const [nuevo] = await tx
        .insert(usuario)
        .values({
          empresaId: c.empresaId,
          authUserId: nuevoAuthUserId,
          nombre: d.nombre,
          email: identificador.email,
          nombreUsuario: identificador.nombreUsuario,
          // La clave la pone otra persona: en su primer ingreso elige la propia (02 §10.2).
          debeCambiarClave: true,
          creadoPor: c.usuarioId,
          actualizadoPor: c.usuarioId,
        })
        .returning({ id: usuario.id });
      if (!nuevo) throw new Error("No se creó el usuario.");
      await tx.insert(usuarioRol).values(
        roles.map((r) => ({ empresaId: c.empresaId, usuarioId: nuevo.id, rolId: r.id, creadoPor: c.usuarioId, actualizadoPor: c.usuarioId })),
      );
      const codigos = ordenarRoles(roles.map((r) => r.codigo));
      await auditar(tx, {
        empresaId: c.empresaId,
        usuarioId: c.usuarioId,
        accion: "CAMBIO_PERMISOS",
        entidad: "usuario",
        entidadId: nuevo.id,
        resumen: `Alta del usuario ${d.nombre} (${identificador.nombreUsuario ?? identificador.email}) con los roles ${codigos.join(", ")}.`,
        datosDespues: { nombre: d.nombre, email: identificador.email, nombreUsuario: identificador.nombreUsuario, roles: codigos },
      });
      return { usuarioId: nuevo.id, identificador: identificador.nombreUsuario ?? identificador.email, clave };
    } catch (error) {
      await cuentas.eliminar(nuevoAuthUserId).catch(() => undefined);
      throw error;
    }
  });
}

export async function cambiarRolesDeUsuario(
  db: BaseDatos,
  authUserId: string,
  datos: { usuarioId: string; roles: string[] },
): Promise<void> {
  const codigosPedidos = validar(esquemaRoles, datos.roles);
  await ejecutarComoUsuario(db, authUserId, "usuarios.administrar", async (tx, c) => {
    await bloquearUsuarios(tx);
    const objetivo = await buscarUsuario(tx, datos.usuarioId);
    const nuevos = await rolesPorCodigo(tx, codigosPedidos);
    const actuales = await rolesDeUsuario(tx, objetivo.id);

    const quitar = actuales.filter((a) => !nuevos.some((n) => n.id === a.rolId));
    const agregar = nuevos.filter((n) => !actuales.some((a) => a.rolId === n.id));
    if (quitar.length === 0 && agregar.length === 0) return;
    if (objetivo.activo && quitar.some((r) => r.codigo === "ADMIN")) await exigirOtroAdmin(tx, objetivo.id);

    if (quitar.length > 0) {
      await tx.delete(usuarioRol).where(
        and(
          eq(usuarioRol.usuarioId, objetivo.id),
          inArray(
            usuarioRol.rolId,
            quitar.map((r) => r.rolId),
          ),
        ),
      );
    }
    if (agregar.length > 0) {
      await tx.insert(usuarioRol).values(
        agregar.map((r) => ({ empresaId: c.empresaId, usuarioId: objetivo.id, rolId: r.id, creadoPor: c.usuarioId, actualizadoPor: c.usuarioId })),
      );
    }
    const antes = ordenarRoles(actuales.map((r) => r.codigo));
    const despues = ordenarRoles(nuevos.map((r) => r.codigo));
    await auditar(tx, {
      empresaId: c.empresaId,
      usuarioId: c.usuarioId,
      accion: "CAMBIO_PERMISOS",
      entidad: "usuario",
      entidadId: objetivo.id,
      resumen: `Roles de ${objetivo.nombre}: ${antes.join(", ") || "ninguno"} → ${despues.join(", ")}.`,
      datosAntes: { roles: antes },
      datosDespues: { roles: despues },
    });
  });
}

/** Desactivar o reactivar (02 §10.3 reglas 2, 4 y 5). Desactivar bloquea también la cuenta en Supabase Auth. */
export async function cambiarEstadoDeUsuario(
  db: BaseDatos,
  cuentas: ServicioCuentas,
  authUserId: string,
  datos: { usuarioId: string; activo: boolean },
): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, "usuarios.administrar", async (tx, c) => {
    await bloquearUsuarios(tx);
    const objetivo = await buscarUsuario(tx, datos.usuarioId);
    if (objetivo.activo === datos.activo) return;
    if (objetivo.pendiente) throw new ErrorDeNegocio("VALIDACION", "Es un pedido de acceso: usá Habilitar o Rechazar.");
    if (!datos.activo) {
      if (objetivo.id === c.usuarioId) throw new ErrorDeNegocio("VALIDACION", "No podés desactivar tu propio usuario.");
      if ((await rolesDeUsuario(tx, objetivo.id)).some((r) => r.codigo === "ADMIN")) await exigirOtroAdmin(tx, objetivo.id);
    }
    await tx.update(usuario).set({ activo: datos.activo, actualizadoPor: c.usuarioId }).where(eq(usuario.id, objetivo.id));
    if (datos.activo && (await rolesDeUsuario(tx, objetivo.id)).length === 0) {
      // Un pedido rechazado nunca tuvo roles: al devolverle el acceso entra como ADMIN, como todos.
      const [admin] = await tx.select({ id: rol.id }).from(rol).where(eq(rol.codigo, "ADMIN"));
      if (admin) {
        await tx.insert(usuarioRol).values({ empresaId: c.empresaId, usuarioId: objetivo.id, rolId: admin.id, creadoPor: c.usuarioId, actualizadoPor: c.usuarioId });
      }
    }
    await auditar(tx, {
      empresaId: c.empresaId,
      usuarioId: c.usuarioId,
      accion: "CAMBIO_PERMISOS",
      entidad: "usuario",
      entidadId: objetivo.id,
      resumen: `${datos.activo ? "Reactivación" : "Desactivación"} del usuario ${objetivo.nombre}.`,
      datosAntes: { activo: objetivo.activo },
      datosDespues: { activo: datos.activo },
    });
    await registrarActividad(tx, c, { accion: "HABILITAR", entidadTipo: "USUARIO", entidadId: objetivo.id, resumen: `${datos.activo ? "le devolvió el acceso a" : "le quitó el acceso a"} ${objetivo.nombre}` });
    // Último paso: si Supabase falla, la transacción se revierte y nada queda a medias.
    await cuentas.bloquear(objetivo.authUserId, !datos.activo);
  });
}

/**
 * Clave provisoria para otra persona que olvidó la suya (sin correo, la recuperación la hace el
 * ADMIN, 02 §10.2). En su próximo ingreso elige una nueva.
 */
export async function restablecerClaveDeUsuario(
  db: BaseDatos,
  cuentas: ServicioCuentas,
  authUserId: string,
  datos: { usuarioId: string; clave?: string },
): Promise<{ clave: string }> {
  const clave = validar(esquemaClaveOpcional, datos.clave) ?? generarClave();
  return ejecutarComoUsuario(db, authUserId, "usuarios.administrar", async (tx, c) => {
    const objetivo = await buscarUsuario(tx, datos.usuarioId);
    await auditar(tx, {
      empresaId: c.empresaId,
      usuarioId: c.usuarioId,
      accion: "CAMBIO_PERMISOS",
      entidad: "usuario",
      entidadId: objetivo.id,
      resumen: `Clave provisoria para ${objetivo.nombre}.`,
    });
    await registrarActividad(tx, c, { accion: "HABILITAR", entidadTipo: "USUARIO", entidadId: objetivo.id, resumen: `le dio una clave provisoria a ${objetivo.nombre}` });
    await tx.update(usuario).set({ debeCambiarClave: true, actualizadoPor: c.usuarioId }).where(eq(usuario.id, objetivo.id));
    await cuentas.cambiarClave(objetivo.authUserId, clave);
    return { clave };
  });
}

/** La persona ya eligió su propia contraseña (primer ingreso, o cambio en "Mi cuenta"). */
export async function marcarClavePropia(db: BaseDatos, authUserId: string): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, null, async (tx, c) => {
    if (!c.debeCambiarClave) return;
    await tx.update(usuario).set({ debeCambiarClave: false, actualizadoPor: c.usuarioId }).where(eq(usuario.id, c.usuarioId));
  });
}
