// =====================================================================
//  Semestres. Las materias son estables; lo que cambia cada semestre son
//  los estudiantes registrados, sus proyectos, sus notas y certificados.
//
//  Hay siempre un semestre ACTIVO: es donde caen los registros nuevos que
//  hacen los estudiantes, sin importar qué esté mirando cada docente.
// =====================================================================
const db = require("../db/database");

const RE_CODIGO = /^\d{4}-\d{2}$/;

function todos() {
  return db.prepare("SELECT * FROM periodos ORDER BY codigo DESC").all();
}

function activo() {
  return (
    db.prepare("SELECT * FROM periodos WHERE activo = 1").get() ||
    db.prepare("SELECT * FROM periodos ORDER BY id DESC").get()
  );
}

function porId(id) {
  if (!id) return null;
  return db.prepare("SELECT * FROM periodos WHERE id = ?").get(Number(id)) || null;
}

function porCodigo(codigo) {
  return db.prepare("SELECT * FROM periodos WHERE codigo = ?").get(String(codigo).trim()) || null;
}

// Formato "2026-20": año y 10 (primer semestre) o 20 (segundo).
function codigoValido(codigo) {
  return RE_CODIGO.test(String(codigo || "").trim());
}

function crear(codigo) {
  const limpio = String(codigo).trim();
  db.prepare("INSERT INTO periodos (codigo, activo) VALUES (?, 0)").run(limpio);
  return porCodigo(limpio);
}

function activar(id) {
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE periodos SET activo = 0").run();
    db.prepare("UPDATE periodos SET activo = 1 WHERE id = ?").run(Number(id));
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return porId(id);
}

/**
 * Middleware: deja en req.periodo el semestre que el docente está viendo.
 * Se recuerda en la sesión y por defecto es el activo.
 */
function conPeriodo(req, res, next) {
  if (req.query.periodo) {
    const elegido = porId(req.query.periodo);
    if (elegido) req.session.periodoId = elegido.id;
  }

  req.periodo = porId(req.session.periodoId) || activo();
  res.locals.periodo = req.periodo;
  res.locals.periodos = todos();
  res.locals.periodoActivo = activo();
  next();
}

module.exports = {
  todos,
  activo,
  porId,
  porCodigo,
  codigoValido,
  crear,
  activar,
  conPeriodo,
};
