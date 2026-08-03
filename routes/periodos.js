const express = require("express");
const periodos = require("../lib/periodos");

const router = express.Router();

// Abrir un semestre nuevo. Queda seleccionado para quien lo crea; activarlo
// (que es lo que decide dónde caen los registros nuevos) es un paso aparte.
router.post("/", (req, res) => {
  const codigo = String(req.body.codigo || "").trim();

  if (!periodos.codigoValido(codigo)) {
    return res.redirect("/panel?periodo_error=formato");
  }
  if (periodos.porCodigo(codigo)) {
    return res.redirect("/panel?periodo_error=existe");
  }

  const nuevo = periodos.crear(codigo);
  if (req.body.activar) periodos.activar(nuevo.id);
  req.session.periodoId = nuevo.id;

  res.redirect(`/panel?periodo_nuevo=${encodeURIComponent(nuevo.codigo)}`);
});

// Marcar un semestre como el activo: a partir de ahí, todo registro nuevo de
// estudiantes entra en él.
router.post("/:id/activar", (req, res) => {
  const periodo = periodos.porId(req.params.id);
  if (!periodo) return res.status(404).send("Semestre no encontrado");

  periodos.activar(periodo.id);
  req.session.periodoId = periodo.id;

  res.redirect(`/panel?periodo_activo=${encodeURIComponent(periodo.codigo)}`);
});

module.exports = router;
