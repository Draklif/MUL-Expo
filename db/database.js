const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const { DOCENTES, PERIODO, VC, JAM, MUSIC, INK, BECAS } = require("../config");

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

  -- =================================================================
  --  CERTIFICADOS
  --  Esta tabla NO es de la Expo: es del programa. La misma fila sirve
  --  para un proyecto de la muestra, un jugador del torneo, un equipo de
  --  la jam, un grupo del festival o quien se subió al bus de una salida.
  --  Un solo código, una sola página y un solo QR para los cinco.
  --
  --  Los datos se congelan al emitirlos: si después cambia una nota, se
  --  borra un proyecto o se le cambia el nombre a un equipo, el
  --  certificado que alguien ya compartió sigue diciendo lo mismo.
  -- =================================================================
  CREATE TABLE IF NOT EXISTS certificados (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo       TEXT NOT NULL UNIQUE,
    -- Slug del evento, o 'salidas' —que no es un evento y por eso no está
    -- en config.EVENTOS, pero sí certifica—.
    evento       TEXT NOT NULL DEFAULT 'expo',
    periodo_id   INTEGER,
    -- A quién se le emitió. ref_tipo dice de qué tabla sale ref_id, y no
    -- hay llave foránea por la misma razón que salida_registros.salida no
    -- la tiene: apuntan a tablas distintas, y una de ellas ni siquiera es
    -- una tabla (una salida vive en config).
    ref_tipo     TEXT NOT NULL DEFAULT 'proyecto',
    ref_id       TEXT NOT NULL,
    -- Sobre qué se emite en bloque: la materia, el torneo, la edición o
    -- la salida. Es lo que un botón del panel genera de una sola vez.
    lote         TEXT NOT NULL,
    persona      TEXT NOT NULL,
    email        TEXT COLLATE NOCASE,
    titulo       TEXT NOT NULL,   -- proyecto | equipo | grupo | área | salida
    contexto     TEXT,            -- materia | juego | edición | lugar
    detalle      TEXT,            -- sala | disciplina | rol | fecha
    puesto       INTEGER,         -- solo la Expo: 1, 2, 3
    premio       TEXT,            -- id del premio en config; nulo = participación
    premio_label TEXT NOT NULL,   -- lo que dice el certificado, congelado
    premio_cls   TEXT NOT NULL,   -- oro | plata | bronce | part
    companeros   TEXT,
    firma        TEXT,
    firma_cargo  TEXT,
    -- Solo la Expo. Se conservan para que borrar una materia siga
    -- llevándose sus certificados, que es como funciona desde el principio.
    materia_id   INTEGER,
    proyecto_id  INTEGER,
    emitido_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    avisado_at   DATETIME,
    UNIQUE (evento, ref_tipo, ref_id, persona),
    FOREIGN KEY (materia_id)  REFERENCES materias(id)  ON DELETE CASCADE,
    FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE SET NULL,
    FOREIGN KEY (periodo_id)  REFERENCES periodos(id)
  );

  -- Los índices de certificados NO van aquí: en una base que viene de antes,
  -- este bloque corre cuando la tabla todavía tiene la forma vieja y un índice
  -- sobre 'evento' no existiría todavía. Se crean después de la migración.

  -- Los premios que un docente le adjudicó a alguien. En la Expo el podio se
  -- calcula de las notas y no pasa por aquí; en el torneo, la jam y el
  -- festival no hay nota que calcular —quién fue el mejor apartado artístico
  -- lo decide un jurado—, así que la designación se guarda.
  --
  -- Las categorías salen de config (VC.premios, JAM.premios, MUSIC.premios) y
  -- aquí solo queda el id: agregar una categoría no pide migración, y quitarla
  -- deja una fila que simplemente deja de mostrarse.
  CREATE TABLE IF NOT EXISTS premios_evento (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    evento       TEXT NOT NULL,
    lote         TEXT NOT NULL,   -- torneo_id | edicion_id
    premio       TEXT NOT NULL,   -- id de la categoría en config
    ref_tipo     TEXT NOT NULL,   -- vc_equipo | vc_jugador | jam_equipo | music_acto | music_persona
    ref_id       INTEGER NOT NULL,
    otorgado_por INTEGER,
    otorgado_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    -- Un ganador por categoría y por edición. Declarar otro reemplaza al
    -- anterior en vez de dejar dos campeones.
    UNIQUE (evento, lote, premio),
    FOREIGN KEY (otorgado_por) REFERENCES docentes(id)
  );

  CREATE INDEX IF NOT EXISTS idx_premios_lote ON premios_evento(evento, lote);

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
  --  MULTIMEDIA MUSIC FEST
  --  Una tarde de música y baile. Se inscriben DOS cosas distintas y por
  --  eso son dos tablas y no una con una columna "tipo": un grupo sube a
  --  la tarima y una persona se para detrás de una consola. No comparten
  --  ni los campos ni el cupo ni la conversación.
  --
  --  Lo que NO está aquí es el itinerario de la tarde: ese se cura a mano
  --  en data/music-fest.json, igual que el de la Expo. La base dice
  --  quién está adentro; el JSON, a qué hora toca cada quien.
  -- =================================================================
  CREATE TABLE IF NOT EXISTS music_ediciones (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    periodo_id          INTEGER,
    nombre              TEXT NOT NULL,
    estado              TEXT NOT NULL DEFAULT 'inscripcion',
    inscripcion_abierta INTEGER NOT NULL DEFAULT 1,
    fecha               TEXT,
    lugar               TEXT,
    cupo_actos          INTEGER,
    cupo_produccion     INTEGER,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (periodo_id) REFERENCES periodos(id)
  );

  CREATE INDEX IF NOT EXISTS idx_music_ed_periodo ON music_ediciones(periodo_id);

  -- Los grupos que suben a la tarima. Mismo código de 6 caracteres que el
  -- resto del sitio: se dicta, se teclea y con él se consulta el estado.
  --
  -- 'orden' es el lugar en el cartel, no la hora: un cartel de festival se
  -- lee de mayor a menor y el que cierra la tarde va de primero y más
  -- grande. La hora exacta vive en el itinerario del JSON.
  CREATE TABLE IF NOT EXISTS music_actos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    edicion_id      INTEGER NOT NULL,
    codigo          TEXT NOT NULL UNIQUE,
    nombre          TEXT NOT NULL,
    tipo            TEXT NOT NULL,
    genero          TEXT,
    integrantes     INTEGER NOT NULL DEFAULT 1,
    propuesta       TEXT,
    necesidades     TEXT,
    enlace          TEXT,
    contacto_nombre TEXT NOT NULL,
    contacto_email  TEXT NOT NULL COLLATE NOCASE,
    telefono        TEXT,
    estado          TEXT NOT NULL DEFAULT 'pendiente',
    nota_docente    TEXT,
    revisado_por    INTEGER,
    revisado_at     DATETIME,
    avisado_at      DATETIME,
    orden           INTEGER NOT NULL DEFAULT 0,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (edicion_id, contacto_email),
    FOREIGN KEY (edicion_id)   REFERENCES music_ediciones(id) ON DELETE CASCADE,
    FOREIGN KEY (revisado_por) REFERENCES docentes(id)
  );

  CREATE INDEX IF NOT EXISTS idx_music_actos_ed ON music_actos(edicion_id, estado, orden);

  -- El equipo de producción: una persona, un área. Se elige una y no varias
  -- porque quien mezcla el sonido no está moviendo luces al mismo tiempo.
  -- El correo institucional es la identidad y por eso no se repite dentro
  -- de una edición.
  CREATE TABLE IF NOT EXISTS music_produccion (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    edicion_id   INTEGER NOT NULL,
    codigo       TEXT NOT NULL UNIQUE,
    nombre       TEXT NOT NULL,
    email        TEXT NOT NULL COLLATE NOCASE,
    telefono     TEXT,
    semestre     TEXT,
    area         TEXT NOT NULL,
    experiencia  TEXT,
    estado       TEXT NOT NULL DEFAULT 'pendiente',
    nota_docente TEXT,
    revisado_por INTEGER,
    revisado_at  DATETIME,
    avisado_at   DATETIME,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (edicion_id, email),
    FOREIGN KEY (edicion_id)   REFERENCES music_ediciones(id) ON DELETE CASCADE,
    FOREIGN KEY (revisado_por) REFERENCES docentes(id)
  );

  CREATE INDEX IF NOT EXISTS idx_music_prod_ed ON music_produccion(edicion_id, area, estado);

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
    -- La asistencia del día de la salida. Tres estados y no dos: NULL es
    -- "todavía no lo he mirado", que en la puerta del bus es distinto de
    -- "no vino". Sin el nulo, una lista a medio pasar se lee como si media
    -- clase se hubiera quedado en tierra.
    asistio           INTEGER,
    asistencia_at     DATETIME,
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
  --  SEMILLERO DE INVESTIGACIÓN — SAMI
  --  Todo lo suyo lleva el prefijo sami_ y no comparte tablas con nadie.
  --
  --  Esto reemplaza dos hojas de cálculo que el programa llevaba a mano:
  --  una con el estado de cada proyecto semestre por semestre, y otra con
  --  las dieciséis reuniones del semestre. Las dos se sostenían con
  --  IMPORTRANGE y XLOOKUP entre archivos, y las cifras que el programa
  --  necesita —cuántos van, cuántos terminaron, a quién le falta CEB— había
  --  que sacarlas a mano. Aquí son una consulta.
  --
  --  A diferencia de las salidas, aquí NO hay un config del que salga la
  --  cosa: una salida es un objeto de config.SALIDAS y solo se guarda quién
  --  se apuntó, pero un proyecto de semillero dura tres semestres, cambia de
  --  director, de estado y de integrantes. Eso es una fila, no una línea de
  --  configuración.
  -- =================================================================

  -- El proyecto es la unidad. Dura tres semestres, lo hacen uno o dos
  -- estudiantes, lo dirige un docente del programa y a veces lo codirige
  -- alguien de fuera.
  --
  -- El título entra como "tentativo" —así lo pide la guía G-01-SEM— y se
  -- corrige después desde el panel: el que se registra casi nunca es el que
  -- se sustenta tres semestres más tarde.
  CREATE TABLE IF NOT EXISTS sami_proyectos (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo       TEXT NOT NULL UNIQUE,
    titulo       TEXT NOT NULL,
    -- Con qué perfil del semillero se siente cómodo el estudiante. NO es la
    -- línea de investigación: esa es del programa, es fija y es la misma para
    -- todos los proyectos, así que vive en config.SAMI y no en una columna que
    -- podría terminar diciendo cuatro cosas distintas.
    perfil       TEXT,
    ods          TEXT,
    -- La escalera de estados vive en lib/sami.js. Aquí solo se guarda en cuál
    -- va, como texto: una clave y no un número, para que la fila se pueda leer
    -- sin tener el código al lado.
    --
    -- 'registro' es donde caen los que llenan el formulario público: dejaron
    -- sus datos y nada más. Notificar la intención en la dirección del programa
    -- es el siguiente peldaño y se hace en persona.
    estado       TEXT NOT NULL DEFAULT 'registro',
    -- El semestre DENTRO del semillero (I, II, III y el IV de quien se pasó).
    -- No es el semestre de la carrera: ese es de cada estudiante y está en la
    -- otra tabla.
    semestre     TEXT,
    -- NULL es "NO ASIGNADO", que es un estado normal y no un dato faltante:
    -- así llega todo proyecto nuevo y así se queda hasta que el comité decide.
    director_id  INTEGER,
    -- Texto libre y no una llave a docentes: el codirector suele ser de otro
    -- programa o de otra universidad, y NO entra al sistema. Guardar su
    -- nombre es todo lo que hay que hacer con él.
    codirector   TEXT,
    -- Las fechas del trámite, cada una una columna del documento del programa.
    -- Nulas mientras no pasen, y ese nulo es información: un proyecto en
    -- desarrollo sin anteproyecto_at es un proyecto al que le falta un papel.
    --
    -- 'ingreso_at' es la primera de todas: el día que entró al semillero. NO es
    -- created_at —esa es cuándo se escribió la fila, que con los proyectos
    -- importados de la hoja vieja es el día de la importación y no dice nada— ni
    -- es periodo_id, que dice en qué SEMESTRE entró y no qué día. Se pregunta de
    -- verdad cuando hay que contar el plazo de los tres semestres.
    ingreso_at       DATE,  -- ingreso al semillero
    carta_at         DATE,  -- radicación al Consejo de Facultad
    propuesta_at     DATE,  -- presentación de la propuesta G-01-SEM
    aprobacion_at    DATE,  -- concepto del Comité de Investigación
    anteproyecto_at  DATE,  -- sustentación del anteproyecto
    -- Los dos comités. 'na' y no NULL porque "no aplica" es una decisión que
    -- alguien tomó, distinta de "todavía no lo hemos mirado" (que es
    -- 'pendiente'). Es la misma lección del asistio de las salidas.
    ceb              TEXT NOT NULL DEFAULT 'na',
    ceb_at           DATE,
    cpi              TEXT NOT NULL DEFAULT 'na',
    cpi_at           DATE,
    sustentacion_at  DATE,  -- sustentación final del proyecto
    publicacion      TEXT,  -- semestre de publicación, al quedar finalizado
    -- El semestre en que entró. No se mueve nunca: es de dónde viene, no
    -- dónde está.
    periodo_id   INTEGER,
    nota         TEXT,      -- nota interna, solo para docentes
    -- Se marca al mandar el correo de "propuesta aprobada". Nulo es lo que
    -- permite reintentarlo sin repetírselo a quien ya lo recibió.
    avisado_at   DATETIME,
    -- La cancelación, que es un hecho y no solo un estado: el proyecto existió,
    -- alguien decidió que no va y esa decisión tiene dueño y fecha. Es la misma
    -- lección de sami_notas.cerrada_por —lo que se deshace no queda anónimo—,
    -- y aquí pesa más porque cancelar le devuelve a sus estudiantes el cupo
    -- para radicar otro proyecto.
    --
    -- 'cancelado_desde' es el estado en el que iba. Se guarda para poder
    -- deshacerlo: sin él, reabrir un proyecto cancelado por error obligaría a
    -- adivinar si iba en anteproyecto o en desarrollo.
    cancelado_at     DATETIME,
    cancelado_por    INTEGER REFERENCES docentes(id),
    cancelado_motivo TEXT,
    cancelado_desde  TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (director_id) REFERENCES docentes(id),
    FOREIGN KEY (periodo_id)  REFERENCES periodos(id)
  );

  CREATE INDEX IF NOT EXISTS idx_sami_proy ON sami_proyectos(estado, created_at);

  -- Uno o dos por proyecto. 'activo' en 0 es quien se retiró: la fila NO se
  -- borra, porque sus reuniones y sus notas siguen siendo ciertas y son la
  -- constancia de lo que sí trabajó mientras estuvo.
  CREATE TABLE IF NOT EXISTS sami_estudiantes (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    proyecto_id        INTEGER NOT NULL,
    nombre             TEXT NOT NULL,
    codigo_estudiante  TEXT NOT NULL,
    documento          TEXT,
    telefono           TEXT,
    email              TEXT NOT NULL COLLATE NOCASE,
    -- El semestre de la CARRERA al vincularse. Se guarda tal como estaba ese
    -- día: sirve para saber que cumplía el mínimo, no para saber en cuál va
    -- hoy.
    semestre_academico INTEGER,
    activo             INTEGER NOT NULL DEFAULT 1,
    orden              INTEGER NOT NULL DEFAULT 0,
    created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
    -- Una persona, un cupo en su proyecto. El correo institucional es la
    -- identidad, igual que en el resto del sitio.
    UNIQUE (proyecto_id, email),
    FOREIGN KEY (proyecto_id) REFERENCES sami_proyectos(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sami_est ON sami_estudiantes(proyecto_id, orden);

  -- Los jurados del anteproyecto con su concepto. Tabla y no dos columnas
  -- porque a veces son tres, porque cada uno concluye por separado y porque
  -- uno puede aprobar mientras el otro pide volver a presentar.
  --
  -- docente_id puede ser NULL: un jurado invitado no está en config.DOCENTES
  -- y no por eso deja de haber firmado un concepto.
  CREATE TABLE IF NOT EXISTS sami_jurados (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    proyecto_id INTEGER NOT NULL,
    docente_id  INTEGER,
    nombre      TEXT NOT NULL,
    concepto    TEXT,
    concepto_at DATE,
    orden       INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (proyecto_id) REFERENCES sami_proyectos(id) ON DELETE CASCADE,
    FOREIGN KEY (docente_id)  REFERENCES docentes(id)
  );

  CREATE INDEX IF NOT EXISTS idx_sami_jur ON sami_jurados(proyecto_id, orden);

  -- Una reunión es del PROYECTO: los adelantos mostrados y lo que se
  -- comprometen a entregar son del trabajo, no de una persona. Por eso van
  -- aquí y no en la tabla de al lado.
  --
  -- 'semana' se calcula al guardar, con el calendario de config.SAMI, y se
  -- guarda ya resuelta: es lo que titula cada hoja del archivo viejo (S1…S16)
  -- y lo que hace que el CSV se pueda pegar ahí sin traducir nada. Recalcularla
  -- al leer cambiaría el pasado cada vez que se corrija el calendario.
  CREATE TABLE IF NOT EXISTS sami_reuniones (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    proyecto_id INTEGER NOT NULL,
    periodo_id  INTEGER NOT NULL,
    fecha       DATE NOT NULL,
    semana      INTEGER,
    adelantos   TEXT,
    compromisos TEXT,
    -- El docente a cargo, que es quien la registró. Sustituye a la "firma
    -- docente" de la hoja: una fila escrita desde una sesión con nombre y
    -- fecha dice más que una firma escaneada.
    docente_id  INTEGER NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (proyecto_id) REFERENCES sami_proyectos(id) ON DELETE CASCADE,
    FOREIGN KEY (periodo_id)  REFERENCES periodos(id),
    FOREIGN KEY (docente_id)  REFERENCES docentes(id)
  );

  CREATE INDEX IF NOT EXISTS idx_sami_reu ON sami_reuniones(proyecto_id, periodo_id, fecha);

  -- La asistencia y la calificación SÍ son de cada estudiante: en un proyecto
  -- de dos, uno puede haber faltado y el otro no.
  --
  -- 'asistio' con tres valores, como en las salidas: NULL es "todavía no lo he
  -- mirado", que no es lo mismo que "no vino". Sin ese nulo, una reunión a
  -- medio registrar se lee como si nadie hubiera ido.
  CREATE TABLE IF NOT EXISTS sami_asistencias (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    reunion_id    INTEGER NOT NULL,
    estudiante_id INTEGER NOT NULL,
    asistio       INTEGER,
    calificacion  REAL,
    UNIQUE (reunion_id, estudiante_id),
    FOREIGN KEY (reunion_id)    REFERENCES sami_reuniones(id)   ON DELETE CASCADE,
    FOREIGN KEY (estudiante_id) REFERENCES sami_estudiantes(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sami_asis ON sami_asistencias(estudiante_id);

  -- Los objetivos del semestre: las actividades que el estudiante se
  -- compromete a hacer en su propuesta, y contra las que el director saca la
  -- nota al final.
  --
  -- Son del PROYECTO y no de cada estudiante, igual que los adelantos de una
  -- reunión: la propuesta es una sola y el objetivo se cumplió o no se cumplió,
  -- que es un hecho del trabajo. Lo que sí distingue a los dos integrantes de un
  -- proyecto ya está en la tabla de al lado —su asistencia y su calificación
  -- reunión por reunión— y al final en la nota que escribe el director.
  --
  -- Van por PERIODO y no por proyecto a secas: un proyecto dura tres semestres
  -- y cada uno trae sus propios objetivos. Los del semestre pasado se quedan
  -- donde están, que es lo que permite abrir el selector de semestre y ver
  -- contra qué se calificó entonces.
  --
  -- 'nota' es NULL mientras no se haya calificado, y ese nulo cuenta: un
  -- objetivo sin calificar NO vale cero, vale que todavía no se miró. Por eso
  -- el promedio se saca solo sobre los calificados.
  CREATE TABLE IF NOT EXISTS sami_objetivos (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    proyecto_id    INTEGER NOT NULL,
    periodo_id     INTEGER NOT NULL,
    texto          TEXT NOT NULL,
    nota           REAL,
    orden          INTEGER NOT NULL DEFAULT 0,
    -- Quién puso la nota y cuándo. Se llenan al calificar y se vacían al
    -- borrar la nota: la misma regla de sami_notas, que una calificación se
    -- puede corregir pero no queda anónima.
    calificado_por INTEGER,
    calificado_at  DATETIME,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (proyecto_id)    REFERENCES sami_proyectos(id) ON DELETE CASCADE,
    FOREIGN KEY (periodo_id)     REFERENCES periodos(id),
    FOREIGN KEY (calificado_por) REFERENCES docentes(id)
  );

  CREATE INDEX IF NOT EXISTS idx_sami_obj ON sami_objetivos(proyecto_id, periodo_id, orden);

  -- La nota del semestre: una por estudiante y por periodo.
  --
  -- Se escribe a mano. El panel muestra al lado el promedio de las reuniones y
  -- el porcentaje de asistencia, pero no los precarga en la casilla: son un
  -- insumo para el docente, que también pesa cosas que no están en esta base.
  --
  -- 'semestre' se copia del proyecto al guardarla y se congela ahí: dentro de
  -- un año hay que poder decir que esta nota fue la del semestre II, aunque el
  -- proyecto ya vaya en el III.
  CREATE TABLE IF NOT EXISTS sami_notas (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    estudiante_id   INTEGER NOT NULL,
    periodo_id      INTEGER NOT NULL,
    semestre        TEXT,
    nota_director   REAL,
    -- NULL cuando no hay codirector. La nota final es el promedio de las dos
    -- cuando están las dos, y la del director sola cuando no.
    nota_codirector REAL,
    observacion     TEXT,
    -- Quién la puso y cuándo. Una nota se puede corregir, pero no se borra ni
    -- se vuelve anónima.
    cerrada_por     INTEGER,
    cerrada_at      DATETIME,
    UNIQUE (estudiante_id, periodo_id),
    FOREIGN KEY (estudiante_id) REFERENCES sami_estudiantes(id) ON DELETE CASCADE,
    FOREIGN KEY (periodo_id)    REFERENCES periodos(id),
    FOREIGN KEY (cerrada_por)   REFERENCES docentes(id)
  );

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

  -- =================================================================
  --  SERVICIO UNIVERSITARIO (BECAS)
  --  Las horas que un becario le devuelve al programa a cambio de su
  --  beca. Dos tablas y ninguna cifra guardada: cuántas lleva, cuántas
  --  le faltan y en qué estado va se cuentan sobre las actividades cada
  --  vez que se piden. En el Excel de la Universidad esas tres columnas
  --  son fórmulas; aquí son un SUM, y por la misma razón que en el
  --  semillero: una cifra guardada es una cifra que algún día va a
  --  estar mentida.
  -- =================================================================

  -- El becario de UN semestre. La beca se asigna semestre a semestre y con
  -- ella las horas, así que la misma persona vuelve a aparecer en el semestre
  -- siguiente como una fila nueva: es lo que permite abrir el semestre pasado
  -- y ver cómo cerró, en vez de un acumulado que ya no responde a nada.
  --
  -- Lo que NO está aquí: el ASPIRANTE ID de la hoja. Es la llave del sistema de
  -- becas de la Universidad y aquí no abre ninguna puerta —a la persona se la
  -- reconoce por su código de estudiante—, así que guardarlo era arrastrar un
  -- dato de otro sistema por si acaso. La columna se sigue saltando al pegar,
  -- porque en la hoja está y no se puede correr el resto.
  CREATE TABLE IF NOT EXISTS becas_becarios (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    periodo_id    INTEGER NOT NULL,
    -- Tal como está en el listado institucional: MAYÚSCULAS y con tildes. NO
    -- se capitaliza bonito. En la hoja de la Universidad la columna ESTUDIANTE
    -- es una lista desplegable cerrada, y un nombre "arreglado" no coincide
    -- con ninguna de sus opciones y deja la fila sin poder pegar.
    nombre        TEXT NOT NULL,
    codigo        TEXT NOT NULL,
    programa      TEXT,
    -- El semestre de la CARRERA, como en el semillero: se guarda tal como
    -- estaba el día de la carga y no se toca más.
    semestre      INTEGER,
    dependencia   TEXT,
    -- Quién responde por estas horas ante el Comité de Becas. Empieza siendo el
    -- de la hoja —el director del programa para todos— y se reparte desde el
    -- panel: es por lo que se filtra la lista, porque lo primero que hace un
    -- docente al entrar es buscar a los suyos.
    --
    -- Texto libre y no una llave a docentes: en la hoja es un nombre escrito a
    -- la manera de Registro y Control ("OCHOA ECHEVERRIA MAURICIO"), que no
    -- tiene por qué coincidir con ninguno de config.DOCENTES, y un responsable
    -- puede ser alguien que no entra a este panel.
    responsable   TEXT,
    horas_meta    REAL NOT NULL,
    -- 'activo' en 0 es quien perdió la beca o se retiró a mitad de semestre.
    -- La fila NO se borra: las horas que alcanzó a hacer siguen siendo ciertas
    -- y son la constancia de lo que sí trabajó mientras estuvo.
    activo        INTEGER NOT NULL DEFAULT 1,
    nota          TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    -- Un código, un cupo por semestre. El código del estudiante es la
    -- identidad aquí y no el correo, porque el listado de becas viene de
    -- Registro y Control y trae código, no correo.
    UNIQUE (periodo_id, codigo),
    FOREIGN KEY (periodo_id) REFERENCES periodos(id)
  );

  CREATE INDEX IF NOT EXISTS idx_becas_bec ON becas_becarios(periodo_id, nombre);

  -- Una sesión de trabajo: un renglón de la BITÁCORA. Es lo único que se
  -- escribe a mano en todo el módulo.
  --
  -- 'horas' es REAL porque el propio formato lo dice: "indique únicamente el
  -- número correspondiente (puede usar decimales)". Media hora es media hora.
  --
  -- 'docente_id' es quien la registró, igual que en las reuniones del
  -- semillero: una fila escrita desde una sesión con nombre y fecha dice más
  -- que una firma. No es quien acompañó al estudiante —eso, si hace falta, va
  -- en la descripción—, es quien responde por que este renglón exista.
  CREATE TABLE IF NOT EXISTS becas_actividades (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    becario_id  INTEGER NOT NULL,
    fecha       DATE NOT NULL,
    -- La clave de una de las diez de lib/becas.js. Se guarda la clave y no la
    -- etiqueta de la hoja para que el día que la Universidad reescriba
    -- "PROYECCIÓN SOCIAL" no haya que tocar las filas viejas.
    asignacion  TEXT NOT NULL,
    horas       REAL NOT NULL,
    descripcion TEXT,
    -- Un enlace a la evidencia del trabajo: la carpeta con las piezas, el video
    -- subido, el documento. Opcional siempre —hay sesiones que no dejan un
    -- archivo—, y es solo la DIRECCIÓN: los archivos no viven en esta app, como
    -- en INKreible y en el semillero. Nada más que http y https, que es lo
    -- único en lo que se puede hacer clic sin peligro.
    evidencia   TEXT,
    docente_id  INTEGER NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (becario_id) REFERENCES becas_becarios(id) ON DELETE CASCADE,
    FOREIGN KEY (docente_id) REFERENCES docentes(id)
  );

  CREATE INDEX IF NOT EXISTS idx_becas_act ON becas_actividades(becario_id, fecha);
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

// Y la contraria, para el dato que se decidió NO guardar. Un CREATE TABLE con
// la columna quitada no la quita de la base que ya existe: se queda ahí, vacía,
// y el que lea el esquema dentro de un año no va a saber cuál de los dos manda.
//
// Se usa con cuidado, que esto sí borra: solo para columnas que se retiraron a
// propósito y cuyo contenido no hay que conservar.
function quitarColumna(tabla, columna) {
  const existe = db
    .prepare(`PRAGMA table_info(${tabla})`)
    .all()
    .some((c) => c.name === columna);
  if (existe) db.exec(`ALTER TABLE ${tabla} DROP COLUMN ${columna}`);
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

// La asistencia llegó después de que ya hubiera salidas con gente inscrita.
agregarColumna("salida_registros", "asistio", "INTEGER");
agregarColumna("salida_registros", "asistencia_at", "DATETIME");

// El semillero arrancó preguntándole al estudiante por la línea y la sublínea
// de investigación, y eso estaba mal: la línea es del PROGRAMA, es fija y es la
// misma para todos los proyectos, así que preguntarla proyecto por proyecto
// solo servía para que cuatro filas dijeran cuatro cosas distintas de algo que
// tiene una sola respuesta. Ahora vive en config.SAMI.
//
// Lo que sí es de cada proyecto es el PERFIL —con cuál de los cuatro se siente
// cómodo el estudiante—, que es otra pregunta y no decide qué va a hacer.
//
// Las dos columnas viejas se quedan donde están en vez de reconstruir la tabla:
// no las lee nadie, y una reconstrucción con llaves foráneas apuntando a esta
// tabla es mucho riesgo para ganar dos columnas de espacio.
agregarColumna("sami_proyectos", "perfil", "TEXT");

// Cancelar un proyecto llegó después: hasta ahora la única salida era pasarlo a
// 'retirado', que dice otra cosa —que el estudiante se fue del semillero— y
// dejaba sin registrar lo único que de verdad hace falta saber después, que es
// por qué se canceló y quién lo decidió.
agregarColumna("sami_proyectos", "cancelado_at", "DATETIME");
agregarColumna("sami_proyectos", "cancelado_por", "INTEGER REFERENCES docentes(id)");
agregarColumna("sami_proyectos", "cancelado_motivo", "TEXT");
agregarColumna("sami_proyectos", "cancelado_desde", "TEXT");

// El día que entró al semillero. Va con las demás fechas del trámite y llegó
// después que ellas: se llevaba de memoria, y created_at no sirve de sustituto
// —en los proyectos que vinieron de la hoja vieja es el día de la importación—.
agregarColumna("sami_proyectos", "ingreso_at", "DATE");

// El enlace a la evidencia de una sesión de servicio universitario. Llegó
// después de las primeras cargas: la bitácora dice qué se hizo, y esto es dónde
// está lo que se hizo.
agregarColumna("becas_actividades", "evidencia", "TEXT");

// El ASPIRANTE ID de la hoja de becas, que se guardó al principio y se decidió
// no guardar: es la llave de otro sistema y aquí no abre nada, que a la persona
// se la reconoce por su código de estudiante.
quitarColumna("becas_becarios", "aspirante_id");

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

// ---------- El semestre más viejo del que hay becarios ----------
// El servicio universitario tiene historial hacia atrás: el archivo de la
// Universidad va por semestres y hay que poder subir los que ya pasaron. Para
// colgarle datos a un semestre, ese semestre tiene que existir aquí, y los
// anteriores al primer arranque de la app no existen —esta tabla solo la llena
// config.PERIODO, un semestre cada vez—.
//
// Así que se abre el de config.BECAS.desde si falta, INACTIVO y sin tocar al
// que esté en curso: no es "empezar" ese semestre, es reconocer que existió.
// Es idempotente y no crea la cadena entera; solo el que se pide.
if (BECAS.desde && !db.prepare("SELECT 1 FROM periodos WHERE codigo = ?").get(BECAS.desde)) {
  db.prepare("INSERT INTO periodos (codigo, activo) VALUES (?, 0)").run(BECAS.desde);
  console.log(`  ✓ Semestre ${BECAS.desde} abierto para el historial de becas.`);
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

  if (!db.prepare("SELECT 1 FROM music_ediciones WHERE periodo_id = ?").get(periodoActual.id)) {
    db.prepare(
      `INSERT INTO music_ediciones
         (periodo_id, nombre, estado, inscripcion_abierta, cupo_actos, cupo_produccion)
       VALUES (?, ?, 'inscripcion', 1, ?, ?)`
    ).run(
      periodoActual.id,
      `Multimedia Music Fest · ${PERIODO}`,
      MUSIC.cupo_actos || null,
      MUSIC.cupo_produccion || null
    );
    console.log(`  ✓ Edición del Music Fest abierta en ${PERIODO}.`);
  }

  if (!db.prepare("SELECT 1 FROM ink_ediciones WHERE periodo_id = ?").get(periodoActual.id)) {
    db.prepare(
      `INSERT INTO ink_ediciones
         (periodo_id, nombre, estado, inscripcion_abierta, dias, semanas, cupo, nomenclatura)
       VALUES (?, ?, 'inscripcion', 1, ?, ?, ?, ?)`
    ).run(
      periodoActual.id,
      `INKreible · ${PERIODO}`,
      INK.dias,
      INK.semanas,
      INK.cupo || null,
      INK.nomenclatura
    );
    // La carpeta de Drive y el día 1 no salen de aquí a propósito: los pone la
    // organización desde el panel del reto, porque no existen hasta que
    // alguien crea la carpeta del semestre y decide cuándo arranca.
    console.log(`  ✓ Edición de INKreible abierta en ${PERIODO}.`);
  }

  db.exec("COMMIT");
} catch (e) {
  db.exec("ROLLBACK");
  throw e;
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_proy_periodo ON proyectos(periodo_id);
  CREATE INDEX IF NOT EXISTS idx_sol_periodo  ON solicitudes(periodo_id, materia_id);
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

// ---------- El certificado deja de ser de la Expo ----------
// La tabla nació con forma de muestra —materia obligatoria, proyecto, sala— y
// ahora tiene que servirle también al torneo, a la jam, al festival y a las
// salidas. Como el cambio es de columnas y de clave única, la tabla se rehace.
//
// Lo único innegociable es que los `codigo` no se toquen: hay certificados
// repartidos por correo, con su QR impreso, y esos enlaces tienen que seguir
// abriendo lo mismo. Por eso se copian id y código tal cual y solo se
// reacomoda lo demás.
const sqlCertificados = db
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'certificados'")
  .get();

if (sqlCertificados && !/\bevento\b/.test(sqlCertificados.sql)) {
  db.exec("BEGIN");
  try {
    db.exec(`
      CREATE TABLE certificados_nuevo (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo       TEXT NOT NULL UNIQUE,
        evento       TEXT NOT NULL DEFAULT 'expo',
        periodo_id   INTEGER,
        ref_tipo     TEXT NOT NULL DEFAULT 'proyecto',
        ref_id       TEXT NOT NULL,
        lote         TEXT NOT NULL,
        persona      TEXT NOT NULL,
        email        TEXT COLLATE NOCASE,
        titulo       TEXT NOT NULL,
        contexto     TEXT,
        detalle      TEXT,
        puesto       INTEGER,
        premio       TEXT,
        premio_label TEXT NOT NULL,
        premio_cls   TEXT NOT NULL,
        companeros   TEXT,
        firma        TEXT,
        firma_cargo  TEXT,
        materia_id   INTEGER,
        proyecto_id  INTEGER,
        emitido_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        avisado_at   DATETIME,
        UNIQUE (evento, ref_tipo, ref_id, persona),
        FOREIGN KEY (materia_id)  REFERENCES materias(id)  ON DELETE CASCADE,
        FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE SET NULL,
        FOREIGN KEY (periodo_id)  REFERENCES periodos(id)
      );

      -- El puesto se queda como número —la Expo lo calcula de las notas— y
      -- además se escribe ya redactado, porque a partir de ahora es lo que
      -- lee la página: los premios de los otros eventos no son números.
      INSERT INTO certificados_nuevo
        (id, codigo, evento, periodo_id, ref_tipo, ref_id, lote, persona, email,
         titulo, contexto, detalle, puesto, premio_label, premio_cls,
         companeros, firma, firma_cargo, materia_id, proyecto_id, emitido_at, avisado_at)
      SELECT id, codigo, 'expo', periodo_id, 'proyecto',
             CAST(COALESCE(proyecto_id, -id) AS TEXT), CAST(materia_id AS TEXT),
             estudiante, email, proyecto_titulo, materia_nombre, sala_nombre, puesto,
             CASE puesto WHEN 1 THEN 'Primer puesto'
                         WHEN 2 THEN 'Segundo puesto'
                         WHEN 3 THEN 'Tercer puesto'
                         ELSE 'Participación' END,
             CASE puesto WHEN 1 THEN 'oro'
                         WHEN 2 THEN 'plata'
                         WHEN 3 THEN 'bronce'
                         ELSE 'part' END,
             companeros, docente, 'Docente de ' || materia_nombre,
             materia_id, proyecto_id, emitido_at, avisado_at
      FROM certificados;

      DROP TABLE certificados;
      ALTER TABLE certificados_nuevo RENAME TO certificados;
    `);
    db.exec("COMMIT");
    console.log("  ✓ certificados: ahora sirven a todos los eventos, no solo a la Expo");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

// Aquí y no en el bloque de esquema: un DROP TABLE se lleva sus índices por
// delante, así que estos se crean cuando la tabla ya tiene su forma final —la
// haya estrenado esta base o se la acabe de dar la migración de arriba—.
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_cert_lote    ON certificados(evento, lote);
  CREATE INDEX IF NOT EXISTS idx_cert_email   ON certificados(email);
  CREATE INDEX IF NOT EXISTS idx_cert_periodo ON certificados(periodo_id);
`);

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
