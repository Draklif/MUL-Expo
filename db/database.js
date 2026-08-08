const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const { DOCENTES, PERIODO, VC, JAM } = require("../config");

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
  -- Un equipo puede ser de UNA persona: quien entra en solitario es un equipo
  -- de uno y entrega su juego como cualquier otro. Eso lo marca la columna
  -- "solitario" (ver más abajo, en las migraciones suaves), y es distinto de
  -- quien se inscribe solo BUSCANDO equipo —ese no tiene fila aquí: vive en
  -- jam_integrantes con equipo_id nulo hasta que la organización lo ubique—.
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
  --  SALIDAS PEDAGÓGICAS
  --  Una salida no es un evento del programa y no tiene tabla propia:
  --  vive entera en config.SALIDAS —a dónde se va, cuándo, cuánto
  --  cuesta y quién cobra— y aquí solo queda quién se apuntó.
  --
  --  Por eso la columna 'salida' es el id de texto del config y no una llave a otra
  --  tabla: no hay dos verdades que puedan contradecirse, y una salida
  --  que se quite del config se lleva su página pero no borra a nadie.
  -- =================================================================
  CREATE TABLE IF NOT EXISTS salida_registros (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    salida            TEXT NOT NULL,
    periodo_id        INTEGER,
    codigo            TEXT NOT NULL UNIQUE,
    nombre            TEXT NOT NULL,
    codigo_estudiante TEXT NOT NULL,
    tipo_id           TEXT NOT NULL,
    num_id            TEXT NOT NULL,
    telefono          TEXT NOT NULL,
    email             TEXT NOT NULL COLLATE NOCASE,
    -- Los dos pagos. Se marcan por separado porque se pagan por separado, y
    -- el estudiante no queda confirmado hasta que estén los dos.
    pago_transporte   INTEGER NOT NULL DEFAULT 0,
    pago_poliza       INTEGER NOT NULL DEFAULT 0,
    transporte_at     DATETIME,
    poliza_at         DATETIME,
    -- Cuándo quedaron los dos pagos y cuándo se le avisó. Van separados: el
    -- correo puede fallar, y avisado_at nulo es lo que permite reintentarlo
    -- sin volver a mandárselo a los cuarenta que ya lo recibieron.
    confirmado_at     DATETIME,
    avisado_at        DATETIME,
    cobrado_por       INTEGER,
    nota              TEXT,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    -- Una persona, un cupo. El correo institucional es la identidad, igual
    -- que en el resto del sitio.
    UNIQUE (salida, email),
    FOREIGN KEY (periodo_id) REFERENCES periodos(id),
    FOREIGN KEY (cobrado_por) REFERENCES docentes(id)
  );

  CREATE INDEX IF NOT EXISTS idx_sal_reg ON salida_registros(salida, created_at);

  -- =================================================================
  --  PATROCINIOS
  --  Marcas que escriben ofreciendo acompañar la Expo. Esto NO es la
  --  lista de patrocinadores que se ve en la página: esa se cura a mano
  --  en data/expo.json, junto con el logo. Aquí solo queda quién tocó
  --  la puerta, que es un dato distinto y de otra naturaleza.
  --
  --  Sin código y sin estado, a diferencia de 'solicitudes': un código
  --  sirve para consultar el estado, y aquí no hay panel que lo mueva.
  --  La fila es la constancia; el correo al organizador es el aviso.
  -- =================================================================
  CREATE TABLE IF NOT EXISTS patrocinios (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    periodo_id      INTEGER,
    marca           TEXT NOT NULL,
    sitio           TEXT,
    tipo            TEXT NOT NULL,
    mensaje         TEXT,
    contacto_nombre TEXT NOT NULL,
    -- Sin COLLATE de dominio ni validación institucional: una marca de
    -- afuera no tiene correo @uniboyaca.edu.co.
    contacto_email  TEXT NOT NULL COLLATE NOCASE,
    telefono        TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (periodo_id) REFERENCES periodos(id)
  );

  CREATE INDEX IF NOT EXISTS idx_patrocinios_periodo ON patrocinios(periodo_id, created_at);
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
// Un equipo de la jam que es UNA persona porque así se inscribió. No es lo
// mismo que un equipo que se quedó en uno porque los demás se retiraron, y por
// eso se guarda en vez de deducirse de contar integrantes: quien entra en
// solitario eligió entrar en solitario, y la página tiene que decirlo así.
agregarColumna("jam_equipos", "solitario", "INTEGER NOT NULL DEFAULT 0");
// Cuándo se le avisó por correo al estudiante. Nulo = todavía no sabe que su
// certificado existe; es lo que evita repetirle el aviso cada vez que se
// regeneran los certificados de la materia.
agregarColumna("certificados", "avisado_at", "DATETIME");

// ---------- Semestres ----------
// La base tiene que tener al menos uno antes de poder repartir nada.
if (!db.prepare("SELECT COUNT(*) AS n FROM periodos").get().n) {
  db.prepare("INSERT INTO periodos (codigo, activo) VALUES (?, 1)").run(PERIODO);
}

// El más viejo de todos. Es a donde va lo que venga de una versión anterior a
// los semestres, y se calcula ANTES de tocar el de config: si no, estrenar un
// semestre nuevo se llevaría consigo los proyectos de hace dos años.
const periodoBase = db.prepare("SELECT id FROM periodos ORDER BY id LIMIT 1").get().id;

// ---------- Cada dato de estudiante cuelga de un semestre ----------
for (const tabla of ["proyectos", "solicitudes", "estudiantes", "certificados"]) {
  agregarColumna(tabla, "periodo_id", "INTEGER REFERENCES periodos(id)");
  // Lo que existía antes de esta versión es del semestre más antiguo.
  db.prepare(`UPDATE ${tabla} SET periodo_id = ? WHERE periodo_id IS NULL`).run(periodoBase);
}

// ---------- El semestre en curso lo dice config.PERIODO ----------
// Cambiar esa línea y reiniciar es todo lo que hace falta para empezar de
// cero: aquí se crea si no existía y se deja como el único activo. Lo del
// semestre pasado no se toca, solo deja de ser el que recibe.
if (!db.prepare("SELECT 1 FROM periodos WHERE codigo = ?").get(PERIODO)) {
  db.prepare("INSERT INTO periodos (codigo, activo) VALUES (?, 0)").run(PERIODO);
  console.log(`  ✓ Semestre ${PERIODO} abierto.`);
}

const periodoActual = db.prepare("SELECT * FROM periodos WHERE codigo = ?").get(PERIODO);

if (!periodoActual.activo) {
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE periodos SET activo = 0").run();
    db.prepare("UPDATE periodos SET activo = 1 WHERE id = ?").run(periodoActual.id);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

// ---------- La temporada: lo que cada evento necesita para recibir ----------
// El torneo de cada juego y la edición de la jam se abren SOLOS, vacíos y en
// el semestre en curso. Es lo que hace que empezar el semestre siguiente sea
// cambiar config.PERIODO y ya: nadie tiene que acordarse de crear nada.
//
// Es idempotente —se corre en cada arranque y no duplica—, y lo que se abrió
// en semestres pasados se queda donde está con sus equipos y sus resultados.
db.exec("BEGIN");
try {
  // Lo de semestres pasados se marca cerrado. Que ya no reciba a nadie está
  // garantizado por el semestre —nada de otro periodo pasa los candados de
  // inscripción—, pero una fila que se quedó diciendo "inscripciones
  // abiertas" desde hace un año se lee mal en el panel, y el panel es para
  // saber qué está pasando de un vistazo.
  db.prepare(
    `UPDATE vc_torneos SET estado = 'finalizado', inscripcion_abierta = 0
      WHERE periodo_id != ? AND (estado != 'finalizado' OR inscripcion_abierta = 1)`
  ).run(periodoActual.id);

  db.prepare(
    `UPDATE jam_ediciones SET estado = 'finalizada', inscripcion_abierta = 0, entregas_abiertas = 0
      WHERE periodo_id != ? AND (estado != 'finalizada' OR inscripcion_abierta = 1 OR entregas_abiertas = 1)`
  ).run(periodoActual.id);

  const insertTorneo = db.prepare(
    `INSERT INTO vc_torneos (juego, nombre, periodo_id, estado, inscripcion_abierta)
     VALUES (?, ?, ?, 'inscripcion', 1)`
  );
  const hayTorneo = db.prepare("SELECT 1 FROM vc_torneos WHERE juego = ? AND periodo_id = ?");

  for (const juego of VC.juegos) {
    if (hayTorneo.get(juego.id, periodoActual.id)) continue;
    insertTorneo.run(juego.id, `Virtual Champions · ${juego.nombre}`, periodoActual.id);
    console.log(`  ✓ Torneo de ${juego.nombre} abierto en ${PERIODO}.`);
  }

  if (!db.prepare("SELECT 1 FROM jam_ediciones WHERE periodo_id = ?").get(periodoActual.id)) {
    db.prepare(
      `INSERT INTO jam_ediciones
         (periodo_id, nombre, estado, inscripcion_abierta, entregas_abiertas,
          horas, max_integrantes, cupo_equipos)
       VALUES (?, ?, 'inscripcion', 1, 1, ?, ?, ?)`
    ).run(
      periodoActual.id,
      `Jam de Altura · ${PERIODO}`,
      JAM.horas,
      JAM.max_integrantes,
      JAM.cupo_equipos || null
    );
    console.log(`  ✓ Edición de la Jam abierta en ${PERIODO}.`);
  }

  db.exec("COMMIT");
} catch (e) {
  db.exec("ROLLBACK");
  throw e;
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
