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
//
//  Los dos últimos peldaños llevan dos banderas más:
//
//  `libera` devuelve el cupo de sus estudiantes. Mientras un proyecto está vivo
//  su gente no puede radicar otro —una persona, una alternativa de grado a la
//  vez—, y eso es justo lo que estorba cuando alguien cambia de idea y tiene
//  que volver a empezar. 'retirado' y 'cancelado' sueltan; 'finalizado' no,
//  porque el que ya terminó no vuelve a empezar.
//
//  `accion` marca el estado al que NO se llega desde el selector. A 'cancelado'
//  se entra por su propio botón, que además pide el motivo y guarda de dónde
//  venía para poder deshacerlo; puesto a mano desde la lista no habría ni lo
//  uno ni lo otro, y una cancelación sin motivo es media cancelación.
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
  { clave: "retirado",   orden: 13, label: "Retirado",               cls: "malo",   hoja: "Retirado",   fase: "cerrado", libera: true },
  { clave: "cancelado",  orden: 14, label: "Cancelado",              cls: "malo",   hoja: "Cancelado",  fase: "cerrado", libera: true, accion: true },
];

const POR_CLAVE = new Map(ESTADOS.map((e) => [e.clave, e]));

const estadoDe = (clave) => POR_CLAVE.get(String(clave || "")) || ESTADOS[0];
const estadoValido = (v) => (POR_CLAVE.has(String(v || "")) ? String(v) : null);

// Lo que el selector del panel ofrece. Los de `accion` se quedan fuera: tienen
// su propio botón porque además del estado guardan otras cosas.
const ESTADOS_MANUALES = ESTADOS.filter((e) => !e.accion);

// Las claves entrecomilladas de un grupo de estados, para meterlas en un IN de
// una consulta. Se interpolan y no se parametrizan porque son constantes de
// este archivo —las de aquí arriba— y así la consulta se lee de corrido.
const claves = (fn) => ESTADOS.filter(fn).map((e) => `'${e.clave}'`).join(",");
const deFase = (fase) => claves((e) => e.fase === fase);
const CERRADOS = deFase("cerrado");
const LIBERAN = claves((e) => e.libera);
// Los cuatro peldaños en los que todavía no hay nada aprobado. Son los que se
// pueden tener de a varios: ver alternativaDe().
const INTENCIONES = deFase("vinculacion");

// De 'aprobada' en adelante ya es un proyecto de verdad: tiene director, cuenta
// en las cifras del semillero y tiene sentido pedirle semestre y reuniones.
// Antes de eso es una intención, que es otra cosa.
const vinculado = (clave) => estadoDe(clave).fase === "proyecto";
const cerrado = (clave) => estadoDe(clave).fase === "cerrado";

// Si el estado le devuelve el cupo a sus estudiantes. Se pregunta al revivir un
// proyecto: salir de aquí es volver a ocuparles la alternativa de grado, y hay
// que comprobar que en el entretanto no la hayan usado en otra parte.
const libera = (clave) => Boolean(estadoDe(clave).libera);

// Los semestres DENTRO del semillero. El IV existe porque pasa —alguien se
// alarga— y porque la hoja lo tenía; el panel lo señala en vez de esconderlo.
const SEMESTRES = ["I", "II", "III", "IV"];
const semestreValido = (v) => (SEMESTRES.includes(String(v || "").trim()) ? String(v).trim() : null);

// El número de orden de un semestre académico. 2026-10 va justo después de
// 2025-20, y restarlos da cuántos semestres hay de uno a otro —que es lo que no
// se puede sacar comparando los códigos como texto—.
function ordinal(codigo) {
  const m = /^(\d{4})-(10|20)$/.exec(String(codigo || "").trim());
  return m ? Number(m[1]) * 2 + (m[2] === "20" ? 1 : 0) : null;
}

/**
 * En cuál de los semestres del semillero (I…IV) iba un proyecto en un semestre
 * académico dado.
 *
 * Se CUENTA desde el semestre de ingreso, no se copia de ninguna parte, y esa es
 * toda la corrección: la nota del semestre venía sellándose con el campo
 * `semestre` del proyecto —dónde está HOY— así que calificar el 2025-20 de un
 * proyecto que hoy va por el III guardaba "III" en una nota que era del I. Dos
 * notas del mismo estudiante terminaban diciendo que las dos eran del III, y esa
 * etiqueta existe justamente para que dentro de un año se sepa cuál fue cuál.
 *
 * Más allá del cuarto se queda en IV: el semillero no tiene un quinto peldaño
 * que nombrar, y quien va por ahí ya está señalado en la ficha por excedido.
 */
function semestreEn(proyecto, codigoPeriodo) {
  const desde = ordinal(proyecto && proyecto.periodo_codigo);
  const hasta = ordinal(codigoPeriodo);
  if (desde === null || hasta === null) return null;

  const n = hasta - desde;
  return n < 0 ? null : SEMESTRES[Math.min(n, SEMESTRES.length - 1)];
}

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

/**
 * La calificación que CUENTA de una marca de reunión.
 *
 * No haber ido a la reunión es un cero, y no una casilla en blanco. Esa es la
 * regla del semillero: la reunión semanal ES el trabajo del semestre, así que
 * faltar no deja la nota pendiente —la decide—.
 *
 * Ojo con lo que esto NO cambia, que es la otra mitad de la regla: una reunión a
 * la que sí fue y todavía nadie calificó sigue valiendo "no está" y no cuenta
 * para el promedio. El cero automático sale de un hecho registrado —faltó—, no
 * de una casilla que nadie ha tocado.
 *
 * Y no se guarda en la tabla, se cuenta al leer, por dos razones: corregir la
 * asistencia de "no vino" a "vino" tiene que quitar el cero solo, y una nota
 * escrita a mano manda sobre el automático —si el director le puso 3.0 a quien
 * no fue porque entregó igual, esa es la nota y no la nuestra—.
 */
const notaDeMarca = (m) => {
  if (!m) return null;
  if (m.calificacion !== null && m.calificacion !== undefined) return m.calificacion;
  // El nulo se aparta ANTES de comparar: Number(null) es 0, así que preguntar
  // por el cero de una vez convertiría "todavía no lo he mirado" en una falta,
  // que es justo la confusión que los tres valores existen para evitar.
  if (m.asistio === null || m.asistio === undefined) return null;
  return Number(m.asistio) === 0 ? 0 : null;
};

// Lo mismo, en SQL, para las cuentas que se hacen en la base.
const NOTA_QUE_CUENTA = "COALESCE(a.calificacion, CASE WHEN a.asistio = 0 THEN 0 END)";

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
//
//  CADA SEMESTRE TIENE EL SUYO, y esa es la única regla que importa aquí. Un
//  proyecto del semillero dura tres semestres, así que el panel se pasa la vida
//  cambiando de semestre en el selector, y las dieciséis semanas que dibuja
//  tienen que ser las de ESE semestre: el pasado empezó el 2 de febrero y el de
//  ahora el 3 de agosto, y una tira de semanas de agosto sobre las reuniones de
//  marzo no es un calendario equivocado, es un calendario que miente.
//
//  Por eso las fechas de inicio son un mapa en config.SAMI y no una sola: al
//  estrenar semestre se agrega un renglón y el de antes se queda donde está.
// ---------------------------------------------------------------------

// La fecha de inicio de un semestre, por su código ("2026-20"). null si ese
// semestre no tiene calendario configurado, que es un caso normal —los
// semestres viejos, antes de que esto existiera— y no un error.
function inicioDe(codigoPeriodo) {
  const inicios = (SAMI.calendario || {}).inicios || {};
  const fecha = inicios[String(codigoPeriodo || "").trim()];
  return partirDia(fecha) ? fecha : null;
}

// Cuántas semanas dura un semestre de reuniones. Esta sí es una sola para
// todos: lo que cambia de un semestre a otro es cuándo empieza, no cuánto dura.
const totalSemanas = () => (SAMI.calendario || {}).semanas || 16;

/**
 * A qué semestre pertenece una fecha, por su código ("2026-20").
 *
 * De aquí sale el "Entró en" del proyecto. Antes se guardaba al crearlo —el
 * semestre que estuviera activo ese día— y se quedaba pegado ahí para siempre,
 * así que corregir la fecha de ingreso no lo movía y la ficha terminaba
 * diciendo "entró en 2026-20" con una fecha de febrero delante. La fecha manda
 * y el semestre se deduce, que es el orden correcto: lo que un docente escribe
 * mirando un acta es el día, no el código del semestre.
 *
 * Sale del FORMATO del código —AAAA-NN, 10 para el primer semestre del año y 20
 * para el segundo, como dice config.PERIODO— y NO de las fechas de inicio de
 * config.SAMI.calendario. Se intentó con ellas y estaba mal: esas fechas son
 * para dibujar las semanas de reuniones, un dato que se escribe a mano cada
 * semestre, y un año mal tecleado ahí movía en silencio el semestre de ingreso
 * de un proyecto. Un dato de apoyo no puede reescribir un dato del trámite.
 *
 * El corte va en julio, que es el mes en que no hay clase: de enero a junio la
 * fecha pertenece al primer semestre —aunque empiece en febrero, quien se
 * inscribe el 28 de enero se inscribe para ese— y de julio a diciembre al
 * segundo.
 */
function periodoDeFecha(fecha) {
  const p = partirDia(fecha);
  return p ? `${p.anio}-${p.mes <= 6 ? "10" : "20"}` : null;
}

/**
 * En qué semana del semestre cae una fecha (S1…S16).
 *
 * Es lo que hoy titula cada hoja del archivo de seguimiento ("Reunión semillero
 * 3 a 7 de Agosto"). Se calcula al guardar y se guarda ya resuelto: recalcularlo
 * al leer haría que corregir el calendario del semestre cambiara la semana de
 * reuniones que ya pasaron.
 *
 * Se calcula contra el calendario del semestre de la REUNIÓN, que es el que le
 * corresponde, y no contra el que se esté mirando en el selector.
 *
 * Fuera del rango devuelve null y no un número forzado: una reunión en enero,
 * durante el receso, no es "la semana 0" ni "la 16", simplemente no cae en el
 * calendario y así se muestra. Lo mismo un semestre sin calendario configurado:
 * antes que inventarle una semana, no ponerle ninguna.
 */
function semanaDe(fecha, codigoPeriodo) {
  const inicio = inicioDe(codigoPeriodo);
  if (!inicio || !partirDia(fecha)) return null;

  const dias = diasEntre(inicio, fecha);
  if (dias === null || dias < 0) return null;

  const semana = Math.floor(dias / 7) + 1;
  return semana >= 1 && semana <= totalSemanas() ? semana : null;
}

/**
 * Las semanas de un semestre, calculadas.
 *
 * En ninguna parte se escriben las dieciséis: salen de la fecha de inicio de
 * ese semestre, una cada siete días. Es lo que en el archivo viejo era el
 * título escrito a mano de cada hoja —"Reunión semillero 3 a 7 de Agosto del
 * 2026"—, y escribirlos a mano dieciséis veces por semestre es dieciséis
 * oportunidades de equivocarse.
 *
 * El rango va de lunes a viernes y no de lunes a domingo: las reuniones se
 * programan en días hábiles, y un rótulo que dijera "3 a 9 de agosto" haría
 * pensar que el sábado también cuenta.
 *
 * Sin calendario para ese semestre devuelve la lista vacía, y la página deja de
 * dibujar la tira en vez de dibujarla mal.
 */
function semanas(codigoPeriodo) {
  const inicio = inicioDe(codigoPeriodo);
  if (!inicio) return [];

  const total = totalSemanas();
  const out = [];

  for (let n = 1; n <= total; n++) {
    const desde = sumarDias(inicio, (n - 1) * 7);
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
      ingreso: dia(p.ingreso_at),
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
  SELECT p.*, d.name AS director, d.code AS director_email, per.codigo AS periodo_codigo,
         canc.name AS cancelado_por_nombre
    FROM sami_proyectos p
    LEFT JOIN docentes d    ON d.id = p.director_id
    LEFT JOIN periodos per  ON per.id = p.periodo_id
    LEFT JOIN docentes canc ON canc.id = p.cancelado_por`;

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
        ORDER BY p.estado IN ('retirado', 'cancelado'), p.estado = 'finalizado',
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

// Los proyectos VIVOS en los que está un correo, del más nuevo al más viejo.
// Es la consulta que comparten las tres preguntas de abajo; lo único que
// cambia entre ellas es qué tramo de la escalera miran.
//
// Los estados con `libera` no cuentan en ninguna de las tres, y de ahí sale la
// salida del que cambió de idea y tiene que volver a radicar: cancelar su
// proyecto le devuelve el cupo sin borrarle el rastro de que existió.
function proyectosDe(email, tramo = "") {
  const correo = limpiarEmail(email);
  if (!correo) return [];
  return db
    .prepare(
      `SELECT p.id, p.codigo, p.titulo, p.estado
         FROM sami_estudiantes e
         JOIN sami_proyectos p ON p.id = e.proyecto_id
        WHERE e.email = ? COLLATE NOCASE
          AND e.activo = 1
          AND p.estado NOT IN (${LIBERAN})
          ${tramo}
        ORDER BY p.created_at DESC`
    )
    .all(correo);
}

// Si alguien ya está en cualquier proyecto vivo, esté en el peldaño que esté.
// Es la pregunta ANCHA y la usa el importador: dos filas de la misma persona en
// las hojas de dos semestres son la misma persona, no dos proyectos.
function proyectoDe(email) {
  return proyectosDe(email)[0] || null;
}

/**
 * El proyecto que ya le ocupa a alguien la alternativa de grado: de 'aprobada'
 * en adelante, más 'finalizado'.
 *
 * Es la pregunta ESTRECHA y es la que mira el formulario público, porque la
 * regla de "una alternativa de grado a la vez" es sobre proyectos aprobados y
 * no sobre intenciones. Quien está buscando tema llega con dos o tres
 * propuestas —cada una con su asesor posible— y no tiene por qué escoger antes
 * de haber hablado con ninguno: dejar las dos escritas es justo lo que este
 * formulario existe para adelantar. Lo que no existe es tener dos proyectos
 * aprobados al tiempo, y eso sigue cerrado.
 */
function alternativaDe(email) {
  return proyectosDe(email, `AND p.estado NOT IN (${INTENCIONES})`)[0] || null;
}

// Las intenciones vivas de alguien: lo que dejó registrado y todavía no es
// proyecto. Se miran para no crear dos veces la misma propuesta.
function intencionesDe(email) {
  return proyectosDe(email, `AND p.estado IN (${INTENCIONES})`);
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
    // `nota` es la que cuenta: la escrita, o el cero de haber faltado.
    // `calificacion` se queda tal cual está en la tabla, que es lo que el
    // formulario tiene que volver a mostrar en su casilla —si ahí saliera el
    // cero automático, guardar sin tocar nada lo dejaría escrito a mano y
    // corregir la asistencia después ya no lo quitaría—.
    marcas: marcas.all(r.id).map((m) => ({
      ...m,
      asistencia: asistenciaDe(m.asistio),
      nota: notaDeMarca(m),
    })),
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
//  Objetivos del semestre
//
//  Las actividades que el estudiante se compromete a hacer en su propuesta.
//  Son contra lo que el director saca la nota: "cumplió" y "no cumplió" no se
//  discuten contra una impresión general del semestre sino contra una lista
//  que estaba escrita desde el primer día.
//
//  Son del proyecto y del periodo. Del PROYECTO porque la propuesta es una
//  sola; del PERIODO porque el semillero dura tres semestres y cada uno trae
//  los suyos.
// ---------------------------------------------------------------------
function objetivosDe(proyectoId, periodoId) {
  return db
    .prepare(
      `SELECT o.*, d.name AS calificado_por_nombre
         FROM sami_objetivos o
         LEFT JOIN docentes d ON d.id = o.calificado_por
        WHERE o.proyecto_id = ? AND o.periodo_id = ?
        ORDER BY o.orden, o.id`
    )
    .all(Number(proyectoId), Number(periodoId));
}

/**
 * El promedio de los objetivos calificados, y cuántos van.
 *
 * Se promedian SOLO los que tienen nota: un objetivo sin calificar no vale
 * cero, vale que todavía no se miró. Contar los pendientes como ceros en
 * octubre daría un promedio de 1.2 que no significa nada y que además baja solo
 * con que el semestre avance.
 *
 * Aquí no hay nada equivalente al cero por inasistencia de las reuniones, y no
 * es un olvido: a una reunión se va o no se va, y eso es un hecho del día. Un
 * objetivo no entregado a mitad de semestre todavía se puede entregar.
 *
 * `pendientes` sale aparte y a la vista para que un promedio de dos objetivos
 * sobre siete no se lea como el promedio del semestre.
 */
function promedioObjetivos(objetivos) {
  const notas = objetivos.filter((o) => o.nota !== null && o.nota !== undefined).map((o) => o.nota);
  const promedio = notas.length
    ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 100) / 100
    : null;

  return {
    total: objetivos.length,
    calificados: notas.length,
    pendientes: objetivos.length - notas.length,
    promedio,
  };
}

/**
 * La nota que el panel SUGIERE para el semestre: el promedio de los objetivos
 * junto con el promedio de las reuniones.
 *
 * Los dos pesan igual y a propósito. Los objetivos dicen qué se entregó y las
 * reuniones cómo se trabajó, y ninguna de las dos cosas manda sobre la otra en
 * un semillero: quien entrega todo el último día sin haber aparecido en cuatro
 * meses no hizo el semestre que la propuesta decía.
 *
 * Con uno solo de los dos, ese solo es la sugerencia —y no la mitad de sí
 * mismo, que es lo que saldría de promediarlo con un cero—. Es la misma regla
 * que usa notaFinal con el codirector que no responde.
 *
 * Sugerencia y nada más: quien la escribe es el director, que pesa cosas que no
 * están en esta base. Aquí no se precarga ninguna casilla.
 */
function sugerido(promedioObj, promedioReu) {
  const hay = [promedioObj, promedioReu].filter((n) => n !== null && n !== undefined);
  if (!hay.length) return null;
  return Math.round((hay.reduce((a, b) => a + b, 0) / hay.length) * 100) / 100;
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
 *   promedio — de las calificaciones que CUENTAN, que no son solo las escritas:
 *              una falta vale cero y entra en el promedio, porque la reunión
 *              semanal es el trabajo del semestre y no ir lo decide. Una
 *              reunión a la que sí fue y nadie ha calificado sigue sin contar:
 *              esa no vale cero, vale que no está.
 */
function rendimiento(estudianteId, periodoId) {
  const fila = db
    .prepare(
      `SELECT COUNT(*) AS sesiones,
              COALESCE(SUM(a.asistio = 1), 0) AS asistio,
              COALESCE(SUM(a.asistio = 0), 0) AS falto,
              COUNT(${NOTA_QUE_CUENTA})       AS calificadas,
              AVG(${NOTA_QUE_CUENTA})         AS promedio
         FROM sami_reuniones r
         JOIN sami_asistencias a ON a.reunion_id = r.id
        WHERE a.estudiante_id = ? AND r.periodo_id = ?`
    )
    .get(Number(estudianteId), Number(periodoId));

  return {
    ...fila,
    total: totalSemanas(),
    sin_pasar: fila.sesiones - fila.asistio - fila.falto,
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

// Los semestres que cuentan para la nota acumulada. El IV NO está: existe
// porque pasa —alguien se alarga— pero el semillero son tres, y quien lo cursa
// no sale con una nota compuesta de cuatro pedazos mientras su compañero la
// saca de tres. Es el mismo tope que el panel señala en la ficha.
const SEMESTRES_QUE_CUENTAN = ["I", "II", "III"];

/**
 * La nota acumulada de un estudiante: el promedio de sus semestres.
 *
 * Es la única cifra del módulo que cruza semestres, y por eso no vive con las
 * demás: todo lo que se ve en el panel es de UN semestre —las reuniones, los
 * objetivos, la nota— y esta es la que responde "¿cómo va en total?", que es lo
 * que hay que saber cuando el proyecto va por el III y alguien pregunta si el
 * estudiante viene bien.
 *
 * Tres reglas y las tres se notan:
 *
 *   · solo I, II y III. La nota del IV no entra aunque esté puesta;
 *   · se promedian los semestres CERRADOS, no los tres. A mitad del II, un
 *     acumulado sacado sobre tres lo dejaría en 2.9 con dos notas de 4.4, y eso
 *     no es un promedio, es una división por semestres que no han pasado;
 *   · si un semestre tiene dos notas —se repitió y quedó registrado dos veces—
 *     manda la del periodo más reciente, no las dos.
 */
function acumulado(estudianteId) {
  const filas = db
    .prepare(
      `SELECT n.semestre, n.nota_director, n.nota_codirector, per.codigo AS periodo_codigo
         FROM sami_notas n
         LEFT JOIN periodos per ON per.id = n.periodo_id
        WHERE n.estudiante_id = ?
        ORDER BY per.codigo`
    )
    .all(Number(estudianteId));

  // Una entrada por semestre; como vienen ordenadas por periodo, la última que
  // se escribe es la más reciente.
  const porSemestre = new Map();
  for (const f of filas) {
    if (!SEMESTRES_QUE_CUENTAN.includes(f.semestre)) continue;
    const final = notaFinal(f);
    if (final === null) continue;
    porSemestre.set(f.semestre, final);
  }

  const puestas = [...porSemestre.values()];

  return {
    cerrados: puestas.length,
    total: SEMESTRES_QUE_CUENTAN.length,
    promedio: puestas.length
      ? Math.round((puestas.reduce((a, b) => a + b, 0) / puestas.length) * 100) / 100
      : null,
  };
}

/**
 * Las cifras del panel, en una sola consulta.
 *
 * Todo lo que en las hojas había que contar a mano cada vez que alguien
 * preguntaba: cuántos van, en qué semestre, a cuántos les falta director y
 * quién tiene un comité colgando.
 */
function resumen() {
  return db
    .prepare(
      `SELECT
         COALESCE(SUM(estado IN (${deFase("vinculacion")})), 0) AS intenciones,
         COALESCE(SUM(estado IN (${deFase("proyecto")})), 0)    AS activos,
         COALESCE(SUM(estado = 'finalizado'), 0)                AS finalizados,
         COALESCE(SUM(estado = 'retirado'), 0)                  AS retirados,
         COALESCE(SUM(estado = 'cancelado'), 0)                 AS cancelados,
         COALESCE(SUM(estado IN (${deFase("proyecto")}) AND semestre = 'I'), 0)   AS sem_i,
         COALESCE(SUM(estado IN (${deFase("proyecto")}) AND semestre = 'II'), 0)  AS sem_ii,
         COALESCE(SUM(estado IN (${deFase("proyecto")}) AND semestre = 'III'), 0) AS sem_iii,
         COALESCE(SUM(estado IN (${deFase("proyecto")}) AND semestre = 'IV'), 0)  AS sem_iv,
         COALESCE(SUM(estado IN (${deFase("proyecto")}) AND director_id IS NULL), 0) AS sin_director,
         COALESCE(SUM(estado IN (${deFase("proyecto")}) AND ceb = 'pendiente'), 0)   AS ceb_pendiente,
         COALESCE(SUM(estado IN (${deFase("proyecto")}) AND cpi = 'pendiente'), 0)   AS cpi_pendiente
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
        WHERE e.activo = 1 AND p.estado NOT IN (${CERRADOS})`
    )
    .get().n;
}

// ---------------------------------------------------------------------
//  Lo que un proyecto deja atrás
// ---------------------------------------------------------------------
/**
 * Qué cuelga de un proyecto: lo que un borrado se llevaría por delante.
 *
 * NO es un permiso, es un aviso. Se contó primero para prohibir el borrado en
 * cuanto hubiera una reunión o una nota, y eso estaba mal por una razón muy
 * concreta: la nota de prueba que alguien escribe para ver cómo se ve la
 * casilla convertía el proyecto de prueba en basura imborrable. Justo al
 * revés de para qué existe el botón.
 *
 * Lo que sí hace es dejar que la página diga qué se va a llevar, con números y
 * no con un "esto no se puede deshacer" genérico: "se lleva 2 integrantes, 7
 * reuniones y 2 notas de semestre" es lo que hace pensar dos veces a quien está
 * a punto de borrar el proyecto equivocado.
 */
function rastro(proyectoId) {
  const id = Number(proyectoId);
  const contar = (sql) => db.prepare(sql).get(id).n;

  return {
    estudiantes: contar("SELECT COUNT(*) AS n FROM sami_estudiantes WHERE proyecto_id = ?"),
    jurados: contar("SELECT COUNT(*) AS n FROM sami_jurados WHERE proyecto_id = ?"),
    reuniones: contar("SELECT COUNT(*) AS n FROM sami_reuniones WHERE proyecto_id = ?"),
    // Los objetivos van con su cuenta de calificados aparte. Una lista pegada de
    // la propuesta y todavía sin notas es una transcripción; en cuanto tiene
    // notas es trabajo de calificación, y eso pesa distinto en el borrado.
    objetivos: contar("SELECT COUNT(*) AS n FROM sami_objetivos WHERE proyecto_id = ?"),
    objetivos_calificados: contar(
      "SELECT COUNT(*) AS n FROM sami_objetivos WHERE proyecto_id = ? AND nota IS NOT NULL"
    ),
    notas: contar(
      `SELECT COUNT(*) AS n
         FROM sami_notas n
         JOIN sami_estudiantes e ON e.id = n.estudiante_id
        WHERE e.proyecto_id = ?`
    ),
  };
}

// Si el borrado se lleva trabajo registrado por delante. Lo único que cambia es
// cuánto cuesta pulsar el botón: con esto en true hay que escribir el código.
const dejaRastro = (r) => Boolean(r.reuniones || r.notas || r.objetivos_calificados);

// ---------------------------------------------------------------------
//  Semestres del semillero
// ---------------------------------------------------------------------
/**
 * Los semestres que el panel ofrece en su selector.
 *
 * La tabla `periodos` es de la app entera y tiene semestres viejos de otros
 * módulos. Del semillero solo hay datos desde cierto punto, y ofrecer
 * semestres en los que no existía solo sirve para abrir páginas vacías y
 * hacer dudar a quien las abre.
 *
 * Desde cuándo lo dicen DOS cosas del config, y se toma la más antigua:
 *
 *   · `SAMI.desde`, que lo declara de frente;
 *   · el calendario más viejo de `SAMI.calendario.inicios`, porque escribirle a
 *     un semestre su lunes de arranque ya es decir que el semillero existía
 *     entonces.
 *
 * Se miran las dos y no solo la primera porque tenerlas separadas era una
 * trampa: quien agrega los calendarios de cuatro semestres viejos espera verlos
 * en el selector —los acaba de declarar— y en cambio no pasaba nada, porque
 * faltaba mover una segunda línea que no tenía por qué recordar. Dos perillas
 * que hay que mantener de acuerdo terminan en desacuerdo.
 *
 * La comparación es de texto y funciona porque el formato AAAA-NN ordena igual
 * que la fecha. Sin ninguna de las dos se ofrecen todos.
 */
function desdeCuando() {
  const inicios = Object.keys((SAMI.calendario || {}).inicios || {});
  const candidatos = [SAMI.desde, ...inicios].filter(Boolean).map(String);
  return candidatos.length ? candidatos.sort()[0] : null;
}

function periodosVisibles(todos) {
  const desde = desdeCuando();
  if (!desde) return todos;
  return todos.filter((p) => String(p.codigo) >= desde);
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

/**
 * Si el semestre que se está mirando es ANTERIOR al de ingreso del proyecto.
 *
 * En un semestre así el proyecto no existía, y por eso el panel no deja
 * escribirle nada: ni reuniones, ni objetivos, ni notas. No es una manía de
 * orden. Una nota del semestre I fechada un año antes de que el estudiante
 * entrara al semillero es un dato que nadie va a poder explicar después, y el
 * selector de semestre está a un clic de la ficha —quedarse en el semestre
 * equivocado y calificar ahí es un error de dos segundos—.
 *
 * Hacia adelante no hay tope, y también a propósito: un proyecto dura tres
 * semestres y puede alargarse a un cuarto, así que el futuro es donde
 * legítimamente sigue trabajando.
 *
 * La comparación es de texto y funciona porque el formato AAAA-NN ordena igual
 * que la fecha, como en periodosVisibles.
 */
function antesDelIngreso(codigoPeriodo, proyecto) {
  const suyo = proyecto && proyecto.periodo_codigo;
  if (!suyo || !codigoPeriodo) return false;
  return String(codigoPeriodo) < String(suyo);
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
 * Un textarea pegado, una cosa por renglón.
 *
 * Es como entran los objetivos: se seleccionan en la propuesta, se copian y se
 * pegan. Y llegan como estaban allá —numerados, con viñetas—, así que se les
 * quita la marca de lista: nadie quiere terminar con un objetivo que se llama
 * "1. Levantamiento de requerimientos" y otro "- Levantamiento…" según de qué
 * documento se copió.
 *
 * Los renglones en blanco se caen solos, que es lo que hace que pegar de un
 * PDF a doble espacio funcione igual.
 */
function lineas(texto, { max = 300, tope = 40 } = {}) {
  return String(texto || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) =>
      l
        .trim()
        .replace(/^[-*•·–—]\s+/, "")
        .replace(/^\d+[.)]\s+/, "")
        .trim()
        .slice(0, max)
    )
    .filter(Boolean)
    .slice(0, tope);
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
 * Si dos títulos tentativos son el mismo.
 *
 * Se compara igualito y no por parecido —sin tildes, sin mayúsculas, sin dobles
 * espacios y sin la puntuación del final—, y esa mano corta es a propósito: al
 * estudiante SÍ se le permite dejar varias propuestas, así que dos títulos
 * distintos son dos ideas y no un error. Lo único que esto atrapa es el mismo
 * título otra vez, que no es una segunda idea sino un doble envío o alguien
 * que no se acuerda de que ya lo hizo.
 */
function mismoTitulo(a, b) {
  const norm = (v) =>
    sinTildes(v)
      .replace(/\s+/g, " ")
      .replace(/[.,;:!?"'¿¡]+$/, "")
      .trim();
  const x = norm(a);
  const y = norm(b);
  return Boolean(x) && x === y;
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

// ---------------------------------------------------------------------
//  Cargar un lote de reuniones pegado desde la hoja semanal
//
//  El otro archivo del semillero es "Seguimiento y Evaluación", con una hoja
//  por semana —S1…S16— y siempre las mismas columnas. Se pegan igual que los
//  proyectos, y por la misma razón: el semestre empezó en Excel y el módulo
//  tiene que poder recoger lo que ya se llenó ahí.
//
//  Dos cosas de esa hoja que este parser tiene que traducir, porque no coinciden
//  con cómo se guarda aquí:
//
//  1. Allá la fila es del ESTUDIANTE y aquí la reunión es del PROYECTO. Las
//     filas del mismo día se juntan en una sola reunión, y cada estudiante
//     queda como una marca suya adentro. Por eso el lote se pega desde la ficha
//     de un proyecto y no en una página aparte: los nombres se resuelven contra
//     SUS integrantes, que son dos como mucho, y no contra el semillero entero.
//
//  2. La columna de asistencia es una FIRMA. Cualquier cosa escrita ahí es
//     haber ido; la casilla vacía es "no se marcó", que no es lo mismo que no
//     haber ido —la misma regla de tres valores del resto del módulo—. Solo un
//     "no" explícito se lee como falta.
// ---------------------------------------------------------------------

// Las columnas de la hoja semanal, de la B a la H. La A es el título de la
// semana y no trae dato; si viene pegada, el parser la reconoce y la descarta.
const COLUMNAS_REUNIONES = [
  { campo: "fecha", rotulo: "Fecha" },
  { campo: "estudiantes", rotulo: "Estudiante(s)" },
  { campo: "adelantos", rotulo: "Adelantos Realizados" },
  { campo: "compromisos", rotulo: "Se Compromete a entregar" },
  { campo: "asistencia", rotulo: "Firma de Asistencia" },
  { campo: "calificacion", rotulo: "Calificación del Docente" },
  { campo: "docente", rotulo: "Docente a cargo" },
];

/**
 * La firma de asistencia de la hoja.
 *
 * Vacía es NULL —nadie la miró— y no un cero. Lo que esté escrito, sea una
 * equis, un "SI" o un nombre garabateado, es que asistió: para eso se firma.
 * Solo lo que dice que no, cuenta como falta.
 */
function asistenciaDeHoja(v) {
  const t = sinTildes(v);
  if (!t) return null;
  return /^(no|n|f|0|falto|falta|ausente|no asistio|no vino|inasistencia)$/.test(t) ? 0 : 1;
}

// Dos integrantes en una celda: "Ana Gómez, Luis Peña". Se parte por lo que de
// verdad separa nombres en una celda y no por espacios, que están dentro de
// cada nombre.
const partirNombres = (v) =>
  String(v || "")
    .split(/[,;/&\n]+/)
    .map((s) => limpiarNombre(s))
    .filter(Boolean);

/**
 * Convierte lo pegado en reuniones listas para insertar.
 *
 * `integrantes` son los del proyecto: los nombres de la hoja se resuelven
 * contra ellos con la misma tolerancia que los docentes —sin tildes, primer
 * nombre y último apellido—, porque en la hoja el mismo estudiante aparece
 * escrito de tres maneras según quién llenó la celda.
 *
 * Devuelve { reuniones, errores }. Los errores son de FILA y no cortan el lote,
 * igual que en los proyectos: se importa lo que sirve y se dice qué se quedó
 * fuera.
 */
function parsearReuniones(texto, integrantes = []) {
  const errores = [];
  const porFecha = new Map();

  const lineas = String(texto || "").replace(/\r\n/g, "\n").split("\n");
  const celdasDe = (l) => l.split("\t").map((c) => c.trim());

  // ¿Viene la columna A del título por delante? Se decide mirando el pegado
  // ENTERO y no fila por fila: si se decidiera fila a fila, las de abajo de un
  // grupo —que traen la fecha en blanco porque va combinada arriba— se
  // desplazarían al revés que la primera y quedarían todas corridas.
  const desplazado = lineas.some((l) => {
    const c = celdasDe(l);
    return c.length > 1 && !c[0] && fechaDeHoja(c[1]);
  });

  let actual = null;

  lineas.forEach((cruda, i) => {
    if (!cruda.trim()) return;

    const crudas = celdasDe(cruda);
    // El título de la hoja ("Reunión semillero 3 a 7 de Agosto del 2026").
    if (/^reuni[oó]n semillero/i.test(crudas[0] || "")) return;

    const celdas = desplazado ? crudas.slice(1) : crudas;
    const f = {};
    COLUMNAS_REUNIONES.forEach((c, j) => (f[c.campo] = celdas[j] || ""));

    // La cabecera, si la pegaron.
    if (sinTildes(f.fecha) === "fecha" || sinTildes(f.estudiantes) === "estudiante(s)") return;

    const n = i + 1;

    // Una fila con fecha empieza —o retoma— un día. Las de abajo le pertenecen,
    // que es como está armada la hoja: la fecha va combinada para el grupo.
    const suya = fechaDeHoja(f.fecha);
    if (suya) actual = suya;
    if (!actual) {
      errores.push(`Fila ${n}: empieza sin fecha, no sé de qué día es.`);
      return;
    }

    if (!porFecha.has(actual)) {
      porFecha.set(actual, {
        fecha: actual,
        adelantos: [],
        compromisos: [],
        docente: null,
        marcas: [],
        vistos: new Set(),
      });
    }
    const r = porFecha.get(actual);

    // Los adelantos y los compromisos son del PROYECTO, pero en la hoja están
    // escritos en la fila de cada estudiante. Se juntan sin repetir: cuando los
    // dos integrantes tienen el mismo texto queda uno, y cuando cada uno
    // escribió lo suyo quedan los dos, que es más honesto que quedarse con el
    // primero y perder el otro.
    const sumar = (lista, valor) => {
      const t = limpiarTexto(valor);
      if (t && !lista.includes(t)) lista.push(t);
    };
    sumar(r.adelantos, f.adelantos);
    sumar(r.compromisos, f.compromisos);
    if (!r.docente && limpiarNombre(f.docente)) r.docente = limpiarNombre(f.docente);

    const nombres = partirNombres(f.estudiantes);
    if (!nombres.length) return;

    const nota = calificacion(f.calificacion);
    if (nota === false) {
      errores.push(`Fila ${n}: la calificación «${f.calificacion}» está fuera de 0 a ${ESCALA_MAX}.`);
      return;
    }
    const asistio = asistenciaDeHoja(f.asistencia);

    for (const nombre of nombres) {
      const suyo = integrantes.find((e) => mismoNombre(e.nombre, nombre));
      if (!suyo) {
        errores.push(`Fila ${n}: «${nombre}» no es integrante de este proyecto. Se omite.`);
        continue;
      }
      // El mismo estudiante dos veces el mismo día: manda la primera y no se
      // duplica la marca, que además reventaría el UNIQUE de la tabla.
      if (r.vistos.has(suyo.id)) continue;
      r.vistos.add(suyo.id);
      // `estudianteId` y no `estudiante_id`: es lo que come escribirMarcas, la
      // misma forma que devuelve leerMarcas al guardar una reunión a mano. Las
      // dos entradas terminan en la misma escritura y conviene que hablen igual.
      r.marcas.push({
        estudianteId: suyo.id,
        nombre: suyo.nombre,
        asistio,
        calificacion: nota,
      });
    }
  });

  const reuniones = [...porFecha.values()]
    .map(({ vistos, adelantos, compromisos, ...r }) => ({
      ...r,
      adelantos: adelantos.join("\n") || null,
      compromisos: compromisos.join("\n") || null,
    }))
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1));

  return { reuniones, errores };
}

module.exports = {
  SAMI,
  ESTADOS,
  ESTADOS_MANUALES,
  SEMESTRES,
  PERFILES,
  CONCEPTOS,
  COMITES,
  ASISTENCIA,
  estadoDe,
  estadoValido,
  vinculado,
  cerrado,
  libera,
  semestreValido,
  semestreEn,
  perfilDe,
  perfilValido,
  conceptoDe,
  conceptoValido,
  comiteDe,
  comiteValido,
  asistenciaDe,
  notaDeMarca,
  enTransaccion,
  inicioDe,
  totalSemanas,
  periodoDeFecha,
  semanaDe,
  semanas,
  periodosVisibles,
  parsearLote,
  parsearReuniones,
  COLUMNAS_HOJA,
  COLUMNAS_REUNIONES,
  mismoNombre,
  mismoTitulo,
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
  alternativaDe,
  intencionesDe,
  juradosDe,
  objetivosDe,
  promedioObjetivos,
  sugerido,
  reunionesDe,
  reunion,
  ultimaReunion,
  rendimiento,
  notaDe,
  notaFinal,
  acumulado,
  resumen,
  contarEstudiantes,
  rastro,
  dejaRastro,
  esDirector,
  antesDelIngreso,
  soloDigitos,
  limpiarTelefono,
  telefonoValido,
  limpiarTexto,
  semestreAcademico,
  calificacion,
  fechaValida,
  lineas,
  estudiantesDesdeFormulario,
  limpiarEmail,
  emailValido,
  limpiarNombre,
  dia,
};
