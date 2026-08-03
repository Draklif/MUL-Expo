// =====================================================================
//  Utilidades para parsear listas pegadas (estudiantes, materias, etc.)
// =====================================================================

// Quita viñetas / numeración inicial ("1.", "-", "•") y espacios sobrantes.
function limpiarNombre(s) {
  return String(s || "")
    .replace(/^\s*(?:[-–—*•·]|\d+\s*[.)])\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Limpia una lista de nombres y elimina vacíos y duplicados (sin importar
// mayúsculas). Conserva el orden y la escritura del primero que aparece.
function unificar(nombres, maxLargo = 120) {
  const vistos = new Set();
  const out = [];
  for (const raw of nombres) {
    const nombre = limpiarNombre(raw).slice(0, maxLargo);
    if (!nombre) continue;
    const clave = nombre.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    out.push(nombre);
  }
  return out;
}

/**
 * Convierte un bloque de texto pegado en una lista de nombres únicos.
 *
 * - Con saltos de línea: cada línea es un nombre (si viene de Excel con
 *   varias columnas, se usa solo la primera).
 * - En una sola línea: separa por comas, punto y coma o tabulaciones.
 */
function parseLista(texto, maxLargo = 120) {
  const crudo = String(texto || "");
  if (!crudo.trim()) return [];

  const partes = /\r?\n/.test(crudo)
    ? crudo.split(/\r?\n/).flatMap((l) => l.split(";")).map((l) => l.split("\t")[0])
    : crudo.split(/[;,\t]/);

  return unificar(partes, maxLargo);
}

// Lista de integrantes tal como se guarda en proyectos.integrantes.
function parseIntegrantes(texto) {
  if (!texto) return [];
  return String(texto)
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

module.exports = { limpiarNombre, unificar, parseLista, parseIntegrantes };
