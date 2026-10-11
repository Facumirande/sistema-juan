import { CLAVE_TARJETAS, CLAVE_TEMA } from "@/dominio/aspecto/aspecto";

// Lo primero que corre en cada página, antes de que se dibuje nada: pone en <html> el modo (claro u
// oscuro) y el aspecto de las tarjetas que se eligieron en este aparato, para que la pantalla ya
// salga así y no parpadee en el otro modo. Hace lo mismo que `temaEfectivo` e `interpretarTarjetas`
// (`src/dominio/aspecto/aspecto.ts`), escrito a mano porque va adentro de la página, sin módulos;
// una prueba verifica que den igual. Después se ocupa `src/ui/aspecto.ts`.

export const GUION_DE_ASPECTO = `(function(){var r=document.documentElement,t=null,c=null;try{t=localStorage.getItem(${JSON.stringify(CLAVE_TEMA)});c=localStorage.getItem(${JSON.stringify(CLAVE_TARJETAS)})}catch(e){}if(t!=="claro"&&t!=="oscuro"){var o=false;try{o=matchMedia("(prefers-color-scheme: dark)").matches}catch(e){}t=o?"oscuro":"claro"}r.setAttribute("data-tema",t);if(c==="neutro")r.setAttribute("data-tarjetas","neutro")})()`;
