const express = require("express");
const db = require("../db/database");
const { parseLista, parseIntegrantes, unificar } = require("../lib/listas");

const router = express.Router();

const MAX_MATERIA = 80;
const MAX_ESTUDIANTE = 120;

// Statements reutilizados
const insertMateria = db.prepare(
  "INSERT INTO materias (nombre, created_by) VALUES (?, ?)"
);
const existeMateria = db.prepare(
  "SELECT 1 FROM materias WHERE nombre = ? COLLATE NOCASE"
);
const insertEstudiante = db.prepare(
  "INSERT OR IGNORE INTO estudiantes (materia_id, nombre) VALUES (?, ?)"
);

// Crear materia (rápido: desde el home)
router.post("/", (req, res) => {
  const { nombre } = req.body;
  if (!nombre || !nombre.trim()) return res.redirect("/");
  insertMateria.run(nombre.trim().slice(0, MAX_MATERIA), req.session.docente.id);
  res.redirect("/");
});

// Crear varias materias de un pegón (una por línea)
router.post("/batch", (req, res) => {
  const nombres = parseLista(req.body.nombres, MAX_MATERIA);
  if (!nombres.length) return res.redirect("/");

  let nuevas = 0;
  db.exec("BEGIN");
  try {
    for (const nombre of nombres) {
      if (existeMateria.get(nombre)) continue; // ya existe: no duplicar
      insertMateria.run(nombre, req.session.docente.id);
      nuevas++;
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  res.redirect(`/?nuevas=${nuevas}&omitidas=${nombres.length - nuevas}`);
});

// Ver materia con sus proyectos y su lista de estudiantes
router.get("/:id", (req, res) => {
  const materia = db.prepare("SELECT * FROM materias WHERE id = ?").get(req.params.id);
  if (!materia) return res.status(404).send("Materia no encontrada");

  const proyectos = db
    .prepare(
      `SELECT p.*,
              (SELECT COUNT(DISTINCT docente_id) FROM calificaciones c WHERE c.proyecto_id = p.id) AS n_jueces
       FROM proyectos p
       WHERE p.materia_id = ?
       ORDER BY p.created_at DESC`
    )
    .all(req.params.id);

  const estudiantes = db
    .prepare(
      "SELECT * FROM estudiantes WHERE materia_id = ? ORDER BY nombre COLLATE NOCASE"
    )
    .all(req.params.id);

  // Quién ya está en algún proyecto (para ver de un vistazo a los pendientes)
  const asignados = new Set();
  for (const p of proyectos) {
    for (const nombre of parseIntegrantes(p.integrantes)) {
      asignados.add(nombre.toLowerCase());
    }
  }

  res.render("materia", { materia, proyectos, estudiantes, asignados });
});

// Agregar estudiantes a la materia (uno o varios pegados de una lista)
router.post("/:id/estudiantes", (req, res) => {
  const materiaId = Number(req.params.id);
  const nombres = parseLista(req.body.nombres, MAX_ESTUDIANTE);
  if (!nombres.length) return res.redirect(`/materias/${materiaId}`);

  let nuevos = 0;
  db.exec("BEGIN");
  try {
    for (const nombre of nombres) {
      if (insertEstudiante.run(materiaId, nombre).changes) nuevos++;
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  res.redirect(
    `/materias/${materiaId}?nuevos=${nuevos}&repetidos=${nombres.length - nuevos}`
  );
});

// Quitar un estudiante de la lista de la materia
router.post("/:id/estudiantes/:eid/delete", (req, res) => {
  db.prepare("DELETE FROM estudiantes WHERE id = ? AND materia_id = ?").run(
    req.params.eid,
    req.params.id
  );
  res.redirect(`/materias/${req.params.id}`);
});

// Crear proyecto dentro de la materia
router.post("/:id/proyectos", (req, res) => {
  const materiaId = Number(req.params.id);
  const { titulo } = req.body;
  if (!titulo || !titulo.trim()) return res.redirect(`/materias/${materiaId}`);

  // Integrantes = seleccionados de la lista + nombres sueltos escritos a mano
  const seleccionados = [].concat(req.body.estudiantes || []);
  const sueltos = parseLista(req.body.integrantes_extra, MAX_ESTUDIANTE);
  const integrantes = unificar([...seleccionados, ...sueltos], MAX_ESTUDIANTE);

  db.exec("BEGIN");
  try {
    db.prepare(
      "INSERT INTO proyectos (materia_id, titulo, integrantes) VALUES (?, ?, ?)"
    ).run(materiaId, titulo.trim(), integrantes.join("\n"));

    // Los nombres nuevos quedan en la lista de la materia para la próxima vez
    for (const nombre of integrantes) insertEstudiante.run(materiaId, nombre);

    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  res.redirect(`/materias/${materiaId}`);
});

// Eliminar materia (cascada elimina proyectos, estudiantes y calificaciones)
router.post("/:id/delete", (req, res) => {
  db.prepare("DELETE FROM materias WHERE id = ?").run(req.params.id);
  res.redirect("/");
});

module.exports = router;
