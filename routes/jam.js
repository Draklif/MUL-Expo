// =====================================================================
//  Jam de Altura — el sitio público.
//
//  La página del reloj, los equipos, la inscripción y la entrega del juego.
//  Todo esto lo ve cualquiera sin entrar a nada; lo que se edita vive en el
//  panel (/jam/panel), que es otro archivo.
// =====================================================================
const express = require("express");
const db = require("../db/database");
const jam = require("../lib/jam");
const envios = require("../lib/envios");
const eventos = require("../lib/eventos");
const { contenidoEvento } = require("../lib/contenido");
const { limpiarNombre } = require("../lib/listas");
const { DOMINIO } = require("../lib/correos");
const { crearLimite } = require("../lib/limite");

const router = express.Router();

const EVENTO = eventos.porSlug("jam-de-altura");
const MAX_NOMBRE_EQUIPO = 40;

// Mismo freno que el resto de formularios públicos: solo cuentan las
// inscripciones que SÍ entraron, para que un salón entero apuntándose desde el
// mismo wifi no se tope con esto y un bot mandando cientos sí.
const limiteInscripcion = crearLimite({ ventanaMs: 10 * 60 * 1000, maximo: 30 });
const limiteEntrega = crearLimite({ ventanaMs: 10 * 60 * 1000, maximo: 40 });

// ---------------------------------------------------------------------
//  Lo que toda página de la jam necesita
// ---------------------------------------------------------------------
const contenido = () => contenidoEvento(EVENTO ? EVENTO.datos : "");

/**
 * El marco común: la edición vigente, en qué fase va y los datos de cabecera.
 * Todas las vistas de la jam reciben esto.
 */
function marco(req, extra = {}) {
  const edicion = jam.edicionVigente();
  const fase = jam.fase(edicion);

  return {
    ...contenido(),
    evento: EVENTO,
    slug: "jam-de-altura",
    edicion,
    fase,
    tema: jam.temaPublico(edicion),
    abierta: jam.inscripcionAbierta(edicion),
    disciplinas: jam.DISCIPLINAS,
    momentoDe: jam.momento,
    css: "/jam.css",
    themeColor: "#10091f",
    title: "Jam de Altura",
    ...extra,
  };
}

// ---------------------------------------------------------------------
//  Landing: el reloj, el tema y quiénes están adentro
// ---------------------------------------------------------------------
router.get("/jam-de-altura", (req, res) => {
  const base = marco(req);
  const id = base.edicion ? base.edicion.id : null;

  res.render("jam/landing", {
    ...base,
    activa: "inicio",
    equipos: id ? jam.equiposDe(id) : [],
    entregas: id ? jam.entregas(id) : [],
    anuncios: id ? jam.anuncios(id, 8) : [],
    cifras: id ? jam.resumen(id) : { equipos: 0, personas: 0, solistas: 0, entregas: 0 },
    mezcla: id ? jam.porDisciplina(id) : [],
  });
});

// ---------------------------------------------------------------------
//  Equipos
// ---------------------------------------------------------------------
router.get("/jam/equipos", (req, res) => {
  const base = marco(req);
  const id = base.edicion ? base.edicion.id : null;

  res.render("jam/equipos", {
    ...base,
    activa: "equipos",
    title: "Equipos · Jam de Altura",
    equipos: id ? jam.equiposDe(id) : [],
    esperando: id ? jam.solistas(id).length : 0,
    mezcla: id ? jam.porDisciplina(id) : [],
  });
});

router.get("/jam/equipo/:id", (req, res) => {
  const equipo = jam.equipoConIntegrantes(req.params.id);
  if (!equipo || equipo.estado !== "aprobado") return res.redirect("/jam-de-altura");

  res.render("jam/equipo", {
    ...marco(req),
    activa: "equipos",
    title: `${equipo.nombre} · Jam de Altura`,
    equipo,
  });
});

// ---------------------------------------------------------------------
//  Estado en vivo: lo que consulta el reloj de la página
// ---------------------------------------------------------------------
// Una sola petición trae todo lo que puede cambiar mientras alguien tiene la
// página abierta: la hora del servidor, la fase, el tema si ya se reveló y el
// tablón de anuncios.
router.get("/jam/api/estado", (req, res) => {
  const id = Number(req.query.edicion) || null;
  // Sin cache: el navegador no puede quedarse con un tema sin revelar de hace
  // media hora, que es justo el dato que la gente está esperando.
  res.set("Cache-Control", "no-store");
  res.json(id ? jam.estadoPublico(id) : { ahora: Date.now(), clave: "sin_edicion" });
});

// ---------------------------------------------------------------------
//  Inscripción
// ---------------------------------------------------------------------
function vistaInscripcion(req, extra = {}) {
  const base = marco(req);
  return {
    ...base,
    activa: "inscripcion",
    title: "Inscripción · Jam de Altura",
    max: base.edicion ? base.edicion.max_integrantes : jam.MAX_INTEGRANTES,
    errores: [],
    valores: { modo: "equipo", integrantes: [] },
    ...extra,
  };
}

router.get("/jam/inscripcion", (req, res) => {
  res.render("jam/inscripcion", vistaInscripcion(req));
});

router.post("/jam/inscripcion", (req, res) => {
  const edicion = jam.edicionVigente();
  const max = edicion ? edicion.max_integrantes : jam.MAX_INTEGRANTES;

  const valores = {
    modo: req.body.modo === "solo" ? "solo" : "equipo",
    equipo: String(req.body.equipo || "").trim().slice(0, MAX_NOMBRE_EQUIPO),
    lema: String(req.body.lema || "").trim().slice(0, 120),
    lider_nombre: limpiarNombre(req.body.lider_nombre).slice(0, 120),
    lider_email: jam.limpiarEmail(req.body.lider_email),
    lider_disciplina: jam.disciplinaValida(req.body.lider_disciplina),
    // El líder ocupa un puesto del equipo, así que de la parte repetida del
    // formulario solo caben max - 1.
    integrantes: jam.integrantesDesdeFormulario(req.body, Math.max(0, max - 1)),
  };

  const fallar = (errores, status = 400) =>
    res.status(status).render("jam/inscripcion", vistaInscripcion(req, { errores, valores }));

  const errores = [];

  if (!edicion) errores.push("Todavía no hay una jam abierta.");
  else if (!jam.inscripcionAbierta(edicion)) {
    errores.push(
      edicion.cupo_equipos && jam.contarEquipos(edicion.id) >= edicion.cupo_equipos
        ? "Se llenó el cupo de equipos de esta edición."
        : "Las inscripciones están cerradas."
    );
  }

  // Quien llena el formulario siempre queda dentro, de primero y como líder.
  if (!valores.lider_nombre) errores.push("Escribe tu nombre.");
  if (!jam.emailValido(valores.lider_email)) {
    errores.push(`Tu correo tiene que ser el institucional @${DOMINIO}.`);
  }
  if (!valores.lider_disciplina) errores.push("Elige de qué te vas a encargar.");

  const equipo = [
    {
      nombre: valores.lider_nombre,
      email: valores.lider_email,
      disciplina: valores.lider_disciplina,
    },
    ...(valores.modo === "equipo"
      ? valores.integrantes.filter((i) => i.email !== valores.lider_email)
      : []),
  ].slice(0, max);

  if (valores.modo === "equipo") {
    if (!valores.equipo) errores.push("Ponle nombre al equipo.");

    const sinNombre = equipo.filter((i) => !i.nombre && i.email);
    if (sinNombre.length) errores.push("Falta el nombre de algún integrante.");

    const malCorreo = equipo.filter((i) => i.nombre && !jam.emailValido(i.email));
    if (malCorreo.length) {
      errores.push(`Falta el correo @${DOMINIO} de ${malCorreo.map((i) => i.nombre).join(", ")}.`);
    }

    const sinDisciplina = equipo.filter((i) => i.nombre && !i.disciplina);
    if (sinDisciplina.length) {
      errores.push(
        `Falta decir de qué se encarga ${sinDisciplina.map((i) => i.nombre).join(", ")}.`
      );
    }

    // Nombre de equipo repetido en la misma edición. La comparación va en JS
    // porque el COLLATE NOCASE de SQLite solo ignora mayúsculas en ASCII.
    if (edicion && valores.equipo) {
      const objetivo = valores.equipo.toLowerCase();
      const repetido = db
        .prepare("SELECT codigo, nombre FROM jam_equipos WHERE edicion_id = ? AND estado != 'rechazado'")
        .all(edicion.id)
        .find((e) => e.nombre.toLowerCase() === objetivo);
      if (repetido) {
        errores.push(
          `Ya hay un equipo llamado "${repetido.nombre}". Consulta su estado con el código ${repetido.codigo}.`
        );
      }
    }
  }

  // Un correo no puede estar en dos equipos de la misma edición. Lo vigila un
  // UNIQUE en la base, pero se avisa aquí con el nombre de la persona en vez
  // de dejar reventar la inserción.
  if (edicion) {
    const yaInscritos = db
      .prepare("SELECT email, nombre FROM jam_integrantes WHERE edicion_id = ?")
      .all(edicion.id);
    const chocan = equipo.filter((i) =>
      yaInscritos.some((y) => y.email.toLowerCase() === (i.email || "").toLowerCase())
    );
    if (chocan.length) {
      errores.push(`${chocan.map((i) => i.nombre || i.email).join(", ")} ya está inscrito.`);
    }
  }

  if (errores.length) return fallar(errores);

  if (limiteInscripcion.alcanzado(req.ip)) {
    return fallar(
      ["Demasiadas inscripciones seguidas desde esta conexión. Intenta de nuevo en unos minutos."],
      429
    );
  }

  const codigo = jam.codigoLibre();

  db.exec("BEGIN");
  try {
    if (valores.modo === "equipo") {
      const info = db
        .prepare(
          `INSERT INTO jam_equipos
             (edicion_id, codigo, nombre, lema, contacto_nombre, contacto_email)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          edicion.id,
          codigo,
          valores.equipo,
          valores.lema || null,
          valores.lider_nombre,
          valores.lider_email
        );

      const insertar = db.prepare(
        `INSERT INTO jam_integrantes
           (edicion_id, equipo_id, nombre, email, disciplina, lider, orden)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      equipo.forEach((i, n) => {
        insertar.run(edicion.id, info.lastInsertRowid, i.nombre, i.email, i.disciplina, n === 0 ? 1 : 0, n);
      });
    } else {
      // Inscripción individual: sin equipo todavía, con su propio código.
      db.prepare(
        `INSERT INTO jam_integrantes (edicion_id, equipo_id, codigo, nombre, email, disciplina)
         VALUES (?, NULL, ?, ?, ?, ?)`
      ).run(
        edicion.id,
        codigo,
        valores.lider_nombre,
        valores.lider_email,
        valores.lider_disciplina
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
  const f = jam.fase(edicion);
  envios.jamAvisoInscripcion(
    {
      codigo,
      nombre: valores.lider_nombre,
      email: valores.lider_email,
      equipo: valores.equipo,
      solo: valores.modo === "solo",
      integrantes: equipo.map((i) => i.nombre),
      cuando: f.momento_inicio ? `${f.momento_inicio.dia}, ${f.momento_inicio.hora}` : null,
    },
    envios.urlBase(req)
  );

  res.redirect(`/jam/inscripcion/listo/${codigo}`);
});

// ---------------------------------------------------------------------
//  Confirmación, consulta y entrega
// ---------------------------------------------------------------------
function vistaEstado(req, { codigo, recienEnviada, error, ok }) {
  const base = marco(req);
  const encontrado = codigo ? jam.buscarPorCodigo(codigo) : null;

  return {
    ...base,
    activa: "inscripcion",
    title: "Tu inscripción · Jam de Altura",
    encontrado,
    codigo: codigo || "",
    recienEnviada,
    error,
    ok,
    puedeEntregar: jam.entregaAbierta(base.edicion, base.fase),
    correoActivo: envios.activo(),
  };
}

router.get("/jam/inscripcion/listo/:codigo", (req, res) => {
  const codigo = String(req.params.codigo || "").toUpperCase();
  if (!jam.buscarPorCodigo(codigo)) return res.redirect("/jam/inscripcion/estado");
  res.render(
    "jam/inscripcion-estado",
    vistaEstado(req, { codigo, recienEnviada: true, error: null, ok: null })
  );
});

// Lo que puede haber salido mal al entregar, dicho en una línea. El POST de la
// entrega redirige aquí con una de estas banderas para que recargar la página
// no vuelva a mandar el formulario.
const PROBLEMAS_ENTREGA = {
  falta: "Para entregar hacen falta el nombre del juego y un enlace que empiece por http.",
  cerrada: "Las entregas de esta edición están cerradas.",
  lento: "Demasiados envíos seguidos desde esta conexión. Espera un momento y vuelve a intentarlo.",
  error: "No encontramos ningún equipo con ese código.",
};

router.get("/jam/inscripcion/estado", (req, res) => {
  const codigo = String(req.query.codigo || "").trim().toUpperCase();
  const problema = Object.keys(PROBLEMAS_ENTREGA).find((k) => req.query[k]);

  res.render(
    "jam/inscripcion-estado",
    vistaEstado(req, {
      codigo,
      recienEnviada: false,
      ok: req.query.entregado
        ? "Quedó registrada la entrega. Se puede volver a enviar las veces que haga falta mientras la jam siga abierta."
        : null,
      error:
        codigo && !jam.buscarPorCodigo(codigo)
          ? "No encontramos ninguna inscripción con ese código."
          : problema
            ? PROBLEMAS_ENTREGA[problema]
            : null,
    })
  );
});

/**
 * La entrega del juego. Va con el código del equipo y sin cuenta: quien tiene
 * el código es del equipo, que es la misma regla del resto del sitio.
 *
 * Se puede reenviar cuantas veces haga falta mientras la jam esté abierta —a
 * las cuatro de la mañana de un domingo siempre hay un enlace mal pegado—.
 */
router.post("/jam/entrega/:codigo", (req, res) => {
  const codigo = String(req.params.codigo || "").trim().toUpperCase();
  const equipo = jam.equipoPorCodigo(codigo);
  const volver = `/jam/inscripcion/estado?codigo=${encodeURIComponent(codigo)}`;

  if (!equipo) return res.redirect("/jam/inscripcion/estado?error=1");

  const edicion = jam.edicion(equipo.edicion_id);
  if (equipo.estado !== "aprobado" || !jam.entregaAbierta(edicion)) {
    return res.redirect(`${volver}&cerrada=1`);
  }

  if (limiteEntrega.alcanzado(req.ip)) return res.redirect(`${volver}&lento=1`);

  const titulo = String(req.body.juego_titulo || "").trim().slice(0, 80);
  const url = String(req.body.juego_url || "").trim().slice(0, 300);
  const desc = String(req.body.juego_desc || "").trim().slice(0, 500);

  // Sin título ni enlace no hay entrega que registrar: es lo mínimo para que
  // alguien más pueda abrir el juego.
  if (!titulo || !/^https?:\/\//i.test(url)) return res.redirect(`${volver}&falta=1`);

  db.prepare(
    `UPDATE jam_equipos
        SET juego_titulo = ?, juego_url = ?, juego_desc = ?,
            entregado_at = COALESCE(entregado_at, CURRENT_TIMESTAMP)
      WHERE id = ?`
  ).run(titulo, url, desc || null, equipo.id);

  limiteEntrega.registrar(req.ip);
  res.redirect(`${volver}&entregado=1`);
});

module.exports = router;
