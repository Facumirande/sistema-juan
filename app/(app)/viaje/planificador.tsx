"use client";

import { startTransition, useActionState, useMemo, useState, useTransition } from "react";

import { enlaceWaze, enlacesGoogleMaps, type DestinoGps } from "@/dominio/entregas/navegacion";
import { estimarTramo, planearRecorrido, type Coordenada } from "@/dominio/entregas/recorrido";
import { leerCoordenadas } from "@/dominio/entregas/ubicacion";
import { ESTADO_INICIAL } from "@/ui/estado-accion";
import { FlechaNavegacion } from "@/ui/iconos";

import { armarRepartoAccion, buscarEnMapaAccion, guardarOrdenAccion, leerEnlaceAccion } from "./acciones";

// Planificador del viaje de entrega: el mejor orden de las paradas (con la primera elegida a mano
// si se quiere), los kilómetros y minutos aproximados de cada tramo, y el GPS para ir.

export interface ParadaPlan {
  id: string;
  cliente: string;
  punto: string;
  direccion: string;
  localidad: string | null;
  coordenada: Coordenada | null;
  horario: string | null;
  telefono: string | null;
  /** Ya entregada: queda primera, fuera del cálculo y del GPS. */
  hecha: boolean;
}

type Guardar = { tipo: "reparto"; repartoId: string } | { tipo: "armar"; fecha: string } | null;

const duracion = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`);
const km = (n: number) => `${n.toFixed(1).replace(".", ",")} km`;
const nombres = (ps: ParadaPlan[]) => ps.map((p) => (p.punto && p.punto !== p.cliente ? `${p.cliente} (${p.punto})` : p.cliente)).join(", ");
const destino = (p: ParadaPlan): DestinoGps => ({ coordenada: p.coordenada, direccion: p.direccion, localidad: p.localidad });

export function PlanificadorDeViaje({ paradas, salida, guardar }: { paradas: ParadaPlan[]; salida: { coordenada: Coordenada | null; direccion: string | null }; guardar: Guardar }) {
  // Sin un orden guardado (entregas todavía sin reparto), arranca ya con el mejor recorrido.
  const [orden, setOrden] = useState(() => {
    if (guardar?.tipo !== "armar" || !salida.coordenada) return paradas.map((p) => p.id);
    const r = planearRecorrido(
      paradas.filter((p) => !p.hecha).map((p) => ({ id: p.id, coordenada: p.coordenada })),
      { salida: salida.coordenada, primeraId: null, volver: false },
    );
    return [...paradas.filter((p) => p.hecha).map((p) => p.id), ...r.orden];
  });
  // De dónde se sale: del depósito, de donde está el celular ahora o de otra dirección que se busca.
  const [modo, setModo] = useState<"salida" | "gps" | "otra">(salida.coordenada ? "salida" : "gps");
  const origen = modo === "salida" ? "salida" : "aca";
  const [aca, setAca] = useState<Coordenada | null>(null);
  const [acaTexto, setAcaTexto] = useState("donde estás ahora");
  const [otra, setOtra] = useState("");
  const [lugares, setLugares] = useState<{ etiqueta: string; coordenada: Coordenada }[]>([]);
  const [buscando, empezar] = useTransition();
  const [primera, setPrimera] = useState("");
  const [volver, setVolver] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cambiado, setCambiado] = useState(false);
  const [estadoGuardar, guardarOrden, guardando] = useActionState(guardar?.tipo === "armar" ? armarRepartoAccion : guardarOrdenAccion, ESTADO_INICIAL);

  const porId = useMemo(() => new Map(paradas.map((p) => [p.id, p])), [paradas]);
  const enOrden = orden.map((id) => porId.get(id)!).filter(Boolean);
  const hechas = enOrden.filter((p) => p.hecha);
  const pendientes = enOrden.filter((p) => !p.hecha);
  const inicio = origen === "salida" ? salida.coordenada : aca;
  const sinUbicacion = pendientes.filter((p) => !p.coordenada);

  const tramos = useMemo(() => {
    const puntos = [inicio, ...pendientes.map((p) => p.coordenada)];
    const lista = pendientes.map((_, i) => {
      const desde = puntos[i];
      const hasta = puntos[i + 1];
      return desde && hasta ? estimarTramo(desde, hasta) : null;
    });
    const ultimo = puntos[puntos.length - 1];
    const vuelta = volver && salida.coordenada && ultimo ? estimarTramo(ultimo, salida.coordenada) : null;
    return { lista, vuelta };
  }, [inicio, pendientes, volver, salida.coordenada]);
  const total = [...tramos.lista, tramos.vuelta].reduce((s, t) => ({ km: s.km + (t?.km ?? 0), min: s.min + (t?.minutos ?? 0) }), { km: 0, min: 0 });

  const calcular = () => {
    if (origen === "aca" && !aca) {
      setAviso(modo === "otra" ? "Primero escribí la dirección de donde salís y tocá Buscar." : "Todavía no sé dónde estás: tocá de nuevo “De donde estoy ahora” y permití la ubicación, o elegí otra forma de salir.");
      return;
    }
    const r = planearRecorrido(
      pendientes.map((p) => ({ id: p.id, coordenada: p.coordenada })),
      { salida: inicio, primeraId: primera || null, volver: volver && origen === "salida" },
    );
    setOrden([...hechas.map((p) => p.id), ...r.orden]);
    setCambiado(true);
    setAviso(sinUbicacion.length ? `${sinUbicacion.length === 1 ? "No tiene" : "No tienen"} la ubicación marcada: ${nombres(sinUbicacion)}. ${sinUbicacion.length === 1 ? "Va" : "Van"} al final del recorrido.` : null);
  };
  const salirDe = (c: Coordenada, texto: string) => {
    setAca(c);
    setAcaTexto(texto);
    setLugares([]);
    setAviso(null);
  };
  const dondeEstoy = () => {
    setModo("gps");
    setAca(null);
    if (!navigator.geolocation) {
      setAviso("Este aparato no tiene GPS disponible en el navegador. Elegí “De otra dirección” y escribila.");
      return;
    }
    setAviso("Buscando dónde estás…");
    navigator.geolocation.getCurrentPosition(
      (p) => salirDe({ lat: p.coords.latitude, lng: p.coords.longitude }, "donde estás ahora"),
      () => setAviso("No se pudo saber dónde estás: permití la ubicación en el navegador y tocá de nuevo, o elegí “De otra dirección”."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  const buscarOtra = () =>
    empezar(async () => {
      const pegada = leerCoordenadas(otra) ?? (/^https?:/i.test(otra.trim()) ? await leerEnlaceAccion(otra) : null);
      if (pegada) return salirDe(pegada, "la ubicación que pegaste");
      const r = await buscarEnMapaAccion(otra);
      setLugares(r.lugares);
      setAviso(r.mensaje);
    });
  const mover = (id: string, paso: -1 | 1) => {
    const i = orden.indexOf(id);
    const j = i + paso;
    if (j < 0 || j >= orden.length || porId.get(orden[j]!)?.hecha) return;
    const nuevo = [...orden];
    [nuevo[i], nuevo[j]] = [nuevo[j]!, nuevo[i]!];
    setOrden(nuevo);
    setCambiado(true);
  };
  const enviarOrden = () => {
    const fd = new FormData();
    if (guardar?.tipo === "reparto") fd.append("repartoId", guardar.repartoId);
    if (guardar?.tipo === "armar") fd.append("fecha", guardar.fecha);
    for (const id of orden) fd.append("parada", id);
    startTransition(() => guardarOrden(fd));
  };
  const enlaces = enlacesGoogleMaps(pendientes.map(destino));
  const boton = "min-h-10 rounded-lg border border-borde bg-superficie px-3 text-sm font-semibold hover:border-marca disabled:opacity-60";

  const opcion = (activa: boolean) => `flex min-h-16 flex-col items-start justify-center rounded-xl border-2 px-4 py-2 text-left disabled:opacity-50 ${activa ? "border-marca bg-marca/10" : "border-borde bg-superficie hover:border-marca/60"}`;

  if (paradas.length === 0) return <p className="text-texto-suave">No hay entregas para llevar.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-borde bg-superficie p-4">
        <p className="font-semibold">🧮 Calcular el viaje</p>
        <div className="flex flex-col gap-2">
          <p className="font-medium">¿De dónde salís?</p>
          <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="De dónde salís">
            <button type="button" onClick={() => setModo("salida")} disabled={!salida.coordenada} aria-pressed={modo === "salida"} className={opcion(modo === "salida")}>
              <span className="font-semibold">🏬 Del depósito</span>
              <span className="text-sm text-texto-suave">{salida.coordenada ? salida.direccion ?? "El lugar de salida guardado" : "Sin marcar: marcalo arriba, en “De dónde salen los repartos”"}</span>
            </button>
            <button type="button" onClick={dondeEstoy} aria-pressed={modo === "gps"} className={opcion(modo === "gps")}>
              <span className="font-semibold">📱 De donde estoy ahora</span>
              <span className="text-sm text-texto-suave">{modo === "gps" && aca ? "✓ Ya sé dónde estás" : "Usa el GPS del celular"}</span>
            </button>
            <button type="button" onClick={() => { setModo("otra"); setAca(null); setAviso(null); }} aria-pressed={modo === "otra"} className={opcion(modo === "otra")}>
              <span className="font-semibold">✍️ De otra dirección</span>
              <span className="text-sm text-texto-suave">{modo === "otra" && aca ? `✓ ${acaTexto}` : "Escribila o pegá un enlace de Google Maps"}</span>
            </button>
          </div>
          {modo === "otra" && (
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap gap-2">
                <input
                  value={otra}
                  onChange={(e) => setOtra(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && otra.trim()) buscarOtra();
                  }}
                  aria-label="Dirección de donde salís"
                  placeholder="Calle, número y localidad (o un enlace de Google Maps)"
                  className="h-12 min-w-0 flex-1 rounded-xl border-2 border-borde bg-superficie px-3"
                />
                <button type="button" onClick={buscarOtra} disabled={buscando || !otra.trim()} className={boton}>
                  {buscando ? "Buscando…" : "🔎 Buscar"}
                </button>
              </div>
              {lugares.map((l) => (
                <button key={`${l.coordenada.lat},${l.coordenada.lng}`} type="button" onClick={() => salirDe(l.coordenada, l.etiqueta)} className="min-h-12 rounded-xl border-2 border-borde bg-superficie px-3 py-2 text-left hover:border-marca">
                  <b>Salgo de acá:</b> {l.etiqueta}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Empezar por</span>
            <select value={primera} onChange={(e) => setPrimera(e.target.value)} className="h-10 max-w-60 rounded-lg border border-borde bg-superficie px-2">
              <option value="">La que quede más cómoda</option>
              {pendientes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.cliente}
                </option>
              ))}
            </select>
          </label>
          {salida.coordenada && origen === "salida" && (
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input type="checkbox" checked={volver} onChange={(e) => setVolver(e.target.checked)} className="size-5" />
              Volver al depósito
            </label>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={calcular} className="min-h-10 rounded-lg bg-marca px-4 font-semibold text-marca-texto">
            Calcular el mejor recorrido
          </button>
        </div>
        {aviso && (
          <p role="status" className="font-medium">
            {aviso}
          </p>
        )}
      </div>

      <ol className="flex flex-col">
        <li className="flex items-center gap-3 pb-2">
          <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-fondo text-lg">
            🏁
          </span>
          <span className="font-medium">{origen === "salida" ? `Salida: ${salida.direccion ?? "el depósito"}` : aca ? `Salida: ${acaTexto}` : "Salida: todavía sin indicar"}</span>
        </li>
        {hechas.map((p) => (
          <li key={p.id} className="flex items-center gap-3 pb-2 opacity-60">
            <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--listo-fondo)] text-[var(--listo-texto)]">
              ✓
            </span>
            <span className="line-through">{p.cliente}</span>
          </li>
        ))}
        {pendientes.map((p, i) => {
          const t = tramos.lista[i];
          return (
            <li key={p.id} className="flex flex-col">
              <span className="ml-4 flex items-center gap-2 border-l-2 border-dashed border-borde py-1 pl-6 text-xs text-texto-suave">{t ? `${km(t.km)} · ${duracion(t.minutos)} aprox.` : "distancia sin calcular (falta la ubicación)"}</span>
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-borde bg-superficie p-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-marca font-bold text-marca-texto">{hechas.length + i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{p.cliente}</p>
                  <p className="text-sm text-texto-suave">
                    {p.direccion}
                    {p.localidad && `, ${p.localidad}`}
                    {p.horario && ` · recibe ${p.horario}`}
                    </p>
                  {!p.coordenada && <p className="text-sm font-semibold text-error">📍 Sin ubicación marcada: el GPS va a buscar la dirección escrita.</p>}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <button type="button" onClick={() => mover(p.id, -1)} disabled={i === 0} aria-label={`Subir ${p.cliente}`} className="size-10 rounded-lg border border-borde disabled:opacity-40">
                    ↑
                  </button>
                  <button type="button" onClick={() => mover(p.id, 1)} disabled={i === pendientes.length - 1} aria-label={`Bajar ${p.cliente}`} className="size-10 rounded-lg border border-borde disabled:opacity-40">
                    ↓
                  </button>
                  <a href={enlacesGoogleMaps([destino(p)])[0]} target="_blank" rel="noreferrer" className="flex min-h-10 items-center rounded-lg bg-[var(--etiqueta-azul)] px-3 text-sm font-semibold text-etiqueta-texto">
                    Ir ▶
                  </a>
                  <a href={enlaceWaze(destino(p))} target="_blank" rel="noreferrer" className="flex min-h-10 items-center rounded-lg border border-borde px-3 text-sm font-semibold">
                    Waze
                  </a>
                  {p.telefono && (
                    <a href={`tel:${p.telefono.replace(/[^\d+]/g, "")}`} className="flex min-h-10 items-center rounded-lg border border-borde px-3 text-sm font-semibold" aria-label={`Llamar a ${p.cliente}`}>
                      📞
                    </a>
                  )}
                </div>
              </div>
            </li>
          );
        })}
        {tramos.vuelta && (
          <li className="flex flex-col">
            <span className="ml-4 border-l-2 border-dashed border-borde py-1 pl-6 text-xs text-texto-suave">
              {km(tramos.vuelta.km)} · {duracion(tramos.vuelta.minutos)} aprox.
            </span>
            <span className="flex items-center gap-3">
              <span aria-hidden className="flex size-9 items-center justify-center rounded-full bg-fondo text-lg">
                ↩
              </span>
              Vuelta al depósito
            </span>
          </li>
        )}
      </ol>

      <div className="flex flex-col gap-3 rounded-xl bg-fondo p-4">
        <p className="text-lg">
          Total aprox.: <b>{km(total.km)}</b> · <b>{duracion(total.min)}</b> de manejo
          {sinUbicacion.length > 0 && (
            <span className="block text-sm text-texto-suave">
              Sin contar {sinUbicacion.length === 1 ? "la parada que no tiene" : "las paradas que no tienen"} la ubicación marcada: <b>{nombres(sinUbicacion)}</b>.
            </span>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {enlaces.map((e, i) => (
            <a key={e} href={e} target="_blank" rel="noreferrer" className="flex min-h-11 items-center rounded-lg bg-[var(--etiqueta-azul)] px-4 font-semibold text-etiqueta-texto">
              <FlechaNavegacion className="" /> {enlaces.length > 1 ? `Abrir el viaje en Google Maps (parte ${i + 1})` : "Abrir todo el viaje en Google Maps"}
            </a>
          ))}
          {guardar && (
            <button type="button" onClick={enviarOrden} disabled={guardando || (guardar.tipo === "reparto" && !cambiado)} className="min-h-11 rounded-lg bg-marca px-4 font-semibold text-marca-texto disabled:opacity-60">
              {guardando ? "Un momento…" : guardar.tipo === "armar" ? "Armar el reparto con este orden" : "Guardar este orden"}
            </button>
          )}
        </div>
        {estadoGuardar.mensaje && (
          <p role={estadoGuardar.ok ? "status" : "alert"} className={`text-sm ${estadoGuardar.ok ? "" : "text-error"}`}>
            {estadoGuardar.mensaje}
          </p>
        )}
      </div>
    </div>
  );
}
