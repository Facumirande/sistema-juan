"use server";

import { redirect } from "next/navigation";

import { anularEntrega, confirmarEntrega, corregirEntrega, emitirDocumentos } from "@/modulos/entregas/entregas";
import { emitirDocumentosDelDia } from "@/modulos/entregas/repartos";
import { ejecutarAccion, tildada } from "@/ui/accion-servidor";
import { campo, type EstadoAccion } from "@/ui/estado-accion";

// Acciones de P-78 y P-80. Los permisos los verifica cada caso de uso.

/** Líneas con diferencias: `ent_<item>`, `mot_<item>`, `det_<item>`. */
function lineas(datos: FormData) {
  return [...datos.keys()]
    .filter((k) => k.startsWith("ent_"))
    .map((k) => {
      const itemId = k.slice(4);
      return {
        itemId,
        entregada: campo(datos, k),
        motivo: (campo(datos, `mot_${itemId}`) || null) as "RECHAZO_CALIDAD" | null,
        detalle: campo(datos, `det_${itemId}`),
      };
    });
}

export async function confirmarEntregaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  const volver = campo(datos, "volver");
  const r = await ejecutarAccion(async ({ db, authUserId }) => {
    const modo = campo(datos, "modo") as "COMPLETA" | "DIFERENCIAS" | "NO_RECIBIO";
    await confirmarEntrega(db, authUserId, {
      entregaId: campo(datos, "entregaId"),
      modo,
      lineas: modo === "DIFERENCIAS" ? lineas(datos) : [],
      motivoNoRecibio: (campo(datos, "motivoNoRecibio") || null) as "OTRO" | null,
      detalleNoRecibio: campo(datos, "detalleNoRecibio"),
      recibidoPor: campo(datos, "recibidoPor"),
      recibidoCargo: campo(datos, "recibidoCargo"),
      observaciones: campo(datos, "observaciones"),
    });
    return { ok: true, mensaje: "Entrega confirmada." };
  });
  if (r.ok && volver.startsWith("/")) redirect(volver);
  return r;
}

export async function emitirDocumentosAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const r = await emitirDocumentos(db, authUserId, { entregaId: campo(datos, "entregaId"), confirmaMargenNegativo: tildada(datos, "confirmarVariacion") });
    return { ok: true, mensaje: r.resultado === "YA_EMITIDOS" ? "Los documentos de esta versión ya estaban emitidos." : `Documentos emitidos (versión ${r.version}).` };
  });
}

export async function corregirEntregaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const r = await corregirEntrega(db, authUserId, { entregaId: campo(datos, "entregaId"), motivo: campo(datos, "motivo"), lineas: lineas(datos) });
    return { ok: true, mensaje: r?.resultado === "EMITIDOS" ? `Corregida: documentos versión ${r.version}.` : "Corregida." };
  });
}

export async function anularEntregaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await anularEntrega(db, authUserId, { entregaId: campo(datos, "entregaId"), motivo: campo(datos, "motivo") });
    return { ok: true, mensaje: "Entrega anulada. Sus pedidos vuelven a preparación para armarse de nuevo." };
  });
}

/** Pantalla "Hoy": hace los remitos que falten de las entregas preparadas del día. */
export async function emitirRemitosDelDiaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const r = await emitirDocumentosDelDia(db, authUserId, campo(datos, "fecha"));
    const texto = r.emitidas ? `Remitos hechos: ${r.emitidas}.` : "No había remitos para hacer.";
    return r.problemas.length ? { ok: false, mensaje: `${texto} ${r.problemas.join(" ")}` } : { ok: true, mensaje: texto };
  });
}
