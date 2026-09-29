import { tiempoRelativo } from "@/dominio/colaboracion/tiempo";
import type { NotaVisible } from "@/modulos/colaboracion/notas";
import type { PersonaVisible } from "@/modulos/colaboracion/personas";
import type { TipoEntidad } from "@/modulos/colaboracion/registro";
import { Avatar } from "@/ui/avatar";
import { BotonAccion } from "@/ui/boton-accion";
import { FormularioAccion } from "@/ui/formulario-accion";

import { borrarNotaAccion, escribirNotaAccion } from "./acciones";
import { MarcarLeidas } from "./marcar-leidas";

// Notas de una tarjeta o ficha, como los comentarios de Trello: arriba se escribe (para todos o
// para alguien), abajo lo último primero, con quién la escribió, para quién y quién la leyó.

export function HiloDeNotas({
  entidadTipo,
  entidadId,
  notas,
  personas,
  yo,
  zonaHoraria,
}: {
  entidadTipo: TipoEntidad;
  entidadId: string;
  notas: NotaVisible[];
  personas: PersonaVisible[];
  yo: string;
  zonaHoraria: string;
}) {
  const ahora = new Date();
  const otros = personas.filter((p) => p.id !== yo);
  const mia = personas.find((p) => p.id === yo);
  const sinLeer = notas.some((n) => !n.leida);

  return (
    <div className="flex flex-col gap-3">
      <MarcarLeidas entidadTipo={entidadTipo} entidadId={entidadId} hay={sinLeer} />
      <div className="flex gap-2">
        {mia && <Avatar persona={mia} />}
        <FormularioAccion accion={escribirNotaAccion} boton="Guardar" className="flex min-w-0 flex-1 flex-col gap-2">
          <input type="hidden" name="entidadTipo" value={entidadTipo} />
          <input type="hidden" name="entidadId" value={entidadId} />
          <textarea
            name="texto"
            rows={2}
            required
            maxLength={2000}
            placeholder={otros.length === 1 ? `Escribile algo a ${otros[0]!.nombre.split(" ")[0]}…` : "Escribí una nota…"}
            className="rounded-lg border border-borde bg-tarjeta px-3 py-2 text-base text-tarjeta-texto shadow-tarjeta"
          />
          <label className="flex items-center gap-2 text-sm text-tarjeta-suave">
            Para
            <select name="para" defaultValue={otros.length === 1 ? otros[0]!.id : ""} className="h-9 rounded-lg border border-borde bg-tarjeta px-2 text-tarjeta-texto">
              <option value="">Todos</option>
              {otros.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
        </FormularioAccion>
      </div>
      {notas.length === 0 ? (
        <p className="text-sm text-tarjeta-suave">Todavía no hay notas.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {[...notas].reverse().map((n) => (
            <li key={n.id} className="flex gap-2">
              <Avatar persona={n.autor} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="text-sm text-tarjeta-suave">
                  <b className="text-tarjeta-texto">{n.autor.nombre}</b>
                  {n.para && <> para {n.para.id === yo ? "vos" : n.para.nombre}</>} · {tiempoRelativo(n.en, ahora, zonaHoraria)}
                  {!n.leida && <span className="ml-2 rounded-full bg-[var(--etiqueta-azul)] px-2 py-0.5 text-xs font-semibold text-etiqueta-texto">nueva</span>}
                </p>
                <p className="rounded-lg bg-tarjeta px-3 py-2 break-words whitespace-pre-line text-tarjeta-texto shadow-tarjeta">{n.texto}</p>
                {n.mia && (
                  <div className="flex items-center gap-3 text-xs text-tarjeta-suave">
                    {n.leidaPor.length > 0 && <span>✓✓ La leyó {n.leidaPor.map((p) => p.nombre.split(" ")[0]).join(", ")}</span>}
                    <BotonAccion accion={borrarNotaAccion} datos={{ notaId: n.id }} confirmar="¿Borrar esta nota?" className="underline underline-offset-2 hover:text-tarjeta-texto">
                      Borrar
                    </BotonAccion>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
