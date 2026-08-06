// El .env se lee antes que nada: de ahí salen las credenciales del correo y
// los módulos de abajo ya preguntan por esas variables al cargarse.
require("./lib/entorno").cargarEnv();

const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const path = require("path");

const db = require("./db/database");
const { CRITERIOS, CRITERIOS_IND, ESCALA_MAX, PASSWORD } = require("./config");
const { contenidoEvento } = require("./lib/contenido");
const eventos = require("./lib/eventos");
const { DOMINIO, PATRON_HTML } = require("./lib/correos");

const authRouter = require("./routes/auth");
const materiasRouter = require("./routes/materias");
const proyectosRouter = require("./routes/proyectos");
const apiRouter = require("./routes/api");
const registroRouter = require("./routes/registro");
const certificadosRouter = require("./routes/certificados");
const periodosRouter = require("./routes/periodos");
const { conPeriodo } = require("./lib/periodos");
const envios = require("./lib/envios");

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

  res.locals.docente = req.session.docente || null;
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
app.use("/periodos", requireAuth, periodosRouter);

// Página pública de un evento. La raíz la usa para el que esté vigente y cada
// slug para el suyo; 'base' es la dirección desde la que se está viendo, para
// que los enlaces de la página vuelvan a donde estaba el visitante.
function renderEvento(res, evento, base) {
  if (evento.vista) {
    return res.render(evento.vista, { ...contenidoEvento(evento.datos), base, slug: evento.slug });
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

// La raíz es el evento más próximo a suceder —no hay dos a la vez, así que no
// hace falta un menú de entrada—. Quien llegue sin enlace ve lo que viene.
app.get("/", (req, res) => {
  renderEvento(res, eventos.activo(), "/");
});

// Guía de montaje para los expositores de la Expo (pública)
app.get("/expositores", (req, res) => {
  const contenido = eventos.contenidoDe("expo");
  if (!contenido.requisitos) return res.redirect("/expo");
  res.render("expositores", { ...contenido });
});

// Registro de expositores (público: lo llenan los estudiantes)
app.use("/registro", registroRouter);

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
  app.get(`/${evento.slug}`, (req, res) => renderEvento(res, evento, `/${evento.slug}`));
});

// ---------- Arrancar ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  const vigente = eventos.activo();
  console.log(`\n  ✓ ${vigente.nombre} en http://localhost:${PORT}`);
  eventos.EVENTOS.filter((e) => e.slug !== vigente.slug).forEach((e) => {
    console.log(`  · ${e.nombre.padEnd(24)} http://localhost:${PORT}/${e.slug}`);
  });
  console.log(`  ✓ Acceso docentes:         http://localhost:${PORT}/acceso`);
  console.log(`  ✓ Para exponer con ngrok:  ngrok http ${PORT}`);
  console.log(
    envios.activo()
      ? `  ✓ Correos:                 desde ${process.env.SMTP_USER}`
      : "  · Correos:                 apagados (falta SMTP_USER/SMTP_PASS en .env)"
  );
  if (!process.env.SESSION_SECRET) {
    console.warn("  ! Sin SESSION_SECRET en .env: cada reinicio cierra las sesiones abiertas.");
  }
  console.log("");
});
