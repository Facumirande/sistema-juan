import { describe, expect, it } from "vitest";
import { z } from "zod";

import { dec } from "@/dominio/dinero/decimal";
import { ErrorDeNegocio } from "@/dominio/errores";
import { enteroOpcional, numeroObligatorio, numeroOpcional, validar } from "@/modulos/validacion";

// Un casillero obligatorio que queda vacío tiene que avisar qué falta, nunca romper la acción.
// (07/10/2026: "Registrar pago" con el monto vacío mostraba "problema del sistema" porque la
// segunda comprobación —que sea mayor que cero— corría igual con el valor vacío.)

const mayorQueCero = z.object({
  monto: numeroObligatorio("Escribí cuánto se pagó.").refine((v) => dec(v).gt(0), { message: "El pago tiene que ser mayor que $0." }),
});

function mensajeDe(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ErrorDeNegocio);
    return (e as ErrorDeNegocio).message;
  }
  throw new Error("Se esperaba un error de validación.");
}

describe("números de los formularios", () => {
  it("un número obligatorio vacío avisa qué falta y no llega a la comprobación siguiente", () => {
    for (const vacio of ["", "   ", null, undefined]) {
      expect(mensajeDe(() => validar(mayorQueCero, { monto: vacio }))).toBe("Escribí cuánto se pagó.");
    }
  });

  it("uno mal escrito avisa lo mismo; uno válido sigue a la comprobación siguiente", () => {
    expect(mensajeDe(() => validar(mayorQueCero, { monto: "abc" }))).toBe("Escribí cuánto se pagó.");
    expect(mensajeDe(() => validar(mayorQueCero, { monto: "0" }))).toBe("El pago tiene que ser mayor que $0.");
    expect(validar(mayorQueCero, { monto: "51.368" })).toEqual({ monto: "51368" });
    expect(validar(mayorQueCero, { monto: "1.234,5" })).toEqual({ monto: "1234.5" });
  });

  it("un número opcional vacío queda nulo, y un entero opcional no acepta decimales", () => {
    const esquema = z.object({ cantidad: numeroOpcional("Escribí la cantidad."), bultos: enteroOpcional("Escribí cuántos bultos (sin coma).") });
    expect(validar(esquema, { cantidad: "", bultos: "" })).toEqual({ cantidad: null, bultos: null });
    expect(validar(esquema, { cantidad: "2,5", bultos: "3" })).toEqual({ cantidad: "2.5", bultos: "3" });
    expect(mensajeDe(() => validar(esquema, { cantidad: "", bultos: "2,5" }))).toBe("Escribí cuántos bultos (sin coma).");
    expect(mensajeDe(() => validar(esquema, { cantidad: "", bultos: "x" }))).toBe("Escribí cuántos bultos (sin coma).");
  });
});
