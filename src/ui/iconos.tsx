// Dibujos propios en SVG para lo que un emoji no muestra bien.

/**
 * La flecha de navegación (la del GPS): acompaña todo lo que lleva a un lugar (viaje de entrega,
 * cómo llegar, abrir el GPS). Toma el tamaño del texto; el color es el de la navegación salvo que
 * se pase otro.
 */
export function FlechaNavegacion({ className = "text-navegacion" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={`inline-block size-[1em] shrink-0 align-[-0.125em] ${className}`}>
      <path d="M3.4 10.6 20.2 3.3c.5-.2 1 .3.8.8l-7.3 16.8c-.3.6-1.1.5-1.3-.1l-1.6-6.3-6.3-1.6c-.6-.2-.7-1-.1-1.3Z" fill="currentColor" />
    </svg>
  );
}
