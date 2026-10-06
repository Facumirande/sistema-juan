"use client";

import Link from "next/link";
import { useState } from "react";

import { cbuParaLeer } from "@/dominio/proveedores/transferencia";

// "Para transferirle": alias, a nombre de quién está la cuenta y CBU, con un botón para copiar
// cada uno y pegarlo en el banco sin equivocarse.

function Copiar({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        } catch {
          // Sin permiso del navegador para copiar: queda el texto a la vista para seleccionarlo.
        }
      }}
      aria-label={`Copiar ${etiqueta}`}
      className="min-h-10 shrink-0 rounded-lg border border-borde bg-superficie px-3 text-sm font-semibold hover:border-marca"
    >
      {copiado ? "✓ Copiado" : "📋 Copiar"}
    </button>
  );
}

export function DatosTransferencia({ alias, cbu, titular, cargar }: { alias: string | null; cbu: string | null; titular: string | null; cargar?: string }) {
  if (!alias && !cbu) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-borde p-3 text-texto-suave">
        <span>🏦 Todavía no tiene alias ni CBU cargados para transferirle.</span>
        {cargar && (
          <Link href={cargar} className="font-semibold text-texto underline-offset-4 hover:underline">
            Cargarlos →
          </Link>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl border-2 border-[var(--pastel-azul)] bg-[var(--pastel-azul)]/30 p-3">
      <p className="font-semibold">🏦 Para transferirle</p>
      {alias && (
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0">
            <span className="block text-sm text-texto-suave">Alias</span>
            <span className="block truncate font-mono text-lg font-semibold">{alias}</span>
          </span>
          <Copiar texto={alias} etiqueta="el alias" />
        </div>
      )}
      {cbu && (
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0">
            <span className="block text-sm text-texto-suave">CBU o CVU</span>
            <span className="block font-mono text-lg font-semibold tabular-nums">{cbuParaLeer(cbu)}</span>
          </span>
          <Copiar texto={cbu} etiqueta="el CBU" />
        </div>
      )}
      <p className={titular ? "" : "text-texto-suave"}>
        {titular ? (
          <>
            A nombre de <b>{titular}</b>: revisá que el banco muestre el mismo nombre antes de confirmar.
          </>
        ) : (
          "Falta a nombre de quién está la cuenta: cargalo para poder comprobarlo antes de transferir."
        )}
      </p>
    </div>
  );
}
