// =====================================================================
//  Jam de Altura — el panel de la organización.
//
//  Las herramientas son cinco y se usan en este orden:
//
//    1. Abrir la edición del semestre (el botón que hace que todo lo demás
//       empiece de cero sin borrar lo del semestre pasado).
//    2. Poner el día y la hora del arranque: eso es lo que echa a andar el
//       reloj de la página pública.
//    3. Revisar las inscripciones y armar equipos con los que se apuntaron
//       solos.
//    4. Revelar el tema. Es un botón grande y aparte a propósito.
//    5. El tablón: avisos que salen en la página mientras corre la jam.
//
//  Va con su propia contraseña y su propia sesión (lib/jam-auth.js): son los
//  mismos docentes de la Expo y del torneo, pero son tres herramientas.
// =====================================================================
const express = require("express");
const db = require("../db/database");
const jam = require("../lib/jam");
const envios = require("../lib/envios");
const periodos = require("../lib/periodos");
const { JAM } = require("../config");
const { limpiarNombre } = require("../lib/listas");
const { desdeInput, paraInput, sumarHoras, momento } = require("../lib/fechas");
const { requireJam, verificar, configurado } = require("../lib/jam-auth");

const router = express.Router();

// Marco común de las pantallas del panel.
function marco(extra = {}) {
  return {
    css: "/jam.css",
    themeColor: "#10091f",
    disciplinas: jam.DISCIPLINAS,
    momentoDe: momento,
    paraInput,
    title: "Panel · Jam de Altura",
    ...extra,
  };
}

// ---------------------------------------------------------------------
//  Acceso
// ---------------------------------------------------------------------
router.get("/acceso", (req, res) => {
  if (req.session.docenteJam) return res.redirect("/jam/panel");
  res.render(
    "jam/acceso",
    marco({ title: "Acceso · Jam de Altura", error: null, email: "", configurado: configurado() })
  );
});

router.post("/acceso", (req, res) => {
  const { docente, error, status } = verificar({
    email: req.body.email,
    password: req.body.password,
    ip: req.ip,
  });

  if (error) {
    return res.status(status).render(
      "jam/acceso",
      marco({
        title: "Acceso · Jam de Altura",
        error,
        email: String(req.body.email || ""),
        configurado: configurado(),
      })
    );
  }

  req.session.docenteJam = docente;
  res.redirect("/jam/panel");
});

// Al salir se vuelve al sitio público de la jam, no a la raíz: la raíz puede
// estar mostrando otro evento.
router.post("/salir", (req, res) => {
  delete req.session.docenteJam;
  res.redirect("/jam-de-altura");
});

// El guardia se cuelga de /panel y no del router entero a propósito: este
// router se monta en /jam, que es también donde viven las páginas públicas de
// la jam. Un `router.use(requireJam)` a secas mandaría al login a cualquiera
// que escribiera mal una dirección pública.
router.use("/panel", requireJam, (req, res, next) => {
  res.locals.periodoJam = periodos.activo();
  next();
});

// ---------------------------------------------------------------------
//  Portada del panel: las ediciones
// ---------------------------------------------------------------------
router.get("/panel", (req, res) => {
  const lista = jam.ediciones().map((e) => ({
    ...e,
    fase: jam.fase(e),
    cifras: jam.resumen(e.id),
  }));

  res.render(
    "jam/panel",
    marco({
      ediciones: lista,
      // Para el formulario de "abrir edición": los semestres que ya existen y
      // el que está activo, que es el que viene propuesto.
      periodos: periodos.todos(),
      porDefecto: JAM,
      aviso: req.query,
    })
  );
});

/**
 * Abrir la edición de un semestre. Este es EL botón de "pasar de semestre":
 *
 *   - si se escribió un código de semestre nuevo, lo crea;
 *   - si se marcó, lo deja como el semestre activo del programa (que es el
 *     mismo que usan la Expo y el torneo: uno solo para todo el sitio);
 *   - deja la edición anterior finalizada y abre una nueva, vacía y con las
 *     inscripciones abiertas.
 *
 * Con eso la jam del semestre siguiente queda lista para recibir inscripciones
 * sin tocar nada más, y la del semestre pasado se queda donde estaba, con sus
 * equipos y sus juegos.
 */
router.post("/panel/ediciones", (req, res) => {
  const codigoNuevo = String(req.body.periodo_nuevo || "").trim();
  let periodo = null;

  if (codigoNuevo) {
    if (!periodos.codigoValido(codigoNuevo)) {
      return res.redirect("/jam/panel?error=periodo_formato");
    }
    periodo = periodos.porCodigo(codigoNuevo) || periodos.crear(codigoNuevo);
  } else {
    periodo = periodos.porId(req.body.periodo_id) || periodos.activo();
  }

  if (req.body.activar_periodo === "1" && periodo) periodos.activar(periodo.id);

  const nombre =
    limpiarNombre(req.body.nombre).slice(0, 80) ||
    `Jam de Altura · ${periodo ? periodo.codigo : "sin semestre"}`;

  const edicion = jam.abrirEdicion({
    periodoId: periodo ? periodo.id : null,
    nombre,
    horas: req.body.horas,
    maxIntegrantes: req.body.max_integrantes,
    cupoEquipos: req.body.cupo_equipos,
  });

  res.redirect(`/jam/panel/ediciones/${edicion.id}?abierta=1`);
});

// ---------------------------------------------------------------------
//  Una edición: la sala de control
// ---------------------------------------------------------------------
router.get("/panel/ediciones/:id", (req, res) => {
  const edicion = jam.edicion(req.params.id);
  if (!edicion) return res.redirect("/jam/panel");

  const todos = jam.equiposDe(edicion.id, null);

  res.render(
    "jam/edicion",
    marco({
      title: `${edicion.nombre} · Panel`,
      edicion,
      fase: jam.fase(edicion),
      cierre: sumarHoras(edicion.inicio, edicion.horas),
      pendientes: todos.filter((e) => e.estado === "pendiente"),
      aprobados: todos.filter((e) => e.estado === "aprobado"),
      rechazados: todos.filter((e) => e.estado === "rechazado"),
      libres: jam.solistas(edicion.id),
      mezclaLibres: jam.porDisciplina(edicion.id, true),
      anuncios: jam.anuncios(edicion.id, 30),
      cifras: jam.resumen(edicion.id),
      correoActivo: envios.activo(),
      aviso: req.query,
    })
  );
});

// El cronograma: cuándo arranca y cuántas horas dura. Es lo único que decide
// lo que muestra el reloj de la página pública.
router.post("/panel/ediciones/:id/cronograma", (req, res) => {
  const edicion = jam.edicion(req.params.id);
  if (!edicion) return res.redirect("/jam/panel");

  const horas = Math.max(1, Math.min(240, Number(req.body.horas) || JAM.horas));

  db.prepare("UPDATE jam_ediciones SET inicio = ?, horas = ? WHERE id = ?").run(
    desdeInput(req.body.inicio),
    horas,
    edicion.id
  );

  res.redirect(`/jam/panel/ediciones/${edicion.id}?ok=1#cronograma`);
});

// Inscripciones, entregas y estado general.
router.post("/panel/ediciones/:id/estado", (req, res) => {
  const edicion = jam.edicion(req.params.id);
  if (!edicion) return res.redirect("/jam/panel");

  const estados = ["inscripcion", "en_curso", "finalizada"];
  const estado = estados.includes(req.body.estado) ? req.body.estado : null;

  db.prepare(
    `UPDATE jam_ediciones
        SET estado = COALESCE(?, estado), inscripcion_abierta = ?, entregas_abiertas = ?,
            cupo_equipos = ?, max_integrantes = ?
      WHERE id = ?`
  ).run(
    estado,
    req.body.inscripcion_abierta === "1" ? 1 : 0,
    req.body.entregas_abiertas === "1" ? 1 : 0,
    Number(req.body.cupo_equipos) || null,
    Math.max(1, Math.min(8, Number(req.body.max_integrantes) || edicion.max_integrantes)),
    edicion.id
  );

  res.redirect(`/jam/panel/ediciones/${edicion.id}?ok=1#ajustes`);
});

// El tema se guarda escondido: escribirlo NO lo publica.
router.post("/panel/ediciones/:id/tema", (req, res) => {
  const edicion = jam.edicion(req.params.id);
  if (!edicion) return res.redirect("/jam/panel");

  db.prepare("UPDATE jam_ediciones SET tema = ? WHERE id = ?").run(
    String(req.body.tema || "").trim().slice(0, 160) || null,
    edicion.id
  );

  res.redirect(`/jam/panel/ediciones/${edicion.id}?ok=1#tema`);
});

/**
 * Revelar (o volver a esconder) el tema. Es el botón grande de la jam: hasta
 * que no se aprieta, el tema no sale del servidor ni escondido en el HTML.
 *
 * Avisar por correo es un paso aparte y explícito, como el de los certificados
 * de la Expo: revelar el tema en la página es instantáneo y no puede quedarse
 * esperando a que Gmail acepte cuarenta correos.
 */
router.post("/panel/ediciones/:id/revelar", (req, res) => {
  const edicion = jam.edicion(req.params.id);
  if (!edicion) return res.redirect("/jam/panel");

  if (!edicion.tema && req.body.revelar === "1") {
    return res.redirect(`/jam/panel/ediciones/${edicion.id}?error=sin_tema#tema`);
  }

  db.prepare("UPDATE jam_ediciones SET tema_revelado = ? WHERE id = ?").run(
    req.body.revelar === "1" ? 1 : 0,
    edicion.id
  );

  res.redirect(`/jam/panel/ediciones/${edicion.id}?${req.body.revelar === "1" ? "revelado" : "escondido"}=1#tema`);
});

// El correo del tema, a todos los inscritos de la edición. Se manda cuando la
// organización quiere, y solo si el tema ya está revelado: nadie puede
// filtrarlo por correo antes de tiempo.
router.post("/panel/ediciones/:id/avisar-tema", async (req, res) => {
  const edicion = jam.edicion(req.params.id);
  if (!edicion) return res.redirect("/jam/panel");

  const volver = `/jam/panel/ediciones/${edicion.id}`;
  if (!edicion.tema || !edicion.tema_revelado) {
    return res.redirect(`${volver}?error=sin_revelar#tema`);
  }

  const cierre = momento(sumarHoras(edicion.inicio, edicion.horas));
  const base = envios.urlBase(req);

  // Solo a quien está adentro de verdad: los equipos aprobados y quienes
  // siguen esperando equipo. A un equipo rechazado no se le manda el tema.
  const gente = db
    .prepare(
      `SELECT i.nombre, i.email
         FROM jam_integrantes i
         LEFT JOIN jam_equipos e ON e.id = i.equipo_id
        WHERE i.edicion_id = ? AND (i.equipo_id IS NULL OR e.estado = 'aprobado')`
    )
    .all(edicion.id);

  let enviados = 0;
  let fallaron = 0;
  for (const persona of gente) {
    const ok = await envios.jamAvisoTema(
      {
        nombre: persona.nombre,
        email: persona.email,
        tema: edicion.tema,
        cierre: cierre ? `${cierre.dia}, ${cierre.hora}` : null,
      },
      base
    );
    if (ok) enviados++;
    else fallaron++;
  }

  res.redirect(`${volver}?avisados=${enviados}&fallaron=${fallaron}#tema`);
});

router.post("/panel/ediciones/:id/borrar", (req, res) => {
  const edicion = jam.edicion(req.params.id);
  if (!edicion) return res.redirect("/jam/panel");

  // Una edición con equipos inscritos no se borra de un clic: eso es el
  // trabajo de un semestre entero y no hay forma de deshacerlo.
  if (jam.resumen(edicion.id).personas > 0) {
    return res.redirect(`/jam/panel/ediciones/${edicion.id}?error=con_gente`);
  }

  db.prepare("DELETE FROM jam_ediciones WHERE id = ?").run(edicion.id);
  res.redirect("/jam/panel?borrada=1");
});

// ---------------------------------------------------------------------
//  Inscripciones
// ---------------------------------------------------------------------
router.post("/panel/equipos/:id/revisar", (req, res) => {
  const equipo = jam.equipo(req.params.id);
  if (!equipo) return res.redirect("/jam/panel");

  const estado = req.body.estado === "aprobado" ? "aprobado" : "rechazado";
  const nota = String(req.body.nota_docente || "").trim().slice(0, 400) || null;

  db.prepare(
    `UPDATE jam_equipos
        SET estado = ?, nota_docente = ?, revisado_por = ?, revisado_at = CURRENT_TIMESTAMP
      WHERE id = ?`
  ).run(estado, nota, req.session.docenteJam.id, equipo.id);

  envios.jamAvisoRevision(
    {
      codigo: equipo.codigo,
      nombre: equipo.contacto_nombre,
      email: equipo.contacto_email,
      equipo: equipo.nombre,
      estado,
      nota_docente: nota,
    },
    envios.urlBase(req)
  );

  res.redirect(`/jam/panel/ediciones/${equipo.edicion_id}?revisado=1#inscripciones`);
});

/**
 * Armar un equipo con los que se inscribieron solos.
 *
 * El panel muestra al lado de cada uno su disciplina justamente para esto: la
 * gracia de la jam es que el equipo sea interdisciplinar, y eso no lo puede
 * decidir un algoritmo que no conoce a nadie. La herramienta ordena la
 * información; quien reparte es el docente.
 */
router.post("/panel/ediciones/:id/armar", (req, res) => {
  const edicion = jam.edicion(req.params.id);
  if (!edicion) return res.redirect("/jam/panel");

  const ids = [].concat(req.body.integrante || []).map(Number).filter(Boolean);
  const nombre = limpiarNombre(req.body.nombre).slice(0, 40);

  const volver = `/jam/panel/ediciones/${edicion.id}`;
  if (!nombre || ids.length < 2) return res.redirect(`${volver}?error=armar#libres`);

  // Solo se pueden usar los que siguen libres en ESTA edición: si alguien ya
  // fue asignado desde otra pestaña, se queda donde está.
  const libres = jam.solistas(edicion.id).filter((i) => ids.includes(i.id));
  if (libres.length < 2) return res.redirect(`${volver}?error=armar#libres`);

  const elegidos = libres.slice(0, edicion.max_integrantes);
  const codigo = jam.codigoLibre();
  let equipoId;

  db.exec("BEGIN");
  try {
    const info = db
      .prepare(
        `INSERT INTO jam_equipos
           (edicion_id, codigo, nombre, estado, armado, contacto_nombre, contacto_email,
            revisado_por, revisado_at)
         VALUES (?, ?, ?, 'aprobado', 1, ?, ?, ?, CURRENT_TIMESTAMP)`
      )
      .run(edicion.id, codigo, nombre, elegidos[0].nombre, elegidos[0].email, req.session.docenteJam.id);
    equipoId = info.lastInsertRowid;

    // El primero de la lista queda de líder. El código individual NO se borra:
    // es el que esa persona anotó al inscribirse y el único que conoce, así
    // que tiene que seguir sirviéndole para consultar.
    const asignar = db.prepare(
      "UPDATE jam_integrantes SET equipo_id = ?, lider = ?, orden = ? WHERE id = ?"
    );
    elegidos.forEach((i, n) => asignar.run(equipoId, n === 0 ? 1 : 0, n, i.id));

    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  // Cada uno se entera de con quién le tocó.
  const base = envios.urlBase(req);
  for (const persona of elegidos) {
    envios.jamAvisoEquipoArmado(
      {
        nombre: persona.nombre,
        email: persona.email,
        equipo: nombre,
        codigo,
        companeros: elegidos.filter((o) => o.id !== persona.id).map((o) => o.nombre),
        equipoId,
      },
      base
    );
  }

  res.redirect(`${volver}?armado=${elegidos.length}#equipos`);
});

router.post("/panel/equipos/:id/borrar", (req, res) => {
  const equipo = jam.equipo(req.params.id);
  if (!equipo) return res.redirect("/jam/panel");

  // Los integrantes no se borran con el equipo: vuelven a la bolsa de libres
  // (equipo_id queda en NULL por el ON DELETE SET NULL) y se les puede
  // reasignar sin pedirles que se inscriban otra vez.
  db.prepare("DELETE FROM jam_equipos WHERE id = ?").run(equipo.id);
  res.redirect(`/jam/panel/ediciones/${equipo.edicion_id}?borrado=1#equipos`);
});

// Sacar a alguien de su equipo y devolverlo a la bolsa de libres. Pasa cada
// edición: alguien se retira dos días antes y su equipo queda de tres.
router.post("/panel/integrantes/:id/liberar", (req, res) => {
  const persona = db
    .prepare("SELECT * FROM jam_integrantes WHERE id = ?")
    .get(Number(req.params.id));
  if (!persona) return res.redirect("/jam/panel");

  db.prepare("UPDATE jam_integrantes SET equipo_id = NULL, lider = 0, orden = 0 WHERE id = ?").run(
    persona.id
  );

  res.redirect(`/jam/panel/ediciones/${persona.edicion_id}?liberado=1#libres`);
});

// ---------------------------------------------------------------------
//  Tablón de anuncios
// ---------------------------------------------------------------------
router.post("/panel/ediciones/:id/anuncios", (req, res) => {
  const edicion = jam.edicion(req.params.id);
  if (!edicion) return res.redirect("/jam/panel");

  const texto = String(req.body.texto || "").trim().slice(0, 400);
  const tipo = jam.TIPOS_ANUNCIO[req.body.tipo] ? req.body.tipo : "aviso";

  if (texto) {
    // La hora se guarda en LOCAL y no con CURRENT_TIMESTAMP, que en SQLite es
    // UTC: la del tablón es la única fecha de la base que se muestra tal cual,
    // y un aviso publicado a la una de la tarde no puede salir diciendo que
    // son las seis.
    db.prepare(
      "INSERT INTO jam_anuncios (edicion_id, texto, tipo, created_at) VALUES (?, ?, ?, datetime('now', 'localtime'))"
    ).run(edicion.id, texto, tipo);
  }

  res.redirect(`/jam/panel/ediciones/${edicion.id}?ok=1#tablon`);
});

router.post("/panel/anuncios/:id/borrar", (req, res) => {
  const anuncio = db.prepare("SELECT * FROM jam_anuncios WHERE id = ?").get(Number(req.params.id));
  if (!anuncio) return res.redirect("/jam/panel");

  db.prepare("DELETE FROM jam_anuncios WHERE id = ?").run(anuncio.id);
  res.redirect(`/jam/panel/ediciones/${anuncio.edicion_id}?ok=1#tablon`);
});

module.exports = router;
