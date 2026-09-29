import Link from "next/link";

import { formatearMoneda, formatearNumero } from "@/dominio/dinero/formato";
import { formatearFecha } from "@/dominio/fechas/fechas";
import type { EstadoRegla, RecargosActuales, ReglaListada } from "@/modulos/precios-venta/reglas";
import { ESTADOS_PEDIDO, UNIDADES_CORTAS } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Campo, CampoNumero, Selector, Tabla, Tarjeta, clasesBoton } from "@/ui/formularios";

import { cerrarReglaAccion, nuevaReglaAccion, recargoAccion } from "../../precios/venta/acciones";

const ESTADOS_REGLA: Readonly<Record<EstadoRegla, string>> = {
  VIGENTE: "vigente",
  PROGRAMADA: "empieza más adelante",
  VENCIDA: "vencida",
  DESACTIVADA: "quitada",
};

const pct = (v: string) => formatearNumero(v, { decimales: 3, recortarCeros: true });

/** Últimos pedidos del cliente y acceso a cargar uno nuevo. */
export function PedidosDelCliente({
  clienteId,
  pedidos,
  puedeCrear,
}: {
  clienteId: string;
  pedidos: { id: string; numero: string; estado: string; fecha: string }[];
  puedeCrear: boolean;
}) {
  return (
    <Tarjeta titulo="Pedidos">
      {pedidos.length === 0 ? (
        <p className="text-texto-suave">Todavía no hizo pedidos.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {pedidos.map((p) => (
            <li key={p.id}>
              <Link href={`/pedidos/${p.id}`} className="underline-offset-4 hover:underline">
                {p.numero} · {formatearFecha(p.fecha)} · {ESTADOS_PEDIDO[p.estado]}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {puedeCrear && (
        <div>
          <Link href={`/pedidos/nuevo?cliente=${clienteId}`} className={clasesBoton("principal")}>
            ＋ Nuevo pedido para este cliente
          </Link>
        </div>
      )}
    </Tarjeta>
  );
}

function Condicion({ r }: { r: ReglaListada }) {
  if (r.tipo === "PRECIO_FIJO") return <>Precio pactado {formatearMoneda(r.valor)}/{UNIDADES_CORTAS[r.unidadBase ?? ""] ?? ""}</>;
  return <>Recargo {pct(r.valor)} %</>;
}

/** Recargo del cliente, precios pactados y excepciones (P-33). */
export function PreciosDelCliente({
  clienteId,
  recargoCliente,
  reglas,
  objetivos,
}: {
  clienteId: string;
  recargoCliente: string | null;
  reglas: ReglaListada[];
  /** Solo si puede editar. */
  objetivos: RecargosActuales | null;
}) {
  return (
    <section id="precios" className="flex flex-col gap-3 rounded-lg border border-borde bg-superficie p-4">
      <h2 className="text-lg font-semibold">Precios</h2>
      <div className="flex flex-wrap items-end gap-3">
        <p className="py-2">Recargo del cliente:</p>
        {objetivos ? (
          <FormularioAccion accion={recargoAccion} boton="Guardar" variante="secundario" enLinea>
            <input type="hidden" name="ambito" value="CLIENTE" />
            <input type="hidden" name="id" value={clienteId} />
            <label className="flex items-center gap-1">
              <input
                name="valor"
                inputMode="decimal"
                defaultValue={recargoCliente === null ? "" : pct(recargoCliente)}
                placeholder="—"
                aria-label="Recargo del cliente en %"
                className="h-11 w-20 rounded-lg border border-borde bg-superficie px-2 text-right text-base"
              />
              %
            </label>
          </FormularioAccion>
        ) : (
          <b className="py-2">{recargoCliente === null ? "—" : `${pct(recargoCliente)} %`}</b>
        )}
      </div>
      <p className="text-sm text-texto-suave">Vacío = usa el recargo del producto, de la categoría o el general.</p>

      {reglas.length > 0 && (
        <Tabla>
          <thead>
            <tr>
              <th>Para</th>
              <th>Condición</th>
              <th>Vigencia</th>
              {objetivos && <th></th>}
            </tr>
          </thead>
          <tbody>
            {reglas.map((r) => (
              <tr key={r.id} className={r.estado === "VIGENTE" || r.estado === "PROGRAMADA" ? "" : "opacity-60"}>
                <td>{r.producto ?? `Categoría ${r.categoria}`}</td>
                <td className="whitespace-nowrap">
                  <Condicion r={r} />
                  {r.referencia && <span className="block text-sm text-texto-suave">{r.referencia}</span>}
                </td>
                <td className="whitespace-nowrap">
                  {formatearFecha(r.vigenteDesde)} → {r.vigenteHasta ? formatearFecha(r.vigenteHasta) : "sin fin"}
                  <span className="block text-sm text-texto-suave">{ESTADOS_REGLA[r.estado]}</span>
                </td>
                {objetivos && (
                  <td>
                    {(r.estado === "VIGENTE" || r.estado === "PROGRAMADA") && (
                      <FormularioAccion accion={cerrarReglaAccion} boton="Quitar" variante="secundario" confirmar="¿Quitar esta condición? Deja de aplicarse desde hoy.">
                        <input type="hidden" name="reglaId" value={r.id} />
                      </FormularioAccion>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}

      {objetivos && (
        <details>
          <summary className="min-h-11 cursor-pointer py-2 font-medium">+ Precio pactado o excepción</summary>
          <FormularioAccion accion={nuevaReglaAccion} boton="Guardar">
            <input type="hidden" name="clienteId" value={clienteId} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Selector
                etiqueta="Tipo"
                name="tipo"
                opciones={[
                  { valor: "PRECIO_FIJO", etiqueta: "Precio pactado (por kg o unidad)" },
                  { valor: "RECARGO", etiqueta: "Recargo especial (%)" },
                ]}
              />
              <Selector
                etiqueta="Para"
                name="objetivo"
                opciones={[
                  ...objetivos.productos.map((p) => ({ valor: `producto:${p.id}`, etiqueta: p.nombre })),
                  ...objetivos.categorias.map((k) => ({ valor: `categoria:${k.id}`, etiqueta: `Toda la categoría ${k.nombre} (solo recargo)` })),
                ]}
              />
              <CampoNumero etiqueta="Valor" name="valor" ayuda="Precio por unidad base (ej. 1.150) o recargo en % (ej. 28)." />
              <Campo etiqueta="Referencia (opcional)" name="referencia" placeholder="Ej. Licitación 2026" />
              <Campo etiqueta="Desde" name="vigenteDesde" type="date" ayuda="Vacío = desde hoy." />
              <Campo etiqueta="Hasta (opcional)" name="vigenteHasta" type="date" />
            </div>
          </FormularioAccion>
        </details>
      )}
    </section>
  );
}
