import { auditoria, type accionAuditoria } from "./esquema";
import type { Transaccion } from "./tipos";

export type AccionAuditoria = (typeof accionAuditoria.enumValues)[number];

export interface RegistroAuditoria {
  empresaId: string;
  /** Nulo solo para procesos automáticos. */
  usuarioId: string | null;
  accion: AccionAuditoria;
  entidad: string;
  entidadId?: string | null;
  resumen: string;
  datosAntes?: Record<string, unknown> | null;
  datosDespues?: Record<string, unknown> | null;
  motivo?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/**
 * Escribe en `auditoria` dentro de la misma transacción que el cambio: si el cambio se
 * revierte, la auditoría también (01 §13).
 */
export async function auditar(tx: Transaccion, registro: RegistroAuditoria): Promise<void> {
  await tx.insert(auditoria).values({
    empresaId: registro.empresaId,
    usuarioId: registro.usuarioId,
    accion: registro.accion,
    entidad: registro.entidad,
    entidadId: registro.entidadId ?? null,
    resumen: registro.resumen,
    datosAntes: registro.datosAntes ?? null,
    datosDespues: registro.datosDespues ?? null,
    motivo: registro.motivo ?? null,
    ip: registro.ip ?? null,
    userAgent: registro.userAgent ?? null,
    requestId: registro.requestId ?? null,
  });
}
