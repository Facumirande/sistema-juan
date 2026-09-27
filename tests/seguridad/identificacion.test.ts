import { describe, expect, it } from "vitest";

import { DOMINIO_CUENTAS_INTERNAS, identificadorVisible, interpretarIdentificador } from "@/seguridad/identificacion";

describe("usuario o correo para ingresar (02 §10.2)", () => {
  it("un nombre de usuario se traduce a un correo interno", () => {
    expect(interpretarIdentificador("  Marta.Deposito ")).toEqual({
      tipo: "usuario",
      nombreUsuario: "marta.deposito",
      email: `marta.deposito@${DOMINIO_CUENTAS_INTERNAS}`,
    });
  });

  it("un correo se usa tal cual, en minúsculas", () => {
    expect(interpretarIdentificador("Juan@Gmail.com")).toEqual({ tipo: "correo", nombreUsuario: null, email: "juan@gmail.com" });
  });

  it("el correo interno completo equivale al nombre de usuario", () => {
    expect(interpretarIdentificador(`juan@${DOMINIO_CUENTAS_INTERNAS}`)).toMatchObject({ tipo: "usuario", nombreUsuario: "juan" });
  });

  it("rechaza nombres cortos, con espacios o símbolos, y correos mal escritos", () => {
    for (const texto of ["jo", "juan perez", "juan!", ".juan", "juan.", "a".repeat(31), "juan@", "juan@gmail", ""]) {
      expect(interpretarIdentificador(texto), texto).toBeNull();
    }
    expect(interpretarIdentificador(`jo@${DOMINIO_CUENTAS_INTERNAS}`)).toBeNull();
  });

  it("en pantalla, las cuentas internas se muestran por su nombre de usuario", () => {
    expect(identificadorVisible(`marta.deposito@${DOMINIO_CUENTAS_INTERNAS}`)).toBe("marta.deposito");
    expect(identificadorVisible("juan@gmail.com")).toBe("juan@gmail.com");
  });
});
