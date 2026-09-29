"use client";

import { useState } from "react";

import { FormularioAccion } from "@/ui/formulario-accion";
import { Pregunta, campoGrande, opcion } from "@/ui/guiado";

import { crearProveedorAccion } from "../acciones";

// Alta de un proveedor en tres preguntas (nombre y puesto, cómo se le paga, teléfono). Los datos
// fiscales y bancarios quedan plegados en "Más datos".

const PLAZOS = [
  { texto: "Sin plazo fijo", dias: "" },
  { texto: "A la semana", dias: "7" },
  { texto: "A los 15 días", dias: "15" },
  { texto: "A los 30 días", dias: "30" },
] as const;

export function FormularioProveedor({ editarCredito }: { editarCredito: boolean }) {
  const [nombre, setNombre] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [condicion, setCondicion] = useState<"CONTADO" | "CREDITO">("CREDITO");
  const [plazo, setPlazo] = useState("");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <FormularioAccion accion={crearProveedorAccion} boton="Crear el proveedor" className="flex flex-col gap-4">
        <input type="hidden" name="condicionPagoHabitual" value={condicion} />

        <Pregunta n={1} titulo="¿Cómo se llama y dónde está?" ayuda="El nombre del puesto o del mayorista, y dónde encontrarlo en el mercado.">
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="nombre" required autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Hnos. García" aria-label="Nombre del proveedor" className={campoGrande} />
            <input name="ubicacionMercado" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Ej. Nave 2, puesto 14" aria-label="Dónde está en el mercado" className={campoGrande} />
          </div>
        </Pregunta>

        <Pregunta n={2} titulo="¿Cómo le pagás normalmente?" ayuda="Es lo que se propone al registrar una compra; en cada compra se puede cambiar.">
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => setCondicion("CONTADO")} aria-pressed={condicion === "CONTADO"} className={`${opcion(condicion === "CONTADO")} flex-col items-start`}>
              <span className="font-semibold">💵 En el momento</span>
              <span className="text-sm text-texto-suave">Se le paga cada compra al contado.</span>
            </button>
            <button type="button" onClick={() => setCondicion("CREDITO")} aria-pressed={condicion === "CREDITO"} className={`${opcion(condicion === "CREDITO")} flex-col items-start`}>
              <span className="font-semibold">📒 A cuenta</span>
              <span className="text-sm text-texto-suave">Se le va debiendo y se le paga después.</span>
            </button>
          </div>
          {condicion === "CREDITO" && editarCredito && (
            <div className="flex flex-col gap-3 rounded-xl bg-fondo p-3">
              <label className="flex flex-col gap-1">
                <span className="font-medium">¿Hasta cuánto se le puede deber? ($)</span>
                <input name="limiteCredito" inputMode="decimal" placeholder="Vacío = sin límite" className={`${campoGrande} max-w-xs`} />
                <span className="text-sm text-texto-suave">El sistema avisa cuando te acercás y frena una compra que lo pase.</span>
              </label>
              <input type="hidden" name="plazoPagoDias" value={plazo} />
              <p className="font-medium">¿En cuánto tiempo hay que pagarle?</p>
              <div className="flex flex-wrap gap-2">
                {PLAZOS.map((p) => (
                  <button key={p.texto} type="button" onClick={() => setPlazo(p.dias)} aria-pressed={plazo === p.dias} className={opcion(plazo === p.dias)}>
                    {p.texto}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Pregunta>

        <Pregunta n={3} titulo="¿A qué teléfono se le escribe?" ayuda="Opcional.">
          <input name="telefono" type="tel" placeholder="Ej. 11 5555-1234" aria-label="Teléfono" className={`${campoGrande} max-w-xs`} />
        </Pregunta>

        <details className="rounded-2xl border border-borde bg-superficie p-4">
          <summary className="cursor-pointer text-lg font-semibold">Más datos (opcional): contacto, CUIT, banco</summary>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="font-medium">Persona de contacto</span>
              <input name="contactoNombre" className={campoGrande} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium">CBU o alias para transferir</span>
              <input name="datosBancarios" className={campoGrande} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium">Razón social</span>
              <input name="razonSocial" className={campoGrande} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium">CUIT</span>
              <input name="identificacionFiscal" className={campoGrande} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium">Correo</span>
              <input name="email" type="email" className={campoGrande} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium">Dirección (fuera del mercado)</span>
              <input name="direccion" className={campoGrande} />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="font-medium">Notas</span>
              <textarea name="observaciones" rows={2} className="rounded-xl border-2 border-borde bg-superficie px-3 py-2" />
            </label>
          </div>
        </details>
      </FormularioAccion>

      <aside className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
        <p className="text-sm font-semibold text-texto-suave">Así va a quedar</p>
        <div className="flex items-start gap-3 rounded-2xl border border-borde bg-superficie p-4 shadow-sm">
          <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-fondo text-3xl">
            🏪
          </span>
          <div className="min-w-0">
            <p className="text-lg font-semibold">{nombre.trim() || "Nombre del proveedor"}</p>
            {ubicacion.trim() && <p className="text-sm text-texto-suave">{ubicacion.trim()}</p>}
            <p className="text-sm text-texto-suave">{condicion === "CONTADO" ? "💵 Se le paga en el momento" : "📒 Se le paga a cuenta"}</p>
          </div>
        </div>
        <p className="text-sm text-texto-suave">Después de crearlo, en su ficha le cargás qué productos vende y a qué precio (o se cargan solos con la primera compra).</p>
      </aside>
    </div>
  );
}
