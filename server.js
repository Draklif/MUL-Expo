const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const path = require("path");

const db = require("./db/database");
const { CRITERIOS, CRITERIOS_IND, ESCALA_MAX } = require("./config");
const { contenidoExpo } = require("./lib/contenido");
const { DOMINIO, PATRON_HTML } = require("./lib/correos");

const authRouter = require("./routes/auth");
const materiasRouter = require("./routes/materias");
const proyectosRouter = require("./routes/proyectos");
const apiRouter = require("./routes/api");
const registroRouter = require("./routes/registro");
const certificadosRouter = require("./routes/certificados");
const periodosRouter = require("./routes/periodos");
const { conPeriodo } = require("./lib/periodos");

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
    secret: "expo-multimedia-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }, // 1 día
  })
);

// Variables globales para las vistas
app.use((req, res, next) => {
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

// Landing pública de la Expo Multimedia
app.get("/", (req, res) => {
  res.render("landing", { ...contenidoExpo() });
});

// Guía de montaje para los expositores (pública)
app.get("/expositores", (req, res) => {
  const contenido = contenidoExpo();
  if (!contenido.requisitos) return res.redirect("/");
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

// ---------- Arrancar ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  ✓ Expo Multimedia corriendo en http://localhost:${PORT}`);
  console.log(`  ✓ Acceso docentes:         http://localhost:${PORT}/acceso`);
  console.log(`  ✓ Para exponer con ngrok:  ngrok http ${PORT}\n`);
});
