const express = require("express");
const db = require("../db/database");

const router = express.Router();

// Crear materia (rápido: desde el home)
router.post("/", (req, res) => {
  const { nombre } = req.body;
  if (!nombre || !nombre.trim()) return res.redirect("/");
  db.prepare("INSERT INTO materias (nombre, created_by) VALUES (?, ?)").run(
    nombre.trim(),
    req.session.docente.id
  );
  res.redirect("/");
});

// Ver materia con sus proyectos
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

  res.render("materia", { materia, proyectos });
});

// Crear proyecto dentro de la materia
router.post("/:id/proyectos", (req, res) => {
  const { titulo, integrantes } = req.body;
  if (!titulo || !titulo.trim()) return res.redirect(`/materias/${req.params.id}`);
  db.prepare(
    "INSERT INTO proyectos (materia_id, titulo, integrantes) VALUES (?, ?, ?)"
  ).run(req.params.id, titulo.trim(), (integrantes || "").trim());
  res.redirect(`/materias/${req.params.id}`);
});

// Eliminar materia (cascada elimina proyectos y calificaciones)
router.post("/:id/delete", (req, res) => {
  db.prepare("DELETE FROM materias WHERE id = ?").run(req.params.id);
  res.redirect("/");
});

module.exports = router;
