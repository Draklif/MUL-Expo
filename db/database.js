const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const { DOCENTES, PERIODO_INICIAL } = require("../config");

const db = new DatabaseSync(path.join(__dirname, "expo.db"));
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

// ---------- Esquema ----------
db.exec(`
  -- Semestres. Las materias son las mismas todos los semestres; lo que cambia
  -- son los estudiantes, sus proyectos, sus notas y sus certificados.
  CREATE TABLE IF NOT EXISTS periodos (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo     TEXT NOT NULL UNIQUE,
    activo     INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

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

  -- Certificados. Los datos se congelan al emitirlos: si después cambia una
  -- nota o se borra un proyecto, el certificado que alguien ya compartió
  -- sigue diciendo lo mismo.
  CREATE TABLE IF NOT EXISTS certificados (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo          TEXT NOT NULL UNIQUE,
    materia_id      INTEGER NOT NULL,
    proyecto_id     INTEGER,
    estudiante      TEXT NOT NULL,
    email           TEXT COLLATE NOCASE,
    proyecto_titulo TEXT NOT NULL,
    materia_nombre  TEXT NOT NULL,
    sala            TEXT,
    sala_nombre     TEXT,
    puesto          INTEGER,
    companeros      TEXT,
    docente         TEXT,
    emitido_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (materia_id, proyecto_id, estudiante),
    FOREIGN KEY (materia_id)  REFERENCES materias(id)  ON DELETE CASCADE,
    FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_cert_materia ON certificados(materia_id);
  CREATE INDEX IF NOT EXISTS idx_cert_email   ON certificados(email);

  -- =================================================================
  --  VIRTUAL CHAMPIONS
  --  El torneo de esports vive aparte de la Expo: no comparte ninguna
  --  tabla con ella. Todo lo suyo lleva el prefijo vc_.
  -- =================================================================

  -- Un torneo es un juego en un semestre. Dos juegos a la vez son dos
  -- torneos, cada uno con sus equipos y su bracket.
  CREATE TABLE IF NOT EXISTS vc_torneos (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    juego               TEXT NOT NULL,
    nombre              TEXT NOT NULL,
    periodo_id          INTEGER,
    estado              TEXT NOT NULL DEFAULT 'inscripcion',
    inscripcion_abierta INTEGER NOT NULL DEFAULT 1,
    cupo_equipos        INTEGER,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (periodo_id) REFERENCES periodos(id)
  );

  CREATE INDEX IF NOT EXISTS idx_vc_torneo_juego ON vc_torneos(juego, periodo_id);

  -- Equipos inscritos. El código de 6 caracteres es el mismo invento del
  -- registro de la Expo: se dicta, se teclea y con él se consulta el estado
  -- sin necesidad de cuenta.
  CREATE TABLE IF NOT EXISTS vc_equipos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    torneo_id       INTEGER NOT NULL,
    codigo          TEXT NOT NULL UNIQUE,
    nombre          TEXT NOT NULL,
    tag             TEXT,
    estado          TEXT NOT NULL DEFAULT 'pendiente',
    armado          INTEGER NOT NULL DEFAULT 0,
    contacto_nombre TEXT,
    contacto_email  TEXT,
    nota_docente    TEXT,
    revisado_por    INTEGER,
    revisado_at     DATETIME,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (torneo_id)    REFERENCES vc_torneos(id) ON DELETE CASCADE,
    FOREIGN KEY (revisado_por) REFERENCES docentes(id)
  );

  CREATE INDEX IF NOT EXISTS idx_vc_eq_torneo ON vc_equipos(torneo_id, estado);

  -- Jugadores. equipo_id nulo = se inscribió solo y todavía no tiene equipo;
  -- esos llevan su propio código para consultar en qué van. Un correo no
  -- puede repetirse dentro del mismo torneo: es la identidad de la persona y
  -- lo que impide que alguien juegue en dos equipos.
  CREATE TABLE IF NOT EXISTS vc_jugadores (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    torneo_id  INTEGER NOT NULL,
    equipo_id  INTEGER,
    codigo     TEXT,
    nombre     TEXT NOT NULL,
    email      TEXT NOT NULL COLLATE NOCASE,
    nick       TEXT,
    rol        TEXT,
    capitan    INTEGER NOT NULL DEFAULT 0,
    suplente   INTEGER NOT NULL DEFAULT 0,
    orden      INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (torneo_id, email),
    FOREIGN KEY (torneo_id) REFERENCES vc_torneos(id) ON DELETE CASCADE,
    FOREIGN KEY (equipo_id) REFERENCES vc_equipos(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_vc_jug_torneo ON vc_jugadores(torneo_id, equipo_id);

  -- Rondas del bracket. El formato (BO1/BO3/BO5) se pone por ronda; una
  -- partida suelta puede llevar el suyo propio y le gana a este.
  CREATE TABLE IF NOT EXISTS vc_rondas (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    torneo_id  INTEGER NOT NULL,
    nombre     TEXT NOT NULL,
    orden      INTEGER NOT NULL DEFAULT 0,
    formato    INTEGER NOT NULL DEFAULT 1,
    presencial INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (torneo_id) REFERENCES vc_torneos(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_vc_rondas_torneo ON vc_rondas(torneo_id, orden);

  -- Partidas. avanza_a_partida_id + avanza_a_slot son lo que mueve el bracket
  -- solo: al cerrarse una partida, su ganador se escribe en el hueco que le
  -- toca de la ronda siguiente.
  CREATE TABLE IF NOT EXISTS vc_partidas (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    torneo_id           INTEGER NOT NULL,
    ronda_id            INTEGER NOT NULL,
    orden               INTEGER NOT NULL DEFAULT 0,
    equipo_a_id         INTEGER,
    equipo_b_id         INTEGER,
    formato             INTEGER,
    estado              TEXT NOT NULL DEFAULT 'programada',
    inicio              TEXT,
    lugar               TEXT,
    stream_url          TEXT,
    marcador_a          INTEGER NOT NULL DEFAULT 0,
    marcador_b          INTEGER NOT NULL DEFAULT 0,
    ganador_id          INTEGER,
    avanza_a_partida_id INTEGER,
    avanza_a_slot       TEXT,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (torneo_id)   REFERENCES vc_torneos(id) ON DELETE CASCADE,
    FOREIGN KEY (ronda_id)    REFERENCES vc_rondas(id)  ON DELETE CASCADE,
    FOREIGN KEY (equipo_a_id) REFERENCES vc_equipos(id) ON DELETE SET NULL,
    FOREIGN KEY (equipo_b_id) REFERENCES vc_equipos(id) ON DELETE SET NULL,
    FOREIGN KEY (ganador_id)  REFERENCES vc_equipos(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_vc_part_torneo ON vc_partidas(torneo_id, estado);
  CREATE INDEX IF NOT EXISTS idx_vc_part_ronda  ON vc_partidas(ronda_id, orden);

  -- Cada mapa (o cada partida, en LoL) de la serie. El marcador de la serie
  -- no se escribe a mano: sale de contar los mapas ganados.
  CREATE TABLE IF NOT EXISTS vc_mapas (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    partida_id INTEGER NOT NULL,
    orden      INTEGER NOT NULL DEFAULT 0,
    mapa       TEXT,
    puntos_a   INTEGER NOT NULL DEFAULT 0,
    puntos_b   INTEGER NOT NULL DEFAULT 0,
    ganador    TEXT,
    estado     TEXT NOT NULL DEFAULT 'pendiente',
    FOREIGN KEY (partida_id) REFERENCES vc_partidas(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_vc_mapas_partida ON vc_mapas(partida_id, orden);

  -- =================================================================
  --  JAM DE ALTURA
  --  La gamejam de 48 horas. Tampoco comparte tablas con nadie: todo
  --  lo suyo lleva el prefijo jam_.
  -- =================================================================

  -- Una edición es la jam de un semestre. Es la unidad que se repite: al
  -- empezar el semestre siguiente se abre otra y la anterior queda archivada
  -- con sus equipos, su tema y sus juegos intactos.
  --
  -- El tema se guarda desde el primer día y se revela con un interruptor
  -- aparte: escribirlo no lo publica, y así se puede dejar listo con
  -- anticipación sin que se filtre por mirar el código fuente de la página
  -- —hasta que tema_revelado no vale 1, el tema no sale del servidor—.
  CREATE TABLE IF NOT EXISTS jam_ediciones (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    periodo_id          INTEGER,
    nombre              TEXT NOT NULL,
    estado              TEXT NOT NULL DEFAULT 'inscripcion',
    inscripcion_abierta INTEGER NOT NULL DEFAULT 1,
    entregas_abiertas   INTEGER NOT NULL DEFAULT 1,
    inicio              TEXT,
    horas               INTEGER NOT NULL DEFAULT 48,
    tema                TEXT,
    tema_revelado       INTEGER NOT NULL DEFAULT 0,
    cupo_equipos        INTEGER,
    max_integrantes     INTEGER NOT NULL DEFAULT 4,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (periodo_id) REFERENCES periodos(id)
  );

  CREATE INDEX IF NOT EXISTS idx_jam_ed_periodo ON jam_ediciones(periodo_id);

  -- Equipos inscritos. Mismo invento del código de 6 caracteres: se dicta, se
  -- teclea, y con él se consulta el estado y se entrega el juego sin cuenta.
  --
  -- Las cuatro columnas del final son la entrega: mientras estén vacías, el
  -- equipo todavía no ha subido nada.
  CREATE TABLE IF NOT EXISTS jam_equipos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    edicion_id      INTEGER NOT NULL,
    codigo          TEXT NOT NULL UNIQUE,
    nombre          TEXT NOT NULL,
    lema            TEXT,
    estado          TEXT NOT NULL DEFAULT 'pendiente',
    armado          INTEGER NOT NULL DEFAULT 0,
    contacto_nombre TEXT,
    contacto_email  TEXT,
    nota_docente    TEXT,
    revisado_por    INTEGER,
    revisado_at     DATETIME,
    juego_titulo    TEXT,
    juego_url       TEXT,
    juego_desc      TEXT,
    entregado_at    DATETIME,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (edicion_id)   REFERENCES jam_ediciones(id) ON DELETE CASCADE,
    FOREIGN KEY (revisado_por) REFERENCES docentes(id)
  );

  CREATE INDEX IF NOT EXISTS idx_jam_eq_edicion ON jam_equipos(edicion_id, estado);

  -- Integrantes. equipo_id nulo = se inscribió solo y todavía no tiene
  -- equipo; esos llevan su propio código. Un correo no se repite dentro de la
  -- misma edición: es la identidad de la persona y lo que impide que alguien
  -- esté en dos equipos.
  CREATE TABLE IF NOT EXISTS jam_integrantes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    edicion_id  INTEGER NOT NULL,
    equipo_id   INTEGER,
    codigo      TEXT,
    nombre      TEXT NOT NULL,
    email       TEXT NOT NULL COLLATE NOCASE,
    disciplina  TEXT,
    semestre    TEXT,
    lider       INTEGER NOT NULL DEFAULT 0,
    orden       INTEGER NOT NULL DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (edicion_id, email),
    FOREIGN KEY (edicion_id) REFERENCES jam_ediciones(id) ON DELETE CASCADE,
    FOREIGN KEY (equipo_id)  REFERENCES jam_equipos(id)   ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_jam_int_edicion ON jam_integrantes(edicion_id, equipo_id);

  -- El tablón: lo que la organización anuncia durante las 48 horas (el
  -- arranque, un recordatorio a mitad de camino, el cierre de entregas). Sale
  -- en la página sin recargar, que es el punto de tenerlo en la base.
  -- created_at va en hora LOCAL (la escribe la ruta con datetime('now',
  -- 'localtime')) y no en UTC como el resto de la base: la del tablón es la
  -- única fecha que se muestra tal cual, y un aviso publicado a la una de la
  -- tarde no puede salir diciendo que son las seis.
  CREATE TABLE IF NOT EXISTS jam_anuncios (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    edicion_id INTEGER NOT NULL,
    texto      TEXT NOT NULL,
    tipo       TEXT NOT NULL DEFAULT 'aviso',
    created_at DATETIME DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (edicion_id) REFERENCES jam_ediciones(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_jam_anun_edicion ON jam_anuncios(edicion_id, created_at);

  -- =================================================================
  --  INKREIBLE
  --  El reto de dibujo de 28 días. Todo lo suyo lleva el prefijo ink_
  --  y no comparte tablas con nadie.
  -- =================================================================

  -- Una edición es el reto de un semestre. Como en la jam, es la unidad que
  -- se repite: al semestre siguiente se abre otra y la anterior queda
  -- archivada con sus palabras, sus dibujos y su podio.
  --
  -- La columna inicio es el DÍA 1 en AAAA-MM-DD, sin hora: aquí no hay un reloj de
  -- horas sino un calendario, y de esa fecha sale sola la cuenta de en qué
  -- día y en qué semana va el reto.
  --
  -- Los tres interruptores del final son lo que la organización va abriendo:
  -- la lista completa de palabras (si no, se destapan día por día), la
  -- galería y el podio.
  CREATE TABLE IF NOT EXISTS ink_ediciones (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    periodo_id          INTEGER,
    nombre              TEXT NOT NULL,
    estado              TEXT NOT NULL DEFAULT 'inscripcion',
    inscripcion_abierta INTEGER NOT NULL DEFAULT 1,
    inicio              TEXT,
    dias                INTEGER NOT NULL DEFAULT 28,
    semanas             INTEGER NOT NULL DEFAULT 4,
    cupo                INTEGER,
    drive_url           TEXT,
    nomenclatura        TEXT NOT NULL DEFAULT '{CODIGO}_{DIA}_{TECNICA}',
    lista_publica       INTEGER NOT NULL DEFAULT 0,
    galeria_publica     INTEGER NOT NULL DEFAULT 0,
    resultados_publicos INTEGER NOT NULL DEFAULT 0,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (periodo_id) REFERENCES periodos(id)
  );

  CREATE INDEX IF NOT EXISTS idx_ink_ed_periodo ON ink_ediciones(periodo_id);

  -- Las palabras del reto, una por día. Se cargan todas de una desde el panel
  -- y se guardan desde el primer día: lo que decide si una palabra se ve no
  -- es una columna sino la fecha (o el interruptor de lista completa), así
  -- que no hay nada que apagar y prender a mano cada mañana.
  CREATE TABLE IF NOT EXISTS ink_palabras (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    edicion_id INTEGER NOT NULL,
    dia        INTEGER NOT NULL,
    palabra    TEXT NOT NULL,
    pista      TEXT,
    UNIQUE (edicion_id, dia),
    FOREIGN KEY (edicion_id) REFERENCES ink_ediciones(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_ink_pal_edicion ON ink_palabras(edicion_id, dia);

  -- Quien se inscribe. Aquí no hay equipos: la unidad es la persona, y su
  -- correo institucional es su identidad dentro de la edición. El código de
  -- 6 caracteres es el mismo invento del resto del sitio y además es la
  -- primera pieza del nombre de cada archivo que sube al Drive.
  --
  -- La columna drive_enviado_at es lo que evita mandarle el enlace dos veces
  -- a la misma persona cuando se reenvía en bloque a los aprobados.
  CREATE TABLE IF NOT EXISTS ink_participantes (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    edicion_id       INTEGER NOT NULL,
    codigo           TEXT NOT NULL UNIQUE,
    nombre           TEXT NOT NULL,
    email            TEXT NOT NULL COLLATE NOCASE,
    semestre         TEXT,
    tecnica          TEXT,
    usuario          TEXT,
    estado           TEXT NOT NULL DEFAULT 'pendiente',
    nota_docente     TEXT,
    revisado_por     INTEGER,
    revisado_at      DATETIME,
    drive_enviado_at DATETIME,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (edicion_id, email),
    FOREIGN KEY (edicion_id)   REFERENCES ink_ediciones(id) ON DELETE CASCADE,
    FOREIGN KEY (revisado_por) REFERENCES docentes(id)
  );

  CREATE INDEX IF NOT EXISTS idx_ink_part_edicion ON ink_participantes(edicion_id, estado);

  -- Un dibujo: una persona, un día. Los archivos viven en el Drive del
  -- evento —esta app no recibe imágenes—, así que lo que se guarda es el
  -- enlace y con qué se dibujó. El UNIQUE de (participante, día) es la regla
  -- del reto escrita en la base: un dibujo por día y por persona; volver a
  -- cargar el mismo día reemplaza el enlace en vez de duplicarlo.
  CREATE TABLE IF NOT EXISTS ink_dibujos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    edicion_id      INTEGER NOT NULL,
    participante_id INTEGER NOT NULL,
    dia             INTEGER NOT NULL,
    tecnica         TEXT NOT NULL DEFAULT 'digital',
    url             TEXT NOT NULL,
    titulo          TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (participante_id, dia),
    FOREIGN KEY (edicion_id)      REFERENCES ink_ediciones(id)     ON DELETE CASCADE,
    FOREIGN KEY (participante_id) REFERENCES ink_participantes(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_ink_dib_edicion ON ink_dibujos(edicion_id, dia);
  CREATE INDEX IF NOT EXISTS idx_ink_dib_persona ON ink_dibujos(participante_id, dia);

  -- El podio. Un mismo dibujo puede ganar su semana, entrar al top y ser el
  -- mejor digital: por eso los premios son una tabla aparte y no una columna
  -- del dibujo.
  --
  --   tipo    — 'semana' (uno por cada semana), 'top' (el top del final),
  --             'digital' y 'analogo' (los mejores de cada técnica).
  --   semana  — solo cuenta para tipo 'semana'; en los demás va en 0 y no en
  --             NULL, porque en SQLite dos NULL no chocan entre sí y el
  --             UNIQUE de abajo dejaría dos primeros puestos del top.
  --   puesto  — el orden dentro de su categoría. En 'semana' siempre es 1.
  CREATE TABLE IF NOT EXISTS ink_premios (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    edicion_id      INTEGER NOT NULL,
    tipo            TEXT NOT NULL,
    semana          INTEGER NOT NULL DEFAULT 0,
    puesto          INTEGER NOT NULL DEFAULT 1,
    dibujo_id       INTEGER NOT NULL,
    participante_id INTEGER NOT NULL,
    nota            TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (edicion_id, tipo, semana, puesto),
    FOREIGN KEY (edicion_id)      REFERENCES ink_ediciones(id)     ON DELETE CASCADE,
    FOREIGN KEY (dibujo_id)       REFERENCES ink_dibujos(id)       ON DELETE CASCADE,
    FOREIGN KEY (participante_id) REFERENCES ink_participantes(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_ink_prem_edicion ON ink_premios(edicion_id, tipo);
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
// Cuándo se le avisó por correo al estudiante. Nulo = todavía no sabe que su
// certificado existe; es lo que evita repetirle el aviso cada vez que se
// regeneran los certificados de la materia.
agregarColumna("certificados", "avisado_at", "DATETIME");

// ---------- Semestre inicial ----------
// Si no hay ninguno, se crea el de config.js y se marca activo.
if (!db.prepare("SELECT COUNT(*) AS n FROM periodos").get().n) {
  db.prepare("INSERT INTO periodos (codigo, activo) VALUES (?, 1)").run(PERIODO_INICIAL);
}
// Siempre tiene que haber exactamente uno activo.
if (!db.prepare("SELECT COUNT(*) AS n FROM periodos WHERE activo = 1").get().n) {
  db.prepare("UPDATE periodos SET activo = 1 WHERE id = (SELECT MAX(id) FROM periodos)").run();
}

const periodoBase = db.prepare("SELECT id FROM periodos WHERE activo = 1").get().id;

// ---------- Cada dato de estudiante cuelga de un semestre ----------
for (const tabla of ["proyectos", "solicitudes", "estudiantes", "certificados"]) {
  agregarColumna(tabla, "periodo_id", "INTEGER REFERENCES periodos(id)");
  // Lo que existía antes de esta versión es del semestre inicial.
  db.prepare(`UPDATE ${tabla} SET periodo_id = ? WHERE periodo_id IS NULL`).run(periodoBase);
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_proy_periodo ON proyectos(periodo_id);
  CREATE INDEX IF NOT EXISTS idx_sol_periodo  ON solicitudes(periodo_id, materia_id);
  CREATE INDEX IF NOT EXISTS idx_cert_periodo ON certificados(periodo_id);
`);

// La identidad de un estudiante es su correo, pero dentro de un semestre: la
// misma persona puede volver a cursar la materia el año siguiente. Como SQLite
// no deja cambiar un UNIQUE con ALTER, la tabla se rehace.
const sqlEstudiantes = db
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'estudiantes'")
  .get();

if (sqlEstudiantes && !/UNIQUE \(materia_id, periodo_id, email\)/.test(sqlEstudiantes.sql)) {
  db.exec("BEGIN");
  try {
    db.exec(`
      CREATE TABLE estudiantes_nuevo (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        materia_id  INTEGER NOT NULL,
        periodo_id  INTEGER,
        nombre      TEXT NOT NULL,
        email       TEXT COLLATE NOCASE,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (materia_id, periodo_id, email),
        FOREIGN KEY (materia_id) REFERENCES materias(id) ON DELETE CASCADE,
        FOREIGN KEY (periodo_id) REFERENCES periodos(id)
      );

      INSERT INTO estudiantes_nuevo (id, materia_id, periodo_id, nombre, email, created_at)
        SELECT id, materia_id, periodo_id, nombre, email, created_at FROM estudiantes;

      DROP TABLE estudiantes;
      ALTER TABLE estudiantes_nuevo RENAME TO estudiantes;
    `);
    db.exec("COMMIT");
    console.log("  ✓ estudiantes: la clave única ahora incluye el semestre");
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
