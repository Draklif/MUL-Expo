// =====================================================================
//  EL PROGRAMA, DE UN VISTAZO
//
//  Lo que alimenta /info: qué hace Ingeniería en Multimedia fuera del salón.
//  Los cuatro eventos y las salidas pedagógicas, cada uno con lo que se hizo
//  la última vez y lo que viene.
//
//  Dos reglas mandan aquí y explican por qué el archivo es de puras consultas:
//
//  1. NO se escribe contenido nuevo. Lo que dice cada evento ya está escrito
//     en su data/*.json —el tipo, la descripción, el lema— y en config
//     —el slug, la fecha, las banderas—. Este módulo los junta; el día que
//     alguien reescriba el lema del torneo, /info lo dice sin tocarse.
//
//  2. El HISTORIAL se cuenta, no se guarda. Cuántos equipos jugaron el
//     semestre pasado no es un dato que alguien escriba: es un COUNT sobre lo
//     que quedó en la base. Así una página de balance no puede envejecer mal
//     ni contradecir al panel.
//
//  Todo lo de aquí es público y por eso solo sale lo que ya se aprobó o se
//  confirmó: un equipo pendiente de revisión no es historia del programa
//  todavía, es una inscripción que alguien no ha mirado.
// =====================================================================
const db = require("../db/database");
const eventos = require("./eventos");
const salidas = require("./salidas");
const premios = require("./premios");
const sami = require("./sami");
const { aprobado } = require("./aprobado");
const { VC, SAMI } = require("../config");

// Cuántos nombres se enseñan de cada edición (el cartel del festival, los
// juegos de la jam). Es un tope de página, no de datos: la edición completa
// está en la página del evento, y esto es el índice.
const MUESTRA = 8;

// ---------------------------------------------------------------------
//  Semestres
// ---------------------------------------------------------------------
// "2026-20" → "segundo semestre de 2026". El código es el que se guarda y el
// que ve un docente en el panel; en una página pública no dice nada.
function semestre(codigo) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(codigo || "").trim());
  if (!m) return String(codigo || "");
  return `${m[2] === "10" ? "primer" : "segundo"} semestre de ${m[1]}`;
}

// ---------------------------------------------------------------------
//  Podios
// ---------------------------------------------------------------------
// De qué tabla sale el nombre de un ganador. premios_evento guarda el ámbito
// en ref_tipo y el id en ref_id, sin llave foránea, porque las cinco filas
// posibles apuntan a cinco tablas distintas.
const NOMBRE_DE = {
  vc_equipo: "SELECT nombre FROM vc_equipos WHERE id = ?",
  vc_jugador: "SELECT nombre FROM vc_jugadores WHERE id = ?",
  jam_equipo: "SELECT nombre FROM jam_equipos WHERE id = ?",
  music_acto: "SELECT nombre FROM music_actos WHERE id = ?",
  music_persona: "SELECT nombre FROM music_produccion WHERE id = ?",
};

/**
 * Quién ganó qué en una edición, en el orden del catálogo de config.
 *
 * Las categorías desiertas no salen: un premio sin nombre al lado no es
 * información, es un hueco. Y el nombre se lee de la tabla y no del
 * certificado a propósito —un premio puede estar adjudicado sin que se hayan
 * emitido los certificados todavía—.
 */
function podio(evento, lote) {
  const puestos = premios.asignados(evento, lote);

  return premios
    .catalogo(evento)
    .map((cat) => {
      const fila = puestos[cat.id];
      if (!fila) return null;

      const sql = NOMBRE_DE[fila.ref_tipo];
      const quien = sql ? db.prepare(sql).get(Number(fila.ref_id)) : null;
      if (!quien) return null;

      return { label: cat.label, cls: cat.cls, quien: quien.nombre };
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------
//  El historial de cada evento
// ---------------------------------------------------------------------
// Los cuatro devuelven la misma forma —semestre, cifras, podio y una muestra
// de nombres— para que la vista de cada banda pueda ser distinta sin que la
// consulta tenga que serlo.

// La Expo no tiene tabla de ediciones: la unidad es el semestre y lo que
// quedó de él son las solicitudes aprobadas. Un semestre sin ninguna no sale
// en la lista —no hubo Expo, o no se registró por aquí—.
function edicionesExpo() {
  const filas = db
    .prepare(
      `SELECT p.id, p.codigo,
              COUNT(DISTINCT s.id)  AS proyectos,
              COUNT(DISTINCT si.id) AS expositores
         FROM solicitudes s
         JOIN periodos p ON p.id = s.periodo_id
         LEFT JOIN solicitud_integrantes si ON si.solicitud_id = s.id
        WHERE s.estado = 'aprobada'
        GROUP BY p.id
        ORDER BY p.codigo DESC`
    )
    .all();

  // El podio sale de los certificados y no del ranking en vivo: la nota de un
  // proyecto se puede corregir años después, pero el primer puesto de aquel
  // semestre es el que se imprimió y se repartió.
  const primeros = db.prepare(
    `SELECT DISTINCT titulo FROM certificados
      WHERE evento = 'expo' AND periodo_id = ? AND puesto IS NOT NULL
      ORDER BY puesto LIMIT 3`
  );

  return filas.map((f) => ({
    periodo: f.codigo,
    semestre: semestre(f.codigo),
    cifras: [
      { n: f.proyectos, que: f.proyectos === 1 ? "proyecto" : "proyectos" },
      { n: f.expositores, que: f.expositores === 1 ? "expositor" : "expositores" },
    ],
    podio: primeros.all(f.id).map((c, i) => ({
      label: ["Primer puesto", "Segundo puesto", "Tercer puesto"][i],
      cls: ["oro", "plata", "bronce"][i],
      quien: c.titulo,
    })),
    nombres: [],
  }));
}

// El torneo son varios torneos: uno por juego y por semestre. Se agrupan por
// semestre porque "Virtual Champions 2026-20" es una sola cosa para quien lee,
// aunque por dentro sean dos brackets.
function edicionesVC() {
  const torneos = db
    .prepare(
      `SELECT t.id, t.juego, p.codigo AS periodo,
              (SELECT COUNT(*) FROM vc_equipos e
                WHERE e.torneo_id = t.id AND e.estado = 'aprobado') AS equipos,
              (SELECT COUNT(*) FROM vc_jugadores j
                 JOIN vc_equipos e ON e.id = j.equipo_id
                WHERE j.torneo_id = t.id AND e.estado = 'aprobado') AS jugadores
         FROM vc_torneos t
         LEFT JOIN periodos p ON p.id = t.periodo_id
        ORDER BY p.codigo DESC, t.id`
    )
    .all()
    .filter((t) => t.equipos > 0);

  const porSemestre = new Map();

  for (const t of torneos) {
    const juego = VC.juegos.find((j) => j.id === t.juego);
    if (!porSemestre.has(t.periodo)) {
      porSemestre.set(t.periodo, {
        periodo: t.periodo,
        semestre: semestre(t.periodo),
        cifras: [],
        podio: [],
        // Los juegos con su color: es lo que le da identidad a la banda del
        // torneo sin que la hoja de estilos tenga que nombrar a ninguno.
        juegos: [],
        nombres: [],
      });
    }

    const ed = porSemestre.get(t.periodo);
    const campeon = podio("virtual-champions", t.id).find((p) => p.cls === "oro");

    ed.juegos.push({
      id: t.juego,
      nombre: juego ? juego.nombre : t.juego,
      acento: juego ? juego.acento : null,
      equipos: t.equipos,
      jugadores: t.jugadores,
      campeon: campeon ? campeon.quien : null,
    });
  }

  return [...porSemestre.values()].map((ed) => {
    const equipos = ed.juegos.reduce((n, j) => n + j.equipos, 0);
    const jugadores = ed.juegos.reduce((n, j) => n + j.jugadores, 0);

    return {
      ...ed,
      cifras: [
        { n: equipos, que: equipos === 1 ? "equipo" : "equipos" },
        { n: jugadores, que: jugadores === 1 ? "jugador" : "jugadores" },
      ],
      // Los campeones del semestre, uno por juego: es lo que hace distinta a
      // una edición del torneo de la siguiente cuando ya no cabe entera.
      nombres: ed.juegos.map((j) => j.campeon).filter(Boolean),
    };
  });
}

// La jam tiene una edición por semestre y la unidad es el juego entregado:
// un equipo inscrito que no entregó no dejó nada que mostrar.
function edicionesJam() {
  const filas = db
    .prepare(
      `SELECT e.id, e.tema, e.tema_revelado, e.horas, p.codigo AS periodo,
              (SELECT COUNT(*) FROM jam_equipos q
                WHERE q.edicion_id = e.id AND q.estado = 'aprobado') AS equipos,
              (SELECT COUNT(*) FROM jam_equipos q
                WHERE q.edicion_id = e.id AND q.estado = 'aprobado'
                  AND q.entregado_at IS NOT NULL) AS entregas
         FROM jam_ediciones e
         LEFT JOIN periodos p ON p.id = e.periodo_id
        ORDER BY p.codigo DESC, e.id DESC`
    )
    .all()
    .filter((e) => e.equipos > 0);

  const juegos = db.prepare(
    `SELECT COALESCE(juego_titulo, nombre) AS titulo FROM jam_equipos
      WHERE edicion_id = ? AND estado = 'aprobado' AND entregado_at IS NOT NULL
      ORDER BY entregado_at LIMIT ?`
  );

  return filas.map((e) => ({
    periodo: e.periodo,
    semestre: semestre(e.periodo),
    // El tema solo se cuenta si ya se reveló: hasta entonces no sale del
    // servidor ni siquiera en el historial.
    tema: e.tema_revelado ? e.tema : null,
    horas: e.horas,
    cifras: [
      { n: e.equipos, que: e.equipos === 1 ? "equipo" : "equipos" },
      { n: e.entregas, que: e.entregas === 1 ? "juego entregado" : "juegos entregados" },
    ],
    podio: podio("jam-de-altura", e.id),
    nombres: juegos.all(e.id, MUESTRA).map((j) => j.titulo),
  }));
}

// El festival: una edición por semestre y el cartel como historia. Los
// nombres son los del cartel, en el orden en que los puso la organización.
function edicionesMusic() {
  const filas = db
    .prepare(
      `SELECT e.id, e.fecha, e.lugar, p.codigo AS periodo,
              (SELECT COUNT(*) FROM music_actos a
                WHERE a.edicion_id = e.id AND a.estado = 'confirmado') AS actos,
              (SELECT COUNT(*) FROM music_produccion m
                WHERE m.edicion_id = e.id AND m.estado = 'confirmado') AS produccion
         FROM music_ediciones e
         LEFT JOIN periodos p ON p.id = e.periodo_id
        ORDER BY p.codigo DESC, e.id DESC`
    )
    .all()
    .filter((e) => e.actos > 0);

  const cartel = db.prepare(
    `SELECT nombre FROM music_actos
      WHERE edicion_id = ? AND estado = 'confirmado'
      ORDER BY orden, nombre COLLATE NOCASE LIMIT ?`
  );

  return filas.map((e) => ({
    periodo: e.periodo,
    semestre: semestre(e.periodo),
    fecha: e.fecha,
    lugar: e.lugar,
    cifras: [
      { n: e.actos, que: e.actos === 1 ? "grupo en tarima" : "grupos en tarima" },
      { n: e.produccion, que: e.produccion === 1 ? "en producción" : "en producción" },
    ],
    podio: podio("music-fest", e.id),
    nombres: cartel.all(e.id, MUESTRA).map((a) => a.nombre),
  }));
}

// El reto de dibujo: una edición por semestre, y la unidad es el DIBUJO
// subido. Un inscrito que no subió nada no dejó historia, igual que el equipo
// de la jam que no entregó.
//
// El podio no sale de premios_evento sino de ink_premios, que es tabla propia:
// aquí un mismo dibujo puede ganar su semana, entrar al top y ser el mejor
// digital, y eso no cabe en la fila única por categoría de las otras.
function edicionesInk() {
  const filas = db
    .prepare(
      `SELECT e.id, e.dias, e.semanas, p.codigo AS periodo,
              (SELECT COUNT(*) FROM ink_participantes i
                WHERE i.edicion_id = e.id AND i.estado = 'aprobado') AS participantes,
              (SELECT COUNT(*) FROM ink_dibujos d
                WHERE d.edicion_id = e.id) AS dibujos
         FROM ink_ediciones e
         LEFT JOIN periodos p ON p.id = e.periodo_id
        ORDER BY p.codigo DESC, e.id DESC`
    )
    .all()
    .filter((e) => e.dibujos > 0);

  // Solo el top: los ganadores semanales son cuatro por edición y aquí no
  // caben. El del top 1 es el que la gente recuerda como "el que ganó".
  const top = db.prepare(
    `SELECT i.nombre FROM ink_premios pr
       JOIN ink_participantes i ON i.id = pr.participante_id
      WHERE pr.edicion_id = ? AND pr.tipo = 'top'
      ORDER BY pr.puesto LIMIT 3`
  );

  // Lo que se enseña son los dibujos que ganaron SU SEMANA, uno por semana:
  // son de días distintos, así que son de palabras distintas, y entre los
  // cuatro se ve de qué fue el reto. Los del top son todos del último día y
  // en una lista quedarían cuatro veces la misma palabra.
  //
  // Un dibujo puede no tener título —la mitad se sube sin él— y ahí se dice
  // por su día y su palabra, que es como se nombra dentro del reto. Nunca por
  // el nombre de quien lo hizo: el autor es lo que va en el podio, y repetirlo
  // aquí haría leer la lista como si fuera de personas.
  const destacados = db.prepare(
    `SELECT COALESCE(d.titulo, 'Día ' || d.dia || ' · ' || pal.palabra) AS titulo
       FROM ink_premios pr
       JOIN ink_dibujos d ON d.id = pr.dibujo_id
       LEFT JOIN ink_palabras pal ON pal.edicion_id = pr.edicion_id AND pal.dia = d.dia
      WHERE pr.edicion_id = ? AND pr.tipo = 'semana'
      ORDER BY pr.semana LIMIT ?`
  );

  return filas.map((e) => ({
    periodo: e.periodo,
    semestre: semestre(e.periodo),
    dias: e.dias,
    semanas: e.semanas,
    cifras: [
      { n: e.participantes, que: e.participantes === 1 ? "dibujante" : "dibujantes" },
      { n: e.dibujos, que: e.dibujos === 1 ? "dibujo" : "dibujos" },
    ],
    podio: top.all(e.id).map((c, i) => ({
      label: ["Primer puesto", "Segundo puesto", "Tercer puesto"][i],
      cls: ["oro", "plata", "bronce"][i],
      quien: c.nombre,
    })),
    nombres: destacados.all(e.id, MUESTRA).map((d) => d.titulo),
  }));
}

const HISTORIAL = {
  expo: edicionesExpo,
  "virtual-champions": edicionesVC,
  "jam-de-altura": edicionesJam,
  "music-fest": edicionesMusic,
  inkreible: edicionesInk,
};

// ---------------------------------------------------------------------
//  Lo que cada evento tiene y los demás no
// ---------------------------------------------------------------------
// El torneo se explica con sus juegos, la jam con sus horas y el festival con
// sus áreas —y esos tres salen de config, así que la vista los pide directo—.
// La Expo se explica con su RECORRIDO, y ese vive en el JSON: las salas
// temáticas son lo que la hace distinta de "todo el mundo expone su trabajo".
const EXTRAS = {
  expo: (contenido) => ({
    salas: (contenido.salas || []).map((s) => ({
      nombre: s.name,
      lema: s.lema || "",
      // La categoría es la que le pone el color a la sala en la página de la
      // Expo; se pasa tal cual para que aquí se vea del mismo color.
      categoria: s.accent || "",
    })),
  }),
};

// ---------------------------------------------------------------------
//  Las ediciones viejas, en un renglón
// ---------------------------------------------------------------------
/**
 * Una edición pasada resumida a una línea, para las bandas que solo enseñan
 * completas las últimas.
 *
 * Un semestre acumulado no se borra —es lo que hizo el programa— pero tampoco
 * puede costar lo mismo que el reciente: con ocho ediciones, ocho carteles
 * enteros son ocho pantallas de scroll y nadie llega a las salidas. Así que a
 * partir de cierto punto cada edición se queda con lo que la distingue: las
 * cifras y UNA cosa —el tema de la jam, el cabeza de cartel del festival,
 * quién ganó—.
 */
function conResumen(ed) {
  const partes = ed.cifras.map((c) => `${c.n} ${c.que}`);
  // El dato que la hace memorable, en este orden: el tema si lo hubo, si no
  // el nombre que encabezó, y si no el ganador.
  const marca =
    ed.tema ||
    (ed.nombres && ed.nombres.length ? ed.nombres[0] : "") ||
    (ed.podio.length ? ed.podio[0].quien : "");

  return { ...ed, resumen: partes.join(" · "), marca };
}

// ---------------------------------------------------------------------
//  La ficha de un evento
// ---------------------------------------------------------------------
/**
 * Todo lo que el índice sabe de un evento: lo que dice config, lo que dice su
 * JSON y lo que dice la base.
 *
 * `url` es null cuando la página está cerrada al público
 * (config.SOLO_EVENTO_ACTIVO): el evento se sigue contando —fue parte de lo
 * que hizo el programa— pero sin un enlace que rebote al visitante de vuelta
 * aquí sin explicarle nada.
 */
function ficha(evento, vigente) {
  const contenido = eventos.contenidoDe(evento.slug);
  const suyo = contenido.evento || {};
  const cerrado = eventos.cerrado(evento.slug);
  const historial = (HISTORIAL[evento.slug] ? HISTORIAL[evento.slug]() : []).map(conResumen);

  return {
    slug: evento.slug,
    nombre: suyo.name || evento.nombre,
    tipo: suyo.tipo || "",
    // El lema del hero es el que se escribió para anunciarse; el de config es
    // el de respaldo, el que sirve mientras el evento no tiene página propia.
    lema: (contenido.hero && contenido.hero.lema) || evento.lema || suyo.desc || "",
    entradilla: (contenido.hero && contenido.hero.entradilla) || "",
    desc: suyo.desc || "",
    cuando: suyo.cuando || eventos.fechaLarga(evento.fecha) || "",
    sede: suyo.sede || "",
    vigente: Boolean(vigente) && vigente.slug === evento.slug,
    inscripciones: eventos.inscripcionesAbiertas(evento.slug),
    cerrado,
    url: cerrado ? null : eventos.url(evento, vigente),
    historial,
    // La última edición se saca aparte porque es la que se enseña completa;
    // las anteriores van en una línea cada una.
    ultima: historial[0] || null,
    anteriores: historial.slice(1),
    ...(EXTRAS[evento.slug] ? EXTRAS[evento.slug](contenido) : {}),
  };
}

// ---------------------------------------------------------------------
//  Las salidas
// ---------------------------------------------------------------------
/**
 * Las salidas pedagógicas, partidas en las dos cosas que le importan a quien
 * lee: la que puede alcanzar y la que ya se hizo.
 *
 * De las que ya pasaron se cuenta quién VIAJÓ y no quién se registró: es la
 * cifra honesta de una salida, y la única que se puede decir en pasado.
 */
function salidasPedagogicas() {
  const ahora = Date.now();

  return salidas.todas().map((s) => {
    const cuentas = salidas.resumen(s);
    const pasada = s.cuando_ms !== null && s.cuando_ms < ahora;

    return {
      ...s,
      pasada,
      abierta: salidas.inscripcionAbierta(s),
      cerrada: salidas.porQueCerrada(s),
      inscritos: cuentas.total,
      confirmados: cuentas.confirmados,
      // Ya formateado: la vista no hace cuentas ni conoce el signo de pesos.
      precio: salidas.pesos(s.total),
      // Solo cuando la lista se pasó de verdad: un cero aquí significaría que
      // no fue nadie, y casi siempre significa que nadie marcó la asistencia.
      viajaron: cuentas.asistieron || null,
    };
  });
}

// ---------------------------------------------------------------------
//  El semillero
// ---------------------------------------------------------------------
/**
 * SAMI para el índice: qué es, cuánto dura y qué se está investigando.
 *
 * De cada proyecto salen SOLO el título y el director, ni el semestre en que
 * va ni en qué punto del trámite está. Es la misma regla de la portada del
 * semillero y por la misma razón: esta página la ve cualquiera, y publicar el
 * avance de un proyecto al lado del nombre de quien lo hace es ponerle una
 * fecha de entrega en público. En qué va lo saben su director y él.
 *
 * Y no hay historial por semestres como en los eventos. Un evento es una
 * edición al año que se cierra y se cuenta; el semillero no cierra nunca —los
 * proyectos duran tres semestres y se solapan—, así que lo que hay que contar
 * no es "qué pasó en 2025-20" sino qué está andando ahora y qué ya se
 * sustentó.
 */
function semillero() {
  const cifras = sami.resumen();
  const proyectos = sami.todos();

  const soloLoPublico = (p) => ({
    titulo: p.titulo,
    director: p.director || "",
    publicacion: p.publicacion || "",
  });

  return {
    nombre: SAMI.nombre,
    completo: SAMI.completo,
    lema: SAMI.lema,
    inscripciones: Boolean(SAMI.inscripciones),
    semestres: SAMI.semestres,
    horas_semestre: SAMI.horas_semestre,
    semestre_minimo: SAMI.semestre_minimo,
    perfiles: SAMI.perfiles || [],
    direccion: SAMI.direccion || {},
    formato: SAMI.formato || "",
    cifras: [
      { n: cifras.activos, que: cifras.activos === 1 ? "proyecto en curso" : "proyectos en curso" },
      { n: sami.contarEstudiantes(), que: "investigando" },
      { n: cifras.finalizados, que: cifras.finalizados === 1 ? "sustentado" : "sustentados" },
    ],
    encurso: proyectos.filter((p) => p.vinculado).map(soloLoPublico),
    finalizados: proyectos.filter((p) => p.estado === "finalizado").map(soloLoPublico),
  };
}

// ---------------------------------------------------------------------
//  Todo junto
// ---------------------------------------------------------------------
/**
 * Lo que necesita la página del índice, en una sola llamada. Se arma en cada
 * visita —son una docena de consultas cortas contra una base local— para que
 * un equipo aprobado hace un minuto ya cuente.
 */
function indice() {
  const vigente = eventos.activo();
  const todas = aprobado("salidas") ? salidasPedagogicas() : [];

  // Lo que no está aprobado no se arma siquiera: no es que salga sin enlace,
  // es que en esta página no existe. Las consultas de su historial tampoco se
  // hacen, que es lo correcto cuando el resultado no se puede enseñar.
  const publicos = eventos.publicos();

  return {
    vigente,
    // Indexado por slug: cada banda de la página es distinta y se pide por su
    // nombre, no por su posición en la lista.
    eventos: Object.fromEntries(publicos.map((e) => [e.slug, ficha(e, vigente)])),
    orden: publicos.map((e) => e.slug),
    // Las dos partes que no son eventos van con su propio interruptor, y en
    // null cuando están apagadas: la vista pregunta por ellas antes de dibujar
    // su banda, igual que hace con un evento que no está en `orden`.
    semillero: aprobado("semillero") ? semillero() : null,
    // Se ordenan por fecha y no por el orden del config: lo que viene, por lo
    // que llega antes; lo que se hizo, por lo más reciente. Una salida sin
    // fecha todavía va al final de las que vienen, que es donde se busca.
    salidas: !aprobado("salidas")
      ? null
      : {
          proximas: todas
            .filter((s) => !s.pasada)
            .sort((a, b) => (a.cuando_ms || Infinity) - (b.cuando_ms || Infinity)),
          pasadas: todas.filter((s) => s.pasada).sort((a, b) => b.cuando_ms - a.cuando_ms),
          total: todas.length,
        },
  };
}

module.exports = { indice, semestre, podio };
