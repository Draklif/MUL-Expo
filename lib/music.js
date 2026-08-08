// =====================================================================
//  Multimedia Music Fest — el dominio del festival.
//
//  Una tarde, una tarima. Dos ideas mandan aquí:
//
//  1. Se inscriben DOS cosas distintas y por eso hay dos tablas. Un grupo
//     sube a tocar o a bailar; una persona se para detrás de una consola.
//     No comparten campos, ni cupo, ni conversación: al grupo se le pregunta
//     qué necesita en tarima, a la persona qué sabe hacer y en qué semestre
//     va. Meterlos en una sola tabla con una columna "tipo" habría sido
//     ahorrarse un CREATE TABLE a cambio de la mitad de las columnas vacías.
//
//  2. El CARTEL sale de la base y el ITINERARIO del JSON. Quién está adentro
//     lo deciden las inscripciones y la curaduría, así que vive aquí. A qué
//     hora toca cada quien lo decide una persona con el cronograma delante y
//     se escribe a mano en data/music-fest.json, igual que el itinerario de
//     la Expo. Son dos preguntas distintas y tienen dos casas distintas.
// =====================================================================
const db = require("../db/database");
const { MUSIC } = require("../config");
const { limpiarNombre } = require("./listas");
const { inscripcionesAbiertas } = require("./eventos");
const { generarCodigo, limpiarEmail, emailValido } = require("./registro");

const TIPOS = MUSIC.tipos;
const AREAS = MUSIC.areas;

// Los tres estados de cualquier inscripción, grupo o persona. Son los mismos
// para las dos porque la pregunta es la misma: ¿está adentro o no?
const ESTADOS = {
  pendiente: { label: "Pendiente", cls: "pend" },
  confirmado: { label: "Confirmado", cls: "ok" },
  rechazado: { label: "No admitido", cls: "no" },
};

const conEstado = (fila) =>
  fila ? { ...fila, estado_info: ESTADOS[fila.estado] || ESTADOS.pendiente } : null;

const tipoValido = (v) => TIPOS.find((t) => t === String(v || "").trim()) || null;
const area = (id) => AREAS.find((a) => a.id === String(id || "").trim()) || null;
const areaValida = (v) => (area(v) ? area(v).id : null);

// ---------------------------------------------------------------------
//  La edición
// ---------------------------------------------------------------------
const SELECT_EDICION = `
  SELECT e.*, p.codigo AS periodo_codigo, p.activo AS periodo_activo
    FROM music_ediciones e
    LEFT JOIN periodos p ON p.id = e.periodo_id`;

function edicion(id) {
  return db.prepare(`${SELECT_EDICION} WHERE e.id = ?`).get(Number(id)) || null;
}

function ediciones() {
  return db.prepare(`${SELECT_EDICION} ORDER BY e.created_at DESC`).all();
}

/**
 * La edición que ve el público: la del semestre activo y, si ese semestre
 * todavía no tiene festival, la última que se haya abierto. Así el día que se
 * cambia de semestre la página muestra el que acaba de pasar en vez de
 * quedarse en blanco.
 */
function edicionVigente() {
  return (
    db.prepare(`${SELECT_EDICION} WHERE p.activo = 1 ORDER BY e.created_at DESC LIMIT 1`).get() ||
    db.prepare(`${SELECT_EDICION} ORDER BY e.created_at DESC LIMIT 1`).get() ||
    null
  );
}

/*
 * No hay función para abrir una edición, y es a propósito: la del semestre en
 * curso se abre sola al arrancar (db/database.js) con los cupos de
 * config.MUSIC copiados a la fila. Empezar el semestre siguiente es cambiar
 * config.PERIODO y reiniciar; la de este queda archivada con su cartel.
 */

/**
 * Si el formulario recibe gente. Cuatro condiciones, y las dos primeras son
 * las de siempre: config manda sobre la base, y una edición archivada no
 * recibe a nadie aunque se le haya quedado la bandera arriba.
 */
function inscripcionAbierta(ed) {
  if (!ed) return false;
  if (!inscripcionesAbiertas("music-fest")) return false;
  if (!ed.periodo_activo) return false;
  return Boolean(ed.inscripcion_abierta) && ed.estado !== "finalizada";
}

// El cupo se mira por separado para cada puerta: que el cartel esté lleno no
// tiene por qué cerrarle la puerta a quien viene a mover luces.
function hayCupoActos(ed) {
  if (!ed || !ed.cupo_actos) return true;
  return contarActos(ed.id) < ed.cupo_actos;
}

function hayCupoProduccion(ed) {
  if (!ed || !ed.cupo_produccion) return true;
  return contarProduccion(ed.id) < ed.cupo_produccion;
}

// ---------------------------------------------------------------------
//  Los grupos del cartel
// ---------------------------------------------------------------------
/**
 * El cartel: los grupos confirmados, en el orden en que se anuncian. Un cartel
 * de festival se lee de mayor a menor —el que cierra la tarde va primero y más
 * grande—, así que el orden lo pone la organización y no la fecha de
 * inscripción. A igualdad de orden manda quién llegó antes.
 */
function actosDe(edicionId, estado = "confirmado") {
  const sql = estado
    ? "SELECT * FROM music_actos WHERE edicion_id = ? AND estado = ? ORDER BY orden, created_at"
    : "SELECT * FROM music_actos WHERE edicion_id = ? ORDER BY orden, created_at";

  const filas = estado
    ? db.prepare(sql).all(Number(edicionId), estado)
    : db.prepare(sql).all(Number(edicionId));

  return filas.map(conEstado);
}

function acto(id) {
  return conEstado(db.prepare("SELECT * FROM music_actos WHERE id = ?").get(Number(id)));
}

function actoPorCodigo(codigo) {
  const limpio = String(codigo || "").trim().toUpperCase();
  if (!limpio) return null;
  return conEstado(db.prepare("SELECT * FROM music_actos WHERE codigo = ?").get(limpio));
}

function actoPorCorreo(edicionId, email) {
  return conEstado(
    db
      .prepare("SELECT * FROM music_actos WHERE edicion_id = ? AND contacto_email = ? COLLATE NOCASE")
      .get(Number(edicionId), limpiarEmail(email))
  );
}

const contarActos = (edicionId) =>
  db
    .prepare("SELECT COUNT(*) AS n FROM music_actos WHERE edicion_id = ? AND estado != 'rechazado'")
    .get(Number(edicionId)).n;

// ---------------------------------------------------------------------
//  El equipo de producción
// ---------------------------------------------------------------------
function produccionDe(edicionId, estado = "confirmado") {
  const sql = estado
    ? "SELECT * FROM music_produccion WHERE edicion_id = ? AND estado = ? ORDER BY area, created_at"
    : "SELECT * FROM music_produccion WHERE edicion_id = ? ORDER BY area, created_at";

  const filas = estado
    ? db.prepare(sql).all(Number(edicionId), estado)
    : db.prepare(sql).all(Number(edicionId));

  return filas.map((p) => ({ ...conEstado(p), area_info: area(p.area) }));
}

function persona(id) {
  const fila = db.prepare("SELECT * FROM music_produccion WHERE id = ?").get(Number(id));
  return fila ? { ...conEstado(fila), area_info: area(fila.area) } : null;
}

function personaPorCodigo(codigo) {
  const limpio = String(codigo || "").trim().toUpperCase();
  if (!limpio) return null;
  const fila = db.prepare("SELECT * FROM music_produccion WHERE codigo = ?").get(limpio);
  return fila ? { ...conEstado(fila), area_info: area(fila.area) } : null;
}

function personaPorCorreo(edicionId, email) {
  const fila = db
    .prepare("SELECT * FROM music_produccion WHERE edicion_id = ? AND email = ? COLLATE NOCASE")
    .get(Number(edicionId), limpiarEmail(email));
  return fila ? { ...conEstado(fila), area_info: area(fila.area) } : null;
}

const contarProduccion = (edicionId) =>
  db
    .prepare("SELECT COUNT(*) AS n FROM music_produccion WHERE edicion_id = ? AND estado != 'rechazado'")
    .get(Number(edicionId)).n;

/**
 * Cuánta gente hay por área, confirmada y pendiente. Es lo que dice si el
 * festival va a tener a alguien en la consola de sonido o si todo el mundo se
 * apuntó a visuales, que es lo que pasa siempre.
 */
function porArea(edicionId) {
  const filas = db
    .prepare(
      `SELECT area,
              COALESCE(SUM(estado = 'confirmado'), 0) AS confirmados,
              COALESCE(SUM(estado = 'pendiente'), 0)  AS pendientes
         FROM music_produccion WHERE edicion_id = ? GROUP BY area`
    )
    .all(Number(edicionId));

  const porId = Object.fromEntries(filas.map((f) => [f.area, f]));

  // Se recorre AREAS y no las filas: un área sin nadie tiene que salir en cero
  // y no desaparecer del panel, que es justo la que hay que salir a buscar.
  return AREAS.map((a) => ({
    ...a,
    confirmados: porId[a.id] ? porId[a.id].confirmados : 0,
    pendientes: porId[a.id] ? porId[a.id].pendientes : 0,
  }));
}

// ---------------------------------------------------------------------
//  Consulta por código
// ---------------------------------------------------------------------
/**
 * Un solo buscador para las dos puertas. Quien consulta su código no tiene por
 * qué acordarse de si se inscribió como grupo o como producción, así que se
 * busca en las dos tablas y se devuelve lo que aparezca, diciendo qué es.
 */
function buscarPorCodigo(codigo) {
  const grupo = actoPorCodigo(codigo);
  if (grupo) return { que: "acto", acto: grupo, persona: null };

  const gente = personaPorCodigo(codigo);
  if (gente) return { que: "produccion", acto: null, persona: gente };

  return null;
}

// Código único de verdad, mirando las dos tablas: los dos códigos se dictan
// igual y no pueden chocar.
function codigoLibre() {
  const usadoActo = db.prepare("SELECT 1 FROM music_actos WHERE codigo = ?");
  const usadaPersona = db.prepare("SELECT 1 FROM music_produccion WHERE codigo = ?");
  let codigo = generarCodigo();
  for (let i = 0; i < 5 && (usadoActo.get(codigo) || usadaPersona.get(codigo)); i++) {
    codigo = generarCodigo();
  }
  return codigo;
}

// ---------------------------------------------------------------------
//  Cifras
// ---------------------------------------------------------------------
function resumen(edicionId) {
  const id = Number(edicionId);

  const actos = db
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(estado = 'confirmado'), 0) AS confirmados,
              COALESCE(SUM(estado = 'pendiente'), 0)  AS pendientes,
              COALESCE(SUM(CASE WHEN estado = 'confirmado' THEN integrantes ELSE 0 END), 0) AS en_tarima
         FROM music_actos WHERE edicion_id = ?`
    )
    .get(id);

  const prod = db
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(estado = 'confirmado'), 0) AS confirmados,
              COALESCE(SUM(estado = 'pendiente'), 0)  AS pendientes
         FROM music_produccion WHERE edicion_id = ?`
    )
    .get(id);

  return {
    actos,
    produccion: prod,
    // La cuenta que le importa a quien organiza: cuánta gente hay que mover
    // ese día, arriba y abajo de la tarima.
    gente: (actos.en_tarima || 0) + (prod.confirmados || 0),
  };
}

/** Lo que necesita la página pública, en un solo objeto. */
function cartel(ed) {
  if (!ed) return { actos: [], equipo: [], cifras: null };
  return {
    actos: actosDe(ed.id),
    equipo: produccionDe(ed.id),
    cifras: resumen(ed.id),
  };
}

module.exports = {
  TIPOS,
  AREAS,
  ESTADOS,
  tipoValido,
  area,
  areaValida,
  edicion,
  ediciones,
  edicionVigente,
  inscripcionAbierta,
  hayCupoActos,
  hayCupoProduccion,
  acto,
  actos: actosDe,
  actoPorCodigo,
  actoPorCorreo,
  contarActos,
  persona,
  produccion: produccionDe,
  personaPorCodigo,
  personaPorCorreo,
  contarProduccion,
  porArea,
  buscarPorCodigo,
  codigoLibre,
  resumen,
  cartel,
  limpiarNombre,
  limpiarEmail,
  emailValido,
};
