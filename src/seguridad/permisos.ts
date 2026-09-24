import { ErrorDeNegocio } from "@/dominio/errores";

import { CATALOGO_PERMISOS, clasePermiso, esPermiso, type Permiso } from "./catalogo-permisos";
import { ROLES_SISTEMA, TODOS_LOS_PERMISOS, type CodigoRolSistema } from "./roles-sistema";

export interface RolAsignado {
  codigo: string;
  permisos: readonly string[];
  activo: boolean;
}

/** Permisos efectivos de un usuario: unión de los permisos de sus roles activos (02 §1). */
export class PermisosEfectivos {
  private readonly claves: ReadonlySet<string>;
  readonly esAdmin: boolean;

  constructor(roles: readonly RolAsignado[]) {
    const activos = roles.filter((r) => r.activo);
    this.esAdmin = activos.some((r) => r.codigo === "ADMIN" || r.permisos.includes(TODOS_LOS_PERMISOS));
    this.claves = new Set(activos.flatMap((r) => r.permisos));
  }

  tiene(permiso: Permiso): boolean {
    return this.esAdmin || this.claves.has(permiso);
  }

  tieneAlguno(permisos: readonly Permiso[]): boolean {
    return permisos.some((p) => this.tiene(p));
  }

  /** Lista explícita (para enviar al navegador y armar el menú). */
  lista(): Permiso[] {
    return (Object.keys(CATALOGO_PERMISOS) as Permiso[]).filter((p) => this.tiene(p));
  }

  /** Lanza SIN_PERMISO si no tiene el permiso (la verificación real ocurre siempre en el servidor). */
  exigir(permiso: Permiso): void {
    if (!this.tiene(permiso)) {
      throw new ErrorDeNegocio("SIN_PERMISO", "No tenés permiso para hacer esta acción.", { permiso });
    }
  }
}

export function esRolSistema(codigo: string): codigo is CodigoRolSistema {
  return codigo === "ADMIN" || Object.hasOwn(ROLES_SISTEMA, codigo);
}

/**
 * Valida la lista de permisos de un rol antes de guardarla (02 §6 y §10.3 regla 7):
 * claves del catálogo, ADMIN no editable, PREPARADOR y REPARTIDOR sin clases sensibles,
 * y los roles de sistema solo con permisos "Sí" u "Opc." de su columna de la matriz.
 */
export function validarPermisosDeRol(codigoRol: string, permisos: readonly string[]): Permiso[] {
  if (codigoRol === "ADMIN") {
    throw new ErrorDeNegocio("VALIDACION", "El rol ADMIN no se puede editar.");
  }
  const invalidos = permisos.filter((p) => !esPermiso(p));
  if (invalidos.length > 0) {
    throw new ErrorDeNegocio("VALIDACION", "Hay permisos que no existen en el catálogo.", { permisos: invalidos });
  }
  const validos = [...new Set(permisos as Permiso[])];
  if (!esRolSistema(codigoRol)) return validos;

  const definicion = ROLES_SISTEMA[codigoRol as Exclude<CodigoRolSistema, "ADMIN">];
  const prohibidos = validos.filter((p) => definicion.clasesProhibidas.includes(clasePermiso(p)));
  if (prohibidos.length > 0) {
    throw new ErrorDeNegocio(
      "VALIDACION",
      `El rol ${codigoRol} nunca puede ver precios, costos, márgenes, deudas ni datos de seguridad.`,
      { permisos: prohibidos },
    );
  }
  const admitidos = new Set<Permiso>([...definicion.porDefecto, ...definicion.opcionales]);
  const fueraDeMatriz = validos.filter((p) => !admitidos.has(p));
  if (fueraDeMatriz.length > 0) {
    throw new ErrorDeNegocio(
      "VALIDACION",
      `Estos permisos no corresponden al rol ${codigoRol}: asignalos con otro rol o con un rol personalizado.`,
      { permisos: fueraDeMatriz },
    );
  }
  return validos;
}
