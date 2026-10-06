import { and, desc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { auditoria, empresa, usuario } from "@/db/esquema";
import { enEmpresa } from "@/db/transaccion";
import {
  configuracionInicialPendiente,
  EMPRESA_PRINCIPAL_ID,
  realizarConfiguracionInicial,
} from "@/modulos/configuracion/configuracion-inicial";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";
import {
  cambiarEstadoDeUsuario,
  cambiarRolesDeUsuario,
  crearUsuario,
  listarUsuarios,
  marcarClavePropia,
  restablecerClaveDeUsuario,
} from "@/modulos/usuarios/usuarios";
import { DOMINIO_CUENTAS_INTERNAS } from "@/seguridad/identificacion";

import { codigoDeError, crearBaseDePrueba, crearEmpresaDePrueba, type BaseDePrueba } from "./base-de-prueba";
import { CuentasSimuladas } from "./cuentas-simuladas";

let base: BaseDePrueba;
let cuentas: CuentasSimuladas;
let otraEmpresa: Awaited<ReturnType<typeof crearEmpresaDePrueba>>;
/** Cuenta de Auth del dueño, creada por la configuración inicial. */
let dueno: string;

const correoInterno = (nombreUsuario: string) => `${nombreUsuario}@${DOMINIO_CUENTAS_INTERNAS}`;

async function mensajeDeError(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  return "SIN_ERROR";
}

function idDe(nombreUsuario: string): string {
  const cuenta = cuentas.porCorreo(correoInterno(nombreUsuario));
  if (!cuenta) throw new Error(`No hay cuenta para ${nombreUsuario}`);
  return cuenta.id;
}

async function usuarioIdDe(nombreUsuario: string): Promise<string> {
  const { usuarios } = await listarUsuarios(base.db, dueno);
  const u = usuarios.find((x) => x.identificador === nombreUsuario);
  if (!u) throw new Error(`No está ${nombreUsuario}`);
  return u.id;
}

const rolesDe = (authUserId: string) => ejecutarComoUsuario(base.db, authUserId, null, async (_tx, c) => c.roles);

beforeAll(async () => {
  base = await crearBaseDePrueba();
  cuentas = new CuentasSimuladas();
  otraEmpresa = await crearEmpresaDePrueba(base.db, "Otra Distribuidora");
});

describe("primer uso (sin pasos a mano en Supabase)", () => {
  const juan = { nombre: "Juan", identificador: "juan", clave: "manzana-2026" };
  const laura = { nombre: "Laura", identificador: "laura", clave: "pera-2026" };
  const datos = { negocio: "Frutas Juan", personas: [juan, laura] };

  it("está pendiente mientras no exista la empresa principal", async () => {
    expect(await configuracionInicialPendiente(base.db)).toBe(true);
  });

  it("rechaza datos inválidos sin crear ninguna cuenta", async () => {
    const intentos = [
      { ...datos, personas: [{ ...juan, identificador: "juan perez" }, laura] },
      { ...datos, personas: [juan, { ...laura, clave: "corta" }] },
      { ...datos, personas: [juan, { ...laura, nombre: "" }] },
    ];
    for (const intento of intentos) expect(await codigoDeError(realizarConfiguracionInicial(base.db, cuentas, intento))).toBe("VALIDACION");
    expect(await mensajeDeError(realizarConfiguracionInicial(base.db, cuentas, { ...datos, personas: [juan, { ...laura, identificador: "JUAN" }] }))).toMatch(
      /mismo usuario/,
    );
    expect(cuentas.cuentas.size).toBe(0);
  });

  it("si falla la base, borra las cuentas que acababa de crear", async () => {
    // El correo de Laura ya lo usa el ADMIN de otra empresa: la fila de usuario viola el índice único.
    const intento = realizarConfiguracionInicial(base.db, cuentas, { ...datos, personas: [juan, { ...laura, identificador: "admin@otradistribuidora.test" }] });
    expect(await codigoDeError(intento)).not.toBe("SIN_ERROR");
    expect(cuentas.cuentas.size).toBe(0);
    expect(await configuracionInicialPendiente(base.db)).toBe(true);
  });

  it("crea la empresa y a las dos personas como administradoras; usa la cuenta que se había creado a mano", async () => {
    const hechaAMano = await cuentas.crear(correoInterno("juan"), "clave-vieja");

    const resultado = await realizarConfiguracionInicial(base.db, cuentas, datos);
    dueno = hechaAMano;

    expect(resultado).toMatchObject({ empresaId: EMPRESA_PRINCIPAL_ID, email: correoInterno("juan") });
    expect(resultado.administradorIds).toHaveLength(2);
    expect(cuentas.cuentas.get(hechaAMano)?.clave).toBe("manzana-2026");
    expect(cuentas.porCorreo(correoInterno("laura"))?.clave).toBe("pera-2026");
    expect(await configuracionInicialPendiente(base.db)).toBe(false);

    expect(await rolesDe(dueno)).toEqual(["ADMIN"]);
    expect(await rolesDe(idDe("laura"))).toEqual(["ADMIN"]);
    const [e] = await enEmpresa(base.db, EMPRESA_PRINCIPAL_ID, (tx) => tx.select().from(empresa));
    expect(e).toMatchObject({ nombre: "Frutas Juan", moneda: "ARS", recargoGlobal: "30.000" });
  });

  it("no se puede hacer dos veces", async () => {
    const segunda = realizarConfiguracionInicial(base.db, cuentas, { personas: [{ ...juan, identificador: "intruso" }] });
    expect(await mensajeDeError(segunda)).toMatch(/ya está listo/);
    expect(cuentas.porCorreo(correoInterno("intruso"))).toBeUndefined();
  });

  it("con una sola persona y sin nombre de negocio también sirve", async () => {
    const otraBase = await crearBaseDePrueba();
    const otrasCuentas = new CuentasSimuladas();
    const r = await realizarConfiguracionInicial(otraBase.db, otrasCuentas, {
      negocio: "",
      personas: [juan, { nombre: "", identificador: "", clave: "" }],
    });
    expect(r.administradorIds).toHaveLength(1);
    expect(otrasCuentas.cuentas.size).toBe(1);
    const [e] = await enEmpresa(otraBase.db, EMPRESA_PRINCIPAL_ID, (tx) => tx.select().from(empresa));
    expect(e?.nombre).toBe("Sistema Repartos");
  });
});

describe("usuarios (P-96, 02 §10)", () => {
  it("crea un usuario sin correo con contraseña generada, sus roles y la auditoría", async () => {
    const r = await crearUsuario(base.db, cuentas, dueno, { nombre: "Marta", identificador: "Marta.Deposito", roles: ["PREPARADOR"] });

    expect(r.identificador).toBe("marta.deposito");
    expect(r.clave).toMatch(/^[a-z2-9]{8}$/);
    const cuenta = cuentas.porCorreo(correoInterno("marta.deposito"));
    expect(cuenta?.clave).toBe(r.clave);
    expect(await rolesDe(cuenta!.id)).toEqual(["PREPARADOR"]);

    const [registro] = await enEmpresa(base.db, EMPRESA_PRINCIPAL_ID, (tx) =>
      tx.select().from(auditoria).where(and(eq(auditoria.entidad, "usuario"), eq(auditoria.entidadId, r.usuarioId))),
    );
    expect(registro).toMatchObject({ accion: "CAMBIO_PERMISOS", datosDespues: expect.objectContaining({ roles: ["PREPARADOR"] }) });
  });

  it("quien crea el sistema ya tiene su contraseña; a quien se agrega le toca elegir la suya al entrar (02 §10.2)", async () => {
    expect(await ejecutarComoUsuario(base.db, dueno, null, async (_tx, c) => c.debeCambiarClave)).toBe(false);
    const r = await crearUsuario(base.db, cuentas, dueno, { nombre: "Tomás", identificador: "tomas" });
    const tomas = idDe("tomas");
    expect(cuentas.cuentas.get(tomas)?.clave).toBe(r.clave);
    expect(await ejecutarComoUsuario(base.db, tomas, null, async (_tx, c) => c.debeCambiarClave)).toBe(true);
    expect((await listarUsuarios(base.db, dueno)).usuarios.find((u) => u.identificador === "tomas")?.debeCambiarClave).toBe(true);

    await marcarClavePropia(base.db, tomas);
    expect(await ejecutarComoUsuario(base.db, tomas, null, async (_tx, c) => c.debeCambiarClave)).toBe(false);

    // Si se olvida la contraseña, la clave provisoria le vuelve a pedir que elija una.
    await restablecerClaveDeUsuario(base.db, cuentas, dueno, { usuarioId: await usuarioIdDe("tomas") });
    expect(await ejecutarComoUsuario(base.db, tomas, null, async (_tx, c) => c.debeCambiarClave)).toBe(true);
    await cambiarEstadoDeUsuario(base.db, cuentas, dueno, { usuarioId: await usuarioIdDe("tomas"), activo: false });
  });

  it("sin roles elegidos, la persona nueva es administradora", async () => {
    await crearUsuario(base.db, cuentas, dueno, { nombre: "Sofía", identificador: "sofia", clave: "sofia-2026" });
    expect(await rolesDe(idDe("sofia"))).toEqual(["ADMIN"]);
  });

  it("acepta una contraseña elegida y correos reales", async () => {
    const r = await crearUsuario(base.db, cuentas, dueno, {
      nombre: "Pedro",
      identificador: "pedro@gmail.com",
      clave: "pedro-compras",
      roles: ["COMPRADOR", "VENDEDOR"],
    });
    expect(r).toMatchObject({ identificador: "pedro@gmail.com", clave: "pedro-compras" });
    expect(await rolesDe(cuentas.porCorreo("pedro@gmail.com")!.id)).toEqual(expect.arrayContaining(["COMPRADOR", "VENDEDOR"]));
  });

  it("rechaza repetidos, roles inexistentes, sin roles y contraseñas cortas, sin crear cuentas", async () => {
    const antes = cuentas.cuentas.size;
    const intentos = [
      { nombre: "Otra Marta", identificador: "marta.deposito", roles: ["PREPARADOR"] },
      { nombre: "Luis", identificador: "luis", roles: ["GERENTE"] },
      { nombre: "Luis", identificador: "luis", roles: [] },
      { nombre: "Luis", identificador: "luis", clave: "1234", roles: ["VENDEDOR"] },
    ];
    for (const datos of intentos) expect(await codigoDeError(crearUsuario(base.db, cuentas, dueno, datos)), datos.nombre).toBe("VALIDACION");
    expect(cuentas.cuentas.size).toBe(antes);
  });

  it("si Supabase falla después de crear la cuenta, no queda nada a medias", async () => {
    cuentas.fallarEn = "crear";
    expect(await codigoDeError(crearUsuario(base.db, cuentas, dueno, { nombre: "Luis", identificador: "luis", roles: ["VENDEDOR"] }))).toMatch(
      /OTRO/,
    );
    const filas = await enEmpresa(base.db, EMPRESA_PRINCIPAL_ID, (tx) => tx.select().from(usuario).where(eq(usuario.nombreUsuario, "luis")));
    expect(filas).toHaveLength(0);
  });

  it("solo quien tiene usuarios.administrar puede ver y administrar usuarios", async () => {
    const marta = idDe("marta.deposito");
    expect(await codigoDeError(listarUsuarios(base.db, marta))).toBe("SIN_PERMISO");
    expect(
      await codigoDeError(crearUsuario(base.db, cuentas, marta, { nombre: "Luis", identificador: "luis", roles: ["ADMIN"] })),
    ).toBe("SIN_PERMISO");
  });

  it("lista los usuarios de la empresa con sus roles, marcando al propio", async () => {
    const { usuarios, roles } = await listarUsuarios(base.db, dueno);
    expect(usuarios.map((u) => [u.nombre, u.identificador, u.roles, u.esUnoMismo])).toEqual([
      ["Juan", "juan", ["ADMIN"], true],
      ["Laura", "laura", ["ADMIN"], false],
      ["Marta", "marta.deposito", ["PREPARADOR"], false],
      ["Pedro", "pedro@gmail.com", ["VENDEDOR", "COMPRADOR"], false],
      ["Sofía", "sofia", ["ADMIN"], false],
      ["Tomás", "tomas", ["ADMIN"], false],
    ]);
    expect(roles.map((r) => r.codigo)).toEqual(["ADMIN", "VENDEDOR", "COMPRADOR", "PREPARADOR", "REPARTIDOR", "ADMINISTRATIVO"]);
  });

  it("cambia los roles y audita antes y después (el cambio rige en el siguiente pedido)", async () => {
    const martaId = await usuarioIdDe("marta.deposito");
    await cambiarRolesDeUsuario(base.db, dueno, { usuarioId: martaId, roles: ["PREPARADOR", "REPARTIDOR"] });
    expect(await rolesDe(idDe("marta.deposito"))).toEqual(expect.arrayContaining(["PREPARADOR", "REPARTIDOR"]));

    const [ultimo] = await enEmpresa(base.db, EMPRESA_PRINCIPAL_ID, (tx) =>
      tx.select().from(auditoria).where(eq(auditoria.entidadId, martaId)).orderBy(desc(auditoria.ocurridoEn)).limit(1),
    );
    expect(ultimo).toMatchObject({
      datosAntes: { roles: ["PREPARADOR"] },
      datosDespues: { roles: ["PREPARADOR", "REPARTIDOR"] },
    });
  });

  it("siempre queda al menos un ADMIN activo (02 §10.3 reglas 2 y 3)", async () => {
    // Laura y Sofía también son ADMIN: se les quita el acceso para que Juan quede como único ADMIN activo.
    for (const otra of ["laura", "sofia"]) {
      await cambiarEstadoDeUsuario(base.db, cuentas, dueno, { usuarioId: await usuarioIdDe(otra), activo: false });
    }
    const juanId = await usuarioIdDe("juan");
    expect(await codigoDeError(cambiarRolesDeUsuario(base.db, dueno, { usuarioId: juanId, roles: ["VENDEDOR"] }))).toBe("VALIDACION");
    expect(await codigoDeError(cambiarEstadoDeUsuario(base.db, cuentas, dueno, { usuarioId: juanId, activo: false }))).toBe("VALIDACION");

    await crearUsuario(base.db, cuentas, dueno, { nombre: "Ana", identificador: "ana", roles: ["ADMIN"] });
    const anaId = await usuarioIdDe("ana");
    await cambiarEstadoDeUsuario(base.db, cuentas, dueno, { usuarioId: anaId, activo: false });
    // Un ADMIN desactivado no cuenta: Juan sigue siendo el único.
    expect(await codigoDeError(cambiarRolesDeUsuario(base.db, dueno, { usuarioId: juanId, roles: ["VENDEDOR"] }))).toBe("VALIDACION");
    expect(await rolesDe(dueno)).toEqual(["ADMIN"]);
  });

  it("desactivar bloquea la cuenta y corta el acceso en el acto; reactivar lo devuelve", async () => {
    const pedroId = await usuarioIdDe("pedro@gmail.com");
    const cuentaPedro = cuentas.porCorreo("pedro@gmail.com")!;

    await cambiarEstadoDeUsuario(base.db, cuentas, dueno, { usuarioId: pedroId, activo: false });
    expect(cuentaPedro.bloqueada).toBe(true);
    expect(await codigoDeError(rolesDe(cuentaPedro.id))).toBe("NO_AUTENTICADO");

    await cambiarEstadoDeUsuario(base.db, cuentas, dueno, { usuarioId: pedroId, activo: true });
    expect(cuentaPedro.bloqueada).toBe(false);
    expect(await codigoDeError(rolesDe(cuentaPedro.id))).toBe("SIN_ERROR");
  });

  it("si Supabase falla al desactivar, el usuario sigue activo", async () => {
    cuentas.fallarEn = "bloquear";
    const pedroId = await usuarioIdDe("pedro@gmail.com");
    expect(await codigoDeError(cambiarEstadoDeUsuario(base.db, cuentas, dueno, { usuarioId: pedroId, activo: false }))).toMatch(/OTRO/);
    expect((await listarUsuarios(base.db, dueno)).usuarios.find((u) => u.id === pedroId)?.activo).toBe(true);
  });

  it("restablece la contraseña de otra persona (generada o elegida)", async () => {
    const martaId = await usuarioIdDe("marta.deposito");
    const { clave } = await restablecerClaveDeUsuario(base.db, cuentas, dueno, { usuarioId: martaId });
    expect(cuentas.porCorreo(correoInterno("marta.deposito"))?.clave).toBe(clave);

    await restablecerClaveDeUsuario(base.db, cuentas, dueno, { usuarioId: martaId, clave: "deposito-2026" });
    expect(cuentas.porCorreo(correoInterno("marta.deposito"))?.clave).toBe("deposito-2026");
    expect(await codigoDeError(restablecerClaveDeUsuario(base.db, cuentas, dueno, { usuarioId: martaId, clave: "corta" }))).toBe("VALIDACION");
  });

  it("el ADMIN de otra empresa no ve ni toca estos usuarios (01 §11)", async () => {
    const { usuarios } = await listarUsuarios(base.db, otraEmpresa.authUserIdAdmin);
    expect(usuarios.map((u) => u.nombre)).toEqual(["Admin Otra Distribuidora"]);
    const martaId = await usuarioIdDe("marta.deposito");
    expect(
      await codigoDeError(cambiarRolesDeUsuario(base.db, otraEmpresa.authUserIdAdmin, { usuarioId: martaId, roles: ["VENDEDOR"] })),
    ).toBe("NO_ENCONTRADO");
    expect(
      await codigoDeError(cambiarEstadoDeUsuario(base.db, cuentas, otraEmpresa.authUserIdAdmin, { usuarioId: martaId, activo: false })),
    ).toBe("NO_ENCONTRADO");
  });
});
