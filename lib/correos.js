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

/**
 * Completa el dominio cuando quien escribe solo puso su nombre de usuario.
 *
 * Es para los CUATRO logins de docentes, donde el correo es siempre del
 * dominio de la universidad: teniéndolo escrito al lado del campo, obligar a
 * teclearlo otra vez es pedir veinte caracteres que no aportan nada.
 *
 * Acepta las dos formas a propósito. El campo enseña el dominio pegado al
 * lado, pero quien pegue el correo entero —o quien traiga el navegador con el
 * autocompletado puesto— no puede quedarse fuera por eso. Y quien escriba un
 * correo de otro dominio pasa tal cual y lo rechaza esInstitucional, que es
 * quien tiene que rechazarlo.
 *
 * NO se usa en los formularios públicos: ahí hay correos de fuera —una marca
 * que quiere patrocinar la Expo— y completarles un dominio que no es el suyo
 * sería inventarse una dirección.
 */
function conDominio(v) {
  const limpio = normalizar(v).replace(/^@+/, "");
  if (!limpio) return "";
  return limpio.includes("@") ? limpio : limpio + SUFIJO;
}

// Expresión para el atributo pattern del HTML.
const PATRON_HTML = "[^@\\s]+@" + DOMINIO.replace(/\./g, "\\.");

module.exports = {
  DOMINIO,
  SUFIJO,
  normalizar,
  conDominio,
  formatoValido,
  esInstitucional,
  PATRON_HTML,
};
