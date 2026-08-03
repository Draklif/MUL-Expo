const express = require("express");
const db = require("../db/database");
const { PASSWORD } = require("../config");

const router = express.Router();

const listaDocentes = () =>
  db.prepare("SELECT id, name FROM docentes ORDER BY name").all();

// El acceso de docentes vive en /acceso (no se enlaza desde el contenido
// público, solo con un enlace discreto al pie de la landing).
router.get("/acceso", (req, res) => {
  if (req.session.docente) return res.redirect("/panel");
  res.render("login", { docentes: listaDocentes(), error: null });
});

function procesarAcceso(req, res) {
  const { docente_id, password } = req.body;

  const fallar = (error) =>
    res.render("login", { docentes: listaDocentes(), error });

  if (!docente_id || !password) {
    return fallar("Selecciona tu nombre e ingresa la contraseña.");
  }
  if (password.trim() !== PASSWORD) {
    return fallar("Contraseña incorrecta.");
  }

  const docente = db
    .prepare("SELECT id, name FROM docentes WHERE id = ?")
    .get(Number(docente_id));

  if (!docente) return fallar("Docente no encontrado.");

  req.session.docente = docente;
  res.redirect("/panel");
}

router.post("/acceso", procesarAcceso);

// Compatibilidad con la ruta anterior
router.get("/login", (req, res) => res.redirect("/acceso"));
router.post("/login", procesarAcceso);

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

module.exports = router;
