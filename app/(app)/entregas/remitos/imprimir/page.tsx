import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { documentosDelDia } from "@/modulos/entregas/entregas";
import { jornadaEnCurso } from "@/modulos/pedidos/jornadas";
import { diaElegido } from "@/ui/dia-elegido";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { BotonImprimir } from "@/ui/boton-imprimir";
import { fechaConDia } from "@/ui/etiquetas";
import { parametro } from "@/ui/parametros";

import { ListaContable, ListaEntrega } from "../../documentos-impresos";

export const metadata: Metadata = { title: "Imprimir remitos · Sistema Repartos" };

/**
 * Todos los remitos del día juntos, en el orden del reparto: las listas de entrega (DOC-02, sin
 * precios; una o dos copias) o las listas contables (DOC-03). Solo la versión vigente de cada una.
 * Con `?imprimir=1` abre el diálogo de impresión al cargar.
 */
export default async function ImprimirRemitos({ searchParams }: PageProps<"/entregas/remitos/imprimir">) {
  const f = await searchParams;
  const contable = parametro(f.tipo) === "contable";
  const sesion = await sesionParaPantalla(contable ? "documentos.imprimir_contable" : "documentos.imprimir_entrega");
  const db = obtenerBaseDatos();
  const pedida = parametro(f.fecha);
  const fecha = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : ((await diaElegido()) ?? (await jornadaEnCurso(db, sesion.authUserId)));
  const dosCopias = !contable && parametro(f.copias) === "2";
  const documentos = await documentosDelDia(db, sesion.authUserId, { fecha, tipo: contable ? "DOC_03" : "DOC_02" });
  const base = `/entregas/remitos/imprimir?fecha=${fecha}`;

  return (
    <article className="relative mx-auto flex max-w-4xl flex-col gap-4 bg-superficie p-4 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/entregas/remitos?fecha=${fecha}`} className="text-texto-suave hover:underline">
          ← Remitos del día
        </Link>
        <p className="text-2xl font-extrabold">
          {contable ? "Listas contables" : "Remitos"} del {fechaConDia(fecha)} <span className="text-base font-semibold">· {documentos.length}</span>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {!contable && (
            <Link href={dosCopias ? base : `${base}&copias=2`} className="underline-offset-4 hover:underline">
              {dosCopias ? "Una copia" : "Dos copias (cliente y negocio)"}
            </Link>
          )}
          {sesion.permisos.includes("documentos.imprimir_contable") && (
            <Link href={contable ? base : `${base}&tipo=contable`} className="underline-offset-4 hover:underline">
              {contable ? "Remitos sin precios" : "Listas contables (con precios)"}
            </Link>
          )}
          {documentos.length > 0 && <BotonImprimir automatico={parametro(f.imprimir) === "1"} />}
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
                <ListaEntrega c={d.contenido} zona={sesion.zonaHoraria} copia="DUPLICADO — NEGOCIO" />
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
