// =====================================================================
//  Registro de expositores: utilidades compartidas entre el formulario
//  público y la revisión que hacen los docentes.
// =====================================================================
const crypto = require("crypto");
const { limpiarNombre } = require("./listas");
const { normalizar, esInstitucional } = require("./correos");

// Sin I, O, 0 ni 1: el código se dicta y se teclea a mano.
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generarCodigo(largo = 6) {
  let out = "";
  for (let i = 0; i < largo; i++) {
    out += ALFABETO[crypto.randomInt(ALFABETO.length)];
  }
  return out;
}

// Los estudiantes también tienen correo institucional: se exige el mismo
// dominio que a los docentes.
const limpiarEmail = normalizar;
const emailValido = esInstitucional;

/**
 * Empareja los campos repetidos del formulario en una lista de integrantes.
 * Descarta las filas totalmente vacías; la identidad es el correo, así que
 * dos filas con el mismo correo se cuentan como una sola persona.
 */
function integrantesDesdeFormulario(body, max = 12) {
  const nombres = [].concat(body.integrante_nombre || []);
  const correos = [].concat(body.integrante_email || []);
  const total = Math.max(nombres.length, correos.length);

  const vistos = new Set();
  const out = [];

  for (let i = 0; i < total && out.length < max; i++) {
    const nombre = limpiarNombre(nombres[i]).slice(0, 120);
    const email = limpiarEmail(correos[i]);
    if (!nombre && !email) continue; // fila en blanco

    // Un correo repetido no agrega a nadie nuevo.
    if (email && vistos.has(email)) continue;
    if (email) vistos.add(email);

    out.push({ nombre, email });
  }

  return out;
}

const ESTADOS = {
  pendiente: { label: "Pendiente", cls: "pend" },
  aprobada: { label: "Aprobada", cls: "ok" },
  rechazada: { label: "Rechazada", cls: "no" },
};

module.exports = {
  generarCodigo,
  limpiarEmail,
  emailValido,
  integrantesDesdeFormulario,
  ESTADOS,
};
