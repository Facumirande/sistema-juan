import { iniciales } from "@/dominio/colaboracion/personas";

// Avatar de una persona: círculo de su color con sus iniciales (como los miembros de Trello).

export interface PersonaAvatar {
  nombre: string;
  color: string;
}

const TAMANOS = { chico: "size-6 text-[10px]", medio: "size-8 text-xs", grande: "size-12 text-base" } as const;

export function Avatar({ persona, tamano = "medio", className = "" }: { persona: PersonaAvatar; tamano?: keyof typeof TAMANOS; className?: string }) {
  return (
    <span
      title={persona.nombre}
      aria-label={persona.nombre}
      role="img"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ring-2 ring-tarjeta select-none ${TAMANOS[tamano]} ${className}`}
      style={{ background: persona.color }}
    >
      {iniciales(persona.nombre)}
    </span>
  );
}
