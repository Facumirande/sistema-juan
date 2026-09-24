import { describe, expect, it } from "vitest";

import { esPermiso, PERMISOS } from "@/seguridad/catalogo-permisos";
import { ROLES_SISTEMA } from "@/seguridad/roles-sistema";
import { MENU, menuPara } from "@/ui/navegacion";

describe("menú por permisos (08 §2.2)", () => {
  it("todas las pantallas usan permisos del catálogo", () => {
    for (const item of MENU.flatMap((g) => g.items)) {
      for (const p of item.permisos) expect(esPermiso(p), `${item.pantalla}: ${p}`).toBe(true);
    }
  });

  it("el REPARTIDOR ve su reparto, entregas y sus documentos, nada con precios ni deudas (08 §6)", () => {
    const menu = menuPara(ROLES_SISTEMA.REPARTIDOR.porDefecto);
    expect(menu.map((g) => g.grupo)).toEqual(["Inicio", "Operación del día", "Administración"]);
    expect(menu[1]?.items.map((i) => i.etiqueta)).toEqual(["Jornadas", "Mi reparto", "Entregas"]);
    expect(menu[2]?.items.map((i) => i.etiqueta)).toEqual(["Documentos emitidos"]);
  });

  it("el VENDEDOR no ve proveedores, precios de compra ni configuración", () => {
    const grupos = menuPara(ROLES_SISTEMA.VENDEDOR.porDefecto).map((g) => g.grupo);
    expect(grupos).toEqual(["Inicio", "Operación del día", "Comercial", "Administración"]);
  });

  it("con todos los permisos se ven todos los grupos", () => {
    expect(menuPara(PERMISOS).map((g) => g.grupo)).toEqual(MENU.map((g) => g.grupo));
  });
});
