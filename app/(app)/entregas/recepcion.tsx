"use client";

import { useState } from "react";

import { Etiqueta } from "@/ui/formularios";

// Quién recibió la entrega. Arriba quedan, como botones, las personas que ya recibieron antes en
// ese cliente (pedido del usuario, 07/10/2026: que no sea tedioso): un toque completa el nombre y
// el cargo. Si es otra persona, se escribe y queda para la próxima.

export interface QuienRecibio {
  nombre: string;
  cargo: string | null;
}

const control = "h-12 rounded-lg border border-borde bg-superficie px-3 text-base";

export function Recepcion({ requiereFirma, anteriores = [] }: { requiereFirma?: boolean; anteriores?: QuienRecibio[] }) {
  const [nombre, setNombre] = useState("");
  const [cargo, setCargo] = useState("");
  const elegido = (p: QuienRecibio) => p.nombre === nombre.trim() && (p.cargo ?? "") === cargo.trim();
  return (
    <div className="flex flex-col gap-3">
      {anteriores.length > 0 && (
        <div className="flex flex-col gap-1.5" role="group" aria-label="Quién recibió otras veces">
          <span className="font-medium">¿Quién recibió? Tocá el nombre:</span>
          <div className="flex flex-wrap gap-2">
            {anteriores.map((p) => (
              <button
                key={`${p.nombre}|${p.cargo ?? ""}`}
                type="button"
                aria-pressed={elegido(p)}
                onClick={() => {
                  setNombre(p.nombre);
                  setCargo(p.cargo ?? "");
                }}
                className={`flex min-h-12 flex-col items-start justify-center rounded-xl border-2 px-4 text-left leading-tight ${elegido(p) ? "border-marca bg-marca text-marca-texto" : "border-borde bg-superficie hover:border-marca"}`}
              >
                <b>{p.nombre}</b>
                {p.cargo && <span className="text-sm">{p.cargo}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <Etiqueta texto={anteriores.length > 0 ? "O escribí quién recibió" : "Recibió"} obligatorio />
          <input name="recibidoPor" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" autoComplete="off" required className={control} />
        </label>
        <label className="flex flex-col gap-1">
          <Etiqueta texto="Cargo (opcional)" />
          <input name="recibidoCargo" value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Ej. dueño, jefa de cocina" autoComplete="off" className={control} />
        </label>
      </div>
      {requiereFirma && <p className="text-sm text-texto-suave">Este cliente pide el remito firmado: guardá el duplicado firmado.</p>}
    </div>
  );
}
