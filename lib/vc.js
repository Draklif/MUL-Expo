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
// ---------------------------------------------------------------------
function torneo(id) {
  return db.prepare("SELECT * FROM vc_torneos WHERE id = ?").get(Number(id)) || null;
}

function torneosDe(juegoId) {
  return db
    .prepare("SELECT * FROM vc_torneos WHERE juego = ? ORDER BY created_at DESC")
    .all(String(juegoId));
}

// El torneo que se muestra de un juego: el que esté en curso, si no el que
// tenga inscripciones abiertas, si no el último. Un juego sin torneos
// devuelve null y su página lo dice en vez de reventar.
function torneoVigente(juegoId) {
  const lista = torneosDe(juegoId);
  if (!lista.length) return null;
  return (
    lista.find((t) => t.estado === "en_curso") ||
    lista.find((t) => t.estado === "inscripcion") ||
    lista[0]
  );
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
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// "2026-11-20 19:30" → { dia: "viernes 20 de noviembre", hora: "7:30 p. m." }
// Se parte la cadena a mano: pasarla por Date la correría cinco horas.
function momento(inicio) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(inicio || ""));
  if (!m) return null;

  const [, y, mes, d, hh, mm] = m;
  const anio = Number(y);
  const nMes = Number(mes);
  const nDia = Number(d);
  const nHora = Number(hh);
  const nMin = Number(mm);

  // Date solo para saber qué día de la semana cae; los números de arriba
  // ya salieron de la cadena y no dependen de la zona horaria.
  const diaSemana = DIAS[new Date(anio, nMes - 1, nDia).getDay()];
  const sufijo = nHora < 12 ? "a. m." : "p. m.";
  const hora12 = nHora % 12 === 0 ? 12 : nHora % 12;

  return {
    fecha: `${anio}-${mes}-${d}`,
    dia: `${diaSemana} ${nDia} de ${MESES[nMes - 1]}`,
    diaCorto: `${nDia} ${MESES[nMes - 1].slice(0, 3)}`,
    hora: `${hora12}:${String(nMin).padStart(2, "0")} ${sufijo}`,
  };
}

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
