const express = require("express");
const db = require("../db/database");
const { contenidoExpo } = require("../lib/contenido");
const { limpiarNombre } = require("../lib/listas");
const { DOMINIO } = require("../lib/correos");
const { crearLimite } = require("../lib/limite");
const { etiquetaPuesto } = require("../lib/certificados");
const periodos = require("../lib/periodos");
const {
  generarCodigo,
  limpiarEmail,
  emailValido,
  integrantesDesdeFormulario,
} = require("../lib/registro");

const router = express.Router();

const MAX_INTEGRANTES = 12;
const MAX_TITULO = 120;
const MAX_DESC = 400;

// Freno para un endpoint público. Solo cuentan los registros que SÍ entraron:
// un curso entero registrándose desde el mismo wifi no debería toparse con
// esto, pero un bot mandando cientos sí.
const limiteRegistro = crearLimite({ ventanaMs: 10 * 60 * 1000, maximo: 30 });

// ---------- Helpers ----------
const listaMaterias = () =>
  db.prepare("SELECT id, nombre FROM materias ORDER BY nombre COLLATE NOCASE").all();

function estadoRegistro() {
  const { registro } = contenidoExpo();
  return registro || { abierto: true };
}

function vistaFormulario(extra = {}) {
  const { salas } = contenidoExpo();
  return {
    materias: listaMaterias(),
    salas,
    registro: estadoRegistro(),
    errores: [],
    valores: { integrantes: [] },
    ...extra,
  };
}

// ---------- Formulario ----------
router.get("/", (req, res) => {
  res.render("registro", vistaFormulario());
});

router.post("/", (req, res) => {
  const registro = estadoRegistro();
  const { salas } = contenidoExpo();
  // Todo registro nuevo entra al semestre activo, mire lo que mire el docente.
  const periodoActivo = periodos.activo();

  const valores = {
    materia_id: String(req.body.materia_id || ""),
    titulo: String(req.body.titulo || "").trim().slice(0, MAX_TITULO),
    sala: String(req.body.sala || ""),
    descripcion: String(req.body.descripcion || "").trim().slice(0, MAX_DESC),
    contacto_nombre: limpiarNombre(req.body.contacto_nombre).slice(0, 120),
    contacto_email: limpiarEmail(req.body.contacto_email),
    integrantes: integrantesDesdeFormulario(req.body, MAX_INTEGRANTES),
  };

  const errores = [];

  if (!registro.abierto) {
    errores.push("El registro de expositores está cerrado.");
  }

  const materia = valores.materia_id
    ? db.prepare("SELECT id, nombre FROM materias WHERE id = ?").get(Number(valores.materia_id))
    : null;
  if (!materia) errores.push("Elige la materia a la que pertenece el proyecto.");

  if (!valores.titulo) errores.push("Ponle un título al proyecto.");

  if (!valores.sala || !salas.some((s) => s.id === valores.sala)) {
    errores.push("Elige la sala donde van a estar ubicados.");
  }

  if (!valores.contacto_nombre) errores.push("Escribe tu nombre.");
  if (!emailValido(valores.contacto_email)) {
    errores.push(`Tu correo tiene que ser el institucional @${DOMINIO}.`);
  }

  // Quien registra siempre queda en el equipo, de primero. La identidad es el
  // correo, así que quien repita el del contacto no se agrega dos veces.
  const equipo = [
    { nombre: valores.contacto_nombre, email: valores.contacto_email },
    ...valores.integrantes.filter((i) => i.email !== valores.contacto_email),
  ].slice(0, MAX_INTEGRANTES);

  // Cada expositor necesita su correo: es lo que lo identifica y sin él no
  // hay forma de saber si ya está registrado en otro proyecto.
  const sinNombre = equipo.filter((i) => !i.nombre);
  if (sinNombre.length) {
    errores.push("Falta el nombre de algún compañero que sí tiene correo.");
  }

  const malCorreo = equipo.filter((i) => i.nombre && !emailValido(i.email));
  if (malCorreo.length) {
    errores.push(
      `Falta el correo @${DOMINIO} de ${malCorreo.map((i) => i.nombre).join(", ")}.`
    );
  }

  // Mismo título en la misma materia y el mismo semestre esperando revisión:
  // casi siempre es un doble envío del formulario. La comparación va en JS
  // porque el COLLATE NOCASE de SQLite solo ignora mayúsculas en ASCII.
  if (materia && valores.titulo) {
    const objetivo = valores.titulo.toLowerCase();
    const repetida = db
      .prepare(
        `SELECT codigo, titulo FROM solicitudes
         WHERE materia_id = ? AND periodo_id = ? AND estado != 'rechazada'`
      )
      .all(materia.id, periodoActivo.id)
      .find((s) => s.titulo.toLowerCase() === objetivo);
    if (repetida) {
      errores.push(
        `Ya hay un registro con ese título en ${materia.nombre}. Consulta su estado con el código ${repetida.codigo}.`
      );
    }
  }

  if (errores.length) {
    return res.status(400).render("registro", vistaFormulario({ errores, valores }));
  }

  if (limiteRegistro.alcanzado(req.ip)) {
    return res.status(429).render(
      "registro",
      vistaFormulario({
        errores: ["Demasiados registros seguidos desde esta conexión. Intenta de nuevo en unos minutos."],
        valores,
      })
    );
  }

  // Código único (con reintentos por si hay colisión)
  let codigo = generarCodigo();
  const existe = db.prepare("SELECT 1 FROM solicitudes WHERE codigo = ?");
  for (let i = 0; i < 5 && existe.get(codigo); i++) codigo = generarCodigo();

  db.exec("BEGIN");
  try {
    const info = db
      .prepare(
        `INSERT INTO solicitudes
           (codigo, materia_id, periodo_id, titulo, sala, descripcion,
            contacto_nombre, contacto_email)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        codigo,
        materia.id,
        periodoActivo.id,
        valores.titulo,
        valores.sala,
        valores.descripcion || null,
        valores.contacto_nombre,
        valores.contacto_email
      );

    const insertInt = db.prepare(
      "INSERT INTO solicitud_integrantes (solicitud_id, nombre, email, orden) VALUES (?, ?, ?, ?)"
    );
    equipo.forEach((i, idx) => {
      insertInt.run(info.lastInsertRowid, i.nombre, i.email || null, idx);
    });

    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  limiteRegistro.registrar(req.ip);
  res.redirect(`/registro/listo/${codigo}`);
});

// ---------- Confirmación ----------
router.get("/listo/:codigo", (req, res) => {
  const solicitud = buscarPorCodigo(req.params.codigo);
  if (!solicitud) return res.redirect("/registro/estado");
  res.render("registro-estado", { solicitud, codigo: solicitud.codigo, recienEnviada: true, error: null });
});

// ---------- Consulta de estado ----------
router.get("/estado", (req, res) => {
  const codigo = String(req.query.codigo || "").trim().toUpperCase();
  const solicitud = codigo ? buscarPorCodigo(codigo) : null;
  res.render("registro-estado", {
    solicitud,
    codigo,
    recienEnviada: false,
    error: codigo && !solicitud ? "No encontramos ningún registro con ese código." : null,
  });
});

function buscarPorCodigo(codigo) {
  const solicitud = db
    .prepare(
      `SELECT s.*, m.nombre AS materia_nombre, d.name AS revisor
       FROM solicitudes s
       JOIN materias m ON m.id = s.materia_id
       LEFT JOIN docentes d ON d.id = s.revisado_por
       WHERE s.codigo = ?`
    )
    .get(String(codigo || "").trim().toUpperCase());

  if (!solicitud) return null;

  solicitud.integrantes = db
    .prepare(
      "SELECT nombre, email FROM solicitud_integrantes WHERE solicitud_id = ? ORDER BY orden, id"
    )
    .all(solicitud.id);

  const { salas } = contenidoExpo();
  solicitud.sala_nombre = (salas.find((s) => s.id === solicitud.sala) || {}).name || solicitud.sala;

  // Certificados del equipo, para que cada quien encuentre el suyo con el
  // mismo código con el que consulta el registro.
  const correos = solicitud.integrantes.map((i) => i.email).filter(Boolean);
  solicitud.certificados = correos.length
    ? db
        .prepare(
          `SELECT codigo, estudiante, puesto FROM certificados
           WHERE email IN (${correos.map(() => "?").join(",")})
           ORDER BY (puesto IS NULL), puesto, estudiante COLLATE NOCASE`
        )
        .all(...correos)
        .map((c) => ({ ...c, etiqueta: etiquetaPuesto(c.puesto) }))
    : [];

  return solicitud;
}

module.exports = router;
