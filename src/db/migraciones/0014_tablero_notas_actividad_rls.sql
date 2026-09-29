-- Tablero, notas y actividad (uso interno, 28/09/2026): aislamiento por empresa (03 §15.7).
-- Una nota no se edita: la borra quien la escribió (lo controla el caso de uso) y con ella sus lecturas.
SELECT interno.habilitar_aislamiento('nota', true);
--> statement-breakpoint
REVOKE UPDATE ON nota FROM app_negocio;
--> statement-breakpoint
SELECT interno.habilitar_aislamiento('nota_lectura', true);
--> statement-breakpoint
REVOKE UPDATE ON nota_lectura FROM app_negocio;
--> statement-breakpoint
-- La actividad es un registro: solo se lee y se agrega; el trigger impide cambiarla o borrarla.
SELECT interno.habilitar_aislamiento('actividad');
--> statement-breakpoint
REVOKE UPDATE ON actividad FROM app_negocio;
--> statement-breakpoint
CREATE TRIGGER impedir_modificacion BEFORE UPDATE OR DELETE ON actividad
  FOR EACH ROW EXECUTE FUNCTION interno.impedir_modificacion();
