import { randomUUID } from "node:crypto";

import { cuentaExistente, type ServicioCuentas } from "@/modulos/seguridad/cuentas";

export interface CuentaSimulada {
  id: string;
  email: string;
  clave: string;
  bloqueada: boolean;
}

/** Supabase Auth en memoria para las pruebas de los casos de uso. */
export class CuentasSimuladas implements ServicioCuentas {
  readonly cuentas = new Map<string, CuentaSimulada>();
  /** Si se fija, la próxima llamada a ese método falla (simula una caída de Supabase). */
  fallarEn: keyof ServicioCuentas | null = null;

  private revisarFalla(metodo: keyof ServicioCuentas) {
    if (this.fallarEn === metodo) {
      this.fallarEn = null;
      throw new Error(`Supabase Auth no responde (${metodo})`);
    }
  }

  private cuenta(id: string): CuentaSimulada {
    const c = this.cuentas.get(id);
    if (!c) throw new Error(`No existe la cuenta ${id}`);
    return c;
  }

  porCorreo(email: string): CuentaSimulada | undefined {
    return [...this.cuentas.values()].find((c) => c.email === email);
  }

  async crear(email: string, clave: string) {
    this.revisarFalla("crear");
    if (this.porCorreo(email)) throw cuentaExistente();
    const id = randomUUID();
    this.cuentas.set(id, { id, email, clave, bloqueada: false });
    return id;
  }

  async buscarPorCorreo(email: string) {
    this.revisarFalla("buscarPorCorreo");
    return this.porCorreo(email)?.id ?? null;
  }

  async cambiarClave(id: string, clave: string) {
    this.revisarFalla("cambiarClave");
    this.cuenta(id).clave = clave;
  }

  async bloquear(id: string, bloqueada: boolean) {
    this.revisarFalla("bloquear");
    this.cuenta(id).bloqueada = bloqueada;
  }

  async eliminar(id: string) {
    this.revisarFalla("eliminar");
    this.cuentas.delete(id);
  }
}
