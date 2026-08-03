// =====================================================================
//  Cálculo de notas y posiciones. Vive aquí y no en cada ruta para que
//  el tablero, el CSV y los certificados digan siempre lo mismo.
// =====================================================================
const db = require("../db/database");
const { CRITERIOS } = require("../config");

const califsDeProyecto = db.prepare(
  "SELECT docente_id, criterio, puntaje FROM calificaciones WHERE proyecto_id = ?"
);

/**
 * Nota de un proyecto: cada docente promedia los criterios que calificó y
 * la nota final es el promedio entre docentes.
 */
function notaProyecto(proyectoId) {
  const califs = califsDeProyecto.all(proyectoId);

  const porDocente = {};
  for (const c of califs) {
    if (!porDocente[c.docente_id]) porDocente[c.docente_id] = {};
    porDocente[c.docente_id][c.criterio] = c.puntaje;
  }

  const promediosDocentes = [];
  for (const docId of Object.keys(porDocente)) {
    const valores = Object.values(porDocente[docId]);
    if (!valores.length) continue;
    promediosDocentes.push(valores.reduce((a, b) => a + b, 0) / valores.length);
  }

  const promedio = promediosDocentes.length
    ? promediosDocentes.reduce((a, b) => a + b, 0) / promediosDocentes.length
    : null;

  const porCriterio = {};
  for (const { key } of CRITERIOS) {
    const vals = califs.filter((c) => c.criterio === key).map((c) => c.puntaje);
    porCriterio[key] = vals.length
      ? vals.reduce((a, b) => a + b, 0) / vals.length
      : null;
  }

  return { promedio, n_jueces: promediosDocentes.length, por_criterio: porCriterio };
}

// Los que ya tienen nota primero, de mayor a menor; los sin calificar al final.
function porNotaDesc(a, b) {
  if (a.promedio == null && b.promedio == null) return 0;
  if (a.promedio == null) return 1;
  if (b.promedio == null) return -1;
  return b.promedio - a.promedio;
}

/**
 * Proyectos de una materia ordenados por nota, con su puesto.
 * Los empates comparten puesto y el siguiente salta (1, 1, 3…).
 * Un proyecto sin calificar no tiene puesto.
 */
function rankingDeMateria(materiaId, periodoId) {
  const proyectos = db
    .prepare(
      "SELECT id, titulo, integrantes, sala FROM proyectos WHERE materia_id = ? AND periodo_id = ?"
    )
    .all(materiaId, periodoId)
    .map((p) => ({ ...p, ...notaProyecto(p.id) }))
    .sort(porNotaDesc);

  let puesto = 0;
  let anterior = null;

  proyectos.forEach((p, i) => {
    if (p.promedio == null) {
      p.puesto = null;
      return;
    }
    if (anterior === null || p.promedio !== anterior) puesto = i + 1;
    anterior = p.promedio;
    p.puesto = puesto;
  });

  return proyectos;
}

module.exports = { notaProyecto, rankingDeMateria, porNotaDesc };
