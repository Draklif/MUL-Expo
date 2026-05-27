const express = require("express");
const db = require("../db/database");
const { CRITERIOS, CRITERIOS_IND } = require("../config");

const router = express.Router();

// Helper: divide el campo integrantes en array limpio
function parseIntegrantes(texto) {
  if (!texto) return [];
  return texto.split("\n").map((s) => s.trim()).filter(Boolean);
}

// Hoja de evaluación del proyecto
router.get("/:id", (req, res) => {
  const proyecto = db
    .prepare(
      `SELECT p.*, m.nombre AS materia_nombre, m.id AS materia_id
       FROM proyectos p
       JOIN materias m ON m.id = p.materia_id
       WHERE p.id = ?`
    )
    .get(req.params.id);

  if (!proyecto) return res.status(404).send("Proyecto no encontrado");

  // Calificaciones previas de proyecto (este docente)
  const misCalif = db
    .prepare(
      `SELECT criterio, puntaje FROM calificaciones
       WHERE proyecto_id = ? AND docente_id = ?`
    )
    .all(req.params.id, req.session.docente.id);

  const misCalifMap = Object.fromEntries(misCalif.map((c) => [c.criterio, c.puntaje]));

  // Calificaciones individuales previas de este docente → { nombre: { criterio: puntaje } }
  const misCalifInd = db
    .prepare(
      `SELECT integrante, criterio, puntaje FROM calificaciones_ind
       WHERE proyecto_id = ? AND docente_id = ?`
    )
    .all(req.params.id, req.session.docente.id);

  const misCalifIndMap = {};
  for (const c of misCalifInd) {
    if (!misCalifIndMap[c.integrante]) misCalifIndMap[c.integrante] = {};
    misCalifIndMap[c.integrante][c.criterio] = c.puntaje;
  }

  const integrantes = parseIntegrantes(proyecto.integrantes);

  // Promedios globales por integrante (TODOS los docentes) para mostrar resumen
  const todasCalifInd = db
    .prepare(
      `SELECT integrante, criterio, puntaje FROM calificaciones_ind WHERE proyecto_id = ?`
    )
    .all(req.params.id);

  // Acumular: { nombre → { criterio → [puntajes] } }
  const acum = {};
  for (const c of todasCalifInd) {
    if (!acum[c.integrante]) acum[c.integrante] = {};
    if (!acum[c.integrante][c.criterio]) acum[c.integrante][c.criterio] = [];
    acum[c.integrante][c.criterio].push(c.puntaje);
  }

  // Convertir a promedios: { nombre → { criterio → avg, _promedio → avg, _nJueces → n } }
  const resumenInd = {};
  for (const nombre of integrantes) {
    const datos = acum[nombre] || {};
    const promediosCrit = {};
    let suma = 0, cuenta = 0, nJueces = 0;
    for (const { key } of CRITERIOS_IND) {
      const vals = datos[key] || [];
      if (vals.length) {
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        promediosCrit[key] = avg;
        suma += avg;
        cuenta++;
        nJueces = Math.max(nJueces, vals.length);
      } else {
        promediosCrit[key] = null;
      }
    }
    resumenInd[nombre] = {
      ...promediosCrit,
      _promedio: cuenta ? suma / cuenta : null,
      _nJueces: nJueces,
    };
  }

  res.render("proyecto", { proyecto, misCalifMap, misCalifIndMap, integrantes, resumenInd });
});

// Guardar / actualizar calificaciones del proyecto (upsert)
router.post("/:id/calificar", (req, res) => {
  const proyectoId = Number(req.params.id);
  const docenteId = req.session.docente.id;

  const upsert = db.prepare(`
    INSERT INTO calificaciones (proyecto_id, docente_id, criterio, puntaje, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (proyecto_id, docente_id, criterio)
    DO UPDATE SET puntaje = excluded.puntaje, updated_at = CURRENT_TIMESTAMP
  `);

  db.exec("BEGIN");
  try {
    for (const { key } of CRITERIOS) {
      const raw = req.body[`crit_${key}`];
      if (raw === undefined || raw === "") continue;
      const val = Number(raw);
      if (Number.isNaN(val) || val < 0) continue;
      upsert.run(proyectoId, docenteId, key, val);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  res.redirect(`/proyectos/${proyectoId}?ok=1`);
});

// Guardar / actualizar calificaciones individuales (upsert)
router.post("/:id/calificar-ind", (req, res) => {
  const proyectoId = Number(req.params.id);
  const docenteId = req.session.docente.id;

  // Reconstruir lista de integrantes desde la DB (fuente de verdad)
  const proyecto = db.prepare("SELECT integrantes FROM proyectos WHERE id = ?").get(proyectoId);
  if (!proyecto) return res.status(404).send("Proyecto no encontrado");

  const integrantes = parseIntegrantes(proyecto.integrantes);

  const upsert = db.prepare(`
    INSERT INTO calificaciones_ind (proyecto_id, docente_id, integrante, criterio, puntaje, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (proyecto_id, docente_id, integrante, criterio)
    DO UPDATE SET puntaje = excluded.puntaje, updated_at = CURRENT_TIMESTAMP
  `);

  db.exec("BEGIN");
  try {
    integrantes.forEach((nombre, idx) => {
      for (const { key } of CRITERIOS_IND) {
        const raw = req.body[`ind_${idx}_${key}`];
        if (raw === undefined || raw === "") continue;
        const val = Number(raw);
        if (Number.isNaN(val) || val < 0) continue;
        upsert.run(proyectoId, docenteId, nombre, key, val);
      }
    });
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  res.redirect(`/proyectos/${proyectoId}?ok=ind`);
});

// Eliminar proyecto
router.post("/:id/delete", (req, res) => {
  const proyecto = db.prepare("SELECT materia_id FROM proyectos WHERE id = ?").get(req.params.id);
  db.prepare("DELETE FROM proyectos WHERE id = ?").run(req.params.id);
  res.redirect(proyecto ? `/materias/${proyecto.materia_id}` : "/");
});

module.exports = router;
