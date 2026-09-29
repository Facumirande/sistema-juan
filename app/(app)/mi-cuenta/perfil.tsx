"use client";

import { useState } from "react";

import { PALETA_AVATAR, iniciales, nombreCorto } from "@/dominio/colaboracion/personas";
import { Avatar } from "@/ui/avatar";
import { FormularioAccion } from "@/ui/formulario-accion";

import { cambiarMiPerfilAccion } from "./acciones";

/** Nombre y color del avatar, con la vista previa de cómo te ven los demás en las tarjetas y las notas. */
export function FormularioPerfil({ nombre, color, otras }: { nombre: string; color: string; otras: { nombre: string; color: string }[] }) {
  const [nombreVista, setNombreVista] = useState(nombre);
  const [colorVista, setColorVista] = useState(color);
  return (
    <FormularioAccion accion={cambiarMiPerfilAccion} boton="Guardar perfil">
      <div className="flex items-center gap-3 rounded-lg bg-fondo p-3">
        <Avatar persona={{ nombre: nombreVista || "?", color: colorVista }} tamano="grande" />
        <p className="text-sm text-texto-suave">
          Así te ven en las tarjetas, las notas y la actividad: <b className="text-texto">{nombreVista || "…"}</b>
        </p>
      </div>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Tu nombre</span>
        <input name="nombre" defaultValue={nombre} onChange={(e) => setNombreVista(e.target.value)} maxLength={80} className="h-12 rounded-lg border border-borde bg-superficie px-3 text-base" />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">Tu color</legend>
        <div className="flex flex-wrap gap-2">
          {PALETA_AVATAR.map((p) => {
            const usan = otras.filter((o) => o.color === p.color);
            const quien = usan.map((o) => nombreCorto(o.nombre)).join(" y ");
            return (
              <label key={p.color} className="cursor-pointer" title={quien ? `${p.nombre} (lo usa ${quien})` : p.nombre}>
                <input type="radio" name="color" value={p.color} defaultChecked={p.color === color} onChange={() => setColorVista(p.color)} className="peer sr-only" />
                <span
                  className="flex size-11 items-center justify-center rounded-full text-xs font-semibold text-white ring-offset-2 ring-offset-superficie peer-checked:ring-4 peer-checked:ring-texto peer-focus-visible:ring-4 peer-focus-visible:ring-marca"
                  style={{ background: p.color }}
                >
                  {usan[0] && <span aria-hidden>{iniciales(usan[0].nombre)}</span>}
                  <span className="sr-only">{quien ? `${p.nombre}, lo usa ${quien}` : p.nombre}</span>
                </span>
              </label>
            );
          })}
        </div>
        {otras.length > 0 && <p className="text-sm text-texto-suave">Los que tienen letras ya los usa otra persona: mejor elegí uno distinto, así se nota quién hizo cada cosa.</p>}
      </fieldset>
    </FormularioAccion>
  );
}
