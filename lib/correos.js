// =====================================================================
//  Correos institucionales. Único lugar donde se decide qué es válido.
// =====================================================================
const { DOMINIO } = require("../config");

const SUFIJO = "@" + DOMINIO.toLowerCase();
const RE_FORMATO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function normalizar(v) {
  return String(v || "").trim().toLowerCase().slice(0, 160);
}

// Formato de correo, sin mirar el dominio.
function formatoValido(v) {
  return RE_FORMATO.test(v);
}

// Correo del dominio de la universidad.
function esInstitucional(v) {
  return formatoValido(v) && v.endsWith(SUFIJO);
}

// Expresión para el atributo pattern del HTML.
const PATRON_HTML = "[^@\\s]+@" + DOMINIO.replace(/\./g, "\\.");

module.exports = {
  DOMINIO,
  SUFIJO,
  normalizar,
  formatoValido,
  esInstitucional,
  PATRON_HTML,
};
