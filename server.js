const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const path = require("path");

const db = require("./db/database");
const { CRITERIOS, CRITERIOS_IND, ESCALA_MAX } = require("./config");

const authRouter = require("./routes/auth");
const materiasRouter = require("./routes/materias");
const proyectosRouter = require("./routes/proyectos");
const apiRouter = require("./routes/api");

const app = express();

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
  res.locals.CRITERIOS = CRITERIOS;
  res.locals.CRITERIOS_IND = CRITERIOS_IND;
  res.locals.ESCALA_MAX = ESCALA_MAX;
  next();
});

// Middleware de autenticación
function requireAuth(req, res, next) {
  if (!req.session.docente) return res.redirect("/login");
  next();
}

// ---------- Rutas ----------
app.use("/", authRouter);
app.use("/materias", requireAuth, materiasRouter);
app.use("/proyectos", requireAuth, proyectosRouter);
app.use("/api", requireAuth, apiRouter);

// Home: tablero / listado
app.get("/", requireAuth, (req, res) => {
  const materias = db
    .prepare(
      `SELECT m.*, d.name AS creador,
              (SELECT COUNT(*) FROM proyectos p WHERE p.materia_id = m.id) AS n_proyectos
       FROM materias m
       JOIN docentes d ON d.id = m.created_by
       ORDER BY m.created_at DESC`
    )
    .all();
  res.render("home", { materias });
});

// Tablero público con ranking general (visible para docentes logueados)
app.get("/tablero", requireAuth, (req, res) => {
  res.render("tablero");
});

// ---------- Arrancar ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  ✓ Expo Eval corriendo en http://localhost:${PORT}`);
  console.log(`  ✓ Para exponer con ngrok:  ngrok http ${PORT}\n`);
});
