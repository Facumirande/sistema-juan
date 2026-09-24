import { describe, expect, it } from "vitest";

import { esErrorDeNegocio } from "@/dominio/errores";
import { CATALOGO_PERMISOS, clasePermiso, esPermiso, PERMISOS, type Permiso } from "@/seguridad/catalogo-permisos";
import { esRolSistema, PermisosEfectivos, validarPermisosDeRol } from "@/seguridad/permisos";
import { ROLES_SISTEMA, TODOS_LOS_PERMISOS } from "@/seguridad/roles-sistema";

function errorDe(fn: () => unknown): { codigo?: string; permisos?: unknown } {
  try {
    fn();
  } catch (e) {
    if (esErrorDeNegocio(e)) return { codigo: e.codigo, permisos: e.detalle?.permisos };
    throw e;
  }
  return {};
}

describe("catálogo de permisos (02 §4)", () => {
  it("tiene las claves modulo.accion del catálogo", () => {
    // 8 + 6 + 13 + 8 + 12 + 14 + 6 claves en las secciones 4.1 a 4.7
    expect(PERMISOS).toHaveLength(67);
    for (const p of PERMISOS) expect(p).toMatch(/^[a-z_]+\.[a-z_]+$/);
    expect(esPermiso("compras.exceder_limite")).toBe(true);
    expect(esPermiso("jornadas.gestionar")).toBe(false);
    expect(esPermiso("toString")).toBe(false);
  });

  it("clasifica los permisos sensibles", () => {
    expect(clasePermiso("precios.ver_venta")).toBe("V");
    expect(clasePermiso("documentos.imprimir_contable")).toBe("V");
    expect(clasePermiso("documentos.imprimir_entrega")).toBe("O");
    expect(clasePermiso("usuarios.administrar")).toBe("P");
  });
});

describe("matriz rol × permiso (02 §5 y §6)", () => {
  it("todos los permisos de la matriz existen y no se repiten entre Sí y Opc.", () => {
    for (const [codigo, rol] of Object.entries(ROLES_SISTEMA)) {
      const todos = [...rol.porDefecto, ...rol.opcionales];
      for (const p of todos) expect(esPermiso(p), `${codigo}: ${p}`).toBe(true);
      expect(new Set(todos).size, codigo).toBe(todos.length);
    }
  });

  it("PREPARADOR y REPARTIDOR no tienen ningún permiso de clase V, C, M, F ni P", () => {
    for (const codigo of ["PREPARADOR", "REPARTIDOR"] as const) {
      const rol = ROLES_SISTEMA[codigo];
      for (const p of [...rol.porDefecto, ...rol.opcionales]) {
        expect(CATALOGO_PERMISOS[p].clase, `${codigo}: ${p}`).toBe("O");
      }
    }
  });

  it("los permisos por defecto de cada rol pasan su propia validación", () => {
    for (const [codigo, rol] of Object.entries(ROLES_SISTEMA)) {
      expect(validarPermisosDeRol(codigo, rol.porDefecto)).toHaveLength(rol.porDefecto.length);
    }
  });

  it("caso 13 de 02 §12: no se puede agregar precios.ver_venta al rol REPARTIDOR", () => {
    const resultado = errorDe(() =>
      validarPermisosDeRol("REPARTIDOR", [...ROLES_SISTEMA.REPARTIDOR.porDefecto, "precios.ver_venta"]),
    );
    expect(resultado).toEqual({ codigo: "VALIDACION", permisos: ["precios.ver_venta"] });
  });

  it("un permiso operativo que no corresponde al rol de sistema se rechaza; uno opcional se acepta", () => {
    expect(errorDe(() => validarPermisosDeRol("PREPARADOR", ["entregas.confirmar"])).permisos).toEqual([
      "entregas.confirmar",
    ]);
    expect(validarPermisosDeRol("COMPRADOR", ["compras.exceder_limite"])).toEqual(["compras.exceder_limite"]);
  });

  it("el rol ADMIN no se edita y las claves inexistentes se rechazan", () => {
    expect(errorDe(() => validarPermisosDeRol("ADMIN", [])).codigo).toBe("VALIDACION");
    expect(errorDe(() => validarPermisosDeRol("VENDEDOR", ["pedidos.borrar"])).permisos).toEqual(["pedidos.borrar"]);
  });

  it("un rol personalizado acepta cualquier clave del catálogo, sin duplicados", () => {
    expect(esRolSistema("ENCARGADO_DEPOSITO")).toBe(false);
    expect(
      validarPermisosDeRol("ENCARGADO_DEPOSITO", ["preparacion.registrar", "repartos.gestionar", "repartos.gestionar"]),
    ).toEqual(["preparacion.registrar", "repartos.gestionar"]);
  });
});

describe("permisos efectivos", () => {
  const rol = (codigo: string, permisos: readonly string[], activo = true) => ({ codigo, permisos, activo });

  it("son la unión de los roles activos (caso 9 de 02 §12: PREPARADOR + VENDEDOR)", () => {
    const efectivos = new PermisosEfectivos([
      rol("PREPARADOR", ROLES_SISTEMA.PREPARADOR.porDefecto),
      rol("VENDEDOR", ROLES_SISTEMA.VENDEDOR.porDefecto),
      rol("COMPRADOR", ROLES_SISTEMA.COMPRADOR.porDefecto, false),
    ]);
    expect(efectivos.tiene("preparacion.registrar")).toBe(true);
    expect(efectivos.tiene("precios.ver_venta")).toBe(true);
    expect(efectivos.tiene("precios.ver_costos")).toBe(false);
    expect(efectivos.tieneAlguno(["compras.registrar", "pedidos.crear"])).toBe(true);
    expect(efectivos.esAdmin).toBe(false);
  });

  it("ADMIN tiene todo, incluido lo que se agregue al catálogo", () => {
    const admin = new PermisosEfectivos([rol("ADMIN", [TODOS_LOS_PERMISOS])]);
    expect(admin.esAdmin).toBe(true);
    expect(admin.lista()).toHaveLength(PERMISOS.length);
    expect(() => admin.exigir("jornada.reabrir")).not.toThrow();
  });

  it("exigir un permiso faltante lanza SIN_PERMISO", () => {
    const repartidor = new PermisosEfectivos([rol("REPARTIDOR", ROLES_SISTEMA.REPARTIDOR.porDefecto)]);
    expect(errorDe(() => repartidor.exigir("documentos.imprimir_contable")).codigo).toBe("SIN_PERMISO");
    expect(repartidor.lista()).toEqual(expect.arrayContaining<Permiso>(["entregas.confirmar", "repartos.ver_propios"]));
    expect(repartidor.lista()).toHaveLength(ROLES_SISTEMA.REPARTIDOR.porDefecto.length);
  });

  it("un usuario sin roles activos no tiene permisos", () => {
    expect(new PermisosEfectivos([rol("ADMIN", ["*"], false)]).tiene("jornada.ver")).toBe(false);
  });
});
