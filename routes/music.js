// =====================================================================
//  Multimedia Music Fest — el sitio público.
//
//  Cuatro páginas: el cartel, las dos puertas de inscripción y la consulta
//  del código.
//
//  Las dos puertas son formularios distintos porque preguntan cosas distintas.
//  A un grupo se le pregunta qué va a presentar y qué necesita en tarima; a
//  quien viene a producción, en qué semestre va y qué sabe hacer. Un solo
//  formulario con la mitad de los campos escondidos detrás de un selector es
//  el atajo que parece más corto y termina siendo más largo de llenar.
//
//  Lo que se edita vive en data/music-fest.json; lo que confirma la
//  organización, en el panel (/music/panel), que es otro archivo.
// =====================================================================
const express = require("express");
const db = require("../db/database");
const music = require("../lib/music");
const eventos = require("../lib/eventos");
const envios = require("../lib/envios");
const { contenidoEvento } = require("../lib/contenido");
const { DOMINIO } = require("../lib/correos");
const { crearLimite } = require("../lib/limite");

const router = express.Router();

const EVENTO = eventos.porSlug("music-fest");

// Toda página de aquí abajo es pública, y por eso todas llevan el mismo
// guardia delante: si el festival no es el evento de este semestre y
// config.SOLO_EVENTO_ACTIVO está en true, la dirección no responde. Va ruta por
// ruta y no con un router.use() porque este router se monta en "/" y por él
// pasan también las peticiones de todo lo demás.
//
// El panel NO pasa por aquí: vive en routes/music-panel.js y se entra con
// contraseña, para poder preparar el evento que viene mientras la puerta
// pública sigue cerrada.
const publica = eventos.soloActivo("music-fest");

const MAX_NOMBRE = 60;
const MAX_TEXTO = 500;

// Mismo freno que el resto de formularios públicos: solo cuentan las
// inscripciones que SÍ entraron, para que un salón entero apuntándose desde el
// mismo wifi no se tope con esto y un bot mandando cientos sí.
const limiteInscripcion = crearLimite({ ventanaMs: 10 * 60 * 1000, maximo: 30 });

// ---------------------------------------------------------------------
//  Lo que toda página del festival necesita
// ---------------------------------------------------------------------
const contenido = () => contenidoEvento(EVENTO ? EVENTO.datos : "");

function marco(extra = {}) {
  const edicion = music.edicionVigente();

  return {
    ...contenido(),
    evento: EVENTO,
    slug: "music-fest",
    edicion,
    abierta: music.inscripcionAbierta(edicion),
    hayCupoActos: music.hayCupoActos(edicion),
    hayCupoProduccion: music.hayCupoProduccion(edicion),
    areas: music.AREAS,
    tipos: music.TIPOS,
    css: "/music.css",
    themeColor: "#0a0710",
    title: "Multimedia Music Fest",
    ...extra,
  };
}

// ---------------------------------------------------------------------
//  El cartel
// ---------------------------------------------------------------------
router.get("/music-fest", publica, (req, res) => {
  const base = marco();
  const cartel = music.cartel(base.edicion);

  res.render("music/landing", {
    ...base,
    activa: "inicio",
    ...cartel,
  });
});

// ---------------------------------------------------------------------
//  Puerta 1: los grupos
// ---------------------------------------------------------------------
const VACIO_GRUPO = {
  nombre: "",
  tipo: "",
  genero: "",
  integrantes: "",
  propuesta: "",
  necesidades: "",
  enlace: "",
  contacto_nombre: "",
  contacto_email: "",
  telefono: "",
};

function vistaGrupo(extra = {}) {
  return marco({
    activa: "grupos",
    title: "Inscribir un grupo · Music Fest",
    errores: [],
    valores: VACIO_GRUPO,
    ...extra,
  });
}

router.get("/music/grupos", publica, (req, res) => {
  res.render("music/grupos", vistaGrupo());
});

router.post("/music/grupos", publica, (req, res) => {
  const edicion = music.edicionVigente();

  const valores = {
    nombre: music.limpiarNombre(req.body.nombre).slice(0, MAX_NOMBRE),
    tipo: music.tipoValido(req.body.tipo) || "",
    genero: String(req.body.genero || "").trim().slice(0, 60),
    integrantes: String(req.body.integrantes || "").replace(/\D/g, "").slice(0, 3),
    propuesta: String(req.body.propuesta || "").trim().slice(0, MAX_TEXTO),
    necesidades: String(req.body.necesidades || "").trim().slice(0, MAX_TEXTO),
    enlace: String(req.body.enlace || "").trim().slice(0, 200),
    contacto_nombre: music.limpiarNombre(req.body.contacto_nombre).slice(0, 120),
    contacto_email: music.limpiarEmail(req.body.contacto_email),
    telefono: String(req.body.telefono || "").replace(/[^\d+\s()-]/g, "").trim().slice(0, 25),
  };

  const fallar = (errores, status = 400) =>
    res.status(status).render("music/grupos", vistaGrupo({ errores, valores }));

  const errores = [];

  if (!edicion) errores.push("Todavía no hay un festival abierto.");
  else if (!music.inscripcionAbierta(edicion)) errores.push("Las inscripciones están cerradas.");
  else if (!music.hayCupoActos(edicion)) errores.push("El cartel ya está lleno para esta edición.");

  if (!valores.nombre) errores.push("Escribe el nombre del grupo.");
  if (!valores.tipo) errores.push("Dinos si es un grupo musical o de baile.");
  if (!valores.integrantes || Number(valores.integrantes) < 1) {
    errores.push("Escribe cuántas personas se suben a la tarima.");
  }
  if (!valores.propuesta) errores.push("Cuéntanos qué van a presentar.");
  if (!valores.contacto_nombre) errores.push("Escribe el nombre de quien podemos contactar.");
  if (!music.emailValido(valores.contacto_email)) {
    errores.push(`El correo de contacto tiene que ser el institucional @${DOMINIO}.`);
  }

  // Un grupo, un correo. Se avisa aquí con nombre propio en vez de dejar
  // reventar el UNIQUE de la base.
  if (edicion && valores.contacto_email && music.actoPorCorreo(edicion.id, valores.contacto_email)) {
    errores.push(
      "Ya hay un grupo inscrito con ese correo en esta edición. Consulta su estado con el " +
        "código que te llegó, o escríbele a la organización si lo perdiste."
    );
  }

  if (errores.length) return fallar(errores);

  if (limiteInscripcion.alcanzado(req.ip)) {
    return fallar(
      ["Demasiadas inscripciones seguidas desde esta conexión. Intenta de nuevo en unos minutos."],
      429
    );
  }

  const codigo = music.codigoLibre();

  db.prepare(
    `INSERT INTO music_actos
       (edicion_id, codigo, nombre, tipo, genero, integrantes, propuesta,
        necesidades, enlace, contacto_nombre, contacto_email, telefono)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    edicion.id,
    codigo,
    valores.nombre,
    valores.tipo,
    valores.genero || null,
    Number(valores.integrantes),
    valores.propuesta,
    valores.necesidades || null,
    valores.enlace || null,
    valores.contacto_nombre,
    valores.contacto_email,
    valores.telefono || null
  );

  limiteInscripcion.registrar(req.ip);

  envios.musicAvisoInscripcion(
    {
      codigo,
      nombre: valores.contacto_nombre,
      email: valores.contacto_email,
      que: "acto",
      titulo: valores.nombre,
      detalle: valores.tipo,
    },
    envios.urlBase(req)
  );

  res.redirect(`/music/inscripcion/listo/${codigo}`);
});

// ---------------------------------------------------------------------
//  Puerta 2: el equipo de producción
// ---------------------------------------------------------------------
const VACIO_PROD = {
  nombre: "",
  email: "",
  telefono: "",
  semestre: "",
  area: "",
  experiencia: "",
};

function vistaProduccion(extra = {}) {
  return marco({
    activa: "produccion",
    title: "Equipo de producción · Music Fest",
    errores: [],
    valores: VACIO_PROD,
    ...extra,
  });
}

router.get("/music/produccion", publica, (req, res) => {
  res.render("music/produccion", vistaProduccion());
});

router.post("/music/produccion", publica, (req, res) => {
  const edicion = music.edicionVigente();

  const valores = {
    nombre: music.limpiarNombre(req.body.nombre).slice(0, 120),
    email: music.limpiarEmail(req.body.email),
    telefono: String(req.body.telefono || "").replace(/[^\d+\s()-]/g, "").trim().slice(0, 25),
    semestre: String(req.body.semestre || "").replace(/\D/g, "").slice(0, 2),
    area: music.areaValida(req.body.area) || "",
    experiencia: String(req.body.experiencia || "").trim().slice(0, MAX_TEXTO),
  };

  const fallar = (errores, status = 400) =>
    res.status(status).render("music/produccion", vistaProduccion({ errores, valores }));

  const errores = [];

  if (!edicion) errores.push("Todavía no hay un festival abierto.");
  else if (!music.inscripcionAbierta(edicion)) errores.push("Las inscripciones están cerradas.");
  else if (!music.hayCupoProduccion(edicion)) {
    errores.push("El equipo de producción ya está completo para esta edición.");
  }

  if (!valores.nombre) errores.push("Escribe tu nombre completo.");
  if (!music.emailValido(valores.email)) {
    errores.push(`Tu correo tiene que ser el institucional @${DOMINIO}.`);
  }
  if (!valores.semestre) errores.push("Dinos en qué semestre vas.");
  if (!valores.area) errores.push("Elige de qué te quieres encargar.");

  if (edicion && valores.email && music.personaPorCorreo(edicion.id, valores.email)) {
    errores.push(
      "Ya estás inscrito en el equipo de producción de esta edición. Consulta tu estado " +
        "con el código que te llegó."
    );
  }

  if (errores.length) return fallar(errores);

  if (limiteInscripcion.alcanzado(req.ip)) {
    return fallar(
      ["Demasiadas inscripciones seguidas desde esta conexión. Intenta de nuevo en unos minutos."],
      429
    );
  }

  const codigo = music.codigoLibre();

  db.prepare(
    `INSERT INTO music_produccion
       (edicion_id, codigo, nombre, email, telefono, semestre, area, experiencia)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    edicion.id,
    codigo,
    valores.nombre,
    valores.email,
    valores.telefono || null,
    valores.semestre,
    valores.area,
    valores.experiencia || null
  );

  limiteInscripcion.registrar(req.ip);

  envios.musicAvisoInscripcion(
    {
      codigo,
      nombre: valores.nombre,
      email: valores.email,
      que: "produccion",
      titulo: "Equipo de producción",
      detalle: (music.area(valores.area) || {}).nombre,
    },
    envios.urlBase(req)
  );

  res.redirect(`/music/inscripcion/listo/${codigo}`);
});

// ---------------------------------------------------------------------
//  El código: una sola consulta para las dos puertas
// ---------------------------------------------------------------------
router.get("/music/inscripcion/listo/:codigo", publica, (req, res) => {
  const hallado = music.buscarPorCodigo(req.params.codigo);
  if (!hallado) return res.redirect("/music/inscripcion/estado");

  res.render(
    "music/estado",
    marco({
      activa: "estado",
      title: "Listo · Music Fest",
      recienHecho: true,
      hallado,
      codigo: req.params.codigo.toUpperCase(),
      error: null,
      correoActivo: envios.activo(),
    })
  );
});

router.get("/music/inscripcion/estado", publica, (req, res) => {
  const codigo = String(req.query.codigo || "").trim();
  const hallado = codigo ? music.buscarPorCodigo(codigo) : null;

  res.render(
    "music/estado",
    marco({
      activa: "estado",
      title: "Consultar el código · Music Fest",
      recienHecho: false,
      hallado,
      codigo,
      error: codigo && !hallado ? "No encontramos ese código. Revisa que esté bien escrito." : null,
      correoActivo: envios.activo(),
    })
  );
});

module.exports = router;
