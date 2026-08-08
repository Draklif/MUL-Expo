// =====================================================================
//  Los premios que se adjudican a mano.
//
//  La Expo no pasa por aquí: su podio sale de las notas y lo calcula
//  lib/ranking.js. El torneo, la jam y el festival no tienen nota que
//  calcular —quién fue el mejor apartado artístico lo decide un jurado
//  mirando los juegos—, así que alguien tiene que declararlo, y eso es lo
//  que guarda este módulo.
//
//  Las categorías salen de config (VC.premios, JAM.premios,
//  MUSIC.premios) y en la base solo queda el id de la que se adjudicó:
//  agregar una categoría es agregar una línea al config, y quitarla no
//  rompe los certificados que ya se emitieron con ella.
// =====================================================================
const db = require("../db/database");
const { VC, JAM, MUSIC } = require("../config");

// De qué evento son las categorías de cada bloque de config.
const CATALOGOS = {
  "virtual-champions": VC.premios,
  "jam-de-altura": JAM.premios,
  "music-fest": MUSIC.premios,
};

// De dónde salen los candidatos de cada ámbito y con qué ref_tipo se guardan.
// Solo entra quien quedó adentro: un premio a alguien que no participó no
// significa nada. Ojo con el nombre del estado, que no es el mismo en los tres
// —el torneo y la jam aprueban equipos, el festival confirma inscripciones—.
const FUENTES = {
  "virtual-champions": {
    equipo: {
      ref_tipo: "vc_equipo",
      sql: `SELECT id, nombre AS etiqueta FROM vc_equipos
            WHERE torneo_id = ? AND estado = 'aprobado'
            ORDER BY nombre COLLATE NOCASE`,
    },
    persona: {
      ref_tipo: "vc_jugador",
      sql: `SELECT j.id, j.nombre || ' · ' || e.nombre AS etiqueta
            FROM vc_jugadores j
            JOIN vc_equipos e ON e.id = j.equipo_id
            WHERE j.torneo_id = ? AND e.estado = 'aprobado'
            ORDER BY j.nombre COLLATE NOCASE`,
    },
  },
  "jam-de-altura": {
    equipo: {
      ref_tipo: "jam_equipo",
      // Solo los que entregaron: es a lo que se le puede dar un premio, porque
      // es lo único que un jurado pudo mirar.
      sql: `SELECT id, nombre || COALESCE(' · ' || juego_titulo, '') AS etiqueta
            FROM jam_equipos
            WHERE edicion_id = ? AND estado = 'aprobado' AND entregado_at IS NOT NULL
            ORDER BY nombre COLLATE NOCASE`,
    },
  },
  "music-fest": {
    acto: {
      ref_tipo: "music_acto",
      sql: `SELECT id, nombre AS etiqueta FROM music_actos
            WHERE edicion_id = ? AND estado = 'confirmado'
            ORDER BY orden, nombre COLLATE NOCASE`,
    },
    produccion: {
      ref_tipo: "music_persona",
      sql: `SELECT id, nombre || ' · ' || area AS etiqueta FROM music_produccion
            WHERE edicion_id = ? AND estado = 'confirmado'
            ORDER BY nombre COLLATE NOCASE`,
    },
  },
};

// Las categorías de un evento, tal como están en config.
function catalogo(evento) {
  return CATALOGOS[evento] || [];
}

function categoria(evento, premioId) {
  return catalogo(evento).find((p) => p.id === premioId) || null;
}

// Lo adjudicado en una edición, indexado por id de categoría.
function asignados(evento, lote) {
  const filas = db
    .prepare("SELECT * FROM premios_evento WHERE evento = ? AND lote = ?")
    .all(evento, String(lote));

  const porId = {};
  for (const f of filas) porId[f.premio] = f;
  return porId;
}

/**
 * Declara (o cambia) el ganador de una categoría. Con `refId` vacío se
 * entiende que la categoría queda desierta y se borra la fila: es lo que hace
 * la opción "—" del panel.
 *
 * Devuelve true si algo cambió, para que el panel pueda decirlo.
 */
function asignar(evento, lote, premioId, refId, docenteId) {
  const cat = categoria(evento, premioId);
  if (!cat) return false;

  const fuente = (FUENTES[evento] || {})[cat.ambito];
  if (!fuente) return false;

  const id = Number(refId);

  if (!id) {
    const r = db
      .prepare("DELETE FROM premios_evento WHERE evento = ? AND lote = ? AND premio = ?")
      .run(evento, String(lote), premioId);
    return r.changes > 0;
  }

  // Que el candidato sea de esta edición y esté confirmado no se da por
  // sentado: el formulario lo manda cualquiera.
  const existe = db.prepare(fuente.sql).all(lote).some((c) => c.id === id);
  if (!existe) return false;

  db.prepare(
    `INSERT INTO premios_evento (evento, lote, premio, ref_tipo, ref_id, otorgado_por)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (evento, lote, premio) DO UPDATE
       SET ref_tipo = excluded.ref_tipo,
           ref_id = excluded.ref_id,
           otorgado_por = excluded.otorgado_por,
           otorgado_at = CURRENT_TIMESTAMP`
  ).run(evento, String(lote), premioId, fuente.ref_tipo, id, docenteId || null);

  return true;
}

// Los candidatos de una categoría, para llenar su selector en el panel.
function candidatos(evento, lote, premioId) {
  const cat = categoria(evento, premioId);
  if (!cat) return [];

  const fuente = (FUENTES[evento] || {})[cat.ambito];
  if (!fuente) return [];

  return db.prepare(fuente.sql).all(lote);
}

/**
 * Quién ganó la última partida cerrada del bracket. Sirve para llegar con el
 * campeón preseleccionado en el panel del torneo y ahorrar el error más tonto,
 * el de coronar al equipo equivocado.
 *
 * Es una SUGERENCIA y no se escribe sola a propósito: la final es presencial,
 * hay torneos que se resuelven fuera del bracket y corregir un mapa puede
 * cambiar el ganador después (lib/vc.js:404). El premio lo declara alguien.
 */
function campeonSugerido(torneoId) {
  const fila = db
    .prepare(
      `SELECT p.ganador_id FROM vc_partidas p
       JOIN vc_rondas r ON r.id = p.ronda_id
       WHERE p.torneo_id = ? AND p.ganador_id IS NOT NULL
       ORDER BY r.orden DESC, p.orden DESC LIMIT 1`
    )
    .get(Number(torneoId));

  return fila ? fila.ganador_id : null;
}

/**
 * El catálogo de un evento con lo ya adjudicado y sus candidatos: es lo único
 * que la vista del panel necesita para dibujar la sección entera.
 */
function paraElPanel(evento, lote) {
  const puestos = asignados(evento, lote);
  const campeon = evento === "virtual-champions" ? campeonSugerido(lote) : null;

  return catalogo(evento).map((cat) => ({
    ...cat,
    asignado: puestos[cat.id] || null,
    candidatos: candidatos(evento, lote, cat.id),
    // Solo para la categoría de equipo que todavía está desierta: sugerirle un
    // campeón a quien ya lo eligió sería discutirle.
    sugerido:
      cat.ambito === "equipo" && !puestos[cat.id] && cat.id === "campeon" ? campeon : null,
  }));
}

// Un id repetido dejaría una categoría inalcanzable, y un ámbito que no existe
// deja un selector vacío sin que se entienda por qué. Se avisa al arrancar y
// no en la primera visita al panel, igual que lo de config.EVENTOS.
(function revisar() {
  for (const [evento, lista] of Object.entries(CATALOGOS)) {
    const ambitos = Object.keys(FUENTES[evento] || {});
    const vistos = new Set();

    for (const p of lista || []) {
      if (!p.id) console.warn(`  ! Hay un premio sin id en "${evento}" ("${p.label}").`);
      else if (vistos.has(p.id)) console.warn(`  ! El premio "${p.id}" está repetido en "${evento}".`);
      vistos.add(p.id);

      if (!ambitos.includes(p.ambito)) {
        console.warn(
          `  ! El premio "${p.id}" de "${evento}" tiene ambito "${p.ambito}", ` +
            `que no existe ahí (los que hay: ${ambitos.join(", ")}). Nunca va a ofrecer candidatos.`
        );
      }
    }
  }
})();

module.exports = {
  catalogo,
  categoria,
  asignados,
  asignar,
  candidatos,
  campeonSugerido,
  paraElPanel,
};
