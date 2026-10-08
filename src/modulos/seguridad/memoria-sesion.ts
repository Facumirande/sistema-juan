// La sesión que se muestra en pantalla (nombre, permisos para armar el menú) se recuerda unos
// segundos por usuario, para no ir a buscarla a la base en cada pantalla. No decide nada: cada
// caso de uso vuelve a verificar al usuario y sus permisos en su propia transacción. Se olvida al
// cambiar el perfil, la clave, los usuarios o la configuración.

const RECORDAR_MS = 20_000;
const MAXIMO = 200;

const recordadas = new Map<string, { valor: unknown; hasta: number }>();

export function sesionRecordada<T>(authUserId: string): T | null {
  const r = recordadas.get(authUserId);
  if (!r) return null;
  if (r.hasta <= Date.now()) {
    recordadas.delete(authUserId);
    return null;
  }
  return r.valor as T;
}

export function recordarSesion<T>(authUserId: string, valor: T): void {
  if (recordadas.size >= MAXIMO) recordadas.clear();
  recordadas.set(authUserId, { valor, hasta: Date.now() + RECORDAR_MS });
}

/** Hay que llamarla cuando cambia algo de lo que la sesión muestra (perfil, roles, clave, configuración). */
export function olvidarSesiones(): void {
  recordadas.clear();
}
