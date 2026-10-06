import { describe, expect, it } from "vitest";

import { esPermiso, PERMISOS } from "@/seguridad/catalogo-permisos";
import { ROLES_SISTEMA } from "@/seguridad/roles-sistema";
import { MENU, menuDisponible, menuPara } from "@/ui/navegacion";

describe("menú por permisos (08 §2.2)", () => {
  it("todas las pantallas usan permisos del catálogo", () => {
    for (const item of MENU.flatMap((g) => g.items)) {
      for (const p of item.permisos) expect(esPermiso(p), `${item.pantalla}: ${p}`).toBe(true);
    }
  });

  it("el REPARTIDOR ve su reparto, entregas y sus documentos, nada con precios ni deudas (08 §6)", () => {
    const menu = menuPara(ROLES_SISTEMA.REPARTIDOR.porDefecto);
    expect(menu.map((g) => g.grupo)).toEqual(["Día de trabajo"]);
    expect(menu[0]?.items.map((i) => i.etiqueta)).toEqual(["Tablero de pedidos", "Mi reparto", "Actividad y notas"]);
  });

  it("quien maneja todos los repartos no ve \"Mi reparto\": usa Logística", () => {
    const dia = menuPara(PERMISOS).find((g) => g.grupo === "Día de trabajo")!;
    expect(dia.items.map((i) => i.etiqueta)).toEqual(["Tablero de pedidos", "Nuevo pedido", "Lista de compras", "Logística", "Actividad y notas"]);
  });

  it("el VENDEDOR no ve proveedores, precios de compra ni configuración", () => {
    const grupos = menuPara(ROLES_SISTEMA.VENDEDOR.porDefecto).map((g) => g.grupo);
    expect(grupos).toEqual(["Día de trabajo", "Registros"]);
    const registros = menuPara(ROLES_SISTEMA.VENDEDOR.porDefecto).find((g) => g.grupo === "Registros");
    expect(registros?.items.map((i) => i.etiqueta)).toEqual(["Clientes", "Productos"]);
  });

  it("con todos los permisos se ven todos los grupos", () => {
    expect(menuPara(PERMISOS).map((g) => g.grupo)).toEqual(MENU.map((g) => g.grupo));
  });

  it("el menú visible no muestra lo que todavía no está hecho", () => {
    const visibles = menuDisponible(PERMISOS).flatMap((g) => g.items);
    expect(visibles.length).toBeGreaterThan(0);
    expect(visibles.every((i) => !i.enConstruccion)).toBe(true);
    expect(menuDisponible(PERMISOS).every((g) => g.items.length > 0)).toBe(true);
  });
});
