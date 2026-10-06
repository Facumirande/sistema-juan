import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { obtenerBaseDatos } from "@/db/cliente";
import { documentoDeEntrega } from "@/modulos/entregas/entregas";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { cargarFicha, idDeRuta } from "@/ui/accion-servidor";
import { BotonImprimir } from "@/ui/boton-imprimir";
import { parametro } from "@/ui/parametros";

import { ListaContable, ListaEntrega } from "../../../documentos-impresos";

export const metadata: Metadata = { title: "Documento de entrega · Sistema Repartos" };

const TIPOS = { "lista-entrega": "DOC_02", "lista-contable": "DOC_03" } as const;

/**
 * DOC-02 Lista de entrega (sin precios) y DOC-03 Lista contable (09): se dibujan desde el
 * contenido guardado al emitir, así que muestran exactamente lo emitido.
 */
export default async function DocumentoDeEntrega({ params, searchParams }: PageProps<"/entregas/[id]/documento/[tipo]">) {
  const { id, tipo } = await params;
  const clave = TIPOS[tipo as keyof typeof TIPOS];
  if (!clave) notFound();
  const sesion = await sesionParaPantalla(clave === "DOC_03" ? "documentos.imprimir_contable" : "documentos.imprimir_entrega");
  const f = await searchParams;
  const v = Number(parametro(f.v));
  const dosCopias = parametro(f.copias) === "2";
  const doc = await cargarFicha(documentoDeEntrega(obtenerBaseDatos(), sesion.authUserId, { entregaId: idDeRuta(id), tipo: clave, version: Number.isInteger(v) && v > 0 ? v : undefined }));
  const fecha = doc?.contenido.fechaEntrega;

  return (
    <article className="relative mx-auto flex max-w-4xl flex-col gap-4 bg-superficie p-4 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {fecha && (
            <Link href={`/entregas/remitos?fecha=${fecha}`} className="text-texto-suave hover:underline">
              ← Remitos del día
            </Link>
          )}
          {sesion.permisos.includes("entregas.ver") ? (
            <Link href={`/entregas/${id}`} className="text-texto-suave hover:underline">
              Ver la entrega
            </Link>
          ) : (
            <Link href="/repartos/mios" className="text-texto-suave hover:underline">
              Mi reparto
            </Link>
          )}
        </div>
        {doc?.tipo === "DOC_02" && (
          <Link href={`/entregas/${id}/documento/${tipo}?v=${doc.version}${dosCopias ? "" : "&copias=2"}`} className="underline-offset-4 hover:underline">
            {dosCopias ? "Una copia" : "Dos copias (cliente y negocio)"}
          </Link>
        )}
        {doc && <BotonImprimir automatico={parametro(f.imprimir) === "1"} />}
      </div>
      {!doc ? (
        <p>Todavía no se hizo el remito de esta entrega: se hace solo al marcarla preparada.</p>
      ) : (
        <>
          {(doc.estado !== "VIGENTE" || doc.version < doc.vigente) && (
            <p className="border-2 border-error p-2 text-center text-lg font-bold text-error">{doc.estado === "ANULADO" ? "ANULADO" : `REEMPLAZADO — ver versión ${doc.vigente}`}</p>
          )}
          {doc.tipo === "DOC_02" ? (
            dosCopias ? (
              <>
                <ListaEntrega c={doc.contenido} zona={sesion.zonaHoraria} copia="ORIGINAL — CLIENTE" />
                <ListaEntrega c={doc.contenido} zona={sesion.zonaHoraria} copia="DUPLICADO — NEGOCIO" />
              </>
            ) : (
              <ListaEntrega c={doc.contenido} zona={sesion.zonaHoraria} copia={null} />
            )
          ) : (
            <ListaContable c={doc.contenido} zona={sesion.zonaHoraria} />
          )}
        </>
      )}
    </article>
  );
}
