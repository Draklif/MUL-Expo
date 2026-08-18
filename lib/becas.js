// =====================================================================
//  Servicio Universitario — las horas de los becarios.
//
//  El módulo más pequeño del sitio, y a propósito. Aquí no hay trámite, no hay
//  estados que decidir, no hay correos y no hay estudiante: hay una lista de
//  becarios con unas horas que cumplir y un renglón por cada sesión de trabajo.
//  Todo lo demás se cuenta.
//
//  Tres ideas mandan:
//
//  1. Las CIFRAS se cuentan, nunca se guardan. Horas realizadas, pendientes y
//     estado salen de sumar las actividades cada vez que se piden. En el Excel
//     de la Universidad son las columnas J, K y L, que son fórmulas; aquí son
//     un SUM. Es la misma lección del semillero, y aquí pesa más: la cifra que
//     se guarda mal es la que decide si alguien cumplió con su beca.
//
//  2. El ESTADO no se decide, se deduce. Es lo contrario del semillero: allá
//     "en qué va" es un juicio del comité que ninguna columna puede deducir;
//     aquí es aritmética —cero horas, algunas, o todas— y no hay nada que
//     opinar. Un selector de estado en el panel solo serviría para dejarlo en
//     un valor que las horas contradicen.
//
//  3. Los NOMBRES son de la Universidad y no se tocan. En la hoja BITÁCORA la
//     columna ESTUDIANTE es una lista desplegable cerrada que sale del listado
//     institucional; un nombre capitalizado bonito o con un espacio de menos no
//     coincide con ninguna opción y deja la fila sin poder pegar. Por eso aquí
//     no se pasa por limpiarNombre() como en el resto del sitio: se guarda lo
//     que vino, en mayúsculas y con sus tildes.
//
//  Lo que este módulo NO hace, y hay que saberlo: no reemplaza el archivo de la
//  Universidad. Ese sigue siendo el documento oficial, se llena en línea y está
//  enlazado a un tablero del Comité de Becas. Lo que hay aquí es donde de
//  verdad se lleva la cuenta, y el CSV del final es el puente: se pega en la
//  BITÁCORA de un golpe en vez de escribir ochenta filas a mano.
// =====================================================================
const db = require("../db/database");
const { BECAS } = require("../config");
const { partirDia, dia, hoy } = require("./fechas");

// ---------------------------------------------------------------------
//  Las diez asignaciones
//
//  Son la lista de validación de la hoja DEPENDENCIAS del formato, en su mismo
//  orden. Viven aquí y no en config.js por la misma razón que la escalera del
//  semillero: no son una preferencia del programa sino una lista cerrada de la
//  Universidad, y cambiar una clave dejaría sin traducir las actividades ya
//  registradas. El propio formato lo dice: "si considera que deben incluirse
//  más actividades envíe un correo a becas@uniboyaca.edu.co".
//
//  `hoja` es la etiqueta LITERAL, en mayúsculas y con tildes, y existe para una
//  sola cosa: que el CSV se pegue en la BITÁCORA sin traducir nada. La celda de
//  ASIGNACIÓN también es un desplegable cerrado, así que "Difusión" no sirve;
//  tiene que decir "DIFUSIÓN".
//
//  `label` es la misma en bonito, para leerla en el panel sin gritar.
// ---------------------------------------------------------------------
const ASIGNACIONES = [
  { clave: "acompanamiento", label: "Acompañamiento docencia", hoja: "ACOMPAÑAMIENTO DOCENCIA" },
  { clave: "autoevaluacion", label: "Autoevaluación",          hoja: "AUTOEVALUACIÓN" },
  { clave: "difusion",       label: "Difusión",                hoja: "DIFUSIÓN" },
  { clave: "eventos",        label: "Eventos",                 hoja: "EVENTOS" },
  { clave: "investigacion",  label: "Investigación",           hoja: "INVESTIGACIÓN" },
  { clave: "laboratorios",   label: "Laboratorios",            hoja: "LABORATORIOS" },
  { clave: "proyeccion",     label: "Proyección social",       hoja: "PROYECCIÓN SOCIAL" },
  { clave: "egresados",      label: "Seguimiento egresados",   hoja: "SEGUIMIENTO EGRESADOS" },
  { clave: "tutorias",       label: "Tutorías",                hoja: "TUTORÍAS" },
  { clave: "otra",           label: "Otra",                    hoja: "OTRA" },
];

const ASIG_POR_CLAVE = new Map(ASIGNACIONES.map((a) => [a.clave, a]));

// La de siempre para comparar texto que escribió gente distinta: sin tildes,
// sin mayúsculas y sin dobles espacios.
const sinTildes = (v) =>
  String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/**
 * La asignación de una clave. Lo que no exista cae en 'otra' y no en nada:
 * una actividad sin asignación no se puede pegar en la hoja, y la hoja tiene
 * una opción justamente para lo que no encaja en las otras nueve.
 */
const asignacionDe = (clave) => ASIG_POR_CLAVE.get(String(clave || "")) || ASIG_POR_CLAVE.get("otra");

const asignacionValida = (v) => (ASIG_POR_CLAVE.has(String(v || "")) ? String(v) : null);

/** De la etiqueta de la hoja ("AUTOEVALUACIÓN") a la clave de aquí. */
function asignacionDesdeHoja(texto) {
  const buscado = sinTildes(texto);
  if (!buscado) return null;
  const a = ASIGNACIONES.find((x) => sinTildes(x.hoja) === buscado || sinTildes(x.label) === buscado);
  return a ? a.clave : null;
}

// ---------------------------------------------------------------------
//  Los tres estados
//
//  Los mismos tres de la columna L de la hoja y con sus mismas palabras. No se
//  guardan en ninguna parte: se deducen de las horas cada vez.
//
//  'finalizado' es horas hechas >= horas a realizar, con el >= a propósito.
//  En el listado real hay quien va en 22 de 20 y en 33 de 30, porque una sesión
//  no se parte por la mitad para cuadrar el total. Pasarse no es un error y la
//  hoja lo trata igual: resalta la fila en verde y avisa de no asignarle más
//  tiempo a ese estudiante.
// ---------------------------------------------------------------------
const ESTADOS = [
  { clave: "no-iniciado", label: "No iniciado",       hoja: "NO SE HA INICIADO", cls: "no" },
  { clave: "en-proceso",  label: "En proceso",        hoja: "EN PROCESO",        cls: "alerta" },
  { clave: "finalizado",  label: "Finalizado",        hoja: "FINALIZADO",        cls: "ok" },
];

const ESTADO_POR_CLAVE = new Map(ESTADOS.map((e) => [e.clave, e]));

function estadoDe(hechas, meta) {
  if (!hechas) return ESTADO_POR_CLAVE.get("no-iniciado");
  if (Number(meta) > 0 && hechas >= Number(meta)) return ESTADO_POR_CLAVE.get("finalizado");
  return ESTADO_POR_CLAVE.get("en-proceso");
}

// ---------------------------------------------------------------------
//  Números que entran de un formulario
// ---------------------------------------------------------------------

/**
 * Las horas de una sesión. Devuelve null si no es un número utilizable.
 *
 * Se acepta la coma decimal porque es como se escribe aquí ("1,5") y como sale
 * de un Excel en español; el tope de 24 es el único límite de sentido común que
 * vale la pena poner: nadie trabaja 200 horas en una sesión, y un cero de más
 * al teclear le daría por cumplida la beca a alguien.
 */
function horasValidas(v) {
  const n = Number(String(v == null ? "" : v).trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 24) return null;
  // Dos decimales de tope: la hoja pide un número, no una medición.
  return Math.round(n * 100) / 100;
}

/** Las horas a realizar de un becario: enteras o con media, y sin tope bajo. */
function metaValida(v) {
  const n = Number(String(v == null ? "" : v).trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 1000) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Una fecha de actividad. Se aceptan las dos formas con las que llega: la del
 * <input type="date"> ("2026-08-16") y la que escribe Excel al copiar
 * ("16/08/2026"), que es la que pide el formato.
 *
 * No se permite el futuro: la bitácora es de lo que ya se hizo, y una sesión
 * fechada el mes que viene son horas contadas antes de trabajarlas.
 */
function fechaValida(v) {
  const texto = String(v || "").trim();
  let iso = null;

  const directa = partirDia(texto);
  if (directa) iso = directa.fecha;

  if (!iso) {
    const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(texto);
    if (m) {
      const dos = (n) => String(n).padStart(2, "0");
      iso = `${m[3]}-${dos(m[2])}-${dos(m[1])}`;
    }
  }

  if (!iso) return null;

  // Que el día exista de verdad. "2026-02-31" tiene forma de fecha y no es un
  // día: sin esto se guardaría tal cual y la hoja lo recibiría como texto, no
  // como fecha. Se comprueba armando el día y viendo si Date lo devolvió igual
  // o se lo llevó al mes siguiente.
  const p = partirDia(iso);
  const d = new Date(p.anio, p.mes - 1, p.dia);
  if (d.getFullYear() !== p.anio || d.getMonth() !== p.mes - 1 || d.getDate() !== p.dia) return null;

  return iso > hoy() ? null : iso;
}

// El código del estudiante viene de Registro y Control: dígitos y nada más. Se
// limpia de espacios y de lo que traiga pegado la hoja.
const soloDigitos = (v) => String(v || "").replace(/\D+/g, "");

/**
 * El enlace a la evidencia de una sesión. Devuelve la dirección o null.
 *
 * Solo http y https, y esa lista corta es una regla de seguridad y no una
 * manía: lo que se guarde aquí termina en el `href` de un enlace del panel, y
 * un `javascript:` ahí es código que corre en la sesión del docente que le dé
 * clic. El escape de la plantilla no protege de eso —el texto sale bien
 * escapado y el navegador lo ejecuta igual—, así que se filtra al entrar.
 *
 * Se acepta pegar la dirección sin el "https://", que es como la copia todo el
 * mundo de la barra del navegador.
 */
function evidenciaValida(v) {
  const texto = String(v || "").trim();
  if (!texto) return null;

  const conEsquema = /^[a-z][a-z0-9+.-]*:/i.test(texto) ? texto : `https://${texto}`;

  let url;
  try {
    url = new URL(conEsquema);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return url.href.slice(0, 500);
}

// ---------------------------------------------------------------------
//  Leer
//
//  Una sola consulta con el SUM adentro y no una por becario: el panel enseña
//  treinta filas con sus horas, y contarlas de a una eran treinta consultas
//  para dibujar una tabla.
// ---------------------------------------------------------------------

// Lo que se le cuelga a una fila de becario para que la vista no tenga que
// calcular nada. `avance` va acotado a 100 aunque las horas se pasen: la barra
// se llena y ya, y lo que sobra se dice con el número.
function conCifras(fila) {
  if (!fila) return null;

  const meta = Number(fila.horas_meta) || 0;
  const hechas = Math.round((Number(fila.horas_hechas) || 0) * 100) / 100;
  const estado = estadoDe(hechas, meta);

  return {
    ...fila,
    horas_meta: meta,
    horas_hechas: hechas,
    pendientes: Math.max(0, Math.round((meta - hechas) * 100) / 100),
    // Lo que se hizo de más. Es un dato aparte y no un pendiente en negativo:
    // no es que falte, es que ya no hay que asignarle más tiempo.
    excedidas: Math.max(0, Math.round((hechas - meta) * 100) / 100),
    avance: meta > 0 ? Math.min(100, Math.round((hechas / meta) * 100)) : 0,
    sesiones: Number(fila.sesiones) || 0,
    ultima: fila.ultima || null,
    estado: estado.clave,
    estado_info: estado,
    activo: Boolean(fila.activo),
  };
}

const SELECT_BECARIO = `
  SELECT b.*,
         (SELECT COALESCE(SUM(a.horas), 0) FROM becas_actividades a WHERE a.becario_id = b.id) AS horas_hechas,
         (SELECT COUNT(*)                  FROM becas_actividades a WHERE a.becario_id = b.id) AS sesiones,
         (SELECT MAX(a.fecha)              FROM becas_actividades a WHERE a.becario_id = b.id) AS ultima
    FROM becas_becarios b
`;

/**
 * Los becarios de un semestre, con sus cifras ya sacadas.
 *
 * El orden se pone aquí y no en el ORDER BY: SQLite compara byte a byte y con
 * eso "MARÍA" cae después de "MARIA", así que dos personas que se llaman casi
 * igual quedan separadas en la lista. localeCompare ordena como ordena un
 * español, que es como se busca un nombre en una lista de treinta.
 */
function becarios(periodoId, { responsable = null } = {}) {
  const lista = db
    .prepare(`${SELECT_BECARIO} WHERE b.periodo_id = ?`)
    .all(periodoId)
    .map(conCifras)
    .sort((a, b) => b.activo - a.activo || a.nombre.localeCompare(b.nombre, "es"));

  if (!responsable) return lista;

  // Se compara normalizado —sin tildes ni mayúsculas— porque el mismo nombre
  // llega escrito de dos maneras: como lo trae la hoja y como lo teclea quien
  // reparte los becarios desde el panel.
  const buscado = sinTildes(responsable);
  return lista.filter((b) => sinTildes(b.responsable) === buscado);
}

/**
 * Los responsables que hay en un semestre, para el filtro y para la lista de
 * sugerencias al escribir uno.
 *
 * Salen de los becarios y no de config.DOCENTES: el responsable es un nombre de
 * la hoja de la Universidad, que no tiene por qué ser uno de los que entran a
 * este panel. Se cuenta cuántos lleva cada uno, que es lo que hace útil al
 * filtro —"los diez míos"— sin tener que abrirlo para averiguarlo.
 */
function responsables(periodoId) {
  const cuenta = new Map();

  for (const b of becarios(periodoId)) {
    const nombre = (b.responsable || "").trim();
    if (!nombre) continue;
    const clave = sinTildes(nombre);
    const ya = cuenta.get(clave);
    if (ya) ya.n++;
    else cuenta.set(clave, { nombre, n: 1 });
  }

  return [...cuenta.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Uno solo, por id. */
function becario(id) {
  return conCifras(db.prepare(`${SELECT_BECARIO} WHERE b.id = ?`).get(Number(id)));
}

/** Las actividades de un becario, de la más reciente a la más vieja. */
function actividadesDe(becarioId) {
  return db
    .prepare(
      `SELECT a.*, d.name AS docente
         FROM becas_actividades a
         LEFT JOIN docentes d ON d.id = a.docente_id
        WHERE a.becario_id = ?
        ORDER BY a.fecha DESC, a.id DESC`
    )
    .all(Number(becarioId))
    .map((a) => ({
      ...a,
      horas: Math.round((Number(a.horas) || 0) * 100) / 100,
      asignacion_info: asignacionDe(a.asignacion),
      dia: dia(a.fecha),
    }));
}

/**
 * Las cifras de arriba del panel: lo que en la hoja había que contar a mano
 * cada vez que el Comité de Becas preguntaba cómo va el programa.
 *
 * Aceptan el mismo filtro que la lista, y tienen que aceptarlo: unas cifras del
 * programa entero encima de una lista de diez becarios se leerían como si
 * fueran de esos diez. Lo que se ve arriba es siempre de lo que se ve abajo.
 */
function resumen(periodoId, filtros = {}) {
  const lista = becarios(periodoId, filtros).filter((b) => b.activo);

  const sumar = (fn) => lista.reduce((t, b) => t + fn(b), 0);
  const meta = sumar((b) => b.horas_meta);
  const hechas = sumar((b) => b.horas_hechas);

  return {
    becarios: lista.length,
    horas_meta: Math.round(meta * 100) / 100,
    horas_hechas: Math.round(hechas * 100) / 100,
    pendientes: Math.round(sumar((b) => b.pendientes) * 100) / 100,
    avance: meta > 0 ? Math.min(100, Math.round((hechas / meta) * 100)) : 0,
    finalizados: lista.filter((b) => b.estado === "finalizado").length,
    en_proceso: lista.filter((b) => b.estado === "en-proceso").length,
    sin_iniciar: lista.filter((b) => b.estado === "no-iniciado").length,
    sesiones: sumar((b) => b.sesiones),
  };
}

/**
 * La bitácora del semestre: una fila por actividad, de la más vieja a la más
 * nueva y con el nombre del becario al lado.
 *
 * El orden es al revés que en la ficha de cada estudiante, y es a propósito:
 * esto es lo que se pega en la hoja, y una bitácora se lee hacia adelante.
 *
 * `desde` y `hasta` acotan por fecha para no repegar lo que ya se pegó la
 * semana pasada. Vacías = el semestre entero.
 */
function bitacora(periodoId, { desde = null, hasta = null, becarioId = null } = {}) {
  const filtros = ["b.periodo_id = ?"];
  const datos = [periodoId];

  if (desde) { filtros.push("a.fecha >= ?"); datos.push(desde); }
  if (hasta) { filtros.push("a.fecha <= ?"); datos.push(hasta); }

  // Un id que no es un número se ignora, no filtra por nada: con un `= NULL` la
  // consulta no devolvería filas y el CSV saldría vacío sin decir por qué.
  const soloUno = Number(becarioId);
  if (Number.isFinite(soloUno) && soloUno > 0) {
    filtros.push("a.becario_id = ?");
    datos.push(soloUno);
  }

  return db
    .prepare(
      `SELECT a.*, b.nombre, b.codigo, d.name AS docente
         FROM becas_actividades a
         JOIN becas_becarios b ON b.id = a.becario_id
         LEFT JOIN docentes d  ON d.id = a.docente_id
        WHERE ${filtros.join(" AND ")}
        ORDER BY a.fecha, a.id`
    )
    .all(...datos)
    .map((a) => ({
      ...a,
      horas: Math.round((Number(a.horas) || 0) * 100) / 100,
      asignacion_info: asignacionDe(a.asignacion),
    }));
}

// ---------------------------------------------------------------------
//  Escribir
// ---------------------------------------------------------------------

/**
 * Registra una sesión de trabajo. Devuelve el id, o null si algo no cuadra.
 *
 * No comprueba si al becario le sobran horas y es a propósito: si el trabajo se
 * hizo, se registra. Pasarse no es un error —el listado real está lleno de
 * gente en 22 de 20— y perder el registro de una tarde de trabajo por cuadrar
 * un total sí lo sería. El panel avisa; no impide.
 */
function registrarActividad({ becarioId, fecha, asignacion, horas, descripcion, evidencia, docenteId }) {
  const f = fechaValida(fecha);
  const h = horasValidas(horas);
  const a = asignacionValida(asignacion);

  if (!f || !h || !a) return null;

  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO becas_actividades
         (becario_id, fecha, asignacion, horas, descripcion, evidencia, docente_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      Number(becarioId),
      f,
      a,
      h,
      String(descripcion || "").trim().slice(0, 500) || null,
      // Un enlace que no sirve se guarda como nada y no tumba el registro: la
      // sesión de trabajo pasó, y perderla porque alguien pegó mal una
      // dirección sería cambiar lo importante por lo accesorio.
      evidenciaValida(evidencia),
      Number(docenteId)
    );

  return lastInsertRowid;
}

// ---------------------------------------------------------------------
//  Cargar el lote pegado desde la hoja
//
//  Igual que en el semillero y por lo mismo: el listado de becarios lo manda la
//  Universidad en un Excel, así que el módulo tiene que poder arrancar con lo
//  que ya hay adentro. Se seleccionan las filas allá, se copian y se pegan
//  aquí; llegan separadas por tabuladores.
//
//  Se aceptan dos formas y las dos se reconocen solas, contando celdas:
//
//    · las OCHO columnas de la hoja "ESTUDIANTES BECARIOS", de la B a la I. Es
//      lo normal: se selecciona el bloque entero y se pega. Si vienen también
//      las tres de las fórmulas (J, K y L) se ignoran, que es lo correcto:
//      esas se cuentan aquí.
//    · TRES columnas —nombre, código y horas— para cargar a mano media docena
//      sin abrir el Excel.
//
//  Lo que NO se hace: capitalizar el nombre. Ver el encabezado del archivo.
// ---------------------------------------------------------------------
const COLUMNAS_HOJA = [
  // La columna B de la hoja. NO se guarda —ver el esquema de becas_becarios—,
  // pero sigue ocupando su sitio aquí: es la primera del bloque que se copia, y
  // quitarla del conteo correría todas las demás una casilla a la izquierda.
  { campo: "ignorar",      rotulo: "ASPIRANTE ID", fuera: true },
  { campo: "nombre",       rotulo: "ESTUDIANTE" },
  { campo: "codigo",       rotulo: "CÓDIGO" },
  { campo: "programa",     rotulo: "PROGRAMA ESTUDIANTE" },
  { campo: "semestre",     rotulo: "SEMESTRE ACTUAL" },
  { campo: "dependencia",  rotulo: "DEPENDENCIA ASIGNADA" },
  { campo: "responsable",  rotulo: "RESPONSABLE" },
  { campo: "horas_meta",   rotulo: "HORAS A REALIZAR" },
];

const COLUMNAS_CORTAS = [
  { campo: "nombre",     rotulo: "ESTUDIANTE" },
  { campo: "codigo",     rotulo: "CÓDIGO" },
  { campo: "horas_meta", rotulo: "HORAS A REALIZAR" },
];

// El nombre se deja como viene; lo único que se le quita son los espacios de
// sobra, que en la hoja real sí aparecen ("JOEL  ESTEBAN SOLANO LARGO").
const limpiarNombreHoja = (v) => String(v || "").replace(/\s+/g, " ").trim();

/**
 * Convierte lo pegado en becarios listos para insertar.
 *
 * Devuelve { becarios, errores }. Los errores son de FILA y no cortan el lote:
 * se carga lo que sirve y se dice qué se quedó fuera, porque un lote de treinta
 * que se rechaza entero por una celda vacía es un lote que nadie va a volver a
 * intentar.
 */
function parsearLote(texto) {
  const salida = [];
  const errores = [];
  const vistos = new Set();

  const lineas = String(texto || "").replace(/\r\n/g, "\n").split("\n");

  lineas.forEach((cruda, i) => {
    if (!cruda.trim()) return;

    const celdas = cruda.split("\t").map((c) => c.trim());
    const n = i + 1;

    // Con qué se pegó esto. Tres celdas es la forma corta; de ahí para arriba
    // es la hoja. Se mide con las celdas de la fila y no con la primera línea
    // porque en un pegado real todas las filas traen el mismo ancho.
    const columnas = celdas.length >= COLUMNAS_HOJA.length ? COLUMNAS_HOJA : COLUMNAS_CORTAS;

    const f = {};
    columnas.forEach((c, j) => (f[c.campo] = celdas[j] || ""));

    // La cabecera, si la pegaron: se reconoce porque su nombre es el rótulo.
    if (sinTildes(f.nombre) === "estudiante" || sinTildes(f.nombre) === "nombre") return;

    const nombre = limpiarNombreHoja(f.nombre);
    const codigo = soloDigitos(f.codigo);
    const meta = metaValida(f.horas_meta);

    if (!nombre) {
      errores.push(`Fila ${n}: sin nombre de estudiante. Se omite.`);
      return;
    }
    if (!codigo) {
      errores.push(`Fila ${n}: «${nombre}» viene sin código. Se omite.`);
      return;
    }
    if (meta === null) {
      errores.push(
        `Fila ${n}: «${nombre}» no trae horas a realizar (“${f.horas_meta || "vacío"}”). Se omite.`
      );
      return;
    }
    if (vistos.has(codigo)) {
      errores.push(`Fila ${n}: el código ${codigo} viene dos veces en el pegado. Se omite la segunda.`);
      return;
    }
    vistos.add(codigo);

    const semestre = Number(soloDigitos(f.semestre));

    salida.push({
      linea: n,
      nombre: nombre.slice(0, 120),
      codigo: codigo.slice(0, 20),
      programa: (f.programa || "").trim().slice(0, 120) || null,
      semestre: Number.isFinite(semestre) && semestre > 0 && semestre < 20 ? semestre : null,
      dependencia: (f.dependencia || "").trim().slice(0, 120) || BECAS.dependencia || null,
      responsable: (f.responsable || "").trim().slice(0, 120) || BECAS.responsable || null,
      horas_meta: meta,
      // De qué forma salió esta fila, para poder decirlo en la vista previa.
      corto: columnas === COLUMNAS_CORTAS,
    });
  });

  return { becarios: salida, errores };
}

/**
 * Le pega a cada fila del lote el becario del semestre que ya tiene ese código,
 * si lo hay. Es lo que la vista previa pinta en rojo y lo que el confirmar
 * omite: el mismo listado se pega dos veces más veces de las que uno creería.
 */
function marcarRepetidos(lote, periodoId) {
  const buscar = db.prepare("SELECT id, nombre, horas_meta FROM becas_becarios WHERE periodo_id = ? AND codigo = ?");
  return lote.map((b) => {
    const ya = buscar.get(periodoId, b.codigo) || null;
    return {
      ...b,
      ya,
      // Un caso que sí vale la pena señalar aparte: ya está, pero la hoja
      // ahora dice otras horas. Se omite igual —no se pisa nada sin permiso—
      // pero se avisa, porque eso se corrige a mano en su ficha.
      cambio_meta: ya && Number(ya.horas_meta) !== Number(b.horas_meta) ? Number(ya.horas_meta) : null,
    };
  });
}

module.exports = {
  ASIGNACIONES,
  ESTADOS,
  COLUMNAS_HOJA,
  COLUMNAS_CORTAS,
  asignacionDe,
  asignacionValida,
  asignacionDesdeHoja,
  estadoDe,
  horasValidas,
  metaValida,
  fechaValida,
  evidenciaValida,
  soloDigitos,
  becarios,
  becario,
  responsables,
  actividadesDe,
  resumen,
  bitacora,
  registrarActividad,
  parsearLote,
  marcarRepetidos,
};
