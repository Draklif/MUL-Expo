// =====================================================================
//  INKreible — el panel de la organización.
//
//  Las herramientas van en el orden en que se usan durante un semestre:
//
//    1. Abrir la edición (el botón que hace que todo lo demás empiece de
//       cero sin borrar lo del semestre pasado).
//    2. Poner el día del arranque: eso es lo que echa a andar el calendario
//       de la página pública y lo que destapa una palabra cada mañana.
//    3. Cargar las 28 palabras, de un tirón y con anticipación.
//    4. La carpeta de Drive y la nomenclatura, que es lo que se le manda a
//       cada quien al admitirlo.
//    5. Revisar inscripciones.
//    6. Cargar los dibujos pegando la lista de la carpeta.
//    7. Armar el podio y publicarlo.
//
//  Va con su propia contraseña y su propia sesión (lib/ink-auth.js): son los
//  mismos docentes de la Expo, del torneo y de la jam, pero son cuatro
//  herramientas.
// =====================================================================
const express = require("express");
const db = require("../db/database");
const ink = require("../lib/ink");
const envios = require("../lib/envios");
const periodos = require("../lib/periodos");
const { INK } = require("../config");
const { limpiarNombre } = require("../lib/listas");
const { partirDia, dia: diaDe } = require("../lib/fechas");
const { requireInk, verificar, configurado } = require("../lib/ink-auth");

const router = express.Router();

// Marco común de las pantallas del panel.
function marco(extra = {}) {
  return {
    css: "/ink.css",
    themeColor: "#f3ede1",
    tecnicas: ink.TECNICAS,
    categorias: ink.CATEGORIAS,
    diaDe,
    title: "Panel · INKreible",
    ...extra,
  };
}

// ---------------------------------------------------------------------
//  Acceso
// ---------------------------------------------------------------------
router.get("/acceso", (req, res) => {
  if (req.session.docenteInk) return res.redirect("/ink/panel");
  res.render(
    "ink/acceso",
    marco({ title: "Acceso · INKreible", error: null, email: "", configurado: configurado() })
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
      "ink/acceso",
      marco({
        title: "Acceso · INKreible",
        error,
        email: String(req.body.email || ""),
        configurado: configurado(),
      })
    );
  }

  req.session.docenteInk = docente;
  res.redirect("/ink/panel");
});

// Al salir se vuelve al sitio público del reto, no a la raíz: la raíz puede
// estar mostrando otro evento.
router.post("/salir", (req, res) => {
  delete req.session.docenteInk;
  res.redirect("/inkreible");
});

// El guardia se cuelga de /panel y no del router entero a propósito: este
// router se monta en /ink, que es también donde viven las páginas públicas del
// reto. Un `router.use(requireInk)` a secas mandaría al login a cualquiera que
// escribiera mal una dirección pública.
router.use("/panel", requireInk, (req, res, next) => {
  res.locals.periodoInk = periodos.activo();
  next();
});

// ---------------------------------------------------------------------
//  Portada del panel: las ediciones
// ---------------------------------------------------------------------
router.get("/panel", (req, res) => {
  const lista = ink.ediciones().map((e) => ({
    ...e,
    fase: ink.fase(e),
    cifras: ink.resumen(e.id),
  }));

  res.render(
    "ink/panel",
    marco({
      ediciones: lista,
      periodos: periodos.todos(),
      porDefecto: INK,
      aviso: req.query,
    })
  );
});

/**
 * Abrir la edición de un semestre. Este es EL botón de "pasar de semestre":
 * deja la anterior finalizada (con sus dibujos y su podio donde están) y abre
 * una nueva, vacía y con las inscripciones abiertas.
 */
router.post("/panel/ediciones", (req, res) => {
  const codigoNuevo = String(req.body.periodo_nuevo || "").trim();
  let periodo = null;

  if (codigoNuevo) {
    if (!periodos.codigoValido(codigoNuevo)) {
      return res.redirect("/ink/panel?error=periodo_formato");
    }
    periodo = periodos.porCodigo(codigoNuevo) || periodos.crear(codigoNuevo);
  } else {
    periodo = periodos.porId(req.body.periodo_id) || periodos.activo();
  }

  if (req.body.activar_periodo === "1" && periodo) periodos.activar(periodo.id);

  const nombre =
    limpiarNombre(req.body.nombre).slice(0, 80) ||
    `INKreible · ${periodo ? periodo.codigo : "sin semestre"}`;

  const edicion = ink.abrirEdicion({
    periodoId: periodo ? periodo.id : null,
    nombre,
    dias: req.body.dias,
    semanas: req.body.semanas,
    cupo: req.body.cupo,
    driveUrl: req.body.drive_url,
    nomenclatura: req.body.nomenclatura,
  });

  res.redirect(`/ink/panel/ediciones/${edicion.id}?abierta=1`);
});

// ---------------------------------------------------------------------
//  Una edición: la sala de control
// ---------------------------------------------------------------------
router.get("/panel/ediciones/:id", (req, res) => {
  const edicion = ink.edicion(req.params.id);
  if (!edicion) return res.redirect("/ink/panel");

  const todos = ink.participantes(edicion.id, null);

  // El resultado de la última lista pegada se guarda en la sesión y se lee una
  // sola vez: un redirect no puede llevar veinte líneas con sus problemas, y
  // dejarlo en la URL haría que recargar la página volviera a mostrarlo.
  const carga = req.session.inkCarga || null;
  delete req.session.inkCarga;

  res.render(
    "ink/edicion",
    marco({
      title: `${edicion.nombre} · Panel`,
      edicion,
      fase: ink.fase(edicion),
      palabras: ink.palabras(edicion.id, edicion),
      semanas: ink.semanasDe(edicion),
      pendientes: todos.filter((p) => p.estado === "pendiente"),
      admitidos: ink.tablaAvance(edicion.id, edicion),
      rechazados: todos.filter((p) => p.estado === "rechazado"),
      sinEnlace: todos.filter((p) => p.estado === "aprobado" && !p.drive_enviado_at).length,
      podio: ink.premios(edicion.id),
      cifras: ink.resumen(edicion.id),
      correoActivo: envios.activo(),
      carga,
      aviso: req.query,
    })
  );
});

// El cronograma: qué día arranca y de cuántos días es. Es lo único que decide
// en qué día del reto está la página pública y qué palabra se ve hoy.
router.post("/panel/ediciones/:id/cronograma", (req, res) => {
  const edicion = ink.edicion(req.params.id);
  if (!edicion) return res.redirect("/ink/panel");

  const inicio = partirDia(req.body.inicio);
  const dias = Math.max(1, Math.min(365, Number(req.body.dias) || edicion.dias));
  const semanas = Math.max(1, Math.min(dias, Number(req.body.semanas) || edicion.semanas));

  db.prepare("UPDATE ink_ediciones SET inicio = ?, dias = ?, semanas = ? WHERE id = ?").run(
    inicio ? inicio.fecha : null,
    dias,
    semanas,
    edicion.id
  );

  res.redirect(`/ink/panel/ediciones/${edicion.id}?ok=1#cronograma`);
});

// Las palabras, todas de una. Se puede volver a pegar la lista cuantas veces
// haga falta: lo que se manda reemplaza a lo que había.
router.post("/panel/ediciones/:id/palabras", (req, res) => {
  const edicion = ink.edicion(req.params.id);
  if (!edicion) return res.redirect("/ink/panel");

  const escritas = ink.guardarPalabras(edicion.id, req.body.palabras, edicion);
  res.redirect(`/ink/panel/ediciones/${edicion.id}?palabras=${escritas}#palabras`);
});

/**
 * Publicar (o volver a esconder) la lista completa.
 *
 * Sin esto, cada palabra se destapa sola el día que le toca, que es como
 * corre el reto. Con esto se ven las 28 desde el primer día, que es como
 * funciona el inktober original: son dos maneras de jugarlo y la decisión es
 * de la organización, no del código.
 */
router.post("/panel/ediciones/:id/lista", (req, res) => {
  const edicion = ink.edicion(req.params.id);
  if (!edicion) return res.redirect("/ink/panel");

  db.prepare("UPDATE ink_ediciones SET lista_publica = ? WHERE id = ?").run(
    req.body.publicar === "1" ? 1 : 0,
    edicion.id
  );

  res.redirect(`/ink/panel/ediciones/${edicion.id}?ok=1#palabras`);
});

// La carpeta y el nombre de los archivos: lo que recibe cada quien al ser
// admitido y lo único que necesita para participar.
router.post("/panel/ediciones/:id/carpeta", (req, res) => {
  const edicion = ink.edicion(req.params.id);
  if (!edicion) return res.redirect("/ink/panel");

  const url = String(req.body.drive_url || "").trim().slice(0, 500);
  if (url && !/^https?:\/\//i.test(url)) {
    return res.redirect(`/ink/panel/ediciones/${edicion.id}?error=enlace#carpeta`);
  }

  db.prepare("UPDATE ink_ediciones SET drive_url = ?, nomenclatura = ? WHERE id = ?").run(
    url || null,
    String(req.body.nomenclatura || "").trim().slice(0, 80) || INK.nomenclatura,
    edicion.id
  );

  res.redirect(`/ink/panel/ediciones/${edicion.id}?ok=1#carpeta`);
});

/**
 * Mandar el enlace de la carpeta a los admitidos que todavía no lo tienen.
 *
 * Existe porque el orden real casi nunca es el del manual: primero se admite a
 * la gente y días después alguien arma la carpeta del semestre. `drive_enviado_at`
 * es lo que evita que a la misma persona le llegue dos veces.
 */
router.post("/panel/ediciones/:id/enviar-enlace", async (req, res) => {
  const edicion = ink.edicion(req.params.id);
  if (!edicion) return res.redirect("/ink/panel");

  const volver = `/ink/panel/ediciones/${edicion.id}`;
  if (!edicion.drive_url) return res.redirect(`${volver}?error=sin_carpeta#carpeta`);

  // A todos o solo a los que no lo han recibido. Lo segundo es lo normal; lo
  // primero sirve el día que cambia el enlace de la carpeta.
  const todos = req.body.todos === "1";
  const gente = db
    .prepare(
      `SELECT * FROM ink_participantes
        WHERE edicion_id = ? AND estado = 'aprobado' ${todos ? "" : "AND drive_enviado_at IS NULL"}`
    )
    .all(edicion.id);

  const base = envios.urlBase(req);
  const marcar = db.prepare("UPDATE ink_participantes SET drive_enviado_at = CURRENT_TIMESTAMP WHERE id = ?");

  let enviados = 0;
  let fallaron = 0;
  for (const persona of gente) {
    const ok = await envios.inkAvisoEnlace(
      {
        nombre: persona.nombre,
        email: persona.email,
        codigo: persona.codigo,
        drive: edicion.drive_url,
        ejemplo: `${ink.nombreArchivo(edicion, { codigo: persona.codigo, dia: 7, tecnica: "digital" })}.jpg`,
        dias: edicion.dias,
      },
      base
    );
    if (ok) {
      marcar.run(persona.id);
      enviados++;
    } else {
      fallaron++;
    }
  }

  res.redirect(`${volver}?enviados=${enviados}&fallaron=${fallaron}#carpeta`);
});

// ---------------------------------------------------------------------
//  Inscripciones
// ---------------------------------------------------------------------
router.post("/panel/participantes/:id/revisar", (req, res) => {
  const persona = ink.participante(req.params.id);
  if (!persona) return res.redirect("/ink/panel");

  const edicion = ink.edicion(persona.edicion_id);
  const estado = req.body.estado === "aprobado" ? "aprobado" : "rechazado";
  const nota = String(req.body.nota_docente || "").trim().slice(0, 400) || null;
  const admitido = estado === "aprobado";

  // El enlace se da por entregado solo si de verdad va en el correo: si la
  // carpeta todavía no existe, esta persona queda en la lista de los que hay
  // que avisar cuando esté.
  db.prepare(
    `UPDATE ink_participantes
        SET estado = ?, nota_docente = ?, revisado_por = ?, revisado_at = CURRENT_TIMESTAMP,
            drive_enviado_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE drive_enviado_at END
      WHERE id = ?`
  ).run(
    estado,
    nota,
    req.session.docenteInk.id,
    admitido && edicion && edicion.drive_url ? 1 : 0,
    persona.id
  );

  const f = ink.fase(edicion);
  envios.inkAvisoRevision(
    {
      codigo: persona.codigo,
      nombre: persona.nombre,
      email: persona.email,
      estado,
      nota_docente: nota,
      drive: edicion ? edicion.drive_url : null,
      ejemplo: `${ink.nombreArchivo(edicion, { codigo: persona.codigo, dia: 7, tecnica: "digital" })}.jpg`,
      dias: edicion ? edicion.dias : ink.DIAS,
      cuando: f.momento_inicio ? f.momento_inicio.dia : null,
    },
    envios.urlBase(req)
  );

  res.redirect(`/ink/panel/ediciones/${persona.edicion_id}?revisado=1#inscripciones`);
});

router.post("/panel/participantes/:id/borrar", (req, res) => {
  const persona = ink.participante(req.params.id);
  if (!persona) return res.redirect("/ink/panel");

  // Con los dibujos se va también lo que hayan ganado: son suyos, y un podio
  // que apunte a alguien que ya no está no le sirve a nadie (de eso se encarga
  // el ON DELETE CASCADE del esquema).
  db.prepare("DELETE FROM ink_participantes WHERE id = ?").run(persona.id);
  res.redirect(`/ink/panel/ediciones/${persona.edicion_id}?borrado=1#inscripciones`);
});

// ---------------------------------------------------------------------
//  Dibujos
// ---------------------------------------------------------------------
/**
 * La lista pegada de la carpeta. Es la herramienta que hace viable el reto:
 * son 28 dibujos por persona y nadie va a teclear eso a mano.
 *
 * Lo que no se entiende no se descarta en silencio: vuelve a la pantalla con
 * el motivo de cada línea, casi siempre un archivo mal nombrado en el Drive.
 */
router.post("/panel/ediciones/:id/dibujos", (req, res) => {
  const edicion = ink.edicion(req.params.id);
  if (!edicion) return res.redirect("/ink/panel");

  const filas = ink.dibujosDesdePegado(req.body.lista, edicion);
  const resultado = ink.cargarDibujos(edicion.id, filas, edicion);

  req.session.inkCarga = {
    guardados: resultado.guardados,
    // Veinte problemas ya son suficientes para entender qué está pasando; si
    // son doscientos, el nombre de archivo está mal en todos y se arregla en
    // el Drive, no leyéndolos uno por uno.
    problemas: resultado.problemas.slice(0, 20),
    total: filas.length,
    descartadas: resultado.problemas.length,
  };

  res.redirect(`/ink/panel/ediciones/${edicion.id}#dibujos`);
});

// Un dibujo suelto: la corrección de una fila que quedó mal, sin volver a
// pegar la lista entera.
router.post("/panel/ediciones/:id/dibujo", (req, res) => {
  const edicion = ink.edicion(req.params.id);
  if (!edicion) return res.redirect("/ink/panel");

  const volver = `/ink/panel/ediciones/${edicion.id}`;
  const persona = ink.participantePorCodigo(req.body.codigo);
  const dia = Number(req.body.dia);
  const url = String(req.body.url || "").trim();

  if (!persona || persona.edicion_id !== edicion.id || persona.estado !== "aprobado") {
    return res.redirect(`${volver}?error=sin_persona#dibujos`);
  }
  if (!dia || dia < 1 || dia > edicion.dias) return res.redirect(`${volver}?error=dia#dibujos`);
  if (!/^https?:\/\//i.test(url)) return res.redirect(`${volver}?error=enlace#dibujos`);

  ink.guardarDibujo({
    edicionId: edicion.id,
    participanteId: persona.id,
    dia,
    tecnica: req.body.tecnica,
    url,
    titulo: req.body.titulo,
  });

  res.redirect(`${volver}?ok=1#dibujos`);
});

router.post("/panel/dibujos/:id/borrar", (req, res) => {
  const d = db.prepare("SELECT * FROM ink_dibujos WHERE id = ?").get(Number(req.params.id));
  if (!d) return res.redirect("/ink/panel");

  db.prepare("DELETE FROM ink_dibujos WHERE id = ?").run(d.id);
  res.redirect(`/ink/panel/ediciones/${d.edicion_id}?borrado=1#dibujos`);
});

// ---------------------------------------------------------------------
//  El podio
// ---------------------------------------------------------------------
/**
 * Guardar un ganador. Se dicta como se dicta en una reunión de jurado —"el de
 * Ana del día doce"—, así que el formulario pide el código de la persona y el
 * día, no un identificador que nadie tiene a la vista.
 */
router.post("/panel/ediciones/:id/premios", (req, res) => {
  const edicion = ink.edicion(req.params.id);
  if (!edicion) return res.redirect("/ink/panel");

  const volver = `/ink/panel/ediciones/${edicion.id}`;
  const tipo = req.body.tipo;
  if (!ink.CATEGORIAS[tipo]) return res.redirect(`${volver}?error=premio#podio`);

  const dibujo = ink.dibujoPorCodigoYDia(edicion.id, req.body.codigo, req.body.dia);
  if (!dibujo) return res.redirect(`${volver}?error=sin_dibujo#podio`);

  ink.guardarPremio({
    edicionId: edicion.id,
    tipo,
    semana: req.body.semana,
    puesto: req.body.puesto,
    dibujoId: dibujo.id,
    nota: req.body.nota,
  });

  res.redirect(`${volver}?ok=1#podio`);
});

router.post("/panel/premios/:id/borrar", (req, res) => {
  const p = db.prepare("SELECT * FROM ink_premios WHERE id = ?").get(Number(req.params.id));
  if (!p) return res.redirect("/ink/panel");

  db.prepare("DELETE FROM ink_premios WHERE id = ?").run(p.id);
  res.redirect(`/ink/panel/ediciones/${p.edicion_id}?borrado=1#podio`);
});

// El correo del podio, a cada quien con lo que ganó. Se manda cuando la
// organización quiere y solo si el podio ya está publicado: nadie se entera
// por correo de un resultado que todavía no está en la página.
router.post("/panel/ediciones/:id/avisar-podio", async (req, res) => {
  const edicion = ink.edicion(req.params.id);
  if (!edicion) return res.redirect("/ink/panel");

  const volver = `/ink/panel/ediciones/${edicion.id}`;
  if (!ink.podioPublico(edicion)) return res.redirect(`${volver}?error=sin_publicar#podio`);

  // Alguien puede haber ganado su semana y estar en el top: le llega un solo
  // correo con las dos cosas, no dos correos.
  const porPersona = new Map();
  const podio = ink.premios(edicion.id);
  for (const tipo of Object.keys(podio)) {
    for (const premio of podio[tipo]) {
      const actual = porPersona.get(premio.participante_id) || {
        nombre: premio.autor,
        id: premio.participante_id,
        reconocimientos: [],
      };
      actual.reconocimientos.push(ink.etiquetaPremio(premio));
      porPersona.set(premio.participante_id, actual);
    }
  }

  const base = envios.urlBase(req);
  let enviados = 0;
  let fallaron = 0;

  for (const persona of porPersona.values()) {
    const ficha = ink.participante(persona.id);
    if (!ficha) continue;
    const ok = await envios.inkAvisoPremio(
      { nombre: ficha.nombre, email: ficha.email, reconocimientos: persona.reconocimientos },
      base
    );
    if (ok) enviados++;
    else fallaron++;
  }

  res.redirect(`${volver}?avisados=${enviados}&fallaron=${fallaron}#podio`);
});

// ---------------------------------------------------------------------
//  Ajustes de la edición
// ---------------------------------------------------------------------
router.post("/panel/ediciones/:id/estado", (req, res) => {
  const edicion = ink.edicion(req.params.id);
  if (!edicion) return res.redirect("/ink/panel");

  const estados = ["inscripcion", "en_curso", "finalizada"];
  const estado = estados.includes(req.body.estado) ? req.body.estado : null;

  db.prepare(
    `UPDATE ink_ediciones
        SET estado = COALESCE(?, estado), inscripcion_abierta = ?, cupo = ?,
            galeria_publica = ?, resultados_publicos = ?
      WHERE id = ?`
  ).run(
    estado,
    req.body.inscripcion_abierta === "1" ? 1 : 0,
    Number(req.body.cupo) || null,
    req.body.galeria_publica === "1" ? 1 : 0,
    req.body.resultados_publicos === "1" ? 1 : 0,
    edicion.id
  );

  res.redirect(`/ink/panel/ediciones/${edicion.id}?ok=1#ajustes`);
});

router.post("/panel/ediciones/:id/borrar", (req, res) => {
  const edicion = ink.edicion(req.params.id);
  if (!edicion) return res.redirect("/ink/panel");

  // Una edición con gente inscrita no se borra de un clic: son cuatro semanas
  // de dibujos y no hay forma de deshacerlo.
  const cifras = ink.resumen(edicion.id);
  if (cifras.inscritos + cifras.pendientes > 0) {
    return res.redirect(`/ink/panel/ediciones/${edicion.id}?error=con_gente`);
  }

  db.prepare("DELETE FROM ink_ediciones WHERE id = ?").run(edicion.id);
  res.redirect("/ink/panel?borrada=1");
});

module.exports = router;
