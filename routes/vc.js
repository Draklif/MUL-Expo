// =====================================================================
//  Virtual Champions — el sitio público.
//
//  La landing, el bracket, el calendario, los equipos, la ficha de cada
//  partida y la inscripción. Todo esto lo ve cualquiera sin entrar a nada;
//  lo que se edita vive en el panel (/vc/panel), que es otro archivo.
// =====================================================================
const express = require("express");
const db = require("../db/database");
const vc = require("../lib/vc");
const envios = require("../lib/envios");
const eventos = require("../lib/eventos");
const { contenidoEvento } = require("../lib/contenido");
const { limpiarNombre } = require("../lib/listas");
const { DOMINIO } = require("../lib/correos");
const { crearLimite } = require("../lib/limite");
const { porCorreo: certificadosDe } = require("../lib/certificados");
const premios = require("../lib/premios");

const router = express.Router();

const EVENTO = eventos.porSlug("virtual-champions");

// Toda página de aquí abajo es pública, y por eso todas llevan el mismo
// guardia delante: si el torneo no es el evento de este semestre y
// config.SOLO_EVENTO_ACTIVO está en true, la dirección no responde. Va ruta por
// ruta y no con un router.use() porque este router se monta en "/" y por él
// pasan también las peticiones de todo lo demás.
//
// El panel NO pasa por aquí: vive en routes/vc-panel.js y se entra con
// contraseña, para poder preparar el evento que viene mientras la puerta
// pública sigue cerrada.
const publica = eventos.soloActivo("virtual-champions");

const MAX_NOMBRE_EQUIPO = 40;

// Mismo freno que el registro de la Expo: solo cuentan las inscripciones que
// SÍ entraron, para que un salón entero apuntándose desde el mismo wifi no
// se tope con esto y un bot mandando cientos sí.
const limiteInscripcion = crearLimite({ ventanaMs: 10 * 60 * 1000, maximo: 30 });

// ---------------------------------------------------------------------
//  Lo que toda página del torneo necesita
// ---------------------------------------------------------------------
// El contenido estático (lema, reglamento, premios) sale del JSON y se
// recarga solo al editarlo, igual que el de la Expo.
const contenido = () => contenidoEvento(EVENTO ? EVENTO.datos : "");

/**
 * Arma el marco común: qué juego se está viendo, su torneo vigente y los
 * datos de cabecera. Todas las vistas del torneo reciben esto.
 *
 * Tres de las páginas del sitio no llevan el juego en la dirección —la
 * portada, la inscripción y la consulta del código—, y sin él caían siempre
 * en el primero de config.VC.juegos. El efecto era feo: alguien mirando el
 * bracket de LoL tocaba "Inicio" y la página se le ponía roja de Valorant sin
 * haber pedido nada. Por eso esas tres aceptan `?juego=`, y por eso `qJuego`
 * viaja a las vistas: es lo que hay que colgarle a cualquier enlace interno
 * que no lleve el juego en la ruta.
 *
 * Con un solo juego configurado el parámetro sobra y no se pone: no hay entre
 * qué elegir y solo ensuciaría las direcciones que se comparten.
 */
function marco(req, juegoId) {
  const juego = vc.juegoDe(juegoId || req.query.juego);
  const torneo = juego ? vc.torneoVigente(juego.id) : null;
  return {
    ...contenido(),
    evento: EVENTO,
    // Las categorías de premio salen de config y no del JSON: son las mismas
    // que el panel adjudica y las mismas que dice el certificado.
    catalogoPremios: premios.catalogo("virtual-champions"),
    juegos: vc.JUEGOS,
    juego,
    torneo,
    qJuego: vc.JUEGOS.length > 1 && juego ? `?juego=${encodeURIComponent(juego.id)}` : "",
    // Si el botón de "Inscribirme" tiene sentido o no. Sale una sola vez y de
    // un solo sitio para que ninguna vista lo decida por su cuenta.
    abierta: vc.inscripcionAbierta(torneo),
    // Las vistas formatean fechas con esto: la hora de una partida se arma
    // partiendo la cadena, nunca con Date, para que no se corra de día.
    momentoDe: vc.momento,
    css: "/vc.css",
    themeColor: juego ? juego.acento : "#0e0f13",
    title: juego ? `Virtual Champions · ${juego.nombre}` : "Virtual Champions",
  };
}

// ---------------------------------------------------------------------
//  Landing
// ---------------------------------------------------------------------
router.get("/virtual-champions", publica, (req, res) => {
  const base = marco(req);
  const torneoId = base.torneo ? base.torneo.id : null;

  res.render("vc/landing", {
    ...base,
    activa: "inicio",
    enVivo: torneoId ? vc.enVivo(torneoId) : [],
    proximas: torneoId ? vc.proximas(torneoId, 5) : [],
    ultimas: torneoId ? vc.ultimas(torneoId, 4) : [],
    bracket: torneoId ? vc.bracketDe(torneoId) : [],
    equipos: torneoId ? vc.equiposDe(torneoId) : [],
    esperando: torneoId ? vc.agentesLibres(torneoId).length : 0,
  });
});

// ---------------------------------------------------------------------
//  Bracket, calendario y equipos
// ---------------------------------------------------------------------
router.get("/vc/:juego/bracket", publica, (req, res) => {
  const base = marco(req, req.params.juego);
  res.render("vc/bracket", {
    ...base,
    activa: "bracket",
    title: `Bracket · ${base.juego ? base.juego.nombre : "Virtual Champions"}`,
    bracket: base.torneo ? vc.bracketDe(base.torneo.id) : [],
  });
});

router.get("/vc/:juego/calendario", publica, (req, res) => {
  const base = marco(req, req.params.juego);
  const partidas = base.torneo ? vc.partidasDe(base.torneo.id) : [];
  res.render("vc/calendario", {
    ...base,
    activa: "calendario",
    title: `Calendario · ${base.juego ? base.juego.nombre : "Virtual Champions"}`,
    dias: vc.porDia(partidas),
  });
});

router.get("/vc/:juego/equipos", publica, (req, res) => {
  const base = marco(req, req.params.juego);
  res.render("vc/equipos", {
    ...base,
    activa: "equipos",
    title: `Equipos · ${base.juego ? base.juego.nombre : "Virtual Champions"}`,
    equipos: base.torneo ? vc.equiposDe(base.torneo.id) : [],
    esperando: base.torneo ? vc.agentesLibres(base.torneo.id).length : 0,
  });
});

// ---------------------------------------------------------------------
//  Fichas
// ---------------------------------------------------------------------
router.get("/vc/equipo/:id", publica, (req, res) => {
  const equipo = vc.equipoConRoster(req.params.id);
  if (!equipo) return res.redirect("/virtual-champions");

  const juegoId = equipo.torneo ? equipo.torneo.juego : null;
  res.render("vc/equipo", {
    ...marco(req, juegoId),
    activa: "equipos",
    title: `${equipo.nombre} · Virtual Champions`,
    equipo,
    partidas: vc.partidasDeEquipo(equipo.id),
  });
});

router.get("/vc/partida/:id", publica, (req, res) => {
  const partida = vc.partidaConTodo(req.params.id);
  if (!partida) return res.redirect("/virtual-champions");

  res.render("vc/partida", {
    ...marco(req, partida.juego),
    activa: "calendario",
    title: `${partida.equipo_a} vs ${partida.equipo_b} · Virtual Champions`,
    partida,
    momento: vc.momento(partida.inicio),
  });
});

// ---------------------------------------------------------------------
//  Estado en vivo (lo que consulta el poll de la landing y de la ficha)
// ---------------------------------------------------------------------
// Una sola petición devuelve todo lo que cambia: las partidas en vivo con sus
// mapas y, si se pide una en concreto, esa. Así la página no tiene que pedir
// dos veces por tick.
router.get("/vc/api/vivo", publica, (req, res) => {
  const torneoId = Number(req.query.torneo) || null;
  const partidaId = Number(req.query.partida) || null;

  res.json({
    ahora: Date.now(),
    partida: partidaId ? vc.partidaConTodo(partidaId) : null,
    en_vivo: torneoId ? vc.enVivo(torneoId) : [],
    proximas: torneoId ? vc.proximas(torneoId, 5) : [],
  });
});

// ---------------------------------------------------------------------
//  Inscripción
// ---------------------------------------------------------------------
// Torneos que reciben equipos, para el selector del formulario. Salen SOLO del
// semestre activo y solo si config tiene el torneo abierto: el del semestre
// pasado no se ofrece nunca, aunque su fila se haya quedado en 1.
function torneosAbiertos() {
  return vc
    .torneosDelSemestre()
    .filter((t) => vc.inscripcionAbierta(t))
    .map((t) => ({
      ...t,
      juego_info: vc.juego(t.juego),
      inscritos: vc.contarEquipos(t.id),
      esperando: vc.agentesLibres(t.id).length,
    }))
    .filter((t) => t.juego_info); // un torneo de un juego que ya no está en config no se ofrece
}

function vistaInscripcion(req, extra = {}) {
  // Al reenviar el formulario con errores, el POST va a /vc/inscripcion a
  // secas y el ?juego= se pierde. El juego sale entonces del torneo que la
  // persona ya había elegido en el selector: la página no puede cambiarle de
  // color justo cuando le está diciendo qué corregir.
  const elegido =
    extra.valores && extra.valores.torneo_id ? vc.torneo(extra.valores.torneo_id) : null;

  const base = marco(req, elegido ? elegido.juego : null);
  const torneos = torneosAbiertos();

  // El selector llega con el juego que se venía mirando ya elegido. Quien
  // entra desde la pestaña de LoL no tiene por qué volver a decir "LoL" en la
  // primera casilla del formulario.
  const porDefecto =
    base.torneo && torneos.some((t) => t.id === base.torneo.id) ? String(base.torneo.id) : "";

  return {
    ...base,
    activa: "inscripcion",
    title: "Inscripción · Virtual Champions",
    torneos,
    errores: [],
    valores: { modo: "equipo", jugadores: [], torneo_id: porDefecto },
    ...extra,
  };
}

router.get("/vc/inscripcion", publica, (req, res) => {
  res.render("vc/inscripcion", vistaInscripcion(req));
});

router.post("/vc/inscripcion", publica, (req, res) => {
  const valores = {
    torneo_id: String(req.body.torneo_id || ""),
    modo: req.body.modo === "solo" ? "solo" : "equipo",
    equipo: String(req.body.equipo || "").trim().slice(0, MAX_NOMBRE_EQUIPO),
    tag: String(req.body.tag || "").trim().toUpperCase().slice(0, 5),
    capitan_nombre: limpiarNombre(req.body.capitan_nombre).slice(0, 120),
    capitan_email: vc.limpiarEmail(req.body.capitan_email),
    capitan_nick: String(req.body.capitan_nick || "").trim().slice(0, 60),
    capitan_rol: String(req.body.capitan_rol || "").trim().slice(0, 40),
    jugadores: vc.jugadoresDesdeFormulario(req.body, vc.MAX_JUGADORES),
  };

  const fallar = (errores, status = 400) =>
    res.status(status).render("vc/inscripcion", vistaInscripcion(req, { errores, valores }));

  const torneo = valores.torneo_id ? vc.torneo(valores.torneo_id) : null;
  const juego = torneo ? vc.juego(torneo.juego) : null;
  const errores = [];

  if (!torneo || !juego) errores.push("Elige el juego en el que se van a inscribir.");
  else if (!vc.inscripcionAbierta(torneo)) {
    errores.push(`Las inscripciones de ${juego.nombre} están cerradas.`);
  }

  // Quien llena el formulario siempre queda dentro, de primero y como capitán.
  if (!valores.capitan_nombre) errores.push("Escribe tu nombre.");
  if (!vc.emailValido(valores.capitan_email)) {
    errores.push(`Tu correo tiene que ser el institucional @${DOMINIO}.`);
  }
  if (!valores.capitan_nick) {
    errores.push(`Escribe tu ${juego ? juego.nick.label : "nombre en el juego"}.`);
  }

  const equipo = [
    {
      nombre: valores.capitan_nombre,
      email: valores.capitan_email,
      nick: valores.capitan_nick,
      rol: valores.capitan_rol,
    },
    ...(valores.modo === "equipo"
      ? valores.jugadores.filter((j) => j.email !== valores.capitan_email)
      : []),
  ].slice(0, vc.MAX_JUGADORES);

  if (valores.modo === "equipo") {
    if (!valores.equipo) errores.push("Ponle nombre al equipo.");

    const minimo = juego ? juego.titulares : 5;
    if (equipo.length < minimo) {
      errores.push(
        `Un equipo de ${juego ? juego.nombre : "este juego"} necesita ${minimo} jugadores; van ${equipo.length}.`
      );
    }

    const sinNombre = equipo.filter((j) => !j.nombre && (j.email || j.nick));
    if (sinNombre.length) errores.push("Falta el nombre de algún jugador.");

    const malCorreo = equipo.filter((j) => j.nombre && !vc.emailValido(j.email));
    if (malCorreo.length) {
      errores.push(`Falta el correo @${DOMINIO} de ${malCorreo.map((j) => j.nombre).join(", ")}.`);
    }

    const sinNick = equipo.filter((j) => j.nombre && !j.nick);
    if (sinNick.length) {
      errores.push(
        `Falta el ${juego ? juego.nick.label : "nick"} de ${sinNick.map((j) => j.nombre).join(", ")}.`
      );
    }

    // Nombre de equipo repetido en el mismo torneo. La comparación va en JS
    // porque el COLLATE NOCASE de SQLite solo ignora mayúsculas en ASCII.
    if (torneo && valores.equipo) {
      const objetivo = valores.equipo.toLowerCase();
      const repetido = db
        .prepare("SELECT codigo, nombre FROM vc_equipos WHERE torneo_id = ? AND estado != 'rechazado'")
        .all(torneo.id)
        .find((e) => e.nombre.toLowerCase() === objetivo);
      if (repetido) {
        errores.push(
          `Ya hay un equipo llamado "${repetido.nombre}" en este torneo. Consulta su estado con el código ${repetido.codigo}.`
        );
      }
    }
  }

  // Un correo no puede estar en dos equipos del mismo torneo. Lo vigila un
  // UNIQUE en la base, pero se avisa aquí con el nombre de la persona en vez
  // de dejar reventar la inserción.
  if (torneo) {
    const yaInscritos = db
      .prepare("SELECT email, nombre FROM vc_jugadores WHERE torneo_id = ?")
      .all(torneo.id);
    const chocan = equipo.filter((j) =>
      yaInscritos.some((y) => y.email.toLowerCase() === (j.email || "").toLowerCase())
    );
    if (chocan.length) {
      errores.push(
        `${chocan.map((j) => j.nombre || j.email).join(", ")} ya está inscrito en este torneo.`
      );
    }
  }

  if (errores.length) return fallar(errores);

  if (limiteInscripcion.alcanzado(req.ip)) {
    return fallar(
      ["Demasiadas inscripciones seguidas desde esta conexión. Intenta de nuevo en unos minutos."],
      429
    );
  }

  const codigo = vc.codigoLibre();

  db.exec("BEGIN");
  try {
    if (valores.modo === "equipo") {
      const info = db
        .prepare(
          `INSERT INTO vc_equipos
             (torneo_id, codigo, nombre, tag, contacto_nombre, contacto_email)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          torneo.id,
          codigo,
          valores.equipo,
          valores.tag || null,
          valores.capitan_nombre,
          valores.capitan_email
        );

      const insertJugador = db.prepare(
        `INSERT INTO vc_jugadores
           (torneo_id, equipo_id, nombre, email, nick, rol, capitan, suplente, orden)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      equipo.forEach((j, i) => {
        insertJugador.run(
          torneo.id,
          info.lastInsertRowid,
          j.nombre,
          j.email,
          j.nick || null,
          j.rol || null,
          i === 0 ? 1 : 0,
          i >= juego.titulares ? 1 : 0,
          i
        );
      });
    } else {
      // Inscripción individual: sin equipo todavía, con su propio código.
      db.prepare(
        `INSERT INTO vc_jugadores (torneo_id, equipo_id, codigo, nombre, email, nick, rol)
         VALUES (?, NULL, ?, ?, ?, ?, ?)`
      ).run(
        torneo.id,
        codigo,
        valores.capitan_nombre,
        valores.capitan_email,
        valores.capitan_nick || null,
        valores.capitan_rol || null
      );
    }

    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  limiteInscripcion.registrar(req.ip);

  // El correo sale aparte: si falla o se demora, la inscripción ya está hecha
  // y el estudiante ve su código en pantalla igual.
  const faltan =
    valores.modo === "solo" ? Math.max(0, juego.titulares - vc.agentesLibres(torneo.id).length) : 0;
  envios.vcAvisoInscripcion(
    {
      codigo,
      nombre: valores.capitan_nombre,
      email: valores.capitan_email,
      equipo: valores.equipo,
      juego: juego.nombre,
      solo: valores.modo === "solo",
      faltan,
    },
    envios.urlBase(req)
  );

  res.redirect(`/vc/inscripcion/listo/${codigo}`);
});

// ---------------------------------------------------------------------
//  Confirmación y consulta
// ---------------------------------------------------------------------
function vistaEstado(req, { codigo, recienEnviada, error }) {
  const encontrado = codigo ? vc.buscarPorCodigo(codigo) : null;
  // El torneo viene resuelto en las dos formas del resultado (equipo o
  // jugador suelto), y de él sale el juego que le da color a la página.
  const torneo = encontrado
    ? (encontrado.tipo === "equipo" ? encontrado.equipo.torneo : encontrado.jugador.torneo)
    : null;
  const juegoId = torneo ? torneo.juego : null;

  // Los certificados del equipo, con el mismo código con el que se consulta
  // todo lo demás. Solo los del torneo: el mismo jugador puede tener el de la
  // jam o el de la Expo, y aquí no vienen a cuento.
  const correos = !encontrado
    ? []
    : encontrado.tipo === "equipo"
      ? (encontrado.equipo.jugadores || []).map((j) => j.email).filter(Boolean)
      : [encontrado.jugador.email].filter(Boolean);

  return {
    ...marco(req, juegoId),
    activa: "inscripcion",
    title: "Tu inscripción · Virtual Champions",
    encontrado,
    certificados: correos.flatMap((c) => certificadosDe(c, "virtual-champions")),
    codigo: codigo || "",
    recienEnviada,
    error,
    correoActivo: envios.activo(),
  };
}

router.get("/vc/inscripcion/listo/:codigo", publica, (req, res) => {
  const codigo = String(req.params.codigo || "").toUpperCase();
  if (!vc.buscarPorCodigo(codigo)) return res.redirect("/vc/inscripcion/estado");
  res.render(
    "vc/inscripcion-estado",
    vistaEstado(req, { codigo, recienEnviada: true, error: null })
  );
});

router.get("/vc/inscripcion/estado", publica, (req, res) => {
  const codigo = String(req.query.codigo || "").trim().toUpperCase();
  res.render(
    "vc/inscripcion-estado",
    vistaEstado(req, {
      codigo,
      recienEnviada: false,
      error: codigo && !vc.buscarPorCodigo(codigo) ? "No encontramos ninguna inscripción con ese código." : null,
    })
  );
});

module.exports = router;
