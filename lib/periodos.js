// =====================================================================
//  Semestres. Las materias son estables; lo que cambia cada semestre son
//  los estudiantes registrados, sus proyectos, sus notas y certificados.
//
//  Hay siempre un semestre ACTIVO: es donde caen los registros nuevos que
//  hacen los estudiantes, sin importar qué esté mirando cada docente.
//
//  Cuál es NO se decide aquí ni desde ningún panel: lo dice config.PERIODO y
//  lo aplica db/database.js al arrancar. Este módulo solo lee. Es a propósito:
//  con un botón en el panel y una línea en el config habría dos verdades, y
//  tarde o temprano una de las dos estaría equivocada.
// =====================================================================
const db = require("../db/database");

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

/**
 * Middleware: deja en req.periodo el semestre que el docente está viendo.
 * Se recuerda en la sesión y por defecto es el activo.
 *
 * Mirar otro semestre es solo eso, mirar: los registros que hagan los
 * estudiantes siguen entrando en el activo pase lo que pase.
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
  conPeriodo,
};
