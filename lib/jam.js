// =====================================================================
//  Jam de Altura — el dominio de la gamejam.
//
//  Dos ideas mandan aquí y explican casi todo lo demás:
//
//  1. La EDICIÓN es la unidad que se repite. Una edición es la jam de un
//     semestre: sus equipos, su tema, sus juegos. Al semestre siguiente se
//     abre otra desde el panel y la anterior queda archivada tal cual quedó.
//     Nada se borra ni se reinicia a mano.
//
//  2. La FASE no se guarda, se calcula. Que la jam esté por empezar, corriendo
//     o terminada sale de la hora de arranque y de cuánto dura; no hay ningún
//     interruptor que alguien pueda olvidar de mover un sábado a las once de
//     la noche. Lo único que sí es un botón es revelar el tema, porque eso
//     tiene que pasar cuando la organización diga y no cuando marque el reloj.
// =====================================================================
const db = require("../db/database");
const { JAM } = require("../config");
const { limpiarNombre } = require("./listas");
const { inscripcionesAbiertas } = require("./eventos");
const { generarCodigo, limpiarEmail, emailValido } = require("./registro");
const { momento, instante, sumarHoras } = require("./fechas");

const DISCIPLINAS = JAM.disciplinas;
const MAX_INTEGRANTES = JAM.max_integrantes;

const ESTADOS_EQUIPO = {
  pendiente: { label: "Pendiente", cls: "pend" },
  aprobado: { label: "Confirmado", cls: "ok" },
  rechazado: { label: "No admitido", cls: "no" },
};

/**
 * Las tres formas de entrar a la jam. Las dos últimas empiezan igual —una
 * persona, sola, llenando el formulario— pero terminan en sitios distintos, y
 * confundirlas era el problema: hasta ahora "solo" significaba siempre "estoy
 * esperando equipo", así que quien quería hacer su juego por su cuenta no
 * tenía cómo decirlo.
 *
 *   equipo    — ya sabe con quién va. Se inscribe el grupo entero.
 *   solitario — va a hacer su juego solo y así se queda. Es un equipo de una
 *               persona: tiene su fila en jam_equipos, sale en la galería y
 *               entrega como cualquier otro.
 *   buscando  — está solo pero NO quiere estarlo. No tiene equipo todavía;
 *               queda en la lista y la organización lo ubica.
 */
const MODOS = {
  equipo: { label: "Equipo completo", cls: "" },
  solitario: { label: "En solitario", cls: "cian" },
  buscando: { label: "Busca equipo", cls: "alerta" },
};

// El modo que llega del formulario. "solo" es el nombre viejo de "buscando" y
// se sigue aceptando: es lo que significaba antes de que existiera "solitario".
function modoValido(v) {
  const limpio = String(v || "").trim();
  if (limpio === "solo") return "buscando";
  return MODOS[limpio] ? limpio : "equipo";
}

// Una disciplina que no esté en la lista de config no se guarda: el selector
// la ofrece, pero el formulario lo manda cualquiera y a nadie le sirve un
// equipo con la disciplina "asdf".
function disciplinaValida(v) {
  const limpia = String(v || "").trim();
  return DISCIPLINAS.includes(limpia) ? limpia : null;
}

// ---------------------------------------------------------------------
//  Ediciones
// ---------------------------------------------------------------------
const SELECT_EDICION = `
  SELECT e.*, p.codigo AS periodo, p.activo AS periodo_activo
    FROM jam_ediciones e
    LEFT JOIN periodos p ON p.id = e.periodo_id
`;

function edicion(id) {
  return db.prepare(`${SELECT_EDICION} WHERE e.id = ?`).get(Number(id)) || null;
}

function ediciones() {
  return db.prepare(`${SELECT_EDICION} ORDER BY e.created_at DESC`).all();
}

/**
 * La edición que ve el público: la del semestre activo, y si ese semestre
 * todavía no tiene jam, la última que se haya abierto. Así, el día que se
 * cambia de semestre sin haber abierto la edición nueva, la página sigue
 * mostrando la que acaba de pasar en vez de quedarse en blanco.
 */
function edicionVigente() {
  return (
    db
      .prepare(`${SELECT_EDICION} WHERE p.activo = 1 ORDER BY e.created_at DESC LIMIT 1`)
      .get() ||
    db.prepare(`${SELECT_EDICION} ORDER BY e.created_at DESC LIMIT 1`).get() ||
    null
  );
}

/*
 * No hay función para abrir una edición, y es a propósito. La del semestre en
 * curso se abre sola al arrancar (db/database.js), con los valores de
 * config.JAM copiados a la fila: si un semestre la jam dura 72 horas se
 * cambia ahí, y las ediciones viejas siguen contando lo que contaron.
 *
 * Empezar el semestre siguiente es cambiar config.PERIODO y reiniciar. La
 * edición de este semestre queda archivada con sus equipos, su tema y sus
 * juegos, y sale una nueva y vacía en su lugar.
 */

// ---------------------------------------------------------------------
//  La fase: en qué momento de la jam estamos
// ---------------------------------------------------------------------
/**
 * Todo lo que la página necesita saber del reloj, en un solo objeto.
 *
 *   sin_edicion — no hay jam abierta todavía.
 *   sin_fecha   — hay edición pero nadie ha puesto la hora de arranque.
 *   antes       — falta para empezar. El contador cuenta hacia el arranque.
 *   en_curso    — corriendo. El contador cuenta lo que queda.
 *   terminado   — se acabaron las horas (o la organización cerró la edición).
 *
 * Los milisegundos van crudos porque el contador del navegador resta números,
 * no lee frases. El texto formateado va aparte, para quien solo quiera
 * imprimir "viernes 20 de noviembre".
 */
function fase(ed, ahora = Date.now()) {
  if (!ed) return { clave: "sin_edicion", inicio: null, fin: null, ahora };

  const inicio = instante(ed.inicio);
  const horas = Number(ed.horas) || JAM.horas;
  const fin = inicio === null ? null : inicio + horas * 3600000;
  const cerrada = ed.estado === "finalizada";

  const base = {
    inicio,
    fin,
    horas,
    ahora,
    momento_inicio: momento(ed.inicio),
    momento_fin: momento(sumarHoras(ed.inicio, horas)),
  };

  if (inicio === null) return { ...base, clave: cerrada ? "terminado" : "sin_fecha" };
  if (cerrada || ahora >= fin) return { ...base, clave: "terminado", restante: 0, avance: 100 };
  if (ahora < inicio) return { ...base, clave: "antes", restante: inicio - ahora, avance: 0 };

  return {
    ...base,
    clave: "en_curso",
    restante: fin - ahora,
    // Cuánto se lleva corrido, en porcentaje, para la barra de la página.
    avance: Math.min(100, Math.max(0, ((ahora - inicio) / (fin - inicio)) * 100)),
  };
}

const yaArranco = (f) => f.clave === "en_curso" || f.clave === "terminado";

// El tema solo sale del servidor cuando está revelado. Es a propósito: hasta
// que no se aprieta el botón, el tema no viaja al navegador ni siquiera
// escondido en el HTML, así que no hay forma de adelantarlo mirando el código
// fuente de la página.
function temaPublico(ed) {
  return ed && ed.tema_revelado && ed.tema ? ed.tema : null;
}

/**
 * Si la jam está recibiendo equipos. Son cuatro candados y tienen que estar
 * abiertos los cuatro:
 *
 *   1. config dice que la jam es el evento de este semestre y que sus
 *      inscripciones están abiertas —el interruptor de verdad—;
 *   2. la edición es la del semestre activo (la del año pasado no recibe a
 *      nadie aunque su fila se haya quedado en 1);
 *   3. su propio interruptor sigue en 1 y no está finalizada;
 *   4. todavía hay cupo.
 *
 * Es el gemelo de vc.inscripcionAbierta: los dos eventos cierran igual.
 */
function inscripcionAbierta(ed) {
  if (!ed) return false;
  if (!inscripcionesAbiertas("jam-de-altura")) return false;
  if (!ed.periodo_activo) return false;
  if (!ed.inscripcion_abierta || ed.estado === "finalizada") return false;
  if (!ed.cupo_equipos) return true;
  return contarEquipos(ed.id) < ed.cupo_equipos;
}

// Se puede entregar desde que arranca la jam hasta que la organización cierra
// las entregas. Que se hayan acabado las 48 horas no cierra la puerta solo:
// siempre hay un equipo subiendo el build tres minutos tarde y esa decisión
// es de quien organiza, no del reloj.
//
// No se mira config.inscripciones: cerrar inscripciones es dejar de admitir
// equipos, no impedirle entregar a los que ya están adentro. Lo que sí manda
// es el semestre: a una edición archivada no se le sube nada.
function entregaAbierta(ed, f = fase(ed)) {
  if (!ed || !ed.periodo_activo) return false;
  return Boolean(ed.entregas_abiertas && ed.estado !== "finalizada" && yaArranco(f));
}

// ---------------------------------------------------------------------
//  Equipos e integrantes
// ---------------------------------------------------------------------
function equipo(id) {
  return db.prepare("SELECT * FROM jam_equipos WHERE id = ?").get(Number(id)) || null;
}

function equipoPorCodigo(codigo) {
  return (
    db
      .prepare("SELECT * FROM jam_equipos WHERE codigo = ?")
      .get(String(codigo || "").trim().toUpperCase()) || null
  );
}

function integrantesDe(equipoId) {
  return db
    .prepare("SELECT * FROM jam_integrantes WHERE equipo_id = ? ORDER BY lider DESC, orden, id")
    .all(Number(equipoId));
}

// Las disciplinas distintas que hay en un equipo, sin repetir y en el orden de
// config. Es lo que se pinta en la tarjeta y lo que deja ver de un vistazo si
// el equipo es interdisciplinar o son cuatro de lo mismo.
function mezclaDe(integrantes) {
  const hay = new Set(integrantes.map((i) => i.disciplina).filter(Boolean));
  return DISCIPLINAS.filter((d) => hay.has(d));
}

function conIntegrantes(eq) {
  if (!eq) return null;
  const integrantes = integrantesDe(eq.id);
  return {
    ...eq,
    integrantes,
    mezcla: mezclaDe(integrantes),
    estado_info: ESTADOS_EQUIPO[eq.estado] || ESTADOS_EQUIPO.pendiente,
    entregado: Boolean(eq.entregado_at),
    // Quien entró en solitario. Se lee de la columna y no de contar
    // integrantes: un equipo de cuatro al que se le retiraron tres queda en
    // uno, pero eso es otra cosa y la página no puede decir lo mismo de los
    // dos casos.
    solitario: Boolean(eq.solitario),
  };
}

function equipoConIntegrantes(id) {
  const eq = equipo(id);
  if (!eq) return null;
  return { ...conIntegrantes(eq), edicion: edicion(eq.edicion_id) };
}

/**
 * Los equipos de una edición. `estado` en null trae todos (es lo que quiere
 * el panel); el sitio público pide solo los aprobados.
 */
function equiposDe(edicionId, estado = "aprobado") {
  const filas = estado
    ? db
        .prepare(
          "SELECT * FROM jam_equipos WHERE edicion_id = ? AND estado = ? ORDER BY nombre COLLATE NOCASE"
        )
        .all(Number(edicionId), estado)
    : db
        .prepare("SELECT * FROM jam_equipos WHERE edicion_id = ? ORDER BY created_at DESC")
        .all(Number(edicionId));

  return filas.map(conIntegrantes);
}

function contarEquipos(edicionId) {
  return db
    .prepare("SELECT COUNT(*) AS n FROM jam_equipos WHERE edicion_id = ? AND estado != 'rechazado'")
    .get(Number(edicionId)).n;
}

// Los juegos entregados, para la galería del final.
function entregas(edicionId) {
  return db
    .prepare(
      `SELECT * FROM jam_equipos
        WHERE edicion_id = ? AND estado = 'aprobado' AND entregado_at IS NOT NULL
        ORDER BY entregado_at`
    )
    .all(Number(edicionId))
    .map(conIntegrantes);
}

// Quienes se inscribieron solos y siguen esperando equipo.
function solistas(edicionId) {
  return db
    .prepare(
      "SELECT * FROM jam_integrantes WHERE edicion_id = ? AND equipo_id IS NULL ORDER BY created_at"
    )
    .all(Number(edicionId));
}

/**
 * Convierte a quien esperaba equipo en un equipo de una persona.
 *
 * Es la salida del callejón: si llega el día del arranque y quedó gente
 * suelta que no alcanzó a completar un equipo, la alternativa a esto es que
 * no participe —sin fila en jam_equipos no hay dónde entregar el juego—. Así
 * entra igual, en solitario, que es exactamente lo que habría elegido de
 * haberlo sabido antes.
 *
 * Conserva su código individual: es el único que esa persona anotó y el que
 * le sirve para consultar. El equipo nuevo lleva el mismo, así que no hay que
 * pedirle que aprenda otro.
 */
function hacerSolitario(integranteId, revisadoPor = null) {
  const persona = db
    .prepare("SELECT * FROM jam_integrantes WHERE id = ?")
    .get(Number(integranteId));
  if (!persona || persona.equipo_id) return null;

  db.exec("BEGIN");
  try {
    const info = db
      .prepare(
        `INSERT INTO jam_equipos
           (edicion_id, codigo, nombre, estado, armado, solitario,
            contacto_nombre, contacto_email, revisado_por, revisado_at)
         VALUES (?, ?, ?, 'aprobado', 0, 1, ?, ?, ?, CURRENT_TIMESTAMP)`
      )
      .run(
        persona.edicion_id,
        persona.codigo || codigoLibre(),
        persona.nombre,
        persona.nombre,
        persona.email,
        revisadoPor
      );

    db.prepare("UPDATE jam_integrantes SET equipo_id = ?, lider = 1, orden = 0 WHERE id = ?").run(
      info.lastInsertRowid,
      persona.id
    );

    db.exec("COMMIT");
    return equipoConIntegrantes(info.lastInsertRowid);
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

// La ficha de quien se inscribió solo, para la página de consulta.
function integrantePorCodigo(codigo) {
  const persona = db
    .prepare("SELECT * FROM jam_integrantes WHERE codigo = ?")
    .get(String(codigo || "").trim().toUpperCase());
  if (!persona) return null;

  return {
    ...persona,
    edicion: edicion(persona.edicion_id),
    equipo: persona.equipo_id ? equipoConIntegrantes(persona.equipo_id) : null,
    esperando: solistas(persona.edicion_id).length,
  };
}

// Un código puede ser de un equipo o de alguien que se inscribió solo. El
// estudiante no tiene por qué saber la diferencia: teclea el suyo y ya.
function buscarPorCodigo(codigo) {
  const limpio = String(codigo || "").trim().toUpperCase();
  if (!limpio) return null;

  const eq = equipoPorCodigo(limpio);
  if (eq) return { tipo: "equipo", codigo: limpio, equipo: equipoConIntegrantes(eq.id) };

  const persona = integrantePorCodigo(limpio);
  if (persona) return { tipo: "solista", codigo: limpio, persona };

  return null;
}

/**
 * Empareja los campos repetidos del formulario en una lista de integrantes.
 * La identidad es el correo: dos filas con el mismo correo son una persona.
 */
function integrantesDesdeFormulario(body, max = MAX_INTEGRANTES) {
  const nombres = [].concat(body.integrante_nombre || []);
  const correos = [].concat(body.integrante_email || []);
  const disciplinas = [].concat(body.integrante_disciplina || []);
  const total = Math.max(nombres.length, correos.length, disciplinas.length);

  const vistos = new Set();
  const out = [];

  for (let i = 0; i < total && out.length < max; i++) {
    const nombre = limpiarNombre(nombres[i]).slice(0, 120);
    const email = limpiarEmail(correos[i]);
    const disciplina = disciplinaValida(disciplinas[i]);
    if (!nombre && !email) continue; // fila en blanco

    if (email && vistos.has(email)) continue;
    if (email) vistos.add(email);

    out.push({ nombre, email, disciplina });
  }

  return out;
}

// Código único de verdad: se reintenta por si dos personas caen en el mismo.
function codigoLibre() {
  const usadoEquipo = db.prepare("SELECT 1 FROM jam_equipos WHERE codigo = ?");
  const usadoPersona = db.prepare("SELECT 1 FROM jam_integrantes WHERE codigo = ?");
  let codigo = generarCodigo();
  for (let i = 0; i < 5 && (usadoEquipo.get(codigo) || usadoPersona.get(codigo)); i++) {
    codigo = generarCodigo();
  }
  return codigo;
}

// ---------------------------------------------------------------------
//  Tablón de anuncios
// ---------------------------------------------------------------------
const TIPOS_ANUNCIO = {
  aviso: { label: "Aviso", cls: "" },
  hito: { label: "Hito", cls: "ok" },
  alerta: { label: "Atención", cls: "alerta" },
};

function anuncios(edicionId, limite = 20) {
  return db
    .prepare("SELECT * FROM jam_anuncios WHERE edicion_id = ? ORDER BY created_at DESC, id DESC LIMIT ?")
    .all(Number(edicionId), Number(limite))
    .map((a) => ({ ...a, tipo_info: TIPOS_ANUNCIO[a.tipo] || TIPOS_ANUNCIO.aviso }));
}

// ---------------------------------------------------------------------
//  Cifras
// ---------------------------------------------------------------------
function resumen(edicionId) {
  const id = Number(edicionId);
  return db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM jam_equipos WHERE edicion_id = ? AND estado = 'aprobado')   AS equipos,
         (SELECT COUNT(*) FROM jam_equipos WHERE edicion_id = ? AND estado = 'pendiente')  AS pendientes,
         (SELECT COUNT(*) FROM jam_equipos WHERE edicion_id = ? AND estado = 'rechazado')  AS rechazados,
         (SELECT COUNT(*) FROM jam_equipos
           WHERE edicion_id = ? AND estado = 'aprobado' AND entregado_at IS NOT NULL)      AS entregas,
         (SELECT COUNT(*) FROM jam_integrantes WHERE edicion_id = ?)                       AS personas,
         (SELECT COUNT(*) FROM jam_integrantes WHERE edicion_id = ? AND equipo_id IS NULL) AS solistas,
         (SELECT COUNT(*) FROM jam_equipos
           WHERE edicion_id = ? AND estado != 'rechazado' AND solitario = 1)               AS solitarios`
    )
    .get(id, id, id, id, id, id, id);
}

// Cuántos hay de cada disciplina en una edición. El panel lo usa para armar
// equipos con criterio: si quedan seis programadores esperando y ningún
// artista, más vale saberlo antes de repartir.
function porDisciplina(edicionId, soloLibres = false) {
  const filas = db
    .prepare(
      `SELECT disciplina, COUNT(*) AS n FROM jam_integrantes
        WHERE edicion_id = ? ${soloLibres ? "AND equipo_id IS NULL" : ""}
        GROUP BY disciplina`
    )
    .all(Number(edicionId));

  const cuenta = new Map(filas.map((f) => [f.disciplina, f.n]));
  return DISCIPLINAS.map((d) => ({ disciplina: d, n: cuenta.get(d) || 0 })).filter((x) => x.n > 0);
}

/**
 * Lo que consulta el reloj de la página cada tanto: la hora del servidor (para
 * que un navegador con la hora corrida no cuente mal), la fase, el tema si ya
 * se reveló y el tablón. Una sola petición trae todo lo que puede cambiar
 * mientras alguien tiene la página abierta.
 */
function estadoPublico(edicionId) {
  const ed = edicion(edicionId);
  if (!ed) return { ahora: Date.now(), clave: "sin_edicion" };

  const f = fase(ed);
  return {
    ahora: f.ahora,
    clave: f.clave,
    inicio: f.inicio,
    fin: f.fin,
    avance: f.avance || 0,
    tema: temaPublico(ed),
    tema_revelado: Boolean(ed.tema_revelado),
    inscripcion_abierta: inscripcionAbierta(ed),
    entrega_abierta: entregaAbierta(ed, f),
    equipos: resumen(ed.id).equipos,
    anuncios: anuncios(ed.id, 8).map((a) => ({
      id: a.id,
      texto: a.texto,
      tipo: a.tipo,
      cuando: a.created_at,
    })),
  };
}

module.exports = {
  DISCIPLINAS,
  MAX_INTEGRANTES,
  ESTADOS_EQUIPO,
  MODOS,
  TIPOS_ANUNCIO,
  modoValido,
  disciplinaValida,
  edicion,
  ediciones,
  edicionVigente,
  fase,
  temaPublico,
  inscripcionAbierta,
  entregaAbierta,
  equipo,
  equipoPorCodigo,
  equipoConIntegrantes,
  equiposDe,
  contarEquipos,
  entregas,
  integrantesDe,
  mezclaDe,
  solistas,
  hacerSolitario,
  integrantePorCodigo,
  buscarPorCodigo,
  integrantesDesdeFormulario,
  codigoLibre,
  anuncios,
  resumen,
  porDisciplina,
  estadoPublico,
  limpiarEmail,
  emailValido,
  momento,
};
