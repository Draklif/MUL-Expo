const express = require("express");
const db = require("../db/database");
const { PASSWORD } = require("../config");
const { normalizar, esInstitucional, DOMINIO } = require("../lib/correos");
const { crearLimite } = require("../lib/limite");

const router = express.Router();

// La contraseña es la misma para todos, así que el login público necesita
// un freno contra intentos a ciegas. Solo cuentan los intentos FALLIDOS:
// entrar bien no gasta cupo, y así varios docentes tras la misma IP no se
// estorban entre ellos.
const limiteAcceso = crearLimite({ ventanaMs: 10 * 60 * 1000, maximo: 15 });

// El acceso de docentes vive en /acceso (no se enlaza desde el contenido
// público, solo con un enlace discreto al pie de la landing).
router.get("/acceso", (req, res) => {
  if (req.session.docente) return res.redirect("/panel");
  res.render("login", { error: null, email: "" });
});

function procesarAcceso(req, res) {
  const email = normalizar(req.body.email);
  const password = String(req.body.password || "");

  const fallar = (error, status = 400) =>
    res.status(status).render("login", { error, email });

  if (!email || !password) {
    return fallar("Escribe tu correo institucional y la contraseña.");
  }

  if (!esInstitucional(email)) {
    return fallar(`Usa tu correo @${DOMINIO}.`);
  }

  if (limiteAcceso.alcanzado(req.ip)) {
    return fallar("Demasiados intentos fallidos. Espera unos minutos y vuelve a probar.", 429);
  }

  const docente = db
    .prepare("SELECT id, name, code FROM docentes WHERE code = ? COLLATE NOCASE")
    .get(email);

  // Mismo mensaje para correo desconocido y clave equivocada: así la página
  // no sirve para averiguar quiénes son docentes.
  if (!docente || password.trim() !== PASSWORD) {
    limiteAcceso.registrar(req.ip);
    return fallar("Correo o contraseña incorrectos.", 401);
  }

  req.session.docente = { id: docente.id, name: docente.name, email: docente.code };
  res.redirect("/panel");
}

router.post("/acceso", procesarAcceso);

// Compatibilidad con la ruta anterior
router.get("/login", (req, res) => res.redirect("/acceso"));
router.post("/login", procesarAcceso);

// Al salir se vuelve a la Expo, no a la portada del programa: todo el panel
// docente es la herramienta de la Expo y soltarlos en el hub institucional es
// cambiarles de aplicación sin avisar.
router.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/expo"));
});

module.exports = router;
