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
`);

// ---------- Sembrar docentes desde config (idempotente) ----------
// Usamos el nombre como clave de identidad (code = name).
const upsertDocente = db.prepare(`
  INSERT INTO docentes (code, name) VALUES (?, ?)
  ON CONFLICT(code) DO UPDATE SET name = excluded.name
`);
// Eliminar docentes que ya no están en la config (sin calificaciones activas).
const deleteOldDocentes = db.prepare(`
  DELETE FROM docentes
  WHERE code NOT IN (${DOCENTES.map(() => "?").join(",")})
`);
db.exec("BEGIN");
try {
  for (const d of DOCENTES) upsertDocente.run(d.name, d.name);
  deleteOldDocentes.run(...DOCENTES.map((d) => d.name));
  db.exec("COMMIT");
} catch (e) {
  db.exec("ROLLBACK");
  throw e;
}

module.exports = db;
