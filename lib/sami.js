// =====================================================================
//  Semillero de investigación SAMI — el dominio.
//
//  Tres ideas mandan aquí:
//
//  1. El PROYECTO es la unidad, no el estudiante ni el semestre. Dura tres
//     semestres, cambia de estado, de director y a veces de integrantes, y
//     todo lo demás cuelga de él. Por eso —a diferencia de las salidas— sí
//     tiene tabla: una salida es una línea de config, un proyecto de tres
//     semestres no cabe en un archivo de configuración.
//
//  2. El ESTADO sí se guarda, no se cuenta. Es lo contrario de las salidas, y
//     a propósito: allá el estado sale de dos casillas de pago que son hechos
//     verificables, aquí "en qué va" es un juicio del comité que ninguna
//     columna puede deducir. Una fecha de sustentación no dice si el
//     anteproyecto quedó aprobado.
//
//  3. Las CIFRAS se cuentan, nunca se guardan. Cuántas reuniones lleva alguien,
//     su asistencia y su promedio salen de las filas cada vez que se piden.
//     Eso es lo que en las hojas eran las columnas #S, ASIST y PROM, sostenidas
//     con fórmulas que se rompían solas.
//
//  Lo que no se automatiza a propósito: la NOTA del semestre. El panel muestra
//  el promedio de las reuniones y la asistencia al lado de la casilla, pero no
//  los precarga. El docente pesa cosas que no están en esta base, y una nota
//  puesta sola por un promedio sería una nota que nadie decidió.
// =====================================================================
const db = require("../db/database");
const { SAMI, ESCALA_MAX } = require("../config");
const { generarCodigo, limpiarEmail, emailValido } = require("./registro");
const { limpiarNombre } = require("./listas");
const { dia, partirDia, diasEntre, sumarDias } = require("./fechas");

// ---------------------------------------------------------------------
//  La escalera de estados
//
//  Trece peldaños que van del "quiero entrar" al proyecto publicado. Los ocho
//  del final son los del documento que lleva el programa; los cinco primeros
//  son el trámite de vinculación, que hasta ahora no estaba en ninguna hoja
//  —se llevaba de memoria y por correo—.
//
//  El primero, 'registro', es donde caen los que llenan el formulario público,
//  y va SEPARADO de 'intencion' a propósito. Llenar un formulario no es haber
//  ido a la dirección del programa a notificar nada, que es el paso 1 de
//  verdad y se hace en persona. Juntarlos daría por cumplido un trámite que
//  nadie ha hecho, y el estudiante se quedaría esperando una respuesta que no
//  va a llegar. A 'intencion' lo mueve un docente cuando conste que sí fue.
//
//  `hoja` es la etiqueta LITERAL del archivo de seguimiento. Existe solo para
//  que el CSV se pueda pegar en el documento viejo sin traducir nada: cinco
//  estados distintos aquí son un mismo "1. Propuesta" allá, porque para el
//  documento del programa un proyecto no existe hasta que le aprueban la
//  propuesta.
//
//  `orden` es para ordenar y para dibujar el avance, no para validar: nadie
//  impide devolver un proyecto de "desarrollo" a "anteproyecto", porque eso
//  pasa de verdad y el sistema no está para discutirlo.
// ---------------------------------------------------------------------
const ESTADOS = [
  { clave: "registro",   orden: 1,  label: "En el registro",         cls: "no",     hoja: "1. Propuesta", fase: "vinculacion" },
  { clave: "intencion",  orden: 2,  label: "Intención notificada",   cls: "pend",   hoja: "1. Propuesta", fase: "vinculacion" },
  { clave: "carta",      orden: 3,  label: "Carta radicada",         cls: "pend",   hoja: "1. Propuesta", fase: "vinculacion" },
  { clave: "propuesta",  orden: 4,  label: "Propuesta en construcción", cls: "pend", hoja: "1. Propuesta", fase: "vinculacion" },
  { clave: "aprobada",   orden: 5,  label: "Propuesta aprobada",     cls: "ok",     hoja: "1. Propuesta", fase: "proyecto" },
  { clave: "anteproyecto",      orden: 6, label: "Anteproyecto",              cls: "alerta", hoja: "2. Anteproyecto",             fase: "proyecto" },
  { clave: "sustentacion_ante", orden: 7, label: "Sustentación de anteproyecto", cls: "alerta", hoja: "3. Sustentación anteproyecto", fase: "proyecto" },
  { clave: "aprobacion_cb",     orden: 8, label: "Aprobación de comités",     cls: "alerta", hoja: "4. Aprobación CB",            fase: "proyecto" },
  { clave: "desarrollo",        orden: 9, label: "Desarrollo del proyecto",   cls: "alerta", hoja: "5. Desarrollo proyecto",      fase: "proyecto" },
  { clave: "radicacion",       orden: 10, label: "Radicación del proyecto",   cls: "alerta", hoja: "6. Radicación proyecto",      fase: "proyecto" },
  { clave: "sustentacion",     orden: 11, label: "Sustentación del proyecto", cls: "alerta", hoja: "7. Sustentación proyecto",    fase: "proyecto" },
  { clave: "finalizado", orden: 12, label: "Finalizado",             cls: "ok",     hoja: "Finalizado", fase: "cerrado" },
  { clave: "retirado",   orden: 13, label: "Retirado",               cls: "malo",   hoja: "Retirado",   fase: "cerrado" },
];

const POR_CLAVE = new Map(ESTADOS.map((e) => [e.clave, e]));

const estadoDe = (clave) => POR_CLAVE.get(String(clave || "")) || ESTADOS[0];
const estadoValido = (v) => (POR_CLAVE.has(String(v || "")) ? String(v) : null);

// De 'aprobada' en adelante ya es un proyecto de verdad: tiene director, cuenta
// en las cifras del semillero y tiene sentido pedirle semestre y reuniones.
// Antes de eso es una intención, que es otra cosa.
const vinculado = (clave) => estadoDe(clave).fase === "proyecto";
const cerrado = (clave) => estadoDe(clave).fase === "cerrado";

// Los semestres DENTRO del semillero. El IV existe porque pasa —alguien se
// alarga— y porque la hoja lo tenía; el panel lo señala en vez de esconderlo.
const SEMESTRES = ["I", "II", "III", "IV"];
const semestreValido = (v) => (SEMESTRES.includes(String(v || "").trim()) ? String(v).trim() : null);

// Los perfiles del semillero. Ojo con lo que NO son: no son la línea de
// investigación —esa es del programa, es fija y vive entera en config.SAMI— ni
// deciden qué proyecto va a hacer quien elige uno. Es con cuál se siente
// cómodo, que sirve para saber a quién ponerlo a hablar con quién.
const PERFILES = SAMI.perfiles || [];
const perfilDe = (v) => PERFILES.find((p) => p.clave === String(v || "")) || null;
const perfilValido = (v) => (perfilDe(v) ? String(v) : null);

// El concepto de un jurado sobre el anteproyecto. Las tres opciones son las de
// la lista de validación de la hoja, con su etiqueta literal para el CSV.
const CONCEPTOS = [
  { clave: "aprobado",     label: "Aprobado",                 cls: "ok",     hoja: "APROBADO" },
  { clave: "correcciones", label: "Aprobado con correcciones", cls: "alerta", hoja: "APROBADO CON CORRECCIONES" },
  { clave: "volver",       label: "Debe volver a presentar",  cls: "malo",   hoja: "DEBE VOLVER A PRESENTAR" },
];
const conceptoDe = (v) => CONCEPTOS.find((c) => c.clave === String(v || "")) || null;
const conceptoValido = (v) => (conceptoDe(v) ? String(v) : null);

// Los dos comités: Ética y Bioética (CEB) y Propiedad Intelectual (CPI).
// 'na' es una decisión —este proyecto no los necesita— y por eso es un valor y
// no un nulo; 'pendiente' es "va en camino", que es lo que hay que perseguir.
const COMITES = [
  { clave: "na",        label: "No aplica",  cls: "no",     hoja: "N/A" },
  { clave: "pendiente", label: "Pendiente",  cls: "alerta", hoja: "PENDIENTE" },
  { clave: "aprobado",  label: "Aprobado",   cls: "ok",     hoja: "APROBADO" },
  { clave: "rechazado", label: "Rechazado",  cls: "malo",   hoja: "RECHAZADO" },
];
const comiteDe = (v) => COMITES.find((c) => c.clave === String(v || "")) || COMITES[0];
const comiteValido = (v) => (COMITES.some((c) => c.clave === String(v || "")) ? String(v) : "na");

// La asistencia a una reunión. Tres estados y no dos, igual que en las salidas:
// NULL es "todavía no lo he mirado", que no es "no vino". Una reunión a medio
// registrar no puede leerse como una falta.
const ASISTENCIA = {
  1: { clave: "vino", label: "Asistió", cls: "ok" },
  0: { clave: "no_vino", label: "No asistió", cls: "malo" },
};
const asistenciaDe = (v) => (v === null || v === undefined ? null : ASISTENCIA[Number(v)] || null);

// ---------------------------------------------------------------------
//  Transacciones
// ---------------------------------------------------------------------
/**
 * Corre varias escrituras como una sola.
 *
 * node:sqlite no trae el envoltorio `db.transaction()` de better-sqlite3, así
 * que se hace a mano con el mismo BEGIN/COMMIT/ROLLBACK que usa
 * db/database.js en sus migraciones. Se recoge aquí porque este módulo lo
 * necesita en cuatro sitios y repetir el try/catch en los cuatro es donde se
 * olvida un ROLLBACK.
 *
 * No anida: SQLite no admite un BEGIN dentro de otro. Ninguna de las
 * escrituras de este módulo llama a otra que también abra transacción.
 */
function enTransaccion(fn) {
  db.exec("BEGIN");
  try {
    const salida = fn();
    db.exec("COMMIT");
    return salida;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

// ---------------------------------------------------------------------
//  El calendario de reuniones
// ---------------------------------------------------------------------
/**
 * En qué semana del semestre cae una fecha (S1…S16).
 *
 * Es lo que hoy titula cada hoja del archivo de seguimiento ("Reunión semillero
 * 3 a 7 de Agosto"). Se calcula al guardar y se guarda ya resuelto: recalcularlo
 * al leer haría que corregir el calendario del semestre cambiara la semana de
 * reuniones que ya pasaron.
 *
 * Fuera del rango devuelve null y no un número forzado: una reunión en enero,
 * durante el receso, no es "la semana 0" ni "la 16", simplemente no cae en el
 * calendario y así se muestra.
 */
function semanaDe(fecha) {
  const cal = SAMI.calendario || {};
  if (!partirDia(fecha) || !partirDia(cal.inicio)) return null;

  const dias = diasEntre(cal.inicio, fecha);
  if (dias === null || dias < 0) return null;

  const semana = Math.floor(dias / 7) + 1;
  return semana >= 1 && semana <= (cal.semanas || 16) ? semana : null;
}

/**
 * Las semanas del semestre, calculadas.
 *
 * En ninguna parte se escriben las dieciséis: salen de la fecha de inicio, una
 * cada siete días. Es lo que en el archivo viejo era el título escrito a mano
 * de cada hoja —"Reunión semillero 3 a 7 de Agosto del 2026"—, y escribirlos a
 * mano dieciséis veces por semestre es dieciséis oportunidades de equivocarse.
 *
 * El rango va de lunes a viernes y no de lunes a domingo: las reuniones se
 * programan en días hábiles, y un rótulo que dijera "3 a 9 de agosto" haría
 * pensar que el sábado también cuenta.
 */
function semanas() {
  const cal = SAMI.calendario || {};
  if (!partirDia(cal.inicio)) return [];

  const total = cal.semanas || 16;
  const out = [];

  for (let n = 1; n <= total; n++) {
    const desde = sumarDias(cal.inicio, (n - 1) * 7);
    const hasta = sumarDias(desde, 4);
    const a = dia(desde);
    const b = dia(hasta);
    out.push({
      n,
      desde,
      hasta,
      // "3 a 7 de agosto" cuando no cambia de mes, "31 de agosto a 4 de
      // septiembre" cuando sí. Es como está escrito en las hojas.
      label:
        a && b
          ? a.mes === b.mes
            ? `${a.numero} a ${b.numero} de ${a.mes}`
            : `${a.numero} de ${a.mes} a ${b.numero} de ${b.mes}`
          : `Semana ${n}`,
    });
  }

  return out;
}

// ---------------------------------------------------------------------
//  Proyectos
// ---------------------------------------------------------------------
/**
 * Adjunta a la fila lo que se deduce de ella y se necesita en tres o cuatro
 * vistas: el estado resuelto, las fechas partidas y el director ya con nombre.
 */
function conEstado(p) {
  if (!p) return null;
  return {
    ...p,
    estado_info: estadoDe(p.estado),
    vinculado: vinculado(p.estado),
    cerrado: cerrado(p.estado),
    perfil_info: perfilDe(p.perfil),
    ceb_info: comiteDe(p.ceb),
    cpi_info: comiteDe(p.cpi),
    // Un proyecto en el IV semestre se pasó del plazo. No se bloquea nada: se
    // señala, que es lo que un documento de seguimiento tiene que hacer.
    excedido: p.semestre === "IV",
    sin_director: !p.director_id,
    fechas: {
      carta: dia(p.carta_at),
      propuesta: dia(p.propuesta_at),
      aprobacion: dia(p.aprobacion_at),
      anteproyecto: dia(p.anteproyecto_at),
      ceb: dia(p.ceb_at),
      cpi: dia(p.cpi_at),
      sustentacion: dia(p.sustentacion_at),
    },
  };
}

const SELECT_PROYECTO = `
  SELECT p.*, d.name AS director, d.code AS director_email, per.codigo AS periodo_codigo
    FROM sami_proyectos p
    LEFT JOIN docentes d   ON d.id = p.director_id
    LEFT JOIN periodos per ON per.id = p.periodo_id`;

function porId(id) {
  const p = db.prepare(`${SELECT_PROYECTO} WHERE p.id = ?`).get(Number(id));
  return p ? conEstado(p) : null;
}

function porCodigo(codigo) {
  const limpio = String(codigo || "").trim().toUpperCase();
  if (!limpio) return null;
  const p = db.prepare(`${SELECT_PROYECTO} WHERE p.codigo = ?`).get(limpio);
  return p ? conEstado(p) : null;
}

/**
 * Todos los proyectos, con sus estudiantes ya pegados.
 *
 * `fase` filtra por el tramo de la escalera: "vinculacion" son las intenciones
 * que todavía no son proyecto, "proyecto" los que están en curso, "cerrado" los
 * terminados y los retirados. Sin filtro, todo.
 */
function todos({ fase = null, directorId = null } = {}) {
  const donde = [];
  const args = [];

  if (fase) {
    const claves = ESTADOS.filter((e) => e.fase === fase).map((e) => e.clave);
    donde.push(`p.estado IN (${claves.map(() => "?").join(",")})`);
    args.push(...claves);
  }
  if (directorId) {
    donde.push("p.director_id = ?");
    args.push(Number(directorId));
  }

  const filas = db
    .prepare(
      `${SELECT_PROYECTO}
        ${donde.length ? "WHERE " + donde.join(" AND ") : ""}
        ORDER BY p.estado = 'retirado', p.estado = 'finalizado',
                 p.semestre DESC, p.created_at`
    )
    .all(...args);

  return filas.map((p) => ({ ...conEstado(p), estudiantes: estudiantesDe(p.id) }));
}

// Código único de verdad: se reintenta por si dos personas caen en el mismo.
function codigoLibre() {
  const usado = db.prepare("SELECT 1 FROM sami_proyectos WHERE codigo = ?");
  let codigo = generarCodigo();
  for (let i = 0; i < 5 && usado.get(codigo); i++) codigo = generarCodigo();
  return codigo;
}

// ---------------------------------------------------------------------
//  Estudiantes
// ---------------------------------------------------------------------
function estudiantesDe(proyectoId) {
  return db
    .prepare("SELECT * FROM sami_estudiantes WHERE proyecto_id = ? ORDER BY orden, id")
    .all(Number(proyectoId));
}

function estudiante(id) {
  return db.prepare("SELECT * FROM sami_estudiantes WHERE id = ?").get(Number(id)) || null;
}

// Si alguien ya está vinculado a un proyecto que sigue vivo. Se mira antes de
// aceptar un registro nuevo: un estudiante no puede tener dos alternativas de
// grado a la vez, y casi siempre es alguien que se registró dos veces.
function proyectoDe(email) {
  const correo = limpiarEmail(email);
  if (!correo) return null;
  const fila = db
    .prepare(
      `SELECT p.id, p.codigo, p.titulo, p.estado
         FROM sami_estudiantes e
         JOIN sami_proyectos p ON p.id = e.proyecto_id
        WHERE e.email = ? COLLATE NOCASE
          AND e.activo = 1
          AND p.estado <> 'retirado'
        ORDER BY p.created_at DESC LIMIT 1`
    )
    .get(correo);
  return fila || null;
}

// ---------------------------------------------------------------------
//  Jurados
// ---------------------------------------------------------------------
function juradosDe(proyectoId) {
  return db
    .prepare("SELECT * FROM sami_jurados WHERE proyecto_id = ? ORDER BY orden, id")
    .all(Number(proyectoId))
    .map((j) => ({ ...j, concepto_info: conceptoDe(j.concepto) }));
}

// ---------------------------------------------------------------------
//  Reuniones
// ---------------------------------------------------------------------
/**
 * Las reuniones de un proyecto en un semestre, con la asistencia y la nota de
 * cada estudiante ya adentro. Es la vista que pide la ficha del panel.
 */
function reunionesDe(proyectoId, periodoId) {
  const filas = db
    .prepare(
      `SELECT r.*, d.name AS docente
         FROM sami_reuniones r
         LEFT JOIN docentes d ON d.id = r.docente_id
        WHERE r.proyecto_id = ? AND r.periodo_id = ?
        ORDER BY r.fecha DESC, r.id DESC`
    )
    .all(Number(proyectoId), Number(periodoId));

  const marcas = db.prepare(
    `SELECT a.*, e.nombre
       FROM sami_asistencias a
       JOIN sami_estudiantes e ON e.id = a.estudiante_id
      WHERE a.reunion_id = ?
      ORDER BY e.orden, e.id`
  );

  return filas.map((r) => ({
    ...r,
    cuando: dia(r.fecha),
    marcas: marcas.all(r.id).map((m) => ({ ...m, asistencia: asistenciaDe(m.asistio) })),
  }));
}

function reunion(id) {
  const r = db
    .prepare(
      `SELECT r.*, d.name AS docente
         FROM sami_reuniones r
         LEFT JOIN docentes d ON d.id = r.docente_id
        WHERE r.id = ?`
    )
    .get(Number(id));
  return r ? { ...r, cuando: dia(r.fecha) } : null;
}

// La última reunión del proyecto, en cualquier semestre. Es lo que ve el
// estudiante en la consulta de su código: qué se comprometió a entregar.
function ultimaReunion(proyectoId) {
  const r = db
    .prepare(
      `SELECT * FROM sami_reuniones
        WHERE proyecto_id = ? ORDER BY fecha DESC, id DESC LIMIT 1`
    )
    .get(Number(proyectoId));
  return r ? { ...r, cuando: dia(r.fecha) } : null;
}

// ---------------------------------------------------------------------
//  Cifras
// ---------------------------------------------------------------------
/**
 * Lo que en la hoja eran las columnas #S, ASIST y PROM de un estudiante.
 *
 * Tres cuentas distintas y conviene no mezclarlas:
 *
 *   sesiones — reuniones registradas para su proyecto en el semestre. Es el
 *              denominador de todo lo demás.
 *   asistio  — a cuántas fue. Las que nadie ha marcado NO cuentan como falta:
 *              se apartan en `sin_pasar`, igual que en las salidas.
 *   promedio — de las calificaciones que tiene. Se promedian solo las puestas;
 *              una reunión sin nota no vale cero, vale que no está.
 */
function rendimiento(estudianteId, periodoId) {
  const fila = db
    .prepare(
      `SELECT COUNT(*) AS sesiones,
              COALESCE(SUM(a.asistio = 1), 0) AS asistio,
              COALESCE(SUM(a.asistio = 0), 0) AS falto,
              COUNT(a.calificacion)           AS calificadas,
              AVG(a.calificacion)             AS promedio
         FROM sami_reuniones r
         JOIN sami_asistencias a ON a.reunion_id = r.id
        WHERE a.estudiante_id = ? AND r.periodo_id = ?`
    )
    .get(Number(estudianteId), Number(periodoId));

  const total = SAMI.calendario ? SAMI.calendario.semanas || 16 : 16;
  return {
    ...fila,
    sin_pasar: fila.sesiones - fila.asistio - fila.falto,
    total,
    // Sobre las reuniones que hubo, no sobre las 16 del calendario: si el
    // director convocó ocho, faltar a dos es 75 % y no 37 %.
    pct: fila.sesiones ? Math.round((fila.asistio / fila.sesiones) * 100) : null,
    promedio: fila.promedio === null ? null : Math.round(fila.promedio * 100) / 100,
  };
}

/**
 * La nota del semestre de un estudiante, con su promedio de reuniones al lado.
 * Devuelve siempre un objeto —aunque no haya nota escrita— para que la vista no
 * tenga que preguntar dos veces.
 */
function notaDe(estudianteId, periodoId) {
  const fila =
    db
      .prepare(
        `SELECT n.*, d.name AS cerrada_por_nombre
           FROM sami_notas n
           LEFT JOIN docentes d ON d.id = n.cerrada_por
          WHERE n.estudiante_id = ? AND n.periodo_id = ?`
      )
      .get(Number(estudianteId), Number(periodoId)) || null;

  return {
    nota: fila,
    final: notaFinal(fila),
    rendimiento: rendimiento(estudianteId, periodoId),
  };
}

/**
 * La nota definitiva: el promedio de las dos cuando hay codirector, y la del
 * director sola cuando no. Un codirector sin nota no baja el promedio a la
 * mitad —eso sería castigar al estudiante porque un tercero no respondió—.
 */
function notaFinal(nota) {
  if (!nota) return null;
  const dir = nota.nota_director;
  const co = nota.nota_codirector;
  if (dir === null || dir === undefined) return co === null || co === undefined ? null : co;
  if (co === null || co === undefined) return dir;
  return Math.round(((dir + co) / 2) * 100) / 100;
}

/**
 * Las cifras del panel, en una sola consulta.
 *
 * Todo lo que en las hojas había que contar a mano cada vez que alguien
 * preguntaba: cuántos van, en qué semestre, a cuántos les falta director y
 * quién tiene un comité colgando.
 */
function resumen() {
  const claves = (fase) => ESTADOS.filter((e) => e.fase === fase).map((e) => `'${e.clave}'`).join(",");

  return db
    .prepare(
      `SELECT
         COALESCE(SUM(estado IN (${claves("vinculacion")})), 0) AS intenciones,
         COALESCE(SUM(estado IN (${claves("proyecto")})), 0)    AS activos,
         COALESCE(SUM(estado = 'finalizado'), 0)                AS finalizados,
         COALESCE(SUM(estado = 'retirado'), 0)                  AS retirados,
         COALESCE(SUM(estado IN (${claves("proyecto")}) AND semestre = 'I'), 0)   AS sem_i,
         COALESCE(SUM(estado IN (${claves("proyecto")}) AND semestre = 'II'), 0)  AS sem_ii,
         COALESCE(SUM(estado IN (${claves("proyecto")}) AND semestre = 'III'), 0) AS sem_iii,
         COALESCE(SUM(estado IN (${claves("proyecto")}) AND semestre = 'IV'), 0)  AS sem_iv,
         COALESCE(SUM(estado IN (${claves("proyecto")}) AND director_id IS NULL), 0) AS sin_director,
         COALESCE(SUM(estado IN (${claves("proyecto")}) AND ceb = 'pendiente'), 0)   AS ceb_pendiente,
         COALESCE(SUM(estado IN (${claves("proyecto")}) AND cpi = 'pendiente'), 0)   AS cpi_pendiente
       FROM sami_proyectos`
    )
    .get();
}

// Cuántos estudiantes activos hay en el semillero. Va aparte del resumen
// porque cuenta personas y no proyectos, y un proyecto puede tener dos.
function contarEstudiantes() {
  return db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM sami_estudiantes e
         JOIN sami_proyectos p ON p.id = e.proyecto_id
        WHERE e.activo = 1 AND p.estado NOT IN ('retirado', 'finalizado')`
    )
    .get().n;
}

// ---------------------------------------------------------------------
//  Semestres del semillero
// ---------------------------------------------------------------------
/**
 * Los semestres que el panel ofrece en su selector.
 *
 * La tabla `periodos` es de la app entera y tiene semestres viejos de otros
 * módulos. Del semillero solo hay datos desde config.SAMI.desde, y ofrecer
 * semestres en los que no existía solo sirve para abrir páginas vacías y
 * hacer dudar a quien las abre.
 *
 * La comparación es de texto y funciona porque el formato AAAA-NN ordena
 * igual que la fecha. Sin `desde` en el config se ofrecen todos.
 */
function periodosVisibles(todos) {
  if (!SAMI.desde) return todos;
  return todos.filter((p) => String(p.codigo) >= String(SAMI.desde));
}

// ---------------------------------------------------------------------
//  Permisos
// ---------------------------------------------------------------------
/**
 * Quién puede escribir reuniones y notas de un proyecto: su director, y nadie
 * más.
 *
 * Todo docente que entra al panel VE el semillero entero —es el documento del
 * programa y esconderlo no le sirve a nadie—, pero calificar el trabajo de un
 * semestre es del director. Lo demás del trámite (estado, jurados, fechas,
 * comités, asignar director) queda abierto: son actos administrativos que
 * cualquiera de la dirección registra.
 */
function esDirector(proyecto, docente) {
  if (!proyecto || !docente) return false;
  return Number(proyecto.director_id) === Number(docente.id);
}

// ---------------------------------------------------------------------
//  Lo que llega de un formulario
// ---------------------------------------------------------------------
// El documento y el código estudiantil son números con los que nadie hace
// cuentas: texto, y sin lo que se cuela al copiarlos de un carné.
const soloDigitos = (v, max = 20) => String(v || "").replace(/[^\d-]/g, "").slice(0, max);

// El teléfono sí admite espacios y el +: se marca, no se suma.
const limpiarTelefono = (v) =>
  String(v || "").replace(/[^\d+\s()-]/g, "").replace(/\s+/g, " ").trim().slice(0, 25);

const telefonoValido = (v) => (String(v || "").match(/\d/g) || []).length >= 7;

const limpiarTexto = (v, max = 2000) => String(v || "").replace(/\r\n/g, "\n").trim().slice(0, max);

// El semestre de la carrera. Fuera de 1..12 no es un semestre, es un error de
// dedo, y se devuelve null para que el formulario lo diga.
function semestreAcademico(v) {
  const n = Number(String(v || "").trim());
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

/**
 * Una calificación de reunión. Devuelve el número, o null si el campo venía
 * vacío —que es un valor legítimo: la reunión pasó y todavía no se calificó—.
 * `false` es un valor fuera de escala, que sí es un error.
 */
function calificacion(v) {
  const texto = String(v || "").trim().replace(",", ".");
  if (!texto) return null;
  const n = Number(texto);
  if (!Number.isFinite(n) || n < 0 || n > ESCALA_MAX) return false;
  return Math.round(n * 100) / 100;
}

// Una fecha AAAA-MM-DD de un <input type="date">, o null si viene vacía. Se
// valida partiendo la cadena, nunca con Date: la regla de lib/fechas.js.
function fechaValida(v) {
  const p = partirDia(String(v || "").trim());
  return p ? p.fecha : null;
}

/**
 * Empareja los campos repetidos del formulario en una lista de estudiantes.
 *
 * Es el mismo trato que integrantesDesdeFormulario le da a los expositores,
 * pero aquí cada fila trae seis campos y no dos, así que no se puede reusar:
 * un proyecto de semillero necesita documento y teléfono de cada quien.
 */
function estudiantesDesdeFormulario(body, max = 3) {
  const campo = (n) => [].concat(body[n] || []);
  const nombres = campo("est_nombre");
  const codigos = campo("est_codigo");
  const documentos = campo("est_documento");
  const telefonos = campo("est_telefono");
  const correos = campo("est_email");
  const semestres = campo("est_semestre");

  const vistos = new Set();
  const out = [];

  for (let i = 0; i < nombres.length && out.length < max; i++) {
    const nombre = limpiarNombre(nombres[i]).slice(0, 120);
    const email = limpiarEmail(correos[i]);
    // Fila en blanco: el formulario trae dos y casi siempre se llena una.
    if (!nombre && !email) continue;
    // La identidad es el correo, así que dos filas con el mismo son una.
    if (email && vistos.has(email)) continue;
    if (email) vistos.add(email);

    out.push({
      nombre,
      email,
      codigo_estudiante: soloDigitos(codigos[i]),
      documento: soloDigitos(documentos[i]),
      telefono: limpiarTelefono(telefonos[i]),
      semestre_academico: semestreAcademico(semestres[i]),
    });
  }

  return out;
}

// ---------------------------------------------------------------------
//  Cargar un lote pegado desde la hoja
//
//  El semillero lleva años en un archivo de Excel, así que este módulo tiene
//  que poder arrancar con lo que ya hay adentro y no con la base en cero. La
//  forma más corta de hacerlo es la que ya usa el resto del sitio para las
//  listas de estudiantes: pegar. Se seleccionan las filas en la hoja, se
//  copian y se pegan aquí; llegan separadas por tabuladores.
//
//  Las columnas son las de "Seguimiento Proyectos SAMI", en su orden, de la A
//  a la O. Y el formato de la hoja tiene una particularidad que hay que
//  respetar: los datos del PROYECTO van solo en la primera fila del grupo, y
//  las de abajo traen el segundo estudiante o el segundo jurado con las demás
//  celdas en blanco. Por eso una fila con la columna A llena EMPIEZA un
//  proyecto y las que siguen le pertenecen.
// ---------------------------------------------------------------------

// El orden de las columnas de la hoja, de la A a la O. Cambiarlo aquí es todo
// lo que hace falta si algún día la hoja se reordena. El rótulo es el de la
// hoja y sirve para enseñar en la página qué se espera pegar.
const COLUMNAS_HOJA = [
  { campo: "titulo",          rotulo: "NOMBRE PROYECTO" },
  { campo: "codigo_estudiante", rotulo: "CÓDIGO" },
  { campo: "nombre",          rotulo: "NOMBRES Y APELLIDOS" },
  { campo: "documento",       rotulo: "DOCUMENTO" },
  { campo: "telefono",        rotulo: "TELÉFONO" },
  { campo: "email",           rotulo: "CORREO ELECTRÓNICO" },
  { campo: "director",        rotulo: "DIRECTOR" },
  { campo: "codirector",      rotulo: "CODIRECTOR" },
  { campo: "semestre",        rotulo: "SEMESTRE SEMILLERO" },
  { campo: "estado",          rotulo: "ESTADO" },
  { campo: "jurado",          rotulo: "JURADO" },
  { campo: "concepto",        rotulo: "CONCEPTO DE JURADO" },
  { campo: "anteproyecto_at", rotulo: "FECHA SUSTENTACIÓN ANTEPROYECTO" },
  { campo: "ceb",             rotulo: "ESTADO CEB" },
  { campo: "cpi",             rotulo: "ESTADO CPI" },
];

const COLUMNAS = COLUMNAS_HOJA.map((c) => c.campo);

// De la etiqueta literal de la hoja a la clave de aquí. Se compara sin
// mayúsculas ni tildes porque nadie escribe "Sustentación" igual dos veces.
const sinTildes = (v) =>
  String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const desdeHoja = (lista, texto) => {
  const buscado = sinTildes(texto);
  if (!buscado) return null;
  return lista.find((x) => sinTildes(x.hoja) === buscado) || null;
};

/**
 * Si dos nombres de docente son el mismo.
 *
 * Sin tildes y sin dobles espacios, porque en la hoja el mismo docente aparece
 * como "Oscar Leonardo Peréz", "Oscar Peréz" y "Oscar Pérez" —con la tilde
 * cambiada de sitio— según quién llenó la celda ese semestre. Un jurado que no
 * se reconoce no rompe nada (se guarda solo su nombre), pero un DIRECTOR que
 * no se reconoce deja el proyecto sin dueño y sin quien pueda calificarlo.
 */
function mismoNombre(a, b) {
  const norm = (v) => sinTildes(v).replace(/\s+/g, " ");
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;

  // "Oscar Pérez" contra "Oscar Leonardo Peréz": el primero y el último apellido
  // mandan, que es lo que de verdad distingue a un docente de otro en una lista
  // de cuatro.
  const piezas = (v) => v.split(" ").filter(Boolean);
  const px = piezas(x);
  const py = piezas(y);
  if (px.length < 2 || py.length < 2) return false;
  return px[0] === py[0] && px[px.length - 1] === py[py.length - 1];
}

/**
 * El estado de un proyecto que viene de la hoja.
 *
 * "1. Propuesta" lo comparten cinco estados de aquí, así que hay que elegir
 * uno, y el correcto es 'propuesta' —propuesta en construcción—: quien ya está
 * en la hoja de seguimiento del programa evidentemente notificó su intención y
 * radicó su carta. Devolver 'registro' diría lo contrario y le borraría dos
 * pasos a alguien que sí los hizo.
 */
function estadoDesdeHoja(v) {
  if (sinTildes(v) === sinTildes("1. Propuesta")) return "propuesta";
  const e = desdeHoja(ESTADOS, v);
  return e ? e.clave : null;
}
const conceptoDesdeHoja = (v) => {
  const c = desdeHoja(CONCEPTOS, v);
  return c ? c.clave : null;
};
const comiteDesdeHoja = (v) => {
  const c = desdeHoja(COMITES, v);
  return c ? c.clave : "na";
};

/**
 * Una fecha como la escribe Excel al copiar: "14/03/2026" o "2026-03-14".
 *
 * Lo que no tenga forma de fecha se descarta en silencio y a propósito: en la
 * hoja real esa celda tiene cosas como "Se retira de semillero", que es una
 * nota y no una fecha, y rechazar el lote entero por eso sería inútil.
 */
function fechaDeHoja(v) {
  const texto = String(v || "").trim();
  const iso = partirDia(texto);
  if (iso) return iso.fecha;

  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(texto);
  if (!m) return null;
  const dos = (n) => String(n).padStart(2, "0");
  return `${m[3]}-${dos(m[2])}-${dos(m[1])}`;
}

// "N/A", "NO ASIGNADO" y las celdas vacías son todas la misma cosa: nada.
const vacio = (v) => {
  const t = String(v || "").trim();
  return !t || /^(n\/?a|no asignado|-{1,2}|ninguno)$/i.test(t) ? null : t;
};

/**
 * Convierte lo pegado en proyectos listos para insertar.
 *
 * Devuelve { proyectos, errores }. Los errores son de FILA y no cortan el
 * lote: se importa lo que sirve y se dice qué se quedó fuera, porque un lote
 * de treinta proyectos que se rechaza entero por un correo mal escrito es un
 * lote que nadie va a volver a intentar.
 */
function parsearLote(texto) {
  const proyectos = [];
  const errores = [];
  let actual = null;

  const lineas = String(texto || "").replace(/\r\n/g, "\n").split("\n");

  lineas.forEach((cruda, i) => {
    if (!cruda.trim()) return;

    const celdas = cruda.split("\t");
    const f = {};
    COLUMNAS.forEach((c, j) => (f[c] = String(celdas[j] || "").trim()));

    const n = i + 1;

    // Una fila con título empieza un proyecto. Se salta la cabecera si la
    // pegaron: se reconoce porque su "título" es el rótulo de la columna.
    if (f.titulo) {
      if (sinTildes(f.titulo) === "nombre proyecto") return;

      actual = {
        linea: n,
        titulo: f.titulo.slice(0, 300),
        director: vacio(f.director),
        codirector: vacio(f.codirector),
        semestre: semestreValido(f.semestre),
        estado: estadoDesdeHoja(f.estado) || "aprobada",
        anteproyecto_at: fechaDeHoja(f.anteproyecto_at),
        ceb: comiteDesdeHoja(f.ceb),
        cpi: comiteDesdeHoja(f.cpi),
        estudiantes: [],
        jurados: [],
      };
      proyectos.push(actual);
    }

    if (!actual) {
      errores.push(`Fila ${n}: empieza sin nombre de proyecto, no sé de quién es.`);
      return;
    }

    // El estudiante de esta fila, si lo hay.
    if (f.nombre) {
      const email = limpiarEmail(f.email);
      if (!emailValido(email)) {
        errores.push(`Fila ${n}: «${f.nombre}» no tiene correo institucional. Se omite.`);
      } else {
        actual.estudiantes.push({
          nombre: limpiarNombre(f.nombre).slice(0, 120),
          codigo_estudiante: soloDigitos(f.codigo_estudiante),
          documento: soloDigitos(f.documento),
          telefono: limpiarTelefono(f.telefono),
          email,
        });
      }
    }

    // Y el jurado, que va en su propia columna y en su propio renglón.
    if (vacio(f.jurado)) {
      actual.jurados.push({
        nombre: limpiarNombre(f.jurado).slice(0, 120),
        concepto: conceptoDesdeHoja(f.concepto),
      });
    }
  });

  // Un proyecto sin un solo estudiante no se puede guardar: no hay a quién
  // ponerle reuniones ni notas.
  const buenos = [];
  for (const p of proyectos) {
    if (!p.estudiantes.length) {
      errores.push(`Fila ${p.linea}: «${p.titulo}» se queda fuera, no tiene ningún estudiante con correo.`);
      continue;
    }
    buenos.push(p);
  }

  return { proyectos: buenos, errores };
}

module.exports = {
  SAMI,
  ESTADOS,
  SEMESTRES,
  PERFILES,
  CONCEPTOS,
  COMITES,
  ASISTENCIA,
  estadoDe,
  estadoValido,
  vinculado,
  cerrado,
  semestreValido,
  perfilDe,
  perfilValido,
  conceptoDe,
  conceptoValido,
  comiteDe,
  comiteValido,
  asistenciaDe,
  enTransaccion,
  semanaDe,
  semanas,
  periodosVisibles,
  parsearLote,
  COLUMNAS_HOJA,
  mismoNombre,
  estadoDesdeHoja,
  conceptoDesdeHoja,
  comiteDesdeHoja,
  conEstado,
  porId,
  porCodigo,
  todos,
  codigoLibre,
  estudiantesDe,
  estudiante,
  proyectoDe,
  juradosDe,
  reunionesDe,
  reunion,
  ultimaReunion,
  rendimiento,
  notaDe,
  notaFinal,
  resumen,
  contarEstudiantes,
  esDirector,
  soloDigitos,
  limpiarTelefono,
  telefonoValido,
  limpiarTexto,
  semestreAcademico,
  calificacion,
  fechaValida,
  estudiantesDesdeFormulario,
  limpiarEmail,
  emailValido,
  limpiarNombre,
  dia,
};
