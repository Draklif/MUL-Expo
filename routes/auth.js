const express = require("express");
const db = require("../db/database");
const { PASSWORD } = require("../config");

const router = express.Router();

router.get("/login", (req, res) => {
  const docentes = db.prepare("SELECT id, name FROM docentes ORDER BY name").all();
  res.render("login", { docentes, error: null });
});

router.post("/login", (req, res) => {
  const { docente_id, password } = req.body;

  if (!docente_id || !password) {
    const docentes = db.prepare("SELECT id, name FROM docentes ORDER BY name").all();
    return res.render("login", { docentes, error: "Selecciona tu nombre e ingresa la contraseña." });
  }

  if (password.trim() !== PASSWORD) {
    const docentes = db.prepare("SELECT id, name FROM docentes ORDER BY name").all();
    return res.render("login", { docentes, error: "Contraseña incorrecta." });
  }

  const docente = db
    .prepare("SELECT id, name FROM docentes WHERE id = ?")
    .get(Number(docente_id));

  if (!docente) {
    const docentes = db.prepare("SELECT id, name FROM docentes ORDER BY name").all();
    return res.render("login", { docentes, error: "Docente no encontrado." });
  }

  req.session.docente = docente;
  res.redirect("/");
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

module.exports = router;
