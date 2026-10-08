"use client";

import Link from "next/link";
import { useRef, useState, useTransition, type KeyboardEvent as EventoTecla, type PointerEvent as EventoPuntero } from "react";

import { enlaceWaze, enlacesGoogleMaps, type DestinoGps } from "@/dominio/entregas/navegacion";
import { estimarTramo, planearRecorrido, type Coordenada } from "@/dominio/entregas/recorrido";
import { leerCoordenadas } from "@/dominio/entregas/ubicacion";
import { ESTADO_INICIAL, type EstadoAccion } from "@/ui/estado-accion";
import { FlechaNavegacion } from "@/ui/iconos";

import { quitarParadaAccion } from "../repartos/acciones";

import {
  armarRepartoAccion,
  buscarEnMapaAccion,
  guardarFavoritoAccion,
  guardarOrdenAccion,
  guardarRecorridoAccion,
  leerEnlaceAccion,
  marcarDestinoAccion,
  quitarDestinoAccion,
} from "./acciones";
import { AgregarDestino, type Favorito } from "./agregar-destino";

// El recorrido en una sola lista (pedido del usuario, 07/10/2026): a dónde hay que ir, en qué
// orden, cuánto hay hasta cada lugar, el GPS para ir y el botón para entregar. Los destinos se
// arrastran (o se mueven con las flechas del teclado) y el orden queda guardado al soltar; al final,
// "Calcular el mejor recorrido" los acomoda al instante y después se pueden seguir moviendo a mano.

export interface Destino {
  /** Con qué se guarda su lugar: "E:<entrega>" o "X:<destino extra>" en el día; la entrega, en un reparto. */
  clave: string;
  tipo: "ENTREGA" | "EXTRA";
  id: string;
  nombre: string;
  punto: string | null;
  direccion: string;
  localidad: string | null;
  horario: string | null;
  coordenada: Coordenada | null;
  telefono: string | null;
  /** Ya se entregó (o ya se pasó por ahí): queda arriba, tachado, fuera del cálculo y del GPS. */
  hecha: boolean;
  /** A dónde lleva "✅ Entregar" (nulo: desde acá no se entrega). */
  entregar?: string | null;
  /** Datos sueltos (bultos, estado) y enlaces (la entrega, su remito) junto a la dirección. */
  detalle?: string | null;
  enlaces?: { texto: string; href: string }[];
  /** Algo que falta, en rojo ("sin remito"). */
  falta?: string | null;
  /** Un destino extra que ya es favorito. */
  favorito?: boolean;
  /** Se puede sacar: un destino extra del día, o una parada de un reparto que todavía no salió. */
  quitar?: "extra" | "reparto" | null;
}

/** Cómo se guarda el orden: el recorrido del día y el de un reparto, al instante; las entregas sin reparto, al armarlo. */
export type GuardarRecorrido = { tipo: "dia"; fecha: string } | { tipo: "reparto"; repartoId: string } | { tipo: "armar"; fecha: string };

type Accion = (estado: EstadoAccion, datos: FormData) => Promise<EstadoAccion>;

const duracion = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`);
const km = (n: number) => `${n.toFixed(1).replace(".", ",")} km`;
const nombres = (ds: Destino[]) => ds.map((d) => d.nombre).join(", ");
const destinoGps = (d: Destino): DestinoGps => ({ coordenada: d.coordenada, direccion: d.direccion, localidad: d.localidad });

const chico = "flex min-h-11 items-center justify-center rounded-lg border border-borde bg-superficie px-3 font-semibold hover:border-marca disabled:opacity-60";

export function Recorrido({
  destinos,
  salida,
  guardar,
  agregar = null,
  vacio = "No hay destinos.",
}: {
  destinos: Destino[];
  salida: { coordenada: Coordenada | null; direccion: string | null };
  /** Nulo: el recorrido solo se mira. */
  guardar: GuardarRecorrido | null;
  /** Sumar destinos y favoritos (solo en el recorrido del día). */
  agregar?: { fecha: string; favoritos: Favorito[] } | null;
  vacio?: string;
}) {
  // El orden mientras se arrastra y hasta que el servidor lo devuelve guardado. Las entregas sin
  // reparto todavía no tienen un orden guardado: arrancan ya en el mejor.
  const [aMano, setAMano] = useState<string[] | null>(() => {
    if (guardar?.tipo !== "armar" || !salida.coordenada) return null;
    return planearRecorrido(
      destinos.map((d) => ({ id: d.clave, coordenada: d.coordenada })),
      { salida: salida.coordenada, primeraId: null, volver: false },
    ).orden;
  });
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const filas = useRef(new Map<string, HTMLLIElement>());
  // De dónde se sale: del depósito, de donde está el celular ahora o de otra dirección.
  const [modo, setModo] = useState<"salida" | "gps" | "otra">(salida.coordenada ? "salida" : "gps");
  const [aca, setAca] = useState<Coordenada | null>(null);
  const [acaTexto, setAcaTexto] = useState("donde estás ahora");
  const [otra, setOtra] = useState("");
  const [lugares, setLugares] = useState<{ etiqueta: string; coordenada: Coordenada }[]>([]);
  const [fijarPrimero, setFijarPrimero] = useState(false);
  const [volver, setVolver] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; grave: boolean } | null>(null);
  const [ocupado, empezar] = useTransition();

  const porClave = new Map(destinos.map((d) => [d.clave, d]));
  const enOrden = aMano ? [...aMano.flatMap((c) => porClave.get(c) ?? []), ...destinos.filter((d) => !aMano.includes(d.clave))] : destinos;
  const hechas = enOrden.filter((d) => d.hecha);
  const pendientes = enOrden.filter((d) => !d.hecha);
  const inicio = modo === "salida" ? salida.coordenada : aca;
  const sinUbicacion = pendientes.filter((d) => !d.coordenada);
  const seOrdena = guardar !== null && pendientes.length > 1;

  const puntos = [inicio, ...pendientes.map((d) => d.coordenada)];
  const tramos = pendientes.map((_, i) => {
    const [desde, hasta] = [puntos[i], puntos[i + 1]];
    return desde && hasta ? estimarTramo(desde, hasta) : null;
  });
  const ultimo = puntos[puntos.length - 1];
  const vuelta = volver && modo === "salida" && salida.coordenada && ultimo && pendientes.length > 0 ? estimarTramo(ultimo, salida.coordenada) : null;
  const total = [...tramos, vuelta].reduce((s, t) => ({ km: s.km + (t?.km ?? 0), min: s.min + (t?.minutos ?? 0) }), { km: 0, min: 0 });

  const ejecutar = (accion: Accion, datos: Record<string, string | string[]>, alFallar?: () => void) => {
    const fd = new FormData();
    for (const [clave, valor] of Object.entries(datos)) for (const v of Array.isArray(valor) ? valor : [valor]) fd.append(clave, v);
    empezar(async () => {
      const r = await accion(ESTADO_INICIAL, fd);
      // Solo se avisa cuando algo no se pudo hacer.
      if (r.ok) return;
      setAviso({ texto: r.mensaje ?? "No se pudo guardar: revisá la conexión y probá de nuevo.", grave: true });
      alFallar?.();
    });
  };

  /** Deja los que faltan en ese orden y lo guarda (los ya hechos quedan arriba). */
  const ordenar = (clavesPendientes: string[]) => {
    const todo = [...hechas.map((d) => d.clave), ...clavesPendientes];
    setAMano(todo);
    if (guardar?.tipo === "dia") ejecutar(guardarRecorridoAccion, { fecha: guardar.fecha, parada: todo }, () => setAMano(null));
    if (guardar?.tipo === "reparto") ejecutar(guardarOrdenAccion, { repartoId: guardar.repartoId, parada: todo }, () => setAMano(null));
  };
  const guardado = () => destinos.filter((d) => !d.hecha).map((d) => d.clave);

  // ——— Arrastrar un destino ———
  const agarrar = (e: EventoPuntero<HTMLButtonElement>, clave: string) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setAMano(enOrden.map((d) => d.clave));
    setArrastrando(clave);
  };
  const mover = (e: EventoPuntero<HTMLButtonElement>) => {
    if (!arrastrando) return;
    // Cerca del borde de la pantalla, la página se corre sola.
    if (e.clientY < 90) window.scrollBy(0, -14);
    else if (e.clientY > window.innerHeight - 90) window.scrollBy(0, 14);
    const lista = pendientes.map((d) => d.clave);
    const desde = lista.indexOf(arrastrando);
    // El lugar nuevo: antes del primer destino cuya mitad queda por debajo del dedo.
    let hasta = lista.length - 1;
    for (const [i, clave] of lista.entries()) {
      const caja = filas.current.get(clave)?.getBoundingClientRect();
      if (caja && e.clientY < caja.top + caja.height / 2) {
        hasta = i > desde ? i - 1 : i;
        break;
      }
    }
    if (hasta === desde) return;
    lista.splice(desde, 1);
    lista.splice(hasta, 0, arrastrando);
    setAMano([...hechas.map((d) => d.clave), ...lista]);
  };
  const soltar = () => {
    if (!arrastrando) return;
    setArrastrando(null);
    const lista = pendientes.map((d) => d.clave);
    if (lista.join() !== guardado().join()) ordenar(lista);
  };
  /** Con el teclado: las flechas suben y bajan el destino. */
  const moverConTecla = (e: EventoTecla<HTMLButtonElement>, clave: string) => {
    const paso = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (!paso) return;
    e.preventDefault();
    const lista = pendientes.map((d) => d.clave);
    const i = lista.indexOf(clave);
    const j = i + paso;
    if (j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j]!, lista[i]!];
    ordenar(lista);
  };

  // ——— De dónde se sale ———
  const salirDe = (c: Coordenada, texto: string) => {
    setAca(c);
    setAcaTexto(texto);
    setLugares([]);
    setAviso(null);
  };
  const dondeEstoy = () => {
    setModo("gps");
    setAca(null);
    if (!navigator.geolocation) return setAviso({ texto: "Este aparato no tiene GPS disponible en el navegador. Elegí “Otra dirección” y escribila.", grave: false });
    setAviso({ texto: "Buscando dónde estás…", grave: false });
    navigator.geolocation.getCurrentPosition(
      (p) => salirDe({ lat: p.coords.latitude, lng: p.coords.longitude }, "donde estás ahora"),
      () => setAviso({ texto: "No se pudo saber dónde estás: permití la ubicación en el navegador y tocá de nuevo, o elegí “Otra dirección”.", grave: false }),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  const buscarOtra = () =>
    empezar(async () => {
      const pegada = leerCoordenadas(otra) ?? (/^https?:/i.test(otra.trim()) ? await leerEnlaceAccion(otra) : null);
      if (pegada) return salirDe(pegada, "la ubicación que pegaste");
      const r = await buscarEnMapaAccion(otra);
      setLugares(r.lugares);
      setAviso(r.mensaje ? { texto: r.mensaje, grave: false } : null);
    });

  const calcular = () => {
    if (modo !== "salida" && !aca) {
      return setAviso({ texto: modo === "otra" ? "Primero escribí de dónde salís y tocá Buscar." : "Todavía no sé dónde estás: tocá de nuevo “Donde estoy” y permití la ubicación, o elegí otra forma de salir.", grave: true });
    }
    const r = planearRecorrido(
      pendientes.map((d) => ({ id: d.clave, coordenada: d.coordenada })),
      { salida: inicio, primeraId: fijarPrimero ? (pendientes[0]?.clave ?? null) : null, volver: volver && modo === "salida" },
    );
    ordenar(r.orden);
    setAviso(
      sinUbicacion.length
        ? { texto: `${sinUbicacion.length === 1 ? "No tiene" : "No tienen"} la ubicación marcada: ${nombres(sinUbicacion)}. ${sinUbicacion.length === 1 ? "Queda" : "Quedan"} al final.`, grave: false }
        : null,
    );
  };
  const armar = () => {
    if (guardar?.tipo !== "armar") return;
    ejecutar(armarRepartoAccion, { fecha: guardar.fecha, parada: pendientes.map((d) => d.clave) });
  };

  const enlaces = enlacesGoogleMaps(pendientes.map(destinoGps));
  const opcion = (activa: boolean) => `flex min-h-11 items-center gap-1 rounded-full border-2 px-3 font-semibold disabled:opacity-50 ${activa ? "border-marca bg-marca text-marca-texto" : "border-borde bg-superficie hover:border-marca"}`;
  const textoSalida = modo === "salida" ? (salida.direccion ?? "el depósito") : aca ? acaTexto : modo === "gps" ? "tocá “Donde estoy” y permití la ubicación" : "escribí la dirección y tocá Buscar";

  return (
    <div className="flex flex-col gap-3">
      {destinos.length === 0 ? (
        <p className="text-texto-suave">{vacio}</p>
      ) : (
        <ol className="flex flex-col">
          <li className="flex flex-col gap-2 pb-1">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="De dónde salís">
              <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fondo text-xl">
                🏁
              </span>
              <span className="font-semibold">Salís de</span>
              <button type="button" onClick={() => setModo("salida")} disabled={!salida.coordenada} aria-pressed={modo === "salida"} title={salida.coordenada ? undefined : "Falta marcar de dónde salen los repartos (más abajo)"} className={opcion(modo === "salida")}>
                🏬 Depósito
              </button>
              <button type="button" onClick={dondeEstoy} aria-pressed={modo === "gps"} className={opcion(modo === "gps")}>
                📱 Donde estoy
              </button>
              <button
                type="button"
                onClick={() => {
                  setModo("otra");
                  setAca(null);
                  setAviso(null);
                }}
                aria-pressed={modo === "otra"}
                className={opcion(modo === "otra")}
              >
                ✍️ Otra dirección
              </button>
            </div>
            <p className="pl-12 text-sm text-texto-suave">{textoSalida}</p>
            {modo === "otra" && (
              <div className="flex flex-col gap-1 pl-12">
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
                  <button type="button" onClick={buscarOtra} disabled={ocupado || !otra.trim()} className={chico}>
                    🔎 Buscar
                  </button>
                </div>
                {lugares.map((l) => (
                  <button key={`${l.coordenada.lat},${l.coordenada.lng}`} type="button" onClick={() => salirDe(l.coordenada, l.etiqueta)} className="min-h-12 rounded-xl border-2 border-borde bg-superficie px-3 py-2 text-left hover:border-marca">
                    <b>Salgo de acá:</b> {l.etiqueta}
                  </button>
                ))}
              </div>
            )}
          </li>

          {hechas.map((d) => (
            <li key={d.clave} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1 text-texto-suave">
              <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--listo-fondo)] text-lg text-[var(--listo-texto)]">
                ✓
              </span>
              <span className="line-through">
                {d.tipo === "EXTRA" && "📌 "}
                {d.nombre}
              </span>
              {d.enlaces?.map((e) => (
                <Link key={e.href} href={e.href} className="text-sm underline-offset-4 hover:underline">
                  {e.texto}
                </Link>
              ))}
              {d.quitar === "extra" && (
                <button type="button" disabled={ocupado} onClick={() => ejecutar(marcarDestinoAccion, { id: d.id, hecha: "no" })} className="min-h-10 rounded-lg px-2 text-sm font-semibold underline underline-offset-4">
                  Todavía no fui
                </button>
              )}
            </li>
          ))}

          {pendientes.map((d, i) => {
            const t = tramos[i];
            return (
              <li
                key={d.clave}
                ref={(el) => {
                  if (el) filas.current.set(d.clave, el);
                  else filas.current.delete(d.clave);
                }}
                className="flex flex-col"
              >
                <span className="ml-5 border-l-2 border-dashed border-borde py-1 pl-7 text-sm text-texto-suave">{t ? `${km(t.km)} · ${duracion(t.minutos)} aprox.` : "sin calcular: falta la ubicación"}</span>
                <div className={`flex flex-col gap-2 rounded-xl border-2 bg-superficie p-2 sm:flex-row sm:items-center sm:gap-3 ${arrastrando === d.clave ? "border-marca shadow-lg" : "border-borde"}`}>
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {seOrdena && (
                      <button
                        type="button"
                        aria-label={`Mover ${d.nombre}: arrastralo, o usá las flechas del teclado`}
                        title="Arrastrar para cambiar el orden"
                        onPointerDown={(e) => agarrar(e, d.clave)}
                        onPointerMove={mover}
                        onPointerUp={soltar}
                        onPointerCancel={soltar}
                        onKeyDown={(e) => moverConTecla(e, d.clave)}
                        className="flex h-12 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-2xl leading-none text-texto-suave hover:bg-fondo active:cursor-grabbing"
                      >
                        <span aria-hidden>⠿</span>
                      </button>
                    )}
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-marca text-lg font-bold text-marca-texto">{hechas.length + i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-lg leading-tight font-bold [overflow-wrap:anywhere]">
                        {d.tipo === "EXTRA" && (d.favorito ? "⭐ " : "📌 ")}
                        {d.nombre}
                        {d.punto && d.punto !== d.nombre && <span className="font-normal text-texto-suave"> · {d.punto}</span>}
                      </p>
                      <p className="text-sm text-texto-suave">
                        {[[d.direccion, d.localidad].filter(Boolean).join(", "), d.horario && `recibe ${d.horario}`, d.detalle].filter(Boolean).join(" · ")}
                        {d.enlaces?.map((e) => (
                          <span key={e.href}>
                            {" · "}
                            <Link href={e.href} className="font-medium underline-offset-4 hover:underline">
                              {e.texto}
                            </Link>
                          </span>
                        ))}
                        {d.falta && <b className="text-error"> · {d.falta}</b>}
                      </p>
                      {!d.coordenada && <p className="text-sm font-semibold text-error">📍 Sin ubicación marcada: el GPS busca la dirección escrita.</p>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                    <a href={enlacesGoogleMaps([destinoGps(d)])[0]} target="_blank" rel="noreferrer" className="flex min-h-11 items-center rounded-lg bg-[var(--etiqueta-azul)] px-3 font-semibold text-etiqueta-texto">
                      Ir ▶
                    </a>
                    <a href={enlaceWaze(destinoGps(d))} target="_blank" rel="noreferrer" className={chico}>
                      Waze
                    </a>
                    {d.telefono && (
                      <a href={`tel:${d.telefono.replace(/[^\d+]/g, "")}`} className={chico} aria-label={`Llamar a ${d.nombre}`}>
                        📞
                      </a>
                    )}
                    {d.quitar === "extra" && !d.favorito && agregar && (
                      <button type="button" disabled={ocupado} onClick={() => ejecutar(guardarFavoritoAccion, { id: d.id })} className={chico} title="Guardarlo como favorito" aria-label={`Guardar ${d.nombre} como favorito`}>
                        ⭐
                      </button>
                    )}
                    {d.quitar && (
                      <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => (d.quitar === "extra" ? ejecutar(quitarDestinoAccion, { id: d.id }) : guardar?.tipo === "reparto" && ejecutar(quitarParadaAccion, { repartoId: guardar.repartoId, entregaId: d.id }))}
                        className={chico}
                        aria-label={`Quitar ${d.nombre} del recorrido`}
                      >
                        ✕ Quitar
                      </button>
                    )}
                    {d.quitar === "extra" && (
                      <button type="button" disabled={ocupado} onClick={() => ejecutar(marcarDestinoAccion, { id: d.id, hecha: "si" })} className="flex min-h-11 items-center rounded-lg bg-marca px-3 font-bold text-marca-texto disabled:opacity-60">
                        ✓ Listo
                      </button>
                    )}
                    {d.entregar && (
                      <Link href={d.entregar} className="flex min-h-11 items-center rounded-lg bg-marca px-3 font-bold text-marca-texto">
                        ✅ Entregar
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            );
          })}

          {vuelta && (
            <li className="flex flex-col">
              <span className="ml-5 border-l-2 border-dashed border-borde py-1 pl-7 text-sm text-texto-suave">
                {km(vuelta.km)} · {duracion(vuelta.minutos)} aprox.
              </span>
              <span className="flex items-center gap-3 font-medium">
                <span aria-hidden className="flex size-10 items-center justify-center rounded-full bg-fondo text-xl">
                  ↩
                </span>
                Vuelta al depósito
              </span>
            </li>
          )}
        </ol>
      )}

      {agregar &&
        (agregando ? (
          <AgregarDestino fecha={agregar.fecha} favoritos={agregar.favoritos} centro={salida.coordenada} alCerrar={() => setAgregando(false)} />
        ) : (
          <button type="button" onClick={() => setAgregando(true)} className="min-h-12 rounded-xl border-2 border-dashed border-marca px-4 text-lg font-bold text-marca hover:bg-marca/10">
            ＋ Agregar destino
          </button>
        ))}

      {aviso && (
        <p role={aviso.grave ? "alert" : "status"} className={`font-medium ${aviso.grave ? "text-error" : ""}`}>
          {aviso.texto}
        </p>
      )}

      {pendientes.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl bg-fondo p-3 sm:p-4">
          {guardar && pendientes.length > 1 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <button type="button" onClick={calcular} disabled={ocupado} className="min-h-14 rounded-xl bg-marca px-5 text-lg font-bold text-marca-texto disabled:opacity-60">
                🧮 Calcular el mejor recorrido
              </button>
              <label className="flex min-h-11 items-center gap-2">
                <input type="checkbox" checked={fijarPrimero} onChange={(e) => setFijarPrimero(e.target.checked)} className="size-6" />
                Dejar primero el de arriba
              </label>
              {salida.coordenada && modo === "salida" && (
                <label className="flex min-h-11 items-center gap-2">
                  <input type="checkbox" checked={volver} onChange={(e) => setVolver(e.target.checked)} className="size-6" />
                  Volver al depósito
                </label>
              )}
            </div>
          )}
          <p className="text-lg">
            Total aprox.: <b>{km(total.km)}</b> · <b>{duracion(total.min)}</b> de manejo
            {sinUbicacion.length > 0 && (
              <span className="block text-sm text-texto-suave">
                Sin contar {sinUbicacion.length === 1 ? "el que no tiene" : "los que no tienen"} la ubicación marcada: <b>{nombres(sinUbicacion)}</b>.
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {enlaces.map((e, i) => (
              <a key={e} href={e} target="_blank" rel="noreferrer" className="flex min-h-12 items-center gap-2 rounded-lg bg-[var(--etiqueta-azul)] px-4 font-semibold text-etiqueta-texto">
                <FlechaNavegacion className="" /> {enlaces.length > 1 ? `Abrir el viaje en Google Maps (parte ${i + 1})` : "Abrir todo el viaje en Google Maps"}
              </a>
            ))}
            {guardar?.tipo === "armar" && (
              <button type="button" onClick={armar} disabled={ocupado} className="min-h-12 rounded-lg bg-marca px-4 font-bold text-marca-texto disabled:opacity-60">
                {ocupado ? "Un momento…" : "Armar el reparto con este orden"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
