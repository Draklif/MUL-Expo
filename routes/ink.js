// =====================================================================
//  INKreible — el sitio público.
//
//  La palabra de hoy, el calendario de las 28, la galería, el podio y la
//  inscripción. Todo esto lo ve cualquiera sin entrar a nada; lo que se
//  edita vive en el panel (/ink/panel), que es otro archivo.
//
//  Ojo con una cosa: esta app NO recibe archivos. Los dibujos se suben a una
//  carpeta de Drive con un nombre predefinido y aquí solo se guardan los
//  enlaces, así que en todo este archivo no hay una sola subida de imagen.
// =====================================================================
const express = require("express");
const db = require("../db/database");
const ink = require("../lib/ink");
const envios = require("../lib/envios");
const eventos = require("../lib/eventos");
const { contenidoEvento } = require("../lib/contenido");
const { limpiarNombre } = require("../lib/listas");
const { DOMINIO } = require("../lib/correos");
const { crearLimite } = require("../lib/limite");

const router = express.Router();

const EVENTO = eventos.porSlug("inkreible");

// El guardia de las páginas públicas, igual que en el torneo, la jam y el
// festival: cierra la puerta cuando el reto no está aprobado en
// config.APROBADO y cuando SOLO_EVENTO_ACTIVO le da la exclusiva a otro. Va en
// CADA ruta y no en un router.use(): este router se monta en "/" y por él pasan
// también las peticiones del panel, que no se cierra nunca.
const publica = eventos.soloActivo("inkreible");

// Mismo freno que el resto de formularios públicos: solo cuentan las
// inscripciones que SÍ entraron, para que un salón entero apuntándose desde el
// mismo wifi no se tope con esto y un bot mandando cientos sí.
const limiteInscripcion = crearLimite({ ventanaMs: 10 * 60 * 1000, maximo: 40 });

// ---------------------------------------------------------------------
//  Lo que toda página del reto necesita
// ---------------------------------------------------------------------
const contenido = () => contenidoEvento(EVENTO ? EVENTO.datos : "");

/**
 * El marco común: la edición vigente, en qué día va el reto y los datos de
 * cabecera. Todas las vistas de INKreible reciben esto.
 */
function marco(req, extra = {}) {
  const edicion = ink.edicionVigente();
  const fase = ink.fase(edicion);

  return {
    ...contenido(),
    evento: EVENTO,
    slug: "inkreible",
    edicion,
    fase,
    abierta: ink.inscripcionAbierta(edicion),
    galeriaAbierta: Boolean(edicion && edicion.galeria_publica),
    podioAbierto: ink.podioPublico(edicion),
    tecnicas: ink.TECNICAS,
    diaDe: ink.diaDe,
    css: "/ink.css",
    themeColor: "#f3ede1",
    title: "INKreible",
    ...extra,
  };
}

// ---------------------------------------------------------------------
//  Portada: la palabra de hoy
// ---------------------------------------------------------------------
router.get("/inkreible", publica, (req, res) => {
  const base = marco(req);
  const id = base.edicion ? base.edicion.id : null;

  res.render("ink/landing", {
    ...base,
    activa: "inicio",
    palabra: ink.palabraDeHoy(base.edicion),
    semanas: ink.semanasDe(base.edicion),
    // La portada no muestra la galería entera: una tira de lo último que
    // entró, que es lo que invita a abrirla.
    ultimos:
      id && base.galeriaAbierta
        ? ink.galeria(id, { limite: 12, recientes: true }, base.edicion)
        : [],
    cifras: id ? ink.resumen(id) : { inscritos: 0, dibujos: 0, completos: 0, palabras: 0 },
    tecnicasHechas: id ? ink.porTecnica(id) : [],
    podio: id && base.podioAbierto ? ink.premios(id) : null,
  });
});

// ---------------------------------------------------------------------
//  El calendario de las 28 palabras
// ---------------------------------------------------------------------
router.get("/ink/palabras", publica, (req, res) => {
  const base = marco(req);
  const id = base.edicion ? base.edicion.id : null;

  res.render("ink/palabras", {
    ...base,
    activa: "palabras",
    title: "Las palabras · INKreible",
    // palabrasPublicas y no palabras: las que todavía no salen vienen con el
    // texto borrado desde el servidor, así que no hay nada que espiar en el
    // código fuente de esta página.
    palabras: id ? ink.palabrasPublicas(id, base.edicion) : [],
    semanas: ink.semanasDe(base.edicion),
  });
});

// ---------------------------------------------------------------------
//  La galería
// ---------------------------------------------------------------------
router.get("/ink/galeria", publica, (req, res) => {
  const base = marco(req);
  const id = base.edicion ? base.edicion.id : null;

  const filtros = {
    semana: Number(req.query.semana) || null,
    dia: Number(req.query.dia) || null,
    tecnica: ink.tecnica(req.query.tecnica) ? req.query.tecnica : null,
    autor: Number(req.query.autor) || null,
  };

  // Mientras la galería no esté abierta no se sirve ni un enlace: se abre al
  // final, cuando ya están todos los dibujos, para que nadie mire lo que hizo
  // el vecino antes de resolver su propia palabra.
  const dibujos = id && base.galeriaAbierta ? ink.galeria(id, filtros, base.edicion) : [];

  res.render("ink/galeria", {
    ...base,
    activa: "galeria",
    title: "Galería · INKreible",
    dibujos: dibujos.map((d) => ({ ...d, semana: ink.semanaDe(d.dia, base.edicion) })),
    filtros,
    semanas: ink.semanasDe(base.edicion),
    palabras: id ? ink.palabrasPublicas(id, base.edicion) : [],
    autores: id && base.galeriaAbierta ? ink.participantes(id, "aprobado") : [],
  });
});

// La libreta de una persona: sus 28 casillas, con lo que entregó y lo que no.
router.get("/ink/participante/:id", publica, (req, res) => {
  const base = marco(req);
  const persona = ink.participante(req.params.id);

  if (!persona || persona.estado !== "aprobado" || !base.edicion) {
    return res.redirect("/inkreible");
  }
  // Fuera de su edición no se muestra: la galería vieja se ve entera desde su
  // propia edición vigente, no colgada de la de este semestre.
  if (persona.edicion_id !== base.edicion.id || !base.galeriaAbierta) {
    return res.redirect("/ink/galeria");
  }

  const ficha = ink.conDibujos(persona, base.edicion);

  res.render("ink/participante", {
    ...base,
    activa: "galeria",
    title: `${persona.nombre} · INKreible`,
    persona: ficha,
    palabras: ink.palabrasPublicas(base.edicion.id, base.edicion),
  });
});

// ---------------------------------------------------------------------
//  El podio
// ---------------------------------------------------------------------
router.get("/ink/resultados", publica, (req, res) => {
  const base = marco(req);
  const id = base.edicion ? base.edicion.id : null;

  res.render("ink/resultados", {
    ...base,
    activa: "resultados",
    title: "Resultados · INKreible",
    podio: id && base.podioAbierto ? ink.premios(id) : null,
    categorias: ink.CATEGORIAS,
    completos: id && base.podioAbierto ? ink.tablaAvance(id, base.edicion).filter((p) => p.completo) : [],
    palabras: id ? ink.palabrasPublicas(id, base.edicion) : [],
  });
});

// ---------------------------------------------------------------------
//  Estado en vivo
// ---------------------------------------------------------------------
// Una sola petición trae lo que puede cambiar mientras alguien tiene la página
// abierta. Aquí eso pasa una vez al día —a medianoche cambia la palabra—, pero
// justamente por eso: quien dejó la pestaña abierta desde ayer tiene que ver
// la de hoy sin recargar a mano.
router.get("/ink/api/estado", publica, (req, res) => {
  const id = Number(req.query.edicion) || null;
  // Sin cache: el navegador no puede quedarse con la palabra de ayer.
  res.set("Cache-Control", "no-store");
  res.json(id ? ink.estadoPublico(id) : { hoy: null, clave: "sin_edicion" });
});

// ---------------------------------------------------------------------
//  Inscripción
// ---------------------------------------------------------------------
function vistaInscripcion(req, extra = {}) {
  const base = marco(req);
  return {
    ...base,
    activa: "inscripcion",
    title: "Inscripción · INKreible",
    ejemplo: ink.ejemploNombre(base.edicion),
    errores: [],
    valores: { tecnica: "" },
    ...extra,
  };
}

router.get("/ink/inscripcion", publica, (req, res) => {
  res.render("ink/inscripcion", vistaInscripcion(req));
});

router.post("/ink/inscripcion", publica, (req, res) => {
  const edicion = ink.edicionVigente();

  const valores = {
    nombre: limpiarNombre(req.body.nombre).slice(0, 120),
    email: ink.limpiarEmail(req.body.email),
    semestre: String(req.body.semestre || "").trim().slice(0, 20),
    tecnica: ink.tecnicaDeclarada(req.body.tecnica),
    // El arroba lo pone la página, no la persona: si lo escribe igual, no se
    // guarda dos veces.
    usuario: String(req.body.usuario || "").trim().replace(/^@+/, "").slice(0, 40),
  };

  const fallar = (errores, status = 400) =>
    res.status(status).render("ink/inscripcion", vistaInscripcion(req, { errores, valores }));

  const errores = [];

  if (!edicion) errores.push("Todavía no hay una edición abierta del reto.");
  else if (!ink.inscripcionAbierta(edicion)) {
    errores.push(
      edicion.cupo && ink.contarInscritos(edicion.id) >= edicion.cupo
        ? "Se llenó el cupo de esta edición."
        : "Las inscripciones están cerradas."
    );
  }

  if (!valores.nombre) errores.push("Escribe tu nombre.");
  if (!ink.emailValido(valores.email)) {
    errores.push(`Tu correo tiene que ser el institucional @${DOMINIO}.`);
  }
  if (!valores.tecnica) errores.push("Dinos con qué vas a dibujar.");

  // Un correo no puede inscribirse dos veces en la misma edición. Lo vigila un
  // UNIQUE en la base, pero se avisa aquí con el código de la primera
  // inscripción en vez de dejar reventar la inserción: casi siempre es alguien
  // que ya se inscribió y no encuentra el correo.
  if (edicion && valores.email) {
    const ya = db
      .prepare("SELECT codigo FROM ink_participantes WHERE edicion_id = ? AND email = ? COLLATE NOCASE")
      .get(edicion.id, valores.email);
    if (ya) {
      errores.push(`Ese correo ya está inscrito. Tu código es ${ya.codigo}: consúltalo aquí abajo.`);
    }
  }

  if (errores.length) return fallar(errores);

  if (limiteInscripcion.alcanzado(req.ip)) {
    return fallar(
      ["Demasiadas inscripciones seguidas desde esta conexión. Intenta de nuevo en unos minutos."],
      429
    );
  }

  const codigo = ink.codigoLibre();

  db.prepare(
    `INSERT INTO ink_participantes (edicion_id, codigo, nombre, email, semestre, tecnica, usuario)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    edicion.id,
    codigo,
    valores.nombre,
    valores.email,
    valores.semestre || null,
    valores.tecnica,
    valores.usuario || null
  );

  limiteInscripcion.registrar(req.ip);

  // El correo sale aparte: si falla o se demora, la inscripción ya está hecha y
  // el estudiante ve su código en pantalla igual.
  const f = ink.fase(edicion);
  envios.inkAvisoInscripcion(
    {
      codigo,
      nombre: valores.nombre,
      email: valores.email,
      tecnica: valores.tecnica === "mixto" ? "Digital y análogo" : ink.etiquetaTecnica(valores.tecnica),
      cuando: f.momento_inicio ? f.momento_inicio.dia : null,
    },
    envios.urlBase(req)
  );

  res.redirect(`/ink/inscripcion/listo/${codigo}`);
});

// ---------------------------------------------------------------------
//  Confirmación y consulta
// ---------------------------------------------------------------------
/**
 * La página del código: en qué va la inscripción y, cuando ya está admitida,
 * el enlace de la carpeta, el nombre exacto de cada archivo y qué días lleva.
 * Es la única página del sitio que un participante necesita durante las cuatro
 * semanas, así que carga todo eso de una.
 */
function vistaEstado(req, { codigo, recienEnviada, error }) {
  const base = marco(req);
  const ficha = codigo ? ink.fichaPorCodigo(codigo) : null;
  const suEdicion = ficha ? ficha.edicion : null;

  return {
    ...base,
    activa: "inscripcion",
    title: "Tu inscripción · INKreible",
    ficha,
    // La libreta se pinta con las palabras de LA edición de esa persona, que
    // puede ser la del semestre pasado si está consultando un código viejo.
    palabras: ficha ? ink.palabrasPublicas(ficha.edicion_id, suEdicion) : [],
    // Y el nombre de archivo con la nomenclatura de esa misma edición.
    nombreArchivo: (dia, tecnica) =>
      ink.nombreArchivo(suEdicion, { codigo: ficha ? ficha.codigo : "", dia, tecnica }),
    codigo: codigo || "",
    recienEnviada,
    error,
    correoActivo: envios.activo(),
  };
}

router.get("/ink/inscripcion/listo/:codigo", publica, (req, res) => {
  const codigo = String(req.params.codigo || "").toUpperCase();
  if (!ink.participantePorCodigo(codigo)) return res.redirect("/ink/inscripcion/estado");
  res.render(
    "ink/inscripcion-estado",
    vistaEstado(req, { codigo, recienEnviada: true, error: null })
  );
});

router.get("/ink/inscripcion/estado", publica, (req, res) => {
  const codigo = String(req.query.codigo || "").trim().toUpperCase();

  res.render(
    "ink/inscripcion-estado",
    vistaEstado(req, {
      codigo,
      recienEnviada: false,
      error:
        codigo && !ink.participantePorCodigo(codigo)
          ? "No encontramos ninguna inscripción con ese código."
          : null,
    })
  );
});

module.exports = router;
