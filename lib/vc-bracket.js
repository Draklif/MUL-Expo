// =====================================================================
//  Virtual Champions — armar el bracket.
//
//  Eliminación directa. Con un número de equipos que no sea potencia de dos
//  (que es casi siempre), los mejor sembrados descansan la primera ronda:
//  se completa con "byes" hasta la potencia de dos de arriba y quien
//  enfrenta a un bye pasa solo.
//
//  Las partidas quedan cableadas entre sí desde el principio
//  (avanza_a_partida_id + avanza_a_slot), así que después nadie tiene que
//  mover a nadie a mano: cerrar una partida sube al ganador.
// =====================================================================
const db = require("../db/database");
const { VC } = require("../config");

// Nombre de la ronda según cuántas partidas tenga. Se nombra desde el final
// hacia atrás, que es como las nombra todo el mundo.
function nombreRonda(partidasEnLaRonda, indice) {
  if (partidasEnLaRonda === 1) return "Final";
  if (partidasEnLaRonda === 2) return "Semifinal";
  if (partidasEnLaRonda === 4) return "Cuartos de final";
  if (partidasEnLaRonda === 8) return "Octavos de final";
  return `Ronda ${indice + 1}`;
}

/**
 * Siembra estándar de eliminación directa: 1 contra el último, 2 contra el
 * penúltimo, y así. Devuelve las posiciones (1..tamano) emparejadas de forma
 * que los dos primeros sembrados solo se puedan cruzar en la final.
 */
function siembra(tamano) {
  let ronda = [1, 2];
  while (ronda.length < tamano) {
    const suma = ronda.length * 2 + 1;
    const siguiente = [];
    for (const pos of ronda) {
      siguiente.push(pos, suma - pos);
    }
    ronda = siguiente;
  }
  // De la lista plana a parejas.
  const parejas = [];
  for (let i = 0; i < ronda.length; i += 2) parejas.push([ronda[i], ronda[i + 1]]);
  return parejas;
}

function potenciaDeDos(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// ¿Se puede rehacer el bracket? Solo si nadie ha jugado todavía: borrar un
// bracket con partidas cerradas se llevaría por delante resultados reales.
function sePuedeRegenerar(torneoId) {
  const n = db
    .prepare("SELECT COUNT(*) AS n FROM vc_partidas WHERE torneo_id = ? AND estado = 'finalizada'")
    .get(Number(torneoId)).n;
  return n === 0;
}

/**
 * Genera el bracket completo de un torneo.
 *
 * equipos — en el orden de siembra (el primero es el mejor sembrado).
 * opciones.formato      — BO de las rondas normales.
 * opciones.formatoFinal — BO de la final.
 * opciones.finalPresencial — si la final se juega en vivo.
 */
function generar(torneoId, equipos, opciones = {}) {
  const formato = Number(opciones.formato || VC.formato_ronda || 1);
  const formatoFinal = Number(opciones.formatoFinal || VC.formato_final || formato);
  const finalPresencial =
    opciones.finalPresencial === undefined ? VC.final_presencial : Boolean(opciones.finalPresencial);

  if (equipos.length < 2) {
    throw new Error("Hacen falta al menos dos equipos aprobados para armar el bracket.");
  }

  const tamano = potenciaDeDos(equipos.length);
  const parejas = siembra(tamano);
  // Posición de siembra → equipo (o null si es un bye).
  const porPosicion = (pos) => equipos[pos - 1] || null;

  db.exec("BEGIN");
  try {
    // Se borra lo anterior. Las partidas y los mapas caen por CASCADE.
    db.prepare("DELETE FROM vc_rondas WHERE torneo_id = ?").run(torneoId);

    const insertRonda = db.prepare(
      "INSERT INTO vc_rondas (torneo_id, nombre, orden, formato, presencial) VALUES (?, ?, ?, ?, ?)"
    );
    const insertPartida = db.prepare(
      `INSERT INTO vc_partidas (torneo_id, ronda_id, orden, equipo_a_id, equipo_b_id, estado)
       VALUES (?, ?, ?, ?, ?, 'programada')`
    );
    const cablear = db.prepare(
      "UPDATE vc_partidas SET avanza_a_partida_id = ?, avanza_a_slot = ? WHERE id = ?"
    );

    const totalRondas = Math.log2(tamano);
    let anteriores = []; // ids de las partidas de la ronda que se acaba de crear

    for (let r = 0; r < totalRondas; r++) {
      const nEnRonda = tamano / 2 ** (r + 1);
      const esFinal = nEnRonda === 1;
      const rondaId = insertRonda.run(
        torneoId,
        nombreRonda(nEnRonda, r),
        r,
        esFinal ? formatoFinal : formato,
        esFinal && finalPresencial ? 1 : 0
      ).lastInsertRowid;

      const actuales = [];
      for (let i = 0; i < nEnRonda; i++) {
        let equipoA = null;
        let equipoB = null;

        // La primera ronda es la única que arranca con equipos puestos: las
        // demás se llenan solas cuando se cierren las de abajo.
        if (r === 0) {
          const [posA, posB] = parejas[i];
          equipoA = porPosicion(posA);
          equipoB = porPosicion(posB);
        }

        const id = insertPartida.run(
          torneoId,
          rondaId,
          i,
          equipoA ? equipoA.id : null,
          equipoB ? equipoB.id : null
        ).lastInsertRowid;
        actuales.push(id);
      }

      // Cada dos partidas de la ronda anterior alimentan una de esta: la
      // primera entra por el slot A y la segunda por el B.
      anteriores.forEach((idPrevio, idx) => {
        cablear.run(actuales[Math.floor(idx / 2)], idx % 2 === 0 ? "a" : "b", idPrevio);
      });

      anteriores = actuales;
    }

    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  resolverByes(torneoId);
}

/**
 * Quien quedó emparejado con un hueco pasa de una: la partida se cierra sola
 * y su ganador sube a la ronda siguiente.
 *
 * No se usa recalcular() para esto porque esa función cuenta mapas, y una
 * partida que nadie jugó no tiene ninguno: dejaría el marcador en 0-0 y sin
 * ganador. Aquí el resultado se escribe directo.
 */
function resolverByes(torneoId) {
  const solitarias = db
    .prepare(
      `SELECT p.* FROM vc_partidas p
        JOIN vc_rondas r ON r.id = p.ronda_id
       WHERE p.torneo_id = ? AND r.orden = 0
         AND ((p.equipo_a_id IS NULL) <> (p.equipo_b_id IS NULL))`
    )
    .all(Number(torneoId));

  for (const p of solitarias) {
    const ganadorId = p.equipo_a_id || p.equipo_b_id;
    const slot = p.equipo_a_id ? "a" : "b";

    db.prepare(
      `UPDATE vc_partidas
          SET estado = 'finalizada', ganador_id = ?,
              marcador_a = ?, marcador_b = ?, lugar = 'Pasa sin jugar',
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`
    ).run(ganadorId, slot === "a" ? 1 : 0, slot === "b" ? 1 : 0, p.id);

    if (p.avanza_a_partida_id && (p.avanza_a_slot === "a" || p.avanza_a_slot === "b")) {
      const columna = p.avanza_a_slot === "a" ? "equipo_a_id" : "equipo_b_id";
      db.prepare(`UPDATE vc_partidas SET ${columna} = ? WHERE id = ?`).run(
        ganadorId,
        p.avanza_a_partida_id
      );
    }
  }
}

module.exports = { generar, sePuedeRegenerar, siembra, nombreRonda };
