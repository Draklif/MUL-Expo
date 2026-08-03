// =====================================================================
//  Emisión y consulta de certificados.
// =====================================================================
const db = require("../db/database");
const QR = require("qrcode-svg");
const { rankingDeMateria } = require("./ranking");
const { contenidoExpo } = require("./contenido");
const { parseIntegrantes } = require("./listas");
const { generarCodigo } = require("./registro");

const PUESTOS = {
  1: { label: "Primer puesto", cls: "oro" },
  2: { label: "Segundo puesto", cls: "plata" },
  3: { label: "Tercer puesto", cls: "bronce" },
};

const PARTICIPACION = { label: "Participación", cls: "part" };

function etiquetaPuesto(puesto) {
  return PUESTOS[puesto] || PARTICIPACION;
}

// Integrantes de un proyecto. Los registros traen nombre y correo; para los
// proyectos viejos, creados a mano, solo hay nombres.
function integrantesDeProyecto(proyecto) {
  const deSolicitud = db
    .prepare(
      `SELECT si.nombre, si.email
       FROM solicitud_integrantes si
       JOIN solicitudes s ON s.id = si.solicitud_id
       WHERE s.proyecto_id = ?
       ORDER BY si.orden, si.id`
    )
    .all(proyecto.id);

  if (deSolicitud.length) return deSolicitud;

  return parseIntegrantes(proyecto.integrantes).map((nombre) => ({ nombre, email: null }));
}

/**
 * Emite (o actualiza) los certificados de una materia: uno por estudiante.
 * Es idempotente — se puede volver a generar cuando cambien las notas y los
 * enlaces ya compartidos siguen sirviendo, solo cambia el puesto.
 */
function emitirDeMateria(materiaId, docenteNombre) {
  const materia = db.prepare("SELECT * FROM materias WHERE id = ?").get(materiaId);
  if (!materia) return { emitidos: 0, actualizados: 0, total: 0 };

  const { salas } = contenidoExpo();
  const ranking = rankingDeMateria(materiaId);

  const buscar = db.prepare(
    "SELECT id, codigo, puesto FROM certificados WHERE materia_id = ? AND proyecto_id = ? AND estudiante = ?"
  );
  const insertar = db.prepare(`
    INSERT INTO certificados
      (codigo, materia_id, proyecto_id, estudiante, email, proyecto_titulo,
       materia_nombre, sala, sala_nombre, puesto, companeros, docente)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const actualizar = db.prepare(`
    UPDATE certificados
    SET email = ?, proyecto_titulo = ?, materia_nombre = ?, sala = ?, sala_nombre = ?,
        puesto = ?, companeros = ?, docente = ?, emitido_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  const existeCodigo = db.prepare("SELECT 1 FROM certificados WHERE codigo = ?");

  let emitidos = 0;
  let actualizados = 0;

  db.exec("BEGIN");
  try {
    for (const proyecto of ranking) {
      const sala = salas.find((s) => s.id === proyecto.sala);
      const equipo = integrantesDeProyecto(proyecto);
      const puesto = proyecto.puesto && proyecto.puesto <= 3 ? proyecto.puesto : null;

      for (const persona of equipo) {
        const companeros = equipo
          .filter((o) => o.nombre !== persona.nombre)
          .map((o) => o.nombre)
          .join("\n");

        const previo = buscar.get(materiaId, proyecto.id, persona.nombre);

        if (previo) {
          actualizar.run(
            persona.email || null,
            proyecto.titulo,
            materia.nombre,
            proyecto.sala || null,
            sala ? sala.name : null,
            puesto,
            companeros || null,
            docenteNombre || null,
            previo.id
          );
          actualizados++;
        } else {
          let codigo = generarCodigo(8);
          for (let i = 0; i < 5 && existeCodigo.get(codigo); i++) codigo = generarCodigo(8);

          insertar.run(
            codigo,
            materiaId,
            proyecto.id,
            persona.nombre,
            persona.email || null,
            proyecto.titulo,
            materia.nombre,
            proyecto.sala || null,
            sala ? sala.name : null,
            puesto,
            companeros || null,
            docenteNombre || null
          );
          emitidos++;
        }
      }
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  return { emitidos, actualizados, total: emitidos + actualizados };
}

function deMateria(materiaId) {
  return db
    .prepare(
      `SELECT * FROM certificados WHERE materia_id = ?
       ORDER BY (puesto IS NULL), puesto, estudiante COLLATE NOCASE`
    )
    .all(materiaId);
}

function porCodigo(codigo) {
  return db
    .prepare("SELECT * FROM certificados WHERE codigo = ?")
    .get(String(codigo || "").trim().toUpperCase());
}

function porCorreo(email) {
  if (!email) return [];
  return db
    .prepare(
      "SELECT * FROM certificados WHERE email = ? ORDER BY (puesto IS NULL), puesto"
    )
    .all(email);
}

// QR en SVG: escala sin pixelarse y se imprime bien.
function qrSvg(texto, tamano = 150) {
  return new QR({
    content: texto,
    padding: 0,
    width: tamano,
    height: tamano,
    color: "#0c0c0f",
    background: "#ffffff",
    ecl: "M",
    join: true,
    container: "svg-viewbox",
  }).svg();
}

module.exports = {
  emitirDeMateria,
  deMateria,
  porCodigo,
  porCorreo,
  etiquetaPuesto,
  qrSvg,
};
