// =====================================================================
//  Emisión y consulta de certificados.
//
//  El certificado dejó de ser una cosa de la Expo: la muestra, el torneo,
//  la jam, el festival y las salidas emiten todos por aquí, con el mismo
//  código, la misma página y el mismo QR. Lo que cambia de un evento a
//  otro es QUIÉN califica y QUÉ dice la frase; lo demás —congelar los
//  datos, no cambiar nunca un código ya repartido, avisar aparte de
//  emitir— es igual para los cinco y vive en emitirLote().
// =====================================================================
const db = require("../db/database");
const QR = require("qrcode-svg");
const { rankingDeMateria } = require("./ranking");
const { contenidoDe, porSlug } = require("./eventos");
const { parseIntegrantes } = require("./listas");
const { generarCodigo } = require("./registro");
const { asignados, categoria } = require("./premios");
const { momento } = require("./fechas");
const { SALIDAS, VC, MUSIC } = require("../config");
const envios = require("./envios");

const PUESTOS = {
  1: { label: "Primer puesto", cls: "oro" },
  2: { label: "Segundo puesto", cls: "plata" },
  3: { label: "Tercer puesto", cls: "bronce" },
};

const PARTICIPACION = { label: "Participación", cls: "part" };

function etiquetaPuesto(puesto) {
  return PUESTOS[puesto] || PARTICIPACION;
}

// Cómo empieza la frase del certificado, según a qué se le emitió. Se resuelve
// al mostrarlo y NO se guarda en la base a propósito: es redacción, no dato.
// Si mañana una de estas frases se escribe mejor, mejoran también los
// certificados que ya están repartidos. Lo que sí queda congelado son los
// nombres, que son lo que no puede cambiar debajo de nadie.
const MOTIVOS = {
  proyecto: "por su participación en la muestra con el proyecto",
  vc_jugador: "por haber competido en el torneo con el equipo",
  jam_integrante: "por haber desarrollado y entregado, en 48 horas, el juego",
  music_acto: "por haber subido a la tarima del festival con el grupo",
  music_persona: "por haber hecho parte del equipo de producción del festival, en el área de",
  salida_registro: "por haber asistido a la salida pedagógica",
};

function motivoDe(cert) {
  return MOTIVOS[cert.ref_tipo] || "por su participación en";
}

// El nombre del evento tal como se anuncia. Las salidas no están en
// config.EVENTOS —no le pelean la raíz a nadie— y por eso llevan el suyo.
function nombreEvento(slug) {
  if (slug === "salidas") return "Salidas pedagógicas";
  const evento = porSlug(slug);
  return evento ? evento.nombre : "Universidad de Boyacá";
}

// Integrantes de un proyecto. Los registros traen nombre y correo; para los
// proyectos viejos, creados a mano, solo hay nombres.
function integrantesDeProyecto(proyecto) {
  const deSolicitud = db
    .prepare(
      `SELECT si.nombre, si.email
       FROM solicitud_integrantes si
       JOIN solicitudes s ON s.id = si.solicitud_id
       WHERE s.proyecto_id = ?
       ORDER BY si.orden, si.id`
    )
    .all(proyecto.id);

  if (deSolicitud.length) return deSolicitud;

  return parseIntegrantes(proyecto.integrantes).map((nombre) => ({ nombre, email: null }));
}

// Los nombres del resto del equipo, en el formato en que se guardan.
function companerosDe(equipo, persona) {
  return (
    equipo
      .filter((o) => o.nombre !== persona.nombre)
      .map((o) => o.nombre)
      .join("\n") || null
  );
}

// ---------------------------------------------------------------------
//  El núcleo
// ---------------------------------------------------------------------

/**
 * Emite (o actualiza) un lote de certificados. Las filas llegan ya
 * normalizadas: quién es, qué hizo y qué se lleva. Aquí solo se guardan.
 *
 * Es idempotente y esa es la parte importante: se puede volver a generar
 * cuando cambie una nota, se declare un premio o se confirme a alguien más, y
 * los enlaces ya compartidos siguen sirviendo. Lo que existía se actualiza sin
 * tocar su código; lo nuevo estrena uno.
 */
function emitirLote({ evento, lote, periodoId, filas }) {
  const buscar = db.prepare(
    `SELECT id, codigo FROM certificados
     WHERE evento = ? AND ref_tipo = ? AND ref_id = ? AND persona = ?`
  );
  const insertar = db.prepare(`
    INSERT INTO certificados
      (codigo, evento, periodo_id, ref_tipo, ref_id, lote, persona, email, titulo,
       contexto, detalle, puesto, premio, premio_label, premio_cls, companeros,
       firma, firma_cargo, materia_id, proyecto_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const actualizar = db.prepare(`
    UPDATE certificados
    SET periodo_id = ?, lote = ?, email = ?, titulo = ?, contexto = ?, detalle = ?,
        puesto = ?, premio = ?, premio_label = ?, premio_cls = ?, companeros = ?,
        firma = ?, firma_cargo = ?, materia_id = ?, proyecto_id = ?,
        emitido_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  const existeCodigo = db.prepare("SELECT 1 FROM certificados WHERE codigo = ?");

  let emitidos = 0;
  let actualizados = 0;

  db.exec("BEGIN");
  try {
    for (const f of filas) {
      const refId = String(f.ref_id);
      const previo = buscar.get(evento, f.ref_tipo, refId, f.persona);

      if (previo) {
        actualizar.run(
          periodoId || null,
          String(lote),
          f.email || null,
          f.titulo,
          f.contexto || null,
          f.detalle || null,
          f.puesto || null,
          f.premio || null,
          f.premio_label,
          f.premio_cls,
          f.companeros || null,
          f.firma || null,
          f.firma_cargo || null,
          f.materia_id || null,
          f.proyecto_id || null,
          previo.id
        );
        actualizados++;
      } else {
        let codigo = generarCodigo(8);
        for (let i = 0; i < 5 && existeCodigo.get(codigo); i++) codigo = generarCodigo(8);

        insertar.run(
          codigo,
          evento,
          periodoId || null,
          f.ref_tipo,
          refId,
          String(lote),
          f.persona,
          f.email || null,
          f.titulo,
          f.contexto || null,
          f.detalle || null,
          f.puesto || null,
          f.premio || null,
          f.premio_label,
          f.premio_cls,
          f.companeros || null,
          f.firma || null,
          f.firma_cargo || null,
          f.materia_id || null,
          f.proyecto_id || null
        );
        emitidos++;
      }
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  return { emitidos, actualizados, total: emitidos + actualizados };
}

/**
 * Los premios adjudicados de un evento, listos para consultar por
 * ref_tipo + ref_id mientras se arman las filas. Devuelve la etiqueta
 * congelada que va a quedar escrita en el certificado.
 */
function premiosPorReferencia(evento, lote) {
  const mapa = new Map();

  for (const [premioId, fila] of Object.entries(asignados(evento, lote))) {
    const cat = categoria(evento, premioId);
    if (!cat) continue; // la categoría salió del config: deja de adjudicarse
    mapa.set(`${fila.ref_tipo}:${fila.ref_id}`, {
      premio: premioId,
      premio_label: cat.label,
      premio_cls: cat.cls || "part",
    });
  }

  return mapa;
}

// Lo que se lleva alguien: el premio adjudicado, o la constancia de que estuvo.
function loQueSeLleva(mapa, refTipo, refId) {
  return (
    mapa.get(`${refTipo}:${refId}`) || {
      premio: null,
      premio_label: PARTICIPACION.label,
      premio_cls: PARTICIPACION.cls,
    }
  );
}

// ---------------------------------------------------------------------
//  Un adaptador por evento: cada uno sabe quién califica en el suyo
// ---------------------------------------------------------------------

/**
 * Expo. Uno por estudiante: puesto para los tres primeros del ranking de la
 * materia y constancia de participación para el resto.
 */
function emitirDeMateria(materiaId, periodoId, docenteNombre) {
  const materia = db.prepare("SELECT * FROM materias WHERE id = ?").get(materiaId);
  if (!materia) return { emitidos: 0, actualizados: 0, total: 0 };

  const { salas } = contenidoDe("expo");
  const filas = [];

  for (const proyecto of rankingDeMateria(materiaId, periodoId)) {
    const sala = salas.find((s) => s.id === proyecto.sala);
    const equipo = integrantesDeProyecto(proyecto);
    const puesto = proyecto.puesto && proyecto.puesto <= 3 ? proyecto.puesto : null;
    const etiqueta = etiquetaPuesto(puesto);

    for (const persona of equipo) {
      filas.push({
        ref_tipo: "proyecto",
        ref_id: proyecto.id,
        persona: persona.nombre,
        email: persona.email || null,
        titulo: proyecto.titulo,
        contexto: materia.nombre,
        detalle: sala ? sala.name : null,
        puesto,
        premio: null,
        premio_label: etiqueta.label,
        premio_cls: etiqueta.cls,
        companeros: companerosDe(equipo, persona),
        firma: docenteNombre || null,
        firma_cargo: `Docente de ${materia.nombre}`,
        materia_id: materiaId,
        proyecto_id: proyecto.id,
      });
    }
  }

  return emitirLote({ evento: "expo", lote: materiaId, periodoId, filas });
}

/**
 * Virtual Champions. Un certificado por jugador —titulares y suplentes: la
 * banca también compitió— de los equipos confirmados. El premio de un equipo
 * se lo lleva la plantilla entera; el de una persona, solo esa persona.
 */
function emitirDeTorneo(torneoId, periodoId, firma) {
  const torneo = db.prepare("SELECT * FROM vc_torneos WHERE id = ?").get(Number(torneoId));
  if (!torneo) return { emitidos: 0, actualizados: 0, total: 0 };

  const juego = VC.juegos.find((j) => j.id === torneo.juego);
  const contexto = juego ? juego.nombre : torneo.nombre;
  const premios = premiosPorReferencia("virtual-champions", torneoId);

  // 'aprobado' y no 'confirmado': así se llama el estado de un equipo del
  // torneo (lib/vc.js:57). El festival sí confirma, y no son lo mismo.
  const equipos = db
    .prepare("SELECT * FROM vc_equipos WHERE torneo_id = ? AND estado = 'aprobado'")
    .all(torneo.id);

  const jugadoresDe = db.prepare(
    "SELECT * FROM vc_jugadores WHERE equipo_id = ? ORDER BY suplente, orden, id"
  );

  const filas = [];

  for (const equipo of equipos) {
    const plantilla = jugadoresDe.all(equipo.id);
    const delEquipo = premios.get(`vc_equipo:${equipo.id}`);

    for (const jugador of plantilla) {
      // El premio individual pesa más que el del equipo: el MVP de la final es
      // suyo y no el mismo cartón que el de sus cuatro compañeros.
      const suyo = premios.get(`vc_jugador:${jugador.id}`);
      const lleva = suyo ||
        delEquipo || {
          premio: null,
          premio_label: PARTICIPACION.label,
          premio_cls: PARTICIPACION.cls,
        };

      filas.push({
        ref_tipo: "vc_jugador",
        ref_id: jugador.id,
        persona: jugador.nombre,
        email: jugador.email || null,
        titulo: equipo.nombre,
        contexto,
        detalle: [jugador.rol, jugador.suplente ? "Suplente" : null].filter(Boolean).join(" · ") || null,
        puesto: null,
        ...lleva,
        companeros: companerosDe(plantilla, jugador),
        firma: firma || null,
        firma_cargo: "Organización · Virtual Champions",
        materia_id: null,
        proyecto_id: null,
      });
    }
  }

  return emitirLote({ evento: "virtual-champions", lote: torneoId, periodoId, filas });
}

/**
 * Jam de Altura. Certifica a los equipos confirmados QUE ENTREGARON: es lo que
 * promete la página —"todos los que entregan"— y es lo honesto, porque un
 * equipo que se inscribió y no subió nada no hizo una jam.
 */
function emitirDeJam(edicionId, periodoId, firma) {
  const edicion = db.prepare("SELECT * FROM jam_ediciones WHERE id = ?").get(Number(edicionId));
  if (!edicion) return { emitidos: 0, actualizados: 0, total: 0 };

  const premios = premiosPorReferencia("jam-de-altura", edicionId);

  // Los mismos que la galería del final: lib/jam.js:281 los llama entregas.
  const equipos = db
    .prepare(
      `SELECT * FROM jam_equipos
       WHERE edicion_id = ? AND estado = 'aprobado' AND entregado_at IS NOT NULL
       ORDER BY entregado_at`
    )
    .all(edicion.id);

  const integrantesDe = db.prepare(
    "SELECT * FROM jam_integrantes WHERE equipo_id = ? ORDER BY lider DESC, orden, id"
  );

  const filas = [];

  for (const equipo of equipos) {
    const gente = integrantesDe.all(equipo.id);
    const lleva = loQueSeLleva(premios, "jam_equipo", equipo.id);

    for (const persona of gente) {
      filas.push({
        ref_tipo: "jam_integrante",
        ref_id: persona.id,
        persona: persona.nombre,
        email: persona.email || null,
        titulo: equipo.juego_titulo || equipo.nombre,
        // El nombre de la edición no va aquí: la cabecera del certificado ya
        // dice de qué evento es, y repetirlo deja una línea que se lee dos
        // veces lo mismo.
        contexto: equipo.nombre,
        detalle: persona.disciplina || null,
        puesto: null,
        ...lleva,
        companeros: companerosDe(gente, persona),
        firma: firma || null,
        firma_cargo: "Organización · Jam de Altura",
        materia_id: null,
        proyecto_id: null,
      });
    }
  }

  return emitirLote({ evento: "jam-de-altura", lote: edicionId, periodoId, filas });
}

/**
 * Multimedia Music Fest. Dos clases de certificado porque son dos clases de
 * participante: el grupo que se subió a la tarima y la persona que estuvo
 * detrás de una consola.
 *
 * Del grupo se certifica al contacto y se nombra al grupo: la inscripción de
 * un acto no pide la lista de quiénes lo integran —solo cuántos son—, así que
 * no hay nombres que poner. Si algún día se piden, aquí es donde se reparten.
 */
function emitirDeMusic(edicionId, periodoId, firma) {
  const edicion = db.prepare("SELECT * FROM music_ediciones WHERE id = ?").get(Number(edicionId));
  if (!edicion) return { emitidos: 0, actualizados: 0, total: 0 };

  const premios = premiosPorReferencia("music-fest", edicionId);
  const filas = [];

  const actos = db
    .prepare("SELECT * FROM music_actos WHERE edicion_id = ? AND estado = 'confirmado' ORDER BY orden")
    .all(edicion.id);

  for (const acto of actos) {
    filas.push({
      ref_tipo: "music_acto",
      ref_id: acto.id,
      persona: acto.contacto_nombre,
      email: acto.contacto_email || null,
      titulo: acto.nombre,
      contexto: acto.tipo,
      detalle: acto.genero || null,
      puesto: null,
      ...loQueSeLleva(premios, "music_acto", acto.id),
      companeros: null,
      firma: firma || null,
      firma_cargo: "Organización · Multimedia Music Fest",
      materia_id: null,
      proyecto_id: null,
    });
  }

  const equipo = db
    .prepare("SELECT * FROM music_produccion WHERE edicion_id = ? AND estado = 'confirmado'")
    .all(edicion.id);

  for (const persona of equipo) {
    const area = MUSIC.areas.find((a) => a.id === persona.area);

    filas.push({
      ref_tipo: "music_persona",
      ref_id: persona.id,
      persona: persona.nombre,
      email: persona.email || null,
      titulo: area ? area.nombre : persona.area,
      // Sin contexto: la frase del certificado ya dice que es del equipo de
      // producción, y repetirlo debajo deja una línea que sobra.
      contexto: null,
      detalle: null,
      puesto: null,
      ...loQueSeLleva(premios, "music_persona", persona.id),
      companeros: null,
      firma: firma || null,
      firma_cargo: "Organización · Multimedia Music Fest",
      materia_id: null,
      proyecto_id: null,
    });
  }

  return emitirLote({ evento: "music-fest", lote: edicionId, periodoId, filas });
}

/**
 * Salidas pedagógicas. Constancia de asistencia, y solo para quien asistió de
 * verdad: la lista de inscritos no sirve —se paga y a veces no se va—, así que
 * lo que cuenta es la asistencia que el docente marcó ese día.
 *
 * No hay premios: una salida no es una competencia. Firma el docente
 * encargado, que es quien responde por ella y quien está en config.
 */
function emitirDeSalida(salidaId, periodoId) {
  const salida = SALIDAS.salidas.find((s) => s.id === String(salidaId));
  if (!salida) return { emitidos: 0, actualizados: 0, total: 0 };

  const registros = db
    .prepare("SELECT * FROM salida_registros WHERE salida = ? AND asistio = 1 ORDER BY nombre")
    .all(String(salidaId));

  // El día de la salida y no la lista de asignaturas: lo que importa de una
  // constancia de asistencia es a dónde se fue y cuándo, no qué materias
  // estaban invitadas.
  const cuando = momento(salida.salida);

  const filas = registros.map((reg) => ({
    ref_tipo: "salida_registro",
    ref_id: reg.id,
    persona: reg.nombre,
    email: reg.email || null,
    titulo: salida.nombre,
    contexto: salida.lugar || null,
    detalle: cuando ? cuando.dia : null,
    puesto: null,
    premio: null,
    premio_label: "Asistencia",
    premio_cls: PARTICIPACION.cls,
    companeros: null,
    firma: (salida.docente && salida.docente.nombre) || null,
    firma_cargo: "Docente encargado de la salida",
    materia_id: null,
    proyecto_id: null,
  }));

  return emitirLote({ evento: "salidas", lote: salidaId, periodoId, filas });
}

// ---------------------------------------------------------------------
//  Consulta
// ---------------------------------------------------------------------

function deLote(evento, lote) {
  return db
    .prepare(
      `SELECT * FROM certificados WHERE evento = ? AND lote = ?
       ORDER BY (premio IS NULL), (puesto IS NULL), puesto, persona COLLATE NOCASE`
    )
    .all(evento, String(lote));
}

// Certificados con correo a los que todavía no se les ha avisado. Emitir es
// idempotente y se repite cada vez que cambia algo; avisar, no: por eso el
// aviso es un paso aparte que el docente dispara cuando ya está conforme.
function pendientesDeAviso(evento, lote) {
  return db
    .prepare(
      `SELECT * FROM certificados
       WHERE evento = ? AND lote = ? AND email IS NOT NULL AND avisado_at IS NULL
       ORDER BY persona COLLATE NOCASE`
    )
    .all(evento, String(lote));
}

/**
 * Manda el correo de los certificados que faltan por avisar. Uno detrás de
 * otro (Gmail no agradece las ráfagas) y cada uno se marca solo cuando su
 * correo salió de verdad: si algo falla, ese queda pendiente para el
 * siguiente intento y nadie lo recibe dos veces.
 */
async function avisarPendientes(evento, lote, base) {
  const marcar = db.prepare(
    "UPDATE certificados SET avisado_at = CURRENT_TIMESTAMP WHERE id = ?"
  );

  let enviados = 0;
  let fallaron = 0;

  for (const cert of pendientesDeAviso(evento, lote)) {
    const ok = await envios.avisoCertificado(
      { ...cert, evento_nombre: nombreEvento(cert.evento), motivo: motivoDe(cert) },
      base
    );
    if (ok) {
      marcar.run(cert.id);
      enviados++;
    } else {
      fallaron++;
    }
  }

  return { enviados, fallaron };
}

function porCodigo(codigo) {
  return db
    .prepare("SELECT * FROM certificados WHERE codigo = ?")
    .get(String(codigo || "").trim().toUpperCase());
}

function porCorreo(email, evento) {
  if (!email) return [];

  const orden = "ORDER BY (premio IS NULL), (puesto IS NULL), puesto, emitido_at DESC";

  if (evento) {
    return db
      .prepare(`SELECT * FROM certificados WHERE email = ? AND evento = ? ${orden}`)
      .all(email, evento);
  }

  return db.prepare(`SELECT * FROM certificados WHERE email = ? ${orden}`).all(email);
}

/**
 * La paleta del QR de cada evento.
 *
 * Un QR blanco puro sobre una hoja oscura se ve pegado encima, así que el
 * papelito se tiñe del color del evento. Lo que NO se hace es invertirlo
 * —módulos claros sobre el fondo oscuro de la hoja—, que sería lo más
 * integrado de todo: medio lector de código no reconoce un QR invertido, y
 * este QR es la verificación del certificado. Tinta oscura sobre papel claro,
 * siempre.
 *
 * Los tonos claros están a propósito muy desaturados: contra la tinta dan más
 * de 15:1 de contraste, y al imprimir sobre papel blanco no se notan.
 */
const PALETAS_QR = {
  expo: { tinta: "#131a2b", papel: "#e7ecf7" },
  "virtual-champions": { tinta: "#1a1013", papel: "#f5e9ea" },
  "jam-de-altura": { tinta: "#14210e", papel: "#e9f6e4" },
  "music-fest": { tinta: "#1e1018", papel: "#f9e9f0" },
  salidas: { tinta: "#14261d", papel: "#eef3ef" },
};

function paletaQr(evento) {
  return PALETAS_QR[evento] || PALETAS_QR.expo;
}

// QR en SVG: escala sin pixelarse y se imprime bien. El margen en blanco va
// DENTRO del SVG (padding se cuenta en módulos) y no en el CSS: así el
// papelito es una sola pieza del color que le toca, sin un borde de otro tono
// alrededor.
function qrSvg(texto, tamano = 150, paleta = PALETAS_QR.expo) {
  return new QR({
    content: texto,
    padding: 3,
    width: tamano,
    height: tamano,
    color: paleta.tinta,
    background: paleta.papel,
    ecl: "M",
    join: true,
    container: "svg-viewbox",
  }).svg();
}

module.exports = {
  emitirLote,
  emitirDeMateria,
  emitirDeTorneo,
  emitirDeJam,
  emitirDeMusic,
  emitirDeSalida,
  deLote,
  pendientesDeAviso,
  avisarPendientes,
  porCodigo,
  porCorreo,
  etiquetaPuesto,
  motivoDe,
  nombreEvento,
  paletaQr,
  qrSvg,
};
