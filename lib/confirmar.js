// =====================================================================
//  El confirmar de lo que le escribe a un estudiante.
//
//  Dieciséis formularios repartidos en siete paneles mandan correo al
//  pulsarlos, y ninguno se puede deshacer: un correo no se devuelve. Todos
//  preguntan antes, y todos lo preguntan igual —que es la mitad de la
//  gracia: un docente que ya vio esta pregunta en la Jam la reconoce en el
//  semillero—.
//
//  La otra mitad es que la pregunta dice la VERDAD del momento, y el correo
//  tiene cuatro maneras de no llegar: apagado (CORREOS=off), desviado
//  (CORREOS_DESVIO), bloqueado por un desvío mal escrito, o sin SMTP. Una
//  confirmación que hable de un correo que nadie va a recibir es peor que no
//  preguntar: deja al docente creyendo que avisó. Por eso la respuesta a
//  "¿va a salir, y a quién?" se resuelve en cada render y no al arrancar
//  —esas líneas del .env se cambian sin reiniciar— y la pregunta cambia de
//  final, no de forma: se sigue viendo, se sigue pudiendo cancelar, y encima
//  dice qué va a pasar de verdad.
//
//  Devuelve la expresión de JavaScript, no el atributo entero, para que la
//  vista pueda anteponerle sus propias condiciones:
//
//    onsubmit="return <%- confirmaCorreo('…') %>"
//    onsubmit="return this.estado.value !== 'aprobada' || <%- confirmaCorreo('…') %>"
// =====================================================================
const envios = require("./envios");

// De texto a literal de JavaScript dentro de un atributo HTML. Las dos
// escapadas en el orden que toca: primero la de JS —la comilla y la barra— y
// después la del atributo. Los nombres salen de la base y ahí hay apellidos
// con apóstrofo, así que esto no es una precaución teórica.
const paraAtributo = (v) =>
  String(v)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, "\\n")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Los cuatro finales posibles. El de arriba es el único que dice "esto llega":
// los otros tres avisan de que no, cada uno por su razón, porque un docente que
// cree que avisó y no avisó es peor que uno que no le dio al botón.
const final = () => {
  if (envios.desvioRoto()) {
    return (
      "OJO: no va a salir ningún correo. CORREOS_DESVIO en el .env tiene algo " +
      "escrito que no es una dirección, y hasta que se arregle el envío está bloqueado."
    );
  }
  if (!envios.activo()) {
    return (
      "OJO: los correos están apagados " +
      (envios.apagados() ? "(CORREOS=off en el .env)" : "(falta SMTP_USER y SMTP_PASS en el .env)") +
      ", así que esta vez NO le va a llegar nada."
    );
  }
  const a = envios.desvio();
  if (a) {
    return (
      `OJO: los correos están DESVIADOS a ${a} (CORREOS_DESVIO en el .env). ` +
      "El correo se manda de verdad, pero a esa bandeja: a quien va dirigido no le llega."
    );
  }
  return "Un correo no se puede devolver.";
};

function confirmaCorreo(texto) {
  return `confirm('${paraAtributo(`${texto}\n\n${final()}`)}')`;
}

module.exports = { confirmaCorreo };
