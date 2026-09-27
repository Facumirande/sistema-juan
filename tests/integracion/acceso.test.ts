import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { realizarConfiguracionInicial } from "@/modulos/configuracion/configuracion-inicial";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";
import {
  MAXIMO_PEDIDOS_PENDIENTES,
  contarPedidosPendientes,
  crearCuentaPropia,
  estadoDeAcceso,
  pedirAcceso,
  responderPedidoDeAcceso,
} from "@/modulos/usuarios/acceso";
import { cambiarEstadoDeUsuario, listarUsuarios } from "@/modulos/usuarios/usuarios";
import { DOMINIO_CUENTAS_INTERNAS } from "@/seguridad/identificacion";

import { codigoDeError, crearBaseDePrueba, type BaseDePrueba } from "./base-de-prueba";
import { CuentasSimuladas } from "./cuentas-simuladas";

// Pedidos de acceso: entrar con Google o "Crear una cuenta", y que un administrador habilite.

let base: BaseDePrueba;
let cuentas: CuentasSimuladas;
let admin: string;
const google = { authUserId: randomUUID(), nombre: "Juan García", email: "Juan.Garcia@Gmail.com" };

const mensajeDeError = async (promesa: Promise<unknown>) => {
  try {
    await promesa;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  return "SIN_ERROR";
};

async function usuarioIdDe(identificador: string): Promise<string> {
  const u = (await listarUsuarios(base.db, admin)).usuarios.find((x) => x.identificador === identificador);
  if (!u) throw new Error(`No está ${identificador}`);
  return u.id;
}

beforeAll(async () => {
  base = await crearBaseDePrueba();
  cuentas = new CuentasSimuladas();
});

describe("pedidos de acceso (Google o cuenta propia)", () => {
  it("antes del primer uso no se pueden pedir accesos", async () => {
    expect(await codigoDeError(pedirAcceso(base.db, google))).toBe("VALIDACION");
    expect(await codigoDeError(crearCuentaPropia(base.db, cuentas, { nombre: "Laura", identificador: "laura", clave: "pera-2026" }))).toBe("VALIDACION");
    expect(cuentas.cuentas.size).toBe(0);

    await realizarConfiguracionInicial(base.db, cuentas, { personas: [{ nombre: "Facundo", identificador: "facundo", clave: "clave-facu-1" }] });
    admin = cuentas.porCorreo(`facundo@${DOMINIO_CUENTAS_INTERNAS}`)!.id;
  });

  it("quien entra con Google queda pendiente y no ve nada hasta que lo habiliten", async () => {
    expect(await estadoDeAcceso(base.db, google.authUserId)).toBe("SIN_PEDIDO");
    expect(await pedirAcceso(base.db, google)).toBe("PENDIENTE");
    expect(await pedirAcceso(base.db, google)).toBe("PENDIENTE");
    expect(await estadoDeAcceso(base.db, google.authUserId)).toBe("PENDIENTE");
    expect(await codigoDeError(ejecutarComoUsuario(base.db, google.authUserId, null, async () => null))).toBe("NO_AUTENTICADO");
  });

  it("'Crear una cuenta' crea el usuario con su contraseña y deja el pedido", async () => {
    const r = await crearCuentaPropia(base.db, cuentas, { nombre: "Laura", identificador: "Laura", clave: "pera-2026" });
    expect(r.email).toBe(`laura@${DOMINIO_CUENTAS_INTERNAS}`);
    const laura = cuentas.porCorreo(r.email)!;
    expect(laura.clave).toBe("pera-2026");
    expect(await estadoDeAcceso(base.db, laura.id)).toBe("PENDIENTE");

    expect(await mensajeDeError(crearCuentaPropia(base.db, cuentas, { nombre: "Otra Laura", identificador: "laura", clave: "otra-clave-1" }))).toMatch(/ya existe/);
    expect(await codigoDeError(crearCuentaPropia(base.db, cuentas, { nombre: "X", identificador: "x y", clave: "otra-clave-1" }))).toBe("VALIDACION");
  });

  it("el administrador ve los pedidos y los habilita (quedan ADMIN) o los rechaza (cuenta bloqueada)", async () => {
    expect(await contarPedidosPendientes(base.db, admin)).toBe(2);
    const lista = (await listarUsuarios(base.db, admin)).usuarios;
    expect(lista.filter((u) => u.pendiente).map((u) => u.identificador).sort()).toEqual(["juan.garcia@gmail.com", "laura"]);

    await responderPedidoDeAcceso(base.db, cuentas, admin, { usuarioId: await usuarioIdDe("laura"), aprobar: true });
    const laura = cuentas.porCorreo(`laura@${DOMINIO_CUENTAS_INTERNAS}`)!;
    expect(await estadoDeAcceso(base.db, laura.id)).toBe("ACTIVO");
    expect(await ejecutarComoUsuario(base.db, laura.id, "usuarios.administrar", async (_tx, c) => c.roles)).toEqual(["ADMIN"]);

    cuentas.cuentas.set(google.authUserId, { id: google.authUserId, email: google.email.toLowerCase(), clave: "", bloqueada: false });
    await responderPedidoDeAcceso(base.db, cuentas, admin, { usuarioId: await usuarioIdDe("juan.garcia@gmail.com"), aprobar: false });
    expect(await estadoDeAcceso(base.db, google.authUserId)).toBe("SIN_ACCESO");
    expect(cuentas.cuentas.get(google.authUserId)?.bloqueada).toBe(true);
    expect(await contarPedidosPendientes(base.db, admin)).toBe(0);

    expect(await codigoDeError(responderPedidoDeAcceso(base.db, cuentas, admin, { usuarioId: await usuarioIdDe("laura"), aprobar: true }))).toBe("NO_ENCONTRADO");
  });

  it("a un rechazado se le puede devolver el acceso después, y entra como ADMIN", async () => {
    await cambiarEstadoDeUsuario(base.db, cuentas, admin, { usuarioId: await usuarioIdDe("juan.garcia@gmail.com"), activo: true });
    expect(await estadoDeAcceso(base.db, google.authUserId)).toBe("ACTIVO");
    expect(cuentas.cuentas.get(google.authUserId)?.bloqueada).toBe(false);
    expect(await ejecutarComoUsuario(base.db, google.authUserId, null, async (_tx, c) => c.roles)).toEqual(["ADMIN"]);
  });

  it(`como mucho ${MAXIMO_PEDIDOS_PENDIENTES} pedidos sin responder (evita que llenen la lista)`, async () => {
    for (let i = 0; i < MAXIMO_PEDIDOS_PENDIENTES; i++) {
      await pedirAcceso(base.db, { authUserId: randomUUID(), nombre: `Desconocido ${i}`, email: `x${i}@gmail.com` });
    }
    expect(await mensajeDeError(pedirAcceso(base.db, { authUserId: randomUUID(), nombre: "Uno más", email: "mas@gmail.com" }))).toMatch(/demasiados/);
    const antes = cuentas.cuentas.size;
    expect(await mensajeDeError(crearCuentaPropia(base.db, cuentas, { nombre: "Uno más", identificador: "uno.mas", clave: "clave-1234" }))).toMatch(/demasiados/);
    expect(cuentas.cuentas.size).toBe(antes);
  });

  it("solo un administrador responde pedidos", async () => {
    const pendiente = (await listarUsuarios(base.db, admin)).usuarios.find((u) => u.pendiente)!;
    const nadie = randomUUID();
    expect(await codigoDeError(responderPedidoDeAcceso(base.db, cuentas, nadie, { usuarioId: pendiente.id, aprobar: true }))).toBe("NO_AUTENTICADO");
  });
});
