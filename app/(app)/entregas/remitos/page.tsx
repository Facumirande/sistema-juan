import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { documentoDeEntrega, entregasConDocumentos, type DocumentoDeEntrega } from "@/modulos/entregas/entregas";
import { jornadaEnCurso } from "@/modulos/pedidos/jornadas";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { BotonImprimir } from "@/ui/boton-imprimir";
import { fechaConDia } from "@/ui/etiquetas";
import { parametro } from "@/ui/parametros";

import { ListaContable, ListaEntrega } from "../documentos-impresos";

export const metadata: Metadata = { title: "Remitos del día · Sistema Repartos" };

/**
 * Todos los remitos del día juntos, en el orden del reparto: las listas de entrega (DOC-02, sin
 * precios; una o dos copias) o las listas contables (DOC-03). Solo la versión vigente de cada una.
 */
export default async function RemitosDelDia({ searchParams }: PageProps<"/entregas/remitos">) {
  const f = await searchParams;
  const contable = parametro(f.tipo) === "contable";
  const sesion = await sesionParaPantalla(contable ? "documentos.imprimir_contable" : "documentos.imprimir_entrega");
  const db = obtenerBaseDatos();
  const pedida = parametro(f.fecha);
  const fecha = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : await jornadaEnCurso(db, sesion.authUserId);
  const dosCopias = !contable && parametro(f.copias) === "2";
  const ids = await entregasConDocumentos(db, sesion.authUserId, fecha);
  const documentos: DocumentoDeEntrega[] = [];
  for (const id of ids) {
    const d = await documentoDeEntrega(db, sesion.authUserId, { entregaId: id, tipo: contable ? "DOC_03" : "DOC_02" });
    if (d && d.version === d.vigente && d.estado === "VIGENTE") documentos.push(d);
  }
  const base = `/entregas/remitos?fecha=${fecha}`;

  return (
    <article className="relative mx-auto flex max-w-4xl flex-col gap-4 bg-superficie p-4 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/inicio?fecha=${fecha}`} className="text-texto-suave hover:underline">
          ← Hoy
        </Link>
        <p className="font-semibold">
          {contable ? "Listas contables" : "Remitos"} del {fechaConDia(fecha)}: {documentos.length}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {!contable && (
            <Link href={dosCopias ? base : `${base}&copias=2`} className="underline-offset-4 hover:underline">
              {dosCopias ? "Una copia" : "Dos copias (cliente y empresa)"}
            </Link>
          )}
          {sesion.permisos.includes("documentos.imprimir_contable") && (
            <Link href={contable ? base : `${base}&tipo=contable`} className="underline-offset-4 hover:underline">
              {contable ? "Remitos sin precios" : "Listas contables (con precios)"}
            </Link>
          )}
          {documentos.length > 0 && <BotonImprimir />}
        </div>
      </div>
      {documentos.length === 0 ? (
        <p>Todavía no hay remitos para este día: se hacen al marcar preparado cada cliente.</p>
      ) : (
        documentos.map((d, i) =>
          d.tipo === "DOC_02" ? (
            dosCopias ? (
              <div key={i} className="flex flex-col gap-4">
                <ListaEntrega c={d.contenido} zona={sesion.zonaHoraria} copia="ORIGINAL — CLIENTE" />
                <ListaEntrega c={d.contenido} zona={sesion.zonaHoraria} copia="DUPLICADO — EMPRESA" />
              </div>
            ) : (
              <ListaEntrega key={i} c={d.contenido} zona={sesion.zonaHoraria} copia={null} />
            )
          ) : (
            <div key={i} className="break-after-page">
              <ListaContable c={d.contenido} zona={sesion.zonaHoraria} />
            </div>
          ),
        )
      )}
    </article>
  );
}
