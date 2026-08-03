const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const { DOCENTES } = require("../config");

const db = new DatabaseSync(path.join(__dirname, "expo.db"));
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

// ---------- Esquema ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS docentes (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    code   TEXT NOT NULL UNIQUE,
    name   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS materias (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre      TEXT NOT NULL,
    created_by  INTEGER NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES docentes(id)
  );

  CREATE TABLE IF NOT EXISTS estudiantes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    materia_id  INTEGER NOT NULL,
    nombre      TEXT NOT NULL COLLATE NOCASE,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (materia_id, nombre),
    FOREIGN KEY (materia_id) REFERENCES materias(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS proyectos (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    materia_id   INTEGER NOT NULL,
    titulo       TEXT NOT NULL,
    integrantes  TEXT NOT NULL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (materia_id) REFERENCES materias(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS calificaciones (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    proyecto_id  INTEGER NOT NULL,
    docente_id   INTEGER NOT NULL,
    criterio     TEXT NOT NULL,
    puntaje      REAL NOT NULL,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (proyecto_id, docente_id, criterio),
    FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE,
    FOREIGN KEY (docente_id)  REFERENCES docentes(id)
  );

  CREATE INDEX IF NOT EXISTS idx_calif_proyecto ON calificaciones(proyecto_id);
  CREATE INDEX IF NOT EXISTS idx_calif_docente  ON calificaciones(docente_id);

  CREATE TABLE IF NOT EXISTS calificaciones_ind (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    proyecto_id  INTEGER NOT NULL,
    docente_id   INTEGER NOT NULL,
    integrante   TEXT NOT NULL,
    criterio     TEXT NOT NULL,
    puntaje      REAL NOT NULL,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (proyecto_id, docente_id, integrante, criterio),
    FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE,
    FOREIGN KEY (docente_id)  REFERENCES docentes(id)
  );

  CREATE INDEX IF NOT EXISTS idx_calind_proyecto ON calificaciones_ind(proyecto_id);

  -- Registro de expositores: lo llenan los estudiantes, lo aprueba el docente.
  CREATE TABLE IF NOT EXISTS solicitudes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo          TEXT NOT NULL UNIQUE,
    materia_id      INTEGER NOT NULL,
    titulo          TEXT NOT NULL,
    sala            TEXT,
    descripcion     TEXT,
    contacto_nombre TEXT NOT NULL,
    contacto_email  TEXT NOT NULL,
    estado          TEXT NOT NULL DEFAULT 'pendiente',
    nota_docente    TEXT,
    revisado_por    INTEGER,
    revisado_at     DATETIME,
    proyecto_id     INTEGER,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (materia_id)  REFERENCES materias(id) ON DELETE CASCADE,
    FOREIGN KEY (revisado_por) REFERENCES docentes(id),
    FOREIGN KEY (proyecto_id)  REFERENCES proyectos(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sol_materia ON solicitudes(materia_id, estado);

  CREATE TABLE IF NOT EXISTS solicitud_integrantes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    solicitud_id  INTEGER NOT NULL,
    nombre        TEXT NOT NULL,
    email         TEXT,
    orden         INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (solicitud_id) REFERENCES solicitudes(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sol_int ON solicitud_integrantes(solicitud_id);
`);

// ---------- Migraciones suaves ----------
// Columnas nuevas sobre tablas que ya existen en bases anteriores.
function agregarColumna(tabla, columna, definicion) {
  const existe = db
    .prepare(`PRAGMA table_info(${tabla})`)
    .all()
    .some((c) => c.name === columna);
  if (!existe) db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
}

agregarColumna("estudiantes", "email", "TEXT");
agregarColumna("proyectos", "sala", "TEXT");

// La identidad de un estudiante pasó a ser el correo institucional: dos
// personas pueden llamarse igual, pero el correo no se repite. La tabla vieja
// tenía UNIQUE(materia_id, nombre), así que hay que rehacerla.
const sqlEstudiantes = db
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'estudiantes'")
  .get();

if (sqlEstudiantes && /UNIQUE \(materia_id, nombre\)/.test(sqlEstudiantes.sql)) {
  db.exec("BEGIN");
  try {
    db.exec(`
      CREATE TABLE estudiantes_nuevo (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        materia_id  INTEGER NOT NULL,
        nombre      TEXT NOT NULL,
        email       TEXT COLLATE NOCASE,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (materia_id, email),
        FOREIGN KEY (materia_id) REFERENCES materias(id) ON DELETE CASCADE
      );

      INSERT INTO estudiantes_nuevo (id, materia_id, nombre, email, created_at)
        SELECT id, materia_id, nombre, email, created_at FROM estudiantes;

      DROP TABLE estudiantes;
      ALTER TABLE estudiantes_nuevo RENAME TO estudiantes;
    `);
    db.exec("COMMIT");
    console.log("  ✓ estudiantes: el correo pasó a ser la clave única");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

// ---------- Sembrar docentes desde config (idempotente) ----------
// La identidad es el correo institucional: es lo que teclean para entrar.
// La columna `code` guarda ese correo (antes guardaba el nombre).
for (const d of DOCENTES) {
  if (!d.email || !d.email.includes("@")) {
    throw new Error(
      `El docente "${d.name}" no tiene correo en config.js. Sin correo no puede entrar.`
    );
  }
}

const todosLosDocentes = db.prepare("SELECT id, code, name FROM docentes");
const insertDocente = db.prepare("INSERT INTO docentes (code, name) VALUES (?, ?)");
const actualizarDocente = db.prepare("UPDATE docentes SET code = ?, name = ? WHERE id = ?");
const usosDocente = db.prepare(`
  SELECT (SELECT COUNT(*) FROM materias           WHERE created_by  = ?)
       + (SELECT COUNT(*) FROM calificaciones     WHERE docente_id  = ?)
       + (SELECT COUNT(*) FROM calificaciones_ind WHERE docente_id  = ?)
       + (SELECT COUNT(*) FROM solicitudes        WHERE revisado_por = ?) AS n
`);

db.exec("BEGIN");
try {
  for (const d of DOCENTES) {
    const correo = d.email.trim().toLowerCase();
    const filas = todosLosDocentes.all();

    const porCorreo = filas.find((f) => f.code.toLowerCase() === correo);
    if (porCorreo) {
      if (porCorreo.name !== d.name) actualizarDocente.run(correo, d.name, porCorreo.id);
      continue;
    }

    // Sin coincidencia de correo, manda el nombre: así, corregir un correo mal
    // escrito en config.js (o venir de la versión donde `code` era el nombre)
    // actualiza a la misma persona en vez de crear otra, y sus materias y
    // calificaciones siguen siendo suyas.
    const porNombre = filas.find((f) => f.name === d.name);
    if (porNombre) actualizarDocente.run(correo, d.name, porNombre.id);
    else insertDocente.run(correo, d.name);
  }

  // Docentes que ya no están en config: se borran solo si no dejaron nada.
  const vigentes = new Set(DOCENTES.map((d) => d.email.trim().toLowerCase()));
  for (const f of todosLosDocentes.all()) {
    if (vigentes.has(f.code.toLowerCase())) continue;
    if (usosDocente.get(f.id, f.id, f.id, f.id).n === 0) {
      db.prepare("DELETE FROM docentes WHERE id = ?").run(f.id);
    } else {
      console.warn(
        `  ! "${f.name}" ya no está en config.js pero tiene datos asociados: se conserva (no podrá entrar).`
      );
    }
  }

  db.exec("COMMIT");
} catch (e) {
  db.exec("ROLLBACK");
  throw e;
}

module.exports = db;
