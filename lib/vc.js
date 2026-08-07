// =====================================================================
//  Virtual Champions — el dominio del torneo.
//
//  Aquí vive todo lo que sabe de juegos, series y marcadores: las rutas se
//  limitan a pedir y a renderizar. La regla que manda es una sola: el
//  marcador de una serie NO se escribe a mano, se cuenta desde los mapas.
//  Así no hay forma de dejar una partida diciendo 2-0 con un solo mapa
//  jugado.
// =====================================================================
const db = require("../db/database");
const { VC } = require("../config");
const { limpiarNombre } = require("./listas");
const { inscripcionesAbiertas } = require("./eventos");
const { generarCodigo, limpiarEmail, emailValido } = require("./registro");

const MAX_JUGADORES = 12;

// ---------------------------------------------------------------------
//  Juegos
// ---------------------------------------------------------------------
const JUEGOS = VC.juegos;

function juego(id) {
  return JUEGOS.find((j) => j.id === String(id || "")) || null;
}

// El juego de una dirección. Sin coincidencia devuelve el primero de la
// lista: una URL vieja o mal tecleada muestra algo en vez de un 404.
function juegoDe(id) {
  return juego(id) || JUEGOS[0] || null;
}

// ---------------------------------------------------------------------
//  Formatos de serie
// ---------------------------------------------------------------------
function formatoLabel(n) {
  return `BO${Number(n) || 1}`;
}

// Cuántos mapas hay que ganar: BO1→1, BO3→2, BO5→3.
function victoriasNecesarias(formato) {
  return Math.ceil((Number(formato) || 1) / 2);
}

// El formato que rige una partida: el suyo si lo tiene, si no el de su ronda.
function formatoDe(partida) {
  return Number(partida.formato || partida.ronda_formato || 1);
}

const ESTADOS_PARTIDA = {
  programada: { label: "Programada", cls: "prog" },
  en_vivo: { label: "En vivo", cls: "vivo" },
  finalizada: { label: "Finalizada", cls: "fin" },
  aplazada: { label: "Aplazada", cls: "apl" },
};

const ESTADOS_EQUIPO = {
  pendiente: { label: "Pendiente", cls: "pend" },
  aprobado: { label: "Aprobado", cls: "ok" },
  rechazado: { label: "Rechazado", cls: "no" },
};

// ---------------------------------------------------------------------
//  Torneos
//
//  Un torneo es un juego EN UN SEMESTRE. Esa segunda mitad es la que hace
//  que el torneo se pueda repetir: el del semestre en curso se abre solo al
//  arrancar (db/database.js) y el del semestre pasado se queda archivado con
//  sus equipos y su bracket, sin estorbarle al nuevo.
// ---------------------------------------------------------------------
const SELECT_TORNEO = `
  SELECT t.*, p.codigo AS periodo, p.activo AS periodo_activo
    FROM vc_torneos t
    LEFT JOIN periodos p ON p.id = t.periodo_id
`;

function torneo(id) {
  return db.prepare(`${SELECT_TORNEO} WHERE t.id = ?`).get(Number(id)) || null;
}

/**
 * Los torneos de un juego. Sin `periodoId` los trae todos (es lo que quiere
 * el panel, que muestra también el historial); con uno, solo los de ese
 * semestre.
 */
function torneosDe(juegoId, periodoId = null) {
  return periodoId
    ? db
        .prepare(`${SELECT_TORNEO} WHERE t.juego = ? AND t.periodo_id = ? ORDER BY t.created_at DESC`)
        .all(String(juegoId), Number(periodoId))
    : db
        .prepare(`${SELECT_TORNEO} WHERE t.juego = ? ORDER BY t.created_at DESC`)
        .all(String(juegoId));
}

/**
 * El torneo que ve el público: el del semestre activo. Si ese semestre
 * todavía no tiene uno —una base vieja, o un juego que se acaba de agregar a
 * config— se muestra el último que haya habido, igual que hace la jam: más
 * vale enseñar el torneo que acaba de pasar que una página en blanco.
 *
 * Un juego sin ningún torneo devuelve null y su página lo dice en vez de
 * reventar.
 */
function torneoVigente(juegoId) {
  const delSemestre = db
    .prepare(`${SELECT_TORNEO} WHERE t.juego = ? AND p.activo = 1 ORDER BY t.created_at DESC LIMIT 1`)
    .get(String(juegoId));
  if (delSemestre) return delSemestre;

  return torneosDe(juegoId)[0] || null;
}

// Todos los torneos del semestre activo, de cualquier juego. Es lo que ofrece
// el formulario de inscripción.
function torneosDelSemestre() {
  return db.prepare(`${SELECT_TORNEO} WHERE p.activo = 1 ORDER BY t.created_at DESC`).all();
}

/**
 * Si un torneo está recibiendo equipos. Son tres candados y tienen que estar
 * abiertos los tres:
 *
 *   1. config dice que el torneo es el evento de este semestre y que sus
 *      inscripciones están abiertas —el interruptor de verdad—;
 *   2. el torneo es el del semestre activo (uno de hace un año no recibe a
 *      nadie aunque su fila diga que sí);
 *   3. su propio interruptor sigue en 1, que es lo que se baja solo al armar
 *      el bracket.
 *
 * Es el gemelo de jam.inscripcionAbierta: los dos eventos cierran igual.
 */
function inscripcionAbierta(t) {
  if (!t) return false;
  if (!inscripcionesAbiertas("virtual-champions")) return false;
  if (!t.periodo_activo) return false;
  if (!t.inscripcion_abierta || t.estado === "finalizado") return false;
  if (!t.cupo_equipos) return true;
  return contarEquipos(t.id) < t.cupo_equipos;
}

// Los que ya están dentro (aprobados y por revisar). Los rechazados no ocupan
// cupo: si no entraron, su lugar sigue libre.
function contarEquipos(torneoId) {
  return db
    .prepare("SELECT COUNT(*) AS n FROM vc_equipos WHERE torneo_id = ? AND estado != 'rechazado'")
    .get(Number(torneoId)).n;
}

// ---------------------------------------------------------------------
//  Equipos y jugadores
// ---------------------------------------------------------------------
function equipo(id) {
  return db.prepare("SELECT * FROM vc_equipos WHERE id = ?").get(Number(id)) || null;
}

function equipoPorCodigo(codigo) {
  return (
    db
      .prepare("SELECT * FROM vc_equipos WHERE codigo = ?")
      .get(String(codigo || "").trim().toUpperCase()) || null
  );
}

function jugadoresDe(equipoId) {
  return db
    .prepare(
      "SELECT * FROM vc_jugadores WHERE equipo_id = ? ORDER BY capitan DESC, suplente, orden, id"
    )
    .all(Number(equipoId));
}

function equipoConRoster(id) {
  const eq = equipo(id);
  if (!eq) return null;
  eq.jugadores = jugadoresDe(eq.id);
  eq.torneo = torneo(eq.torneo_id);
  eq.juego = eq.torneo ? juego(eq.torneo.juego) : null;
  return eq;
}

function equiposDe(torneoId, estado = "aprobado") {
  const equipos = estado
    ? db
        .prepare(
          "SELECT * FROM vc_equipos WHERE torneo_id = ? AND estado = ? ORDER BY nombre COLLATE NOCASE"
        )
        .all(Number(torneoId), estado)
    : db
        .prepare("SELECT * FROM vc_equipos WHERE torneo_id = ? ORDER BY created_at DESC")
        .all(Number(torneoId));

  return equipos.map((e) => ({ ...e, jugadores: jugadoresDe(e.id) }));
}

// Los que se inscribieron solos y siguen esperando equipo.
function agentesLibres(torneoId) {
  return db
    .prepare(
      "SELECT * FROM vc_jugadores WHERE torneo_id = ? AND equipo_id IS NULL ORDER BY created_at"
    )
    .all(Number(torneoId));
}

// La ficha de quien se inscribió solo, para la página de consulta.
function jugadorPorCodigo(codigo) {
  const jug = db
    .prepare("SELECT * FROM vc_jugadores WHERE codigo = ?")
    .get(String(codigo || "").trim().toUpperCase());
  if (!jug) return null;
  jug.torneo = torneo(jug.torneo_id);
  jug.juego = jug.torneo ? juego(jug.torneo.juego) : null;
  jug.equipo = jug.equipo_id ? equipoConRoster(jug.equipo_id) : null;
  // Cuántos van esperando, para poder decirle cuánto falta.
  jug.esperando = agentesLibres(jug.torneo_id).length;
  return jug;
}

// Un código puede ser de un equipo o de alguien que se inscribió solo: el
// estudiante no tiene por qué saber la diferencia, teclea el suyo y ya.
function buscarPorCodigo(codigo) {
  const limpio = String(codigo || "").trim().toUpperCase();
  if (!limpio) return null;

  const eq = equipoPorCodigo(limpio);
  if (eq) {
    return { tipo: "equipo", codigo: limpio, equipo: equipoConRoster(eq.id) };
  }

  const jug = jugadorPorCodigo(limpio);
  if (jug) return { tipo: "jugador", codigo: limpio, jugador: jug };

  return null;
}

/**
 * Empareja los campos repetidos del formulario en una lista de jugadores.
 * Es el gemelo de integrantesDesdeFormulario del registro de la Expo, pero
 * con cuatro columnas. La identidad sigue siendo el correo: dos filas con el
 * mismo correo son una sola persona.
 */
function jugadoresDesdeFormulario(body, max = MAX_JUGADORES) {
  const nombres = [].concat(body.jugador_nombre || []);
  const correos = [].concat(body.jugador_email || []);
  const nicks = [].concat(body.jugador_nick || []);
  const roles = [].concat(body.jugador_rol || []);
  const total = Math.max(nombres.length, correos.length, nicks.length, roles.length);

  const vistos = new Set();
  const out = [];

  for (let i = 0; i < total && out.length < max; i++) {
    const nombre = limpiarNombre(nombres[i]).slice(0, 120);
    const email = limpiarEmail(correos[i]);
    const nick = String(nicks[i] || "").trim().slice(0, 60);
    const rol = String(roles[i] || "").trim().slice(0, 40);
    if (!nombre && !email && !nick) continue; // fila en blanco

    if (email && vistos.has(email)) continue;
    if (email) vistos.add(email);

    out.push({ nombre, email, nick, rol });
  }

  return out;
}

// Código único de verdad: se reintenta por si dos personas caen en el mismo.
function codigoLibre() {
  const usadoEquipo = db.prepare("SELECT 1 FROM vc_equipos WHERE codigo = ?");
  const usadoJugador = db.prepare("SELECT 1 FROM vc_jugadores WHERE codigo = ?");
  let codigo = generarCodigo();
  for (let i = 0; i < 5 && (usadoEquipo.get(codigo) || usadoJugador.get(codigo)); i++) {
    codigo = generarCodigo();
  }
  return codigo;
}

// ---------------------------------------------------------------------
//  Partidas
// ---------------------------------------------------------------------
const SELECT_PARTIDA = `
  SELECT p.*,
         r.nombre AS ronda, r.orden AS ronda_orden,
         r.formato AS ronda_formato, r.presencial AS ronda_presencial,
         a.nombre AS equipo_a, a.tag AS tag_a,
         b.nombre AS equipo_b, b.tag AS tag_b,
         t.juego  AS juego
    FROM vc_partidas p
    JOIN vc_rondas   r ON r.id = p.ronda_id
    JOIN vc_torneos  t ON t.id = p.torneo_id
    LEFT JOIN vc_equipos a ON a.id = p.equipo_a_id
    LEFT JOIN vc_equipos b ON b.id = p.equipo_b_id
`;

function mapasDe(partidaId) {
  return db
    .prepare("SELECT * FROM vc_mapas WHERE partida_id = ? ORDER BY orden, id")
    .all(Number(partidaId));
}

// Los adornos que toda vista necesita y ninguna debería calcular por su cuenta.
function decorar(p) {
  if (!p) return null;
  const f = formatoDe(p);
  return {
    ...p,
    formato_real: f,
    formato_label: formatoLabel(f),
    presencial: p.ronda_presencial,
    estado_info: ESTADOS_PARTIDA[p.estado] || ESTADOS_PARTIDA.programada,
    equipo_a: p.equipo_a || "Por definir",
    equipo_b: p.equipo_b || "Por definir",
    definida: Boolean(p.equipo_a_id && p.equipo_b_id),
  };
}

function partida(id) {
  return decorar(db.prepare(`${SELECT_PARTIDA} WHERE p.id = ?`).get(Number(id)));
}

// Partida + mapas + rosters. Es lo que pide la ficha pública.
function partidaConTodo(id) {
  const p = partida(id);
  if (!p) return null;
  p.mapas = mapasDe(p.id);
  p.roster_a = p.equipo_a_id ? jugadoresDe(p.equipo_a_id) : [];
  p.roster_b = p.equipo_b_id ? jugadoresDe(p.equipo_b_id) : [];
  p.torneo = torneo(p.torneo_id);
  p.juego_info = juego(p.juego);
  return p;
}

function partidasDe(torneoId) {
  return db
    .prepare(`${SELECT_PARTIDA} WHERE p.torneo_id = ? ORDER BY r.orden, p.orden, p.id`)
    .all(Number(torneoId))
    .map(decorar);
}

// El bracket agrupado por rondas, listo para pintar en columnas.
function bracketDe(torneoId) {
  const rondas = db
    .prepare("SELECT * FROM vc_rondas WHERE torneo_id = ? ORDER BY orden, id")
    .all(Number(torneoId));
  const partidas = partidasDe(torneoId);
  return rondas.map((r) => ({
    ...r,
    formato_label: formatoLabel(r.formato),
    partidas: partidas.filter((p) => p.ronda_id === r.id),
  }));
}

function enVivo(torneoId) {
  return db
    .prepare(
      `${SELECT_PARTIDA} WHERE p.torneo_id = ? AND p.estado = 'en_vivo'
       ORDER BY r.orden, p.orden, p.id`
    )
    .all(Number(torneoId))
    .map((p) => ({ ...decorar(p), mapas: mapasDe(p.id) }));
}

// Las que vienen: primero las que tienen hora puesta, y las que no, al final.
function proximas(torneoId, limite = 6) {
  return db
    .prepare(
      `${SELECT_PARTIDA}
        WHERE p.torneo_id = ? AND p.estado IN ('programada', 'aplazada')
        ORDER BY (p.inicio IS NULL), p.inicio, r.orden, p.orden
        LIMIT ?`
    )
    .all(Number(torneoId), Number(limite))
    .map(decorar);
}

function ultimas(torneoId, limite = 6) {
  return db
    .prepare(
      `${SELECT_PARTIDA}
        WHERE p.torneo_id = ? AND p.estado = 'finalizada'
        ORDER BY p.updated_at DESC LIMIT ?`
    )
    .all(Number(torneoId), Number(limite))
    .map(decorar);
}

function partidasDeEquipo(equipoId) {
  return db
    .prepare(
      `${SELECT_PARTIDA}
        WHERE p.equipo_a_id = ? OR p.equipo_b_id = ?
        ORDER BY r.orden, p.orden`
    )
    .all(Number(equipoId), Number(equipoId))
    .map(decorar);
}

// ---------------------------------------------------------------------
//  El corazón: recalcular una serie
// ---------------------------------------------------------------------
/**
 * Vuelve a contar el marcador de una partida desde sus mapas, decide si ya
 * hay ganador y, si lo hay, lo sube al hueco que le toca en la ronda
 * siguiente.
 *
 * Se llama después de CUALQUIER cambio en los mapas. Es idempotente: correrla
 * dos veces deja lo mismo. Si un mapa se corrige y el ganador cambia, el
 * equipo que había subido se baja solo (por eso se limpia el slot antes de
 * volver a escribirlo).
 */
function recalcular(partidaId) {
  const p = db.prepare("SELECT * FROM vc_partidas WHERE id = ?").get(Number(partidaId));
  if (!p) return null;

  const ronda = db.prepare("SELECT * FROM vc_rondas WHERE id = ?").get(p.ronda_id);
  const formato = Number(p.formato || (ronda && ronda.formato) || 1);
  const meta = victoriasNecesarias(formato);

  const mapas = mapasDe(p.id).filter((m) => m.estado === "jugado");
  const a = mapas.filter((m) => m.ganador === "a").length;
  const b = mapas.filter((m) => m.ganador === "b").length;

  let ganadorId = null;
  if (a >= meta && p.equipo_a_id) ganadorId = p.equipo_a_id;
  else if (b >= meta && p.equipo_b_id) ganadorId = p.equipo_b_id;

  // El estado solo se mueve solo hacia 'finalizada' y de vuelta. Que una
  // partida esté 'en_vivo' o 'programada' lo decide el docente; que esté
  // cerrada lo decide el marcador.
  let estado = p.estado;
  if (ganadorId) estado = "finalizada";
  else if (p.estado === "finalizada") estado = "en_vivo";

  db.prepare(
    `UPDATE vc_partidas
        SET marcador_a = ?, marcador_b = ?, ganador_id = ?, estado = ?,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`
  ).run(a, b, ganadorId, estado, p.id);

  // Propagación al bracket.
  if (p.avanza_a_partida_id && (p.avanza_a_slot === "a" || p.avanza_a_slot === "b")) {
    const columna = p.avanza_a_slot === "a" ? "equipo_a_id" : "equipo_b_id";
    const siguiente = db
      .prepare("SELECT * FROM vc_partidas WHERE id = ?")
      .get(p.avanza_a_partida_id);

    // No se toca una partida siguiente que ya se jugó: corregir un resultado
    // viejo no puede borrar de un plumazo lo que pasó después. Eso lo arregla
    // el docente a mano, sabiendo lo que hace.
    if (siguiente && siguiente.estado !== "finalizada") {
      db.prepare(
        `UPDATE vc_partidas SET ${columna} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(ganadorId, p.avanza_a_partida_id);
    }
  }

  return partida(p.id);
}

// ---------------------------------------------------------------------
//  Fechas y horas (siempre en local, nunca por Date)
// ---------------------------------------------------------------------
// El formateo vive en lib/fechas.js desde que la Jam necesitó lo mismo: una
// hora escrita a mano se lee partiendo la cadena, y esa regla tiene que ser
// una sola para todo el sitio. Se sigue exportando desde aquí porque las
// vistas del torneo lo piden por este nombre.
const { momento } = require("./fechas");

// Agrupa partidas por día para el calendario. Las que no tienen hora quedan
// en un grupo aparte al final: existen, pero todavía no se sabe cuándo.
function porDia(partidas) {
  const grupos = new Map();
  const sinFecha = [];

  for (const p of partidas) {
    const m = momento(p.inicio);
    if (!m) {
      sinFecha.push(p);
      continue;
    }
    if (!grupos.has(m.fecha)) grupos.set(m.fecha, { fecha: m.fecha, dia: m.dia, partidas: [] });
    grupos.get(m.fecha).partidas.push({ ...p, momento: m });
  }

  const out = [...grupos.values()].sort((x, y) => x.fecha.localeCompare(y.fecha));
  if (sinFecha.length) out.push({ fecha: "", dia: "Por programar", partidas: sinFecha });
  return out;
}

module.exports = {
  MAX_JUGADORES,
  JUEGOS,
  juego,
  juegoDe,
  formatoLabel,
  formatoDe,
  victoriasNecesarias,
  ESTADOS_PARTIDA,
  ESTADOS_EQUIPO,
  torneo,
  torneosDe,
  torneoVigente,
  torneosDelSemestre,
  inscripcionAbierta,
  contarEquipos,
  equipo,
  equipoPorCodigo,
  equipoConRoster,
  equiposDe,
  jugadoresDe,
  agentesLibres,
  jugadorPorCodigo,
  buscarPorCodigo,
  jugadoresDesdeFormulario,
  codigoLibre,
  limpiarEmail,
  emailValido,
  partida,
  partidaConTodo,
  partidasDe,
  partidasDeEquipo,
  bracketDe,
  mapasDe,
  enVivo,
  proximas,
  ultimas,
  recalcular,
  momento,
  porDia,
};
