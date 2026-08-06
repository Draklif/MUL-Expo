const express = require("express");
const db = require("../db/database");
const { parseLista } = require("../lib/listas");
const { contenidoDe } = require("../lib/eventos");
const { rankingDeMateria } = require("../lib/ranking");
const {
  emitirDeMateria,
  deMateria,
  etiquetaPuesto,
  avisarPendientes,
} = require("../lib/certificados");
const envios = require("../lib/envios");

const router = express.Router();

const MAX_MATERIA = 80;

// Statements reutilizados
const insertMateria = db.prepare(
  "INSERT INTO materias (nombre, created_by) VALUES (?, ?)"
);
// El COLLATE NOCASE de SQLite solo ignora mayúsculas en ASCII, así que la
// comparación de nombres se hace en JS.
const nombresDeMaterias = db.prepare("SELECT nombre FROM materias");
// El correo es la identidad: dos estudiantes pueden llamarse igual, pero el
// mismo correo en la misma materia es la misma persona. Si ya estaba (por
// ejemplo, porque expone en dos proyectos) se deja el nombre del primer
// registro aprobado, para que no cambie a espaldas del docente.
const upsertEstudiante = db.prepare(`
  INSERT INTO estudiantes (materia_id, periodo_id, nombre, email) VALUES (?, ?, ?, ?)
  ON CONFLICT (materia_id, periodo_id, email) DO NOTHING
`);
const integrantesDeSolicitud = db.prepare(
  "SELECT nombre, email FROM solicitud_integrantes WHERE solicitud_id = ? ORDER BY orden, id"
);

// Crear materia (rápido: desde el home)
router.post("/", (req, res) => {
  const { nombre } = req.body;
  if (!nombre || !nombre.trim()) return res.redirect("/panel");
  insertMateria.run(nombre.trim().slice(0, MAX_MATERIA), req.session.docente.id);
  res.redirect("/panel");
});

// Crear varias materias de un pegón (una por línea)
router.post("/batch", (req, res) => {
  const nombres = parseLista(req.body.nombres, MAX_MATERIA);
  if (!nombres.length) return res.redirect("/panel");

  const existentes = new Set(
    nombresDeMaterias.all().map((m) => m.nombre.toLowerCase())
  );

  let nuevas = 0;
  db.exec("BEGIN");
  try {
    for (const nombre of nombres) {
      if (existentes.has(nombre.toLowerCase())) continue; // ya existe: no duplicar
      existentes.add(nombre.toLowerCase());
      insertMateria.run(nombre, req.session.docente.id);
      nuevas++;
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  res.redirect(`/panel?nuevas=${nuevas}&omitidas=${nombres.length - nuevas}`);
});

// Ver materia con sus proyectos y su lista de estudiantes
router.get("/:id", (req, res) => {
  const materia = db.prepare("SELECT * FROM materias WHERE id = ?").get(req.params.id);
  if (!materia) return res.status(404).send("Materia no encontrada");

  const proyectos = db
    .prepare(
      `SELECT p.*,
              (SELECT COUNT(DISTINCT docente_id) FROM calificaciones c WHERE c.proyecto_id = p.id) AS n_jueces
       FROM proyectos p
       WHERE p.materia_id = ? AND p.periodo_id = ?
       ORDER BY p.created_at DESC`
    )
    .all(req.params.id, req.periodo.id);

  // Estudiantes que se registraron y ya fueron aprobados. Los que no aparecen
  // aquí no tienen proyecto y no se pueden calificar.
  const estudiantes = db
    .prepare(
      `SELECT id, nombre, email FROM estudiantes
       WHERE materia_id = ? AND periodo_id = ? AND email IS NOT NULL
       ORDER BY nombre COLLATE NOCASE`
    )
    .all(req.params.id, req.periodo.id);

  // A qué proyecto pertenece cada uno (por correo, que es la identidad)
  const proyectoPorCorreo = {};
  for (const fila of db
    .prepare(
      `SELECT si.email, s.titulo
       FROM solicitud_integrantes si
       JOIN solicitudes s ON s.id = si.solicitud_id
       WHERE s.materia_id = ? AND s.periodo_id = ? AND s.estado = 'aprobada'
         AND si.email IS NOT NULL`
    )
    .all(req.params.id, req.periodo.id)) {
    const clave = fila.email.toLowerCase();
    if (!proyectoPorCorreo[clave]) proyectoPorCorreo[clave] = [];
    proyectoPorCorreo[clave].push(fila.titulo);
  }

  for (const e of estudiantes) {
    e.proyectos = proyectoPorCorreo[(e.email || "").toLowerCase()] || [];
  }

  // Registros de expositores que llegaron a esta materia
  const solicitudes = db
    .prepare(
      `SELECT s.*, d.name AS revisor
       FROM solicitudes s
       LEFT JOIN docentes d ON d.id = s.revisado_por
       WHERE s.materia_id = ? AND s.periodo_id = ?
       ORDER BY (s.estado = 'pendiente') DESC, s.created_at DESC`
    )
    .all(req.params.id, req.periodo.id);

  const { salas } = contenidoDe("expo");
  for (const s of solicitudes) {
    s.integrantes = integrantesDeSolicitud.all(s.id);
    s.sala_nombre = (salas.find((x) => x.id === s.sala) || {}).name || s.sala;
  }

  const pendientes = solicitudes.filter((s) => s.estado === "pendiente");
  const revisadas = solicitudes.filter((s) => s.estado !== "pendiente");

  // Podio y certificados ya emitidos
  const ranking = rankingDeMateria(req.params.id, req.periodo.id);
  const podio = ranking.filter((p) => p.puesto && p.puesto <= 3);
  const certificados = deMateria(req.params.id, req.periodo.id).map((c) => ({
    ...c,
    etiqueta: etiquetaPuesto(c.puesto),
  }));

  res.render("materia", {
    materia,
    proyectos,
    estudiantes,
    pendientes,
    revisadas,
    podio,
    certificados,
    correoActivo: envios.activo(),
  });
});

// Emitir (o actualizar) los certificados de la materia
router.post("/:id/certificados", (req, res) => {
  const materiaId = Number(req.params.id);
  const materia = db.prepare("SELECT id FROM materias WHERE id = ?").get(materiaId);
  if (!materia) return res.status(404).send("Materia no encontrada");

  const r = emitirDeMateria(materiaId, req.periodo.id, req.session.docente.name);
  res.redirect(
    `/materias/${materiaId}?emitidos=${r.emitidos}&actualizados=${r.actualizados}#certificados`
  );
});

// Avisarle por correo a cada estudiante que ya tiene su certificado.
//
// Es un botón aparte a propósito: emitir se repite cada vez que cambia una
// nota, y avisar no se puede deshacer. El docente manda los correos cuando ya
// está conforme con el podio, no antes. Este sí espera a que salgan para poder
// decir cuántos llegaron.
router.post("/:id/certificados/avisos", async (req, res) => {
  const materiaId = Number(req.params.id);
  const materia = db.prepare("SELECT id FROM materias WHERE id = ?").get(materiaId);
  if (!materia) return res.status(404).send("Materia no encontrada");

  let r = { enviados: 0, fallaron: 0 };
  try {
    r = await avisarPendientes(materiaId, req.periodo.id, envios.urlBase(req));
  } catch (e) {
    console.error(`  ! Avisos de certificados de la materia ${materiaId}: ${e.message}`);
  }

  res.redirect(
    `/materias/${materiaId}?avisados=${r.enviados}&fallaron=${r.fallaron}#certificados`
  );
});

// ---------- Revisión de registros de expositores ----------

// Completa la solicitud con lo que el correo necesita nombrar: la materia y la
// sala se guardan por id, y el revisor es quien acaba de tocar el botón.
function paraElCorreo(solicitud, req) {
  const { salas } = contenidoDe("expo");
  const materia = db
    .prepare("SELECT nombre FROM materias WHERE id = ?")
    .get(solicitud.materia_id);

  return {
    ...solicitud,
    materia_nombre: materia ? materia.nombre : "",
    sala_nombre: (salas.find((s) => s.id === solicitud.sala) || {}).name || solicitud.sala,
    revisor: req.session.docente.name,
  };
}

// Aprobar: crea el proyecto y suma a los integrantes a la lista de la materia
router.post("/:id/solicitudes/:sid/aprobar", (req, res) => {
  const materiaId = Number(req.params.id);
  const solicitudId = Number(req.params.sid);

  const solicitud = db
    .prepare("SELECT * FROM solicitudes WHERE id = ? AND materia_id = ?")
    .get(solicitudId, materiaId);

  if (!solicitud) return res.status(404).send("Registro no encontrado");
  if (solicitud.estado === "aprobada") return res.redirect(`/materias/${materiaId}`);

  const integrantes = integrantesDeSolicitud.all(solicitudId);

  db.exec("BEGIN");
  try {
    // El proyecto entra al semestre del registro, no al que esté mirando el
    // docente: si aprueba algo viejo, sigue perteneciendo a su semestre.
    const info = db
      .prepare(
        "INSERT INTO proyectos (materia_id, periodo_id, titulo, integrantes, sala) VALUES (?, ?, ?, ?, ?)"
      )
      .run(
        materiaId,
        solicitud.periodo_id,
        solicitud.titulo,
        integrantes.map((i) => i.nombre).join("\n"),
        solicitud.sala
      );

    for (const i of integrantes) {
      upsertEstudiante.run(materiaId, solicitud.periodo_id, i.nombre, i.email || null);
    }

    db.prepare(
      `UPDATE solicitudes
       SET estado = 'aprobada', nota_docente = NULL, revisado_por = ?,
           revisado_at = CURRENT_TIMESTAMP, proyecto_id = ?
       WHERE id = ?`
    ).run(req.session.docente.id, info.lastInsertRowid, solicitudId);

    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  // El aviso sale aparte: el proyecto ya quedó creado pase lo que pase con el
  // correo.
  envios.avisoRevision(
    { ...paraElCorreo(solicitud, req), estado: "aprobada" },
    envios.urlBase(req)
  );

  res.redirect(`/materias/${materiaId}?revisado=aprobada`);
});

// Rechazar: queda registrado con el motivo, sin crear proyecto
router.post("/:id/solicitudes/:sid/rechazar", (req, res) => {
  const materiaId = Number(req.params.id);
  const solicitudId = Number(req.params.sid);
  const nota = String(req.body.nota || "").trim().slice(0, 300);

  const info = db
    .prepare(
      `UPDATE solicitudes
       SET estado = 'rechazada', nota_docente = ?, revisado_por = ?,
           revisado_at = CURRENT_TIMESTAMP
       WHERE id = ? AND materia_id = ? AND estado = 'pendiente'`
    )
    .run(nota || null, req.session.docente.id, solicitudId, materiaId);

  // Solo se avisa si el rechazo cambió algo. Si la solicitud ya estaba
  // revisada, el UPDATE no toca nada y nadie tiene que recibir un correo
  // repetido.
  if (info.changes) {
    const solicitud = db.prepare("SELECT * FROM solicitudes WHERE id = ?").get(solicitudId);
    envios.avisoRevision(paraElCorreo(solicitud, req), envios.urlBase(req));
  }

  res.redirect(`/materias/${materiaId}?revisado=rechazada`);
});

// Eliminar materia (cascada elimina proyectos, estudiantes y calificaciones)
router.post("/:id/delete", (req, res) => {
  db.prepare("DELETE FROM materias WHERE id = ?").run(req.params.id);
  res.redirect("/panel");
});

module.exports = router;
