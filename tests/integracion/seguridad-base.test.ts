import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { auditar } from "@/db/auditoria";
import { auditoria, empresa, rol, secuencia, usuario, usuarioRol } from "@/db/esquema";
import { siguienteNumero } from "@/db/secuencia";
import { cambiarRol, enEmpresa } from "@/db/transaccion";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";
import { ROLES_SISTEMA } from "@/seguridad/roles-sistema";

import { codigoDeError, crearBaseDePrueba, crearEmpresaDePrueba, type BaseDePrueba } from "./base-de-prueba";

let base: BaseDePrueba;
let empresaA: Awaited<ReturnType<typeof crearEmpresaDePrueba>>;
let empresaB: Awaited<ReturnType<typeof crearEmpresaDePrueba>>;

beforeAll(async () => {
  base = await crearBaseDePrueba();
  empresaA = await crearEmpresaDePrueba(base.db, "Distribuidora A");
  empresaB = await crearEmpresaDePrueba(base.db, "Distribuidora B");
});

describe("estructura de seguridad", () => {
  it("toda tabla con empresa_id tiene RLS habilitada, forzada y la política de aislamiento (RT-02)", async () => {
    const tablas = await base.comoSuperusuario(() =>
      base.pg.query<{ tabla: string; rls: boolean; forzada: boolean; politica: boolean }>(`
        select c.relname as tabla, c.relrowsecurity as rls, c.relforcerowsecurity as forzada,
               exists (select 1 from pg_policies p where p.tablename = c.relname and p.policyname = 'aislamiento_empresa') as politica
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and (exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'empresa_id' and not a.attisdropped)
               or c.relname = 'empresa')
        order by 1`),
    );
    expect(tablas.rows.map((t) => t.tabla)).toEqual([
      "actividad", "auditoria", "categoria", "cliente", "compra", "compra_item", "documento_emitido", "empresa", "entrega",
      "entrega_item", "factura", "factura_entrega", "historial_precio_compra", "imputacion_pago_proveedor", "jornada", "lista_compra",
      "lista_compra_item", "movimiento_cuenta_proveedor", "nota", "nota_lectura", "pago_proveedor", "pedido", "pedido_item", "presentacion",
      "producto", "proveedor", "proveedor_producto", "punto_entrega", "regla_precio", "reparto", "rol", "secuencia",
      "usuario", "usuario_rol",
    ]);
    for (const t of tablas.rows) expect(t, t.tabla).toMatchObject({ rls: true, forzada: true, politica: true });
  });

  it("app_servidor sin cambiar de rol no puede leer ninguna tabla (NOINHERIT)", async () => {
    expect(await codigoDeError(base.db.select().from(usuario))).toBe("PERMISO_BD");
  });

  it("sin empresa fijada no se ve nada, aunque la sesión ya haya usado otra empresa (falla cerrada)", async () => {
    await enEmpresa(base.db, empresaA.empresaId, (tx) => tx.select().from(rol));
    const filas = await base.db.transaction(async (tx) => {
      await cambiarRol(tx, "app_negocio");
      return tx.select().from(rol);
    });
    expect(filas).toHaveLength(0);
  });
});

describe("alta de empresa", () => {
  it("crea configuración, numeración, los 6 roles de sistema y el ADMIN", async () => {
    await enEmpresa(base.db, empresaA.empresaId, async (tx) => {
      const [e] = await tx.select().from(empresa);
      expect(e).toMatchObject({ nombre: "Distribuidora A", moneda: "ARS", recargoGlobal: "30.000", estrategiaCosto: "PREFERIDO" });
      expect(await tx.select().from(secuencia)).toHaveLength(9);
      const roles = await tx.select({ codigo: rol.codigo, permisos: rol.permisos }).from(rol);
      expect(roles.map((r) => r.codigo).sort()).toEqual(["ADMIN", "ADMINISTRATIVO", "COMPRADOR", "PREPARADOR", "REPARTIDOR", "VENDEDOR"]);
      expect(roles.find((r) => r.codigo === "REPARTIDOR")?.permisos).toEqual(ROLES_SISTEMA.REPARTIDOR.porDefecto);
      const [registro] = await tx.select().from(auditoria).where(eq(auditoria.entidad, "empresa"));
      expect(registro).toMatchObject({ accion: "CREAR", entidadId: empresaA.empresaId, usuarioId: null });
    });
  });
});

describe("aislamiento entre empresas (01 §11)", () => {
  it("cada empresa ve solo sus filas en todas las tablas", async () => {
    for (const { empresaId } of [empresaA, empresaB]) {
      await enEmpresa(base.db, empresaId, async (tx) => {
        for (const tabla of [usuario, rol, usuarioRol, secuencia, auditoria]) {
          const filas = await tx.select({ empresaId: tabla.empresaId }).from(tabla);
          expect(filas.length).toBeGreaterThan(0);
          expect(new Set(filas.map((f) => f.empresaId))).toEqual(new Set([empresaId]));
        }
        expect((await tx.select({ id: empresa.id }).from(empresa)).map((e) => e.id)).toEqual([empresaId]);
      });
    }
  });

  it("caso 12 de 02 §12: buscar por id un registro de otra empresa no devuelve nada", async () => {
    const filas = await enEmpresa(base.db, empresaA.empresaId, (tx) =>
      tx.select().from(usuario).where(eq(usuario.id, empresaB.administradorId)),
    );
    expect(filas).toHaveLength(0);
  });

  it("no se puede grabar una fila con el empresa_id de otra empresa", async () => {
    const intento = enEmpresa(base.db, empresaA.empresaId, (tx) =>
      tx.insert(rol).values({ empresaId: empresaB.empresaId, codigo: "INTRUSO", nombre: "Intruso" }),
    );
    expect(await codigoDeError(intento)).toBe("RLS");
  });

  it("app_negocio no puede crear empresas ni borrar roles", async () => {
    const nuevaEmpresa = enEmpresa(base.db, empresaA.empresaId, (tx) =>
      tx.insert(empresa).values({ id: empresaA.empresaId, nombre: "Otra" }),
    );
    expect(await codigoDeError(nuevaEmpresa)).toBe("PERMISO_BD");
    const borrarRol = enEmpresa(base.db, empresaA.empresaId, (tx) => tx.delete(rol).where(eq(rol.codigo, "VENDEDOR")));
    expect(await codigoDeError(borrarRol)).toBe("PERMISO_BD");
  });
});

describe("sesión y permisos", () => {
  it("resuelve el ADMIN con todos los permisos y su empresa", async () => {
    const contexto = await ejecutarComoUsuario(base.db, empresaA.authUserIdAdmin, "jornada.reabrir", async (_tx, c) => c);
    expect(contexto).toMatchObject({ empresaId: empresaA.empresaId, roles: ["ADMIN"], zonaHoraria: "America/Argentina/Buenos_Aires" });
    expect(contexto.permisos.esAdmin).toBe(true);
  });

  it("un usuario de Auth sin fila en el sistema no entra", async () => {
    expect(await codigoDeError(ejecutarComoUsuario(base.db, randomUUID(), null, async () => null))).toBe("NO_AUTENTICADO");
  });

  it("REPARTIDOR: tiene sus permisos y recibe SIN_PERMISO para DOC-03; desactivado, no entra (caso 11)", async () => {
    const authUserId = randomUUID();
    await enEmpresa(base.db, empresaA.empresaId, async (tx) => {
      const [repartidor] = await tx.select({ id: rol.id }).from(rol).where(eq(rol.codigo, "REPARTIDOR"));
      const [u] = await tx
        .insert(usuario)
        .values({ empresaId: empresaA.empresaId, authUserId, nombre: "Carlos", email: "carlos@a.test" })
        .returning({ id: usuario.id });
      await tx.insert(usuarioRol).values({ empresaId: empresaA.empresaId, usuarioId: u!.id, rolId: repartidor!.id });
    });

    const permisos = await ejecutarComoUsuario(base.db, authUserId, "entregas.confirmar", async (_tx, c) => c.permisos.lista());
    expect(permisos.sort()).toEqual([...ROLES_SISTEMA.REPARTIDOR.porDefecto].sort());
    expect(await codigoDeError(ejecutarComoUsuario(base.db, authUserId, "documentos.imprimir_contable", async () => null))).toBe(
      "SIN_PERMISO",
    );

    await enEmpresa(base.db, empresaA.empresaId, (tx) => tx.update(usuario).set({ activo: false }).where(eq(usuario.authUserId, authUserId)));
    expect(await codigoDeError(ejecutarComoUsuario(base.db, authUserId, null, async () => null))).toBe("NO_AUTENTICADO");
  });

  it("actualizado_en lo mantiene la base al modificar", async () => {
    const [antes] = await enEmpresa(base.db, empresaA.empresaId, (tx) =>
      tx.select({ en: rol.actualizadoEn }).from(rol).where(eq(rol.codigo, "VENDEDOR")),
    );
    await new Promise((r) => setTimeout(r, 5));
    const [despues] = await enEmpresa(base.db, empresaA.empresaId, (tx) =>
      tx.update(rol).set({ descripcion: "Toma pedidos" }).where(eq(rol.codigo, "VENDEDOR")).returning({ en: rol.actualizadoEn }),
    );
    expect(despues!.en.getTime()).toBeGreaterThan(antes!.en.getTime());
  });
});

describe("auditoría inmutable (01 §13)", () => {
  it("la aplicación puede insertar y leer, pero no modificar ni borrar", async () => {
    const modificar = enEmpresa(base.db, empresaA.empresaId, (tx) => tx.update(auditoria).set({ resumen: "cambiado" }));
    expect(await codigoDeError(modificar)).toBe("PERMISO_BD");
    const borrar = enEmpresa(base.db, empresaA.empresaId, (tx) => tx.delete(auditoria));
    expect(await codigoDeError(borrar)).toBe("PERMISO_BD");
  });

  it("ni el dueño de la tabla puede modificarla (trigger)", async () => {
    const intento = base.comoSuperusuario(() => base.db.execute(sql`update auditoria set resumen = 'x'`));
    expect(await codigoDeError(intento)).toBe("INMUTABLE");
  });

  it("las acciones que lo exigen requieren motivo", async () => {
    const sinMotivo = enEmpresa(base.db, empresaA.empresaId, (tx) =>
      auditar(tx, { empresaId: empresaA.empresaId, usuarioId: empresaA.administradorId, accion: "ANULAR", entidad: "compra", resumen: "Anulación" }),
    );
    expect(await codigoDeError(sinMotivo)).toBe("CHECK");
    const conMotivo = enEmpresa(base.db, empresaA.empresaId, (tx) =>
      auditar(tx, {
        empresaId: empresaA.empresaId,
        usuarioId: empresaA.administradorId,
        accion: "ANULAR",
        entidad: "compra",
        resumen: "Anulación de COM-000130",
        motivo: "El proveedor no entregó la mercadería",
      }),
    );
    expect(await codigoDeError(conMotivo)).toBe("SIN_ERROR");
  });
});

describe("numeración de documentos (RN-149)", () => {
  it("es correlativa por empresa y tipo, y un rollback no consume el número", async () => {
    const primero = await enEmpresa(base.db, empresaA.empresaId, (tx) => siguienteNumero(tx, "PEDIDO"));
    expect(primero.visible).toBe("PED-000001");

    const revertido = enEmpresa(base.db, empresaA.empresaId, async (tx) => {
      await siguienteNumero(tx, "PEDIDO");
      throw new Error("falla después de numerar");
    });
    await expect(revertido).rejects.toThrow("falla después de numerar");

    const segundo = await enEmpresa(base.db, empresaA.empresaId, (tx) => siguienteNumero(tx, "PEDIDO"));
    expect(segundo).toEqual({ numero: 2, visible: "PED-000002" });

    const otraEmpresa = await enEmpresa(base.db, empresaB.empresaId, (tx) => siguienteNumero(tx, "PEDIDO"));
    expect(otraEmpresa.visible).toBe("PED-000001");
    expect((await enEmpresa(base.db, empresaA.empresaId, (tx) => siguienteNumero(tx, "COMPRA"))).visible).toBe("COM-000001");
  });

  it("sin empresa fijada no hay numeración disponible", async () => {
    const intento = base.db.transaction(async (tx) => {
      await cambiarRol(tx, "app_negocio");
      return siguienteNumero(tx, "PEDIDO");
    });
    expect(await codigoDeError(intento)).toBe("NO_ENCONTRADO");
  });
});
