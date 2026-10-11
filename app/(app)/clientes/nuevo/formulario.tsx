"use client";

import { useState } from "react";

import { dibujoDeCliente } from "@/ui/etiquetas-tablero";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Pregunta, campoGrande, opcion } from "@/ui/guiado";

import { BuscadorDeLugar } from "../../viaje/buscador-de-lugar";
import { crearClienteAccion } from "../acciones";

// Alta de un cliente en tres preguntas (nombre y tipo, dónde se entrega, teléfono). Lo demás es
// opcional y queda plegado en "Más opciones", con valores por defecto razonables.

const TIPOS = [
  { valor: "COMERCIO", texto: "Comercio" },
  { valor: "RESTAURANTE", texto: "Restaurante" },
  { valor: "HOSPITAL", texto: "Hospital" },
  { valor: "INSTITUCION", texto: "Institución" },
  { valor: "OTRO", texto: "Otro" },
] as const;

const HORARIOS = [
  { texto: "Cuando sea", desde: "", hasta: "" },
  { texto: "Temprano (6 a 9)", desde: "06:00", hasta: "09:00" },
  { texto: "A la mañana (8 a 12)", desde: "08:00", hasta: "12:00" },
  { texto: "A la tarde (14 a 18)", desde: "14:00", hasta: "18:00" },
] as const;

const PRIORIDADES = [
  { valor: "1", texto: "Primero", ayuda: "ej. un hospital" },
  { valor: "3", texto: "Normal", ayuda: "" },
  { valor: "5", texto: "Al final", ayuda: "" },
] as const;

const FACTURACION = [
  { valor: "POR_ENTREGA", texto: "En cada entrega" },
  { valor: "SEMANAL", texto: "Por semana" },
  { valor: "QUINCENAL", texto: "Por quincena" },
  { valor: "MENSUAL", texto: "Por mes" },
] as const;

export function FormularioCliente() {
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<string>("COMERCIO");
  const [direccion, setDireccion] = useState("");
  const [ubicacion, setUbicacion] = useState<{ lat: number; lng: number } | null>(null);
  const [horario, setHorario] = useState(0);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [otroHorario, setOtroHorario] = useState(false);
  const [prioridad, setPrioridad] = useState("3");
  const [facturacion, setFacturacion] = useState("POR_ENTREGA");
  const recibe = otroHorario ? { desde, hasta } : HORARIOS[horario]!;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <FormularioAccion accion={crearClienteAccion} boton="Crear el cliente" className="flex flex-col gap-4">
        <input type="hidden" name="tipoCliente" value={tipo} />
        <input type="hidden" name="punto_nombre" value="Principal" />
        <input type="hidden" name="punto_horarioDesde" value={recibe.desde} />
        <input type="hidden" name="punto_horarioHasta" value={recibe.hasta} />
        <input type="hidden" name="prioridadFaltantes" value={prioridad} />
        <input type="hidden" name="periodicidadFacturacion" value={facturacion} />

        <Pregunta n={1} titulo="¿Cómo se llama y qué es?">
          <input name="nombre" required autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Restaurante La Esquina" aria-label="Nombre del cliente" className={campoGrande} />
          <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de cliente">
            {TIPOS.map((t) => (
              <button key={t.valor} type="button" onClick={() => setTipo(t.valor)} aria-pressed={tipo === t.valor} className={opcion(tipo === t.valor)}>
                <span aria-hidden className="text-2xl">
                  {dibujoDeCliente(t.valor)}
                </span>
                {t.texto}
              </button>
            ))}
          </div>
        </Pregunta>

        <Pregunta n={2} titulo="¿Dónde se le entrega?" ayuda="Sin una dirección no se le pueden cargar pedidos. Después, en su ficha, podés marcarla en el mapa o agregar otra.">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            {/* Mientras se escribe aparecen los lugares de Tucumán; el elegido deja marcada la ubicación. */}
            <input type="hidden" name="punto_direccion" value={direccion} />
            {ubicacion && (
              <>
                <input type="hidden" name="punto_lat" value={ubicacion.lat} />
                <input type="hidden" name="punto_lng" value={ubicacion.lng} />
              </>
            )}
            <div className="flex flex-col gap-1">
              <BuscadorDeLugar
                valor={direccion}
                alCambiar={(t) => {
                  setDireccion(t);
                  setUbicacion(null);
                }}
                alElegir={(l) => {
                  setDireccion(l.etiqueta);
                  setUbicacion(l.coordenada);
                }}
                etiqueta="Dirección de entrega"
                placeholder="Calle y número (elegí de la lista para marcar la ubicación)"
              />
              <span className={`text-sm ${ubicacion ? "font-semibold text-marca" : "text-texto-suave"}`}>{ubicacion ? "✓ Ubicación marcada: va a aparecer bien en el recorrido." : "Elegí la dirección de la lista para que quede marcada en el mapa."}</span>
            </div>
            <input name="punto_localidad" placeholder="Localidad (ej. Yerba Buena)" aria-label="Localidad" className={campoGrande} />
          </div>
          <p className="font-medium">¿A qué hora recibe?</p>
          <div className="flex flex-wrap gap-2">
            {HORARIOS.map((h, i) => (
              <button
                key={h.texto}
                type="button"
                onClick={() => {
                  setHorario(i);
                  setOtroHorario(false);
                }}
                aria-pressed={!otroHorario && horario === i}
                className={opcion(!otroHorario && horario === i)}
              >
                {h.texto}
              </button>
            ))}
            <button type="button" onClick={() => setOtroHorario(true)} aria-pressed={otroHorario} className={opcion(otroHorario)}>
              Otro horario…
            </button>
          </div>
          {otroHorario && (
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2">
                Desde <input type="time" value={desde} onChange={(e) => setDesde(e.target.value)} className={campoGrande} />
              </label>
              <label className="flex items-center gap-2">
                Hasta <input type="time" value={hasta} onChange={(e) => setHasta(e.target.value)} className={campoGrande} />
              </label>
            </div>
          )}
        </Pregunta>

        <Pregunta n={3} titulo="¿A qué teléfono se le escribe?" ayuda="Opcional. Sirve para llamarlo desde el reparto.">
          <input name="telefono" type="tel" placeholder="Ej. 11 5555-1234" aria-label="Teléfono" className={`${campoGrande} max-w-xs`} />
        </Pregunta>

        <details className="rounded-2xl border border-borde bg-superficie p-4">
          <summary className="cursor-pointer text-lg font-semibold">Más opciones (se pueden dejar como están)</summary>
          <div className="mt-4 flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <p className="font-medium">Si falta mercadería, ¿a quién se le completa primero?</p>
              <div className="flex flex-wrap gap-2">
                {PRIORIDADES.map((p) => (
                  <button key={p.valor} type="button" onClick={() => setPrioridad(p.valor)} aria-pressed={prioridad === p.valor} className={opcion(prioridad === p.valor)}>
                    {p.texto}
                    {p.ayuda && <span className="text-sm text-texto-suave">({p.ayuda})</span>}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <p className="font-medium">¿Cada cuánto se le hace el comprobante de venta?</p>
              <div className="flex flex-wrap gap-2">
                {FACTURACION.map((f) => (
                  <button key={f.valor} type="button" onClick={() => setFacturacion(f.valor)} aria-pressed={facturacion === f.valor} className={opcion(facturacion === f.valor)}>
                    {f.texto}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-3">
                <input type="checkbox" name="aceptaSustituciones" defaultChecked className="size-5" /> Si falta un producto, acepta que se le mande otro parecido
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" name="requiereFirma" className="size-5" /> Hay que traer el remito firmado
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" name="requiereOrdenCompra" className="size-5" /> Trabaja con número de orden de compra
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="font-medium">Persona de contacto</span>
                <input name="contactoNombre" className={campoGrande} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-medium">Cómo llegar (sale en el remito)</span>
                <input name="punto_referencias" placeholder="Ej. entrada por la calle lateral" className={campoGrande} />
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
                <span className="font-medium">Correo para los remitos con precios</span>
                <input name="emailContable" type="email" className={campoGrande} />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="font-medium">Notas sobre el cliente</span>
              <textarea name="observaciones" rows={2} className="rounded-xl border-2 border-borde bg-superficie px-3 py-2" />
            </label>
          </div>
        </details>
      </FormularioAccion>

      <aside className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
        <p className="text-sm font-semibold text-texto-suave">Así va a quedar</p>
        <div className="flex items-start gap-3 rounded-2xl border border-borde bg-superficie p-4 shadow-sm">
          <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-fondo text-3xl">
            {dibujoDeCliente(tipo)}
          </span>
          <div className="min-w-0">
            <p className="text-lg font-semibold">{nombre.trim() || "Nombre del cliente"}</p>
            <p className="text-sm text-texto-suave">📍 {direccion.trim() || "Falta dónde se entrega"}</p>
            {(recibe.desde || recibe.hasta) && (
              <p className="text-sm text-texto-suave">
                🕘 Recibe {recibe.desde || "?"}–{recibe.hasta || "?"}
              </p>
            )}
          </div>
        </div>
        <p className="text-sm text-texto-suave">Después de crearlo podés cargarle pedidos y, en su ficha, marcar la dirección en el mapa o pactarle precios.</p>
      </aside>
    </div>
  );
}
