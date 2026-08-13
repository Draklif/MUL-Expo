// El .env se lee antes que nada: de ahí salen las credenciales del correo y
// los módulos de abajo ya preguntan por esas variables al cargarse.
require("./lib/entorno").cargarEnv();

const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const path = require("path");

const db = require("./db/database");
const { CRITERIOS, CRITERIOS_IND, ESCALA_MAX, PASSWORD, PATROCINIOS, PERIODO } = require("./config");
const { contenidoEvento } = require("./lib/contenido");
const eventos = require("./lib/eventos");
const { aprobado } = require("./lib/aprobado");
const { DOMINIO, PATRON_HTML } = require("./lib/correos");

const authRouter = require("./routes/auth");
const materiasRouter = require("./routes/materias");
const proyectosRouter = require("./routes/proyectos");
const apiRouter = require("./routes/api");
const registroRouter = require("./routes/registro");
const patrociniosRouter = require("./routes/patrocinios");
const certificadosRouter = require("./routes/certificados");
const vcRouter = require("./routes/vc");
const vcPanelRouter = require("./routes/vc-panel");
const jamRouter = require("./routes/jam");
const jamPanelRouter = require("./routes/jam-panel");
const musicRouter = require("./routes/music");
const musicPanelRouter = require("./routes/music-panel");
const salidasRouter = require("./routes/salidas");
const salidasPanelRouter = require("./routes/salidas-panel");
const inkRouter = require("./routes/ink");
const inkPanelRouter = require("./routes/ink-panel");
const samiRouter = require("./routes/sami");
const samiPanelRouter = require("./routes/sami-panel");
const infoRouter = require("./routes/info");
const { conPeriodo } = require("./lib/periodos");
const envios = require("./lib/envios");
const { configurado: vcConfigurado } = require("./lib/vc-auth");
const { configurado: jamConfigurado } = require("./lib/jam-auth");
const { configurado: musicConfigurado } = require("./lib/music-auth");
const { configurado: salidasConfigurado } = require("./lib/salidas-auth");
const { configurado: inkConfigurado } = require("./lib/ink-auth");
const { configurado: samiConfigurado } = require("./lib/sami-auth");

// Sin contraseña no entra ningún docente. Mejor decirlo aquí y de frente que
// dejar un login que rechaza a todo el mundo sin explicar por qué.
if (!PASSWORD) {
  console.error("\n  ✕ Falta PASSWORD_DOCENTES en el .env.");
  console.error("    Es la contraseña compartida de los docentes: sin ella nadie entra al panel.");
  console.error("    Copia .env.example como .env y llénalo.\n");
  process.exit(1);
}

// Firma las cookies de sesión. Si no está en el .env se inventa una al
// arrancar: la app funciona igual, pero cada reinicio cierra las sesiones
// abiertas. Lo que no puede es ser un texto fijo en el código —con la clave a
// la vista en el repositorio, cualquiera se fabrica la cookie de un docente y
// entra sin contraseña—.
const SESION_SECRETO = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

const app = express();

// Detrás de ngrok (o de cualquier túnel) todas las peticiones llegan desde
// 127.0.0.1: sin esto, los frenos por IP tratarían al mundo entero como un
// solo visitante.
app.set("trust proxy", true);

// ---------- Vistas ----------
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ---------- Middlewares ----------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: SESION_SECRETO,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }, // 1 día
  })
);

// Variables globales para las vistas
app.use((req, res, next) => {
  // La lista de eventos se resuelve en cada petición y no al arrancar: así el
  // día que cambie el vigente, el sitio se acomoda solo sin reiniciar.
  const vigente = eventos.activo();
  res.locals.EVENTOS = eventos.EVENTOS.map((e) => ({ ...e, url: eventos.url(e, vigente) }));

  // Quiénes somos, para el pie de cualquier página. Salen del contenido del
  // evento vigente y no de una constante en el código porque el JSON de cada
  // evento puede decirlo a su manera; una vista que traiga el suyo lo pisa,
  // que es lo que pasa en las landings. Sin evento del semestre no hay JSON
  // que preguntar y contenidoDe devuelve la plantilla vacía, que ya trae el
  // nombre del programa y el de la universidad.
  const marca = eventos.contenidoDe(vigente && vigente.slug);
  res.locals.programa = marca.programa;
  res.locals.institucion = marca.institucion;

  res.locals.docente = req.session.docente || null;
  // Cada herramienta tiene su propia sesión: sirve para que el pie de cada
  // sitio público ofrezca "ir al panel" a quien ya entró y "acceso" al resto.
  res.locals.docenteVC = req.session.docenteVC || null;
  res.locals.docenteJam = req.session.docenteJam || null;
  res.locals.docenteMusic = req.session.docenteMusic || null;
  res.locals.docenteSalidas = req.session.docenteSalidas || null;
  res.locals.docenteInk = req.session.docenteInk || null;
  res.locals.docenteSami = req.session.docenteSami || null;
  res.locals.query = req.query;
  res.locals.DOMINIO = DOMINIO;
  res.locals.PATRON_CORREO = PATRON_HTML;
  res.locals.CRITERIOS = CRITERIOS;
  res.locals.CRITERIOS_IND = CRITERIOS_IND;
  res.locals.ESCALA_MAX = ESCALA_MAX;
  next();
});

// Middleware de autenticación
function requireAuth(req, res, next) {
  if (!req.session.docente) return res.redirect("/acceso");
  next();
}

// ---------- Rutas ----------
app.use("/", authRouter);
app.use("/materias", requireAuth, conPeriodo, materiasRouter);
app.use("/proyectos", requireAuth, conPeriodo, proyectosRouter);
app.use("/api", requireAuth, conPeriodo, apiRouter);

// Página pública de un evento. La raíz la usa para el que esté vigente y cada
// slug para el suyo; 'base' es la dirección desde la que se está viendo, para
// que los enlaces de la página vuelvan a donde estaba el visitante.
function renderEvento(res, evento, base) {
  if (evento.vista) {
    const contenido = contenidoEvento(evento.datos);
    // Si el registro recibe o no lo dice config, no el JSON: el archivo de
    // datos pone los textos. Así el botón de la landing y el formulario de
    // /registro no pueden contradecirse.
    const registro = contenido.registro
      ? { ...contenido.registro, abierto: eventos.inscripcionesAbiertas(evento.slug) }
      : null;

    // Lo mismo para el formulario de las marcas, y por lo mismo: el JSON pone
    // los textos y config.PATROCINIOS decide si la puerta está abierta. Es una
    // bandera aparte de la de inscripciones a propósito —los patrocinios se
    // buscan en otro calendario— y solo aplica a la Expo.
    const patrociniosAbierto = evento.slug === "expo" && Boolean(PATROCINIOS.abierto);

    return res.render(evento.vista, {
      ...contenido,
      registro,
      patrociniosAbierto,
      base,
      slug: evento.slug,
    });
  }
  // Sin plantilla propia todavía: la página de aviso se arma con el config.
  res.render("evento-proximo", {
    ev: evento,
    base,
    slug: evento.slug,
    fecha: eventos.fechaLarga(evento.fecha),
    programa: "Ingeniería en Multimedia",
    institucion: "Universidad de Boyacá",
  });
}

// El índice del programa. Es la única página pública que no es de un evento y
// va montada antes que la raíz porque es a donde manda la raíz cuando no hay
// ningún evento activo.
app.use("/info", infoRouter);

// La raíz es el evento más próximo a suceder —no hay dos a la vez, así que no
// hace falta un menú de entrada—. Quien llegue sin enlace ve lo que viene.
app.get("/", (req, res) => {
  const vigente = eventos.activo();

  // Entre un semestre y otro no hay evento que anunciar. En vez de dejar la
  // portada del último —que se leería como si todavía estuviera pasando— se
  // manda al índice del programa, que dice que ahora mismo no hay nada en
  // curso y enseña todo lo que se ha hecho y lo que viene.
  if (!vigente) return res.redirect("/info");

  // Un evento con router propio se arma con datos de la base, así que su
  // página la sirve él y no renderEvento: la raíz manda a su dirección.
  if (vigente.ruta) return res.redirect(`/${vigente.slug}`);
  renderEvento(res, vigente, "/");
});

// Guía de montaje para los expositores de la Expo (pública)
app.get("/expositores", eventos.soloActivo("expo"), (req, res) => {
  const contenido = eventos.contenidoDe("expo");
  if (!contenido.requisitos) return res.redirect("/expo");
  res.render("expositores", { ...contenido });
});

// Registro de expositores (público: lo llenan los estudiantes). El guardia va
// aquí, en el montaje, porque este router sí tiene su propia dirección: por él
// no pasan las peticiones de nadie más.
app.use("/registro", eventos.soloActivo("expo"), registroRouter);

// Patrocinios de la Expo (público: lo llenan las marcas de afuera). Sin el
// guardia de eventos a propósito: a un patrocinador se le habla con meses de
// anticipación, así que esta puerta la abre y la cierra PATROCINIOS.abierto y
// no el calendario del semestre.
app.use("/", patrociniosRouter);

// Virtual Champions. Va con router propio y no con la página automática de
// eventos porque su contenido no está en un JSON sino en la base: los
// equipos, el bracket y el marcador cambian durante el torneo. El público va
// primero para que el panel, que vive en el mismo /vc, no le pase por encima.
app.use("/", vcRouter);
app.use("/vc", vcPanelRouter);

// Jam de Altura. Mismo reparto que el torneo y por la misma razón: su página
// se arma con la base (la edición, el reloj, el tema, los equipos), así que la
// sirve un router y no la página automática de eventos. El público va primero
// para que el panel, que vive en el mismo /jam, no le pase por encima.
app.use("/", jamRouter);
app.use("/jam", jamPanelRouter);

// Multimedia Music Fest. Mismo reparto que el torneo y la jam: su cartel se
// arma con la base —quién se inscribió y quedó confirmado—, así que lo sirve un
// router y no la página automática de eventos. El público va primero para que
// el panel, que vive en el mismo /music, no le pase por encima.
app.use("/", musicRouter);
app.use("/music", musicPanelRouter);

// INKreible. Mismo reparto que los anteriores y por la misma razón: su página
// se arma con la base (la edición, el día del reto, la palabra de hoy, los
// dibujos), así que la sirve un router y no la página automática de eventos.
// El público va primero para que el panel, que vive en el mismo /ink, no le
// pase por encima.
app.use("/", inkRouter);
app.use("/ink", inkPanelRouter);

// Salidas pedagógicas. No es un evento del programa —no está en config.EVENTOS
// ni le pelea la raíz a nadie—: es un trámite con una fecha, y vive siempre en
// /salidas. Mismo reparto que los eventos con router propio: el público va
// primero, y una dirección que no corresponda a ninguna salida del config
// sigue de largo hasta el panel, que vive en ese mismo /salidas.
app.use("/", salidasRouter);
app.use("/salidas", salidasPanelRouter);

// Semillero SAMI. Tampoco es un evento, y por la razón contraria a las salidas:
// no tiene fecha porque no termina nunca. Es una alternativa de grado que está
// andando siempre, con proyectos de tres semestres que se solapan. Vive en
// /semillero y se reparte igual: el público primero, y lo que no sea una de sus
// páginas sigue de largo hasta el panel, que vive en ese mismo /semillero.
app.use("/", samiRouter);
app.use("/semillero", samiPanelRouter);

// Certificados (públicos: el QR de cada uno apunta a su página)
app.use("/certificado", certificadosRouter);

// Panel de docentes: listado de materias
app.get("/panel", requireAuth, conPeriodo, (req, res) => {
  const docenteId = req.session.docente.id;

  // El filtro se recuerda en la sesión: al volver de calificar una materia,
  // el panel sigue como lo dejaste.
  if (req.query.mias !== undefined) {
    req.session.soloMias = req.query.mias === "1";
  }
  const soloMias = Boolean(req.session.soloMias);

  const materias = db
    .prepare(
      `SELECT m.*, d.name AS creador,
              (SELECT COUNT(*) FROM proyectos p
                WHERE p.materia_id = m.id AND p.periodo_id = ?) AS n_proyectos,
              (SELECT COUNT(*) FROM solicitudes s
                WHERE s.materia_id = m.id AND s.estado = 'pendiente'
                  AND s.periodo_id = ?) AS n_pendientes
       FROM materias m
       JOIN docentes d ON d.id = m.created_by
       WHERE (? = 0 OR m.created_by = ?)
       ORDER BY m.created_at DESC`
    )
    .all(req.periodo.id, req.periodo.id, soloMias ? 1 : 0, docenteId);

  const totales = db
    .prepare(
      "SELECT COUNT(*) AS todas, COALESCE(SUM(created_by = ?), 0) AS mias FROM materias"
    )
    .get(docenteId);

  res.render("home", { materias, soloMias, totales, docenteId });
});

// Tablero con ranking del semestre que se esté viendo
app.get("/tablero", requireAuth, conPeriodo, (req, res) => {
  res.render("tablero");
});

// Cada evento en su propia dirección (/expo, /virtual-champions…). Van de
// últimas a propósito: si algún día un slug se llamara igual que una ruta de la
// app, la ruta de la app gana y nadie se queda sin panel.
eventos.EVENTOS.forEach((evento) => {
  if (!evento.slug) return;
  // Los que traen router propio ya pusieron su dirección más arriba, con los
  // datos que necesitan. Registrarla otra vez aquí no la reemplazaría (gana la
  // primera), pero dejarlo explícito evita la duda al leerlo.
  if (evento.ruta) return;
  app.get(`/${evento.slug}`, eventos.soloActivo(evento.slug), (req, res) =>
    renderEvento(res, evento, `/${evento.slug}`)
  );
});

// ---------- Arrancar ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  const vigente = eventos.activo();
  const abierto = vigente ? eventos.inscripcionesAbiertas(vigente.slug) : false;

  // Las dos líneas que hay que leer al arrancar: qué evento manda y si está
  // recibiendo gente. Las dos salen de config.js y de ningún otro lado.
  if (vigente) {
    console.log(`\n  ✓ ${vigente.nombre} en http://localhost:${PORT}`);
    console.log(`    Semestre ${PERIODO} · inscripciones ${abierto ? "ABIERTAS" : "cerradas"}`);
    if (!abierto) {
      console.log(`    Para abrirlas: inscripciones: true en "${vigente.slug}", en config.js.`);
    }
  } else {
    // Sin evento del semestre la raíz es el índice del programa. Se dice con
    // el mismo tono que lo otro: es un estado normal, no una avería.
    console.log(`\n  ✓ Ingeniería en Multimedia en http://localhost:${PORT}`);
    console.log(`    Semestre ${PERIODO} · sin evento activo: la raíz lleva al índice`);
    console.log(`    Para activar uno: activo: true en su evento, en config.js.`);
  }
  console.log("");
  // Solo las direcciones que de verdad abren. Lo que no está aprobado rebota a
  // la raíz, y anunciarlo aquí manda al que lee a comprobar un enlace muerto.
  eventos.EVENTOS.filter((e) => !vigente || e.slug !== vigente.slug).forEach((e) => {
    const rotulo = e.nombre.padEnd(24);
    console.log(
      aprobado(e.slug)
        ? `  · ${rotulo} http://localhost:${PORT}/${e.slug}`
        : `  · ${rotulo} sin aprobar (APROBADO en config.js)`
    );
  });
  console.log(`  · Índice del programa:     http://localhost:${PORT}/info`);
  console.log(`  ✓ Acceso docentes:         http://localhost:${PORT}/acceso`);
  console.log(
    vcConfigurado()
      ? `  ✓ Panel Virtual Champions: http://localhost:${PORT}/vc/acceso`
      : "  · Panel Virtual Champions: cerrado (falta PASSWORD_VC en .env)"
  );
  console.log(
    jamConfigurado()
      ? `  ✓ Panel Jam de Altura:     http://localhost:${PORT}/jam/acceso`
      : "  · Panel Jam de Altura:     cerrado (falta PASSWORD_JAM en .env)"
  );
  console.log(
    musicConfigurado()
      ? `  ✓ Panel Music Fest:        http://localhost:${PORT}/music/acceso`
      : "  · Panel Music Fest:        cerrado (falta PASSWORD_MUSIC en .env)"
  );
  console.log(
    inkConfigurado()
      ? `  ✓ Panel INKreible:         http://localhost:${PORT}/ink/acceso`
      : "  · Panel INKreible:         cerrado (falta PASSWORD_INK en .env)"
  );
  console.log(
    salidasConfigurado()
      ? `  ✓ Panel salidas:           http://localhost:${PORT}/salidas/acceso`
      : "  · Panel salidas:           cerrado (falta PASSWORD_SALIDAS en .env)"
  );
  console.log(
    samiConfigurado()
      ? `  ✓ Panel semillero SAMI:    http://localhost:${PORT}/semillero/acceso`
      : "  · Panel semillero SAMI:    cerrado (falta PASSWORD_SAMI en .env)"
  );
  console.log(
    aprobado("salidas")
      ? `  · Salidas pedagógicas:     http://localhost:${PORT}/salidas`
      : "  · Salidas pedagógicas:     sin aprobar (APROBADO en config.js)"
  );
  console.log(
    aprobado("semillero")
      ? `  · Semillero SAMI:          http://localhost:${PORT}/semillero`
      : "  · Semillero SAMI:          sin aprobar (APROBADO en config.js)"
  );
  console.log(`  ✓ Para exponer con ngrok:  ngrok http ${PORT}`);
  console.log(
    envios.activo()
      ? `  ✓ Correos:                 desde ${process.env.SMTP_USER}`
      : envios.apagados()
        ? "  · Correos:                 APAGADOS a propósito (CORREOS=off en .env)"
        : "  · Correos:                 apagados (falta SMTP_USER/SMTP_PASS en .env)"
  );
  if (!process.env.SESSION_SECRET) {
    console.warn("  ! Sin SESSION_SECRET en .env: cada reinicio cierra las sesiones abiertas.");
  }
  console.log("");
});
