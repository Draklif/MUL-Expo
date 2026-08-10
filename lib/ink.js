// =====================================================================
//  INKreible — el dominio del reto de dibujo.
//
//  Tres ideas mandan aquí y explican casi todo lo demás:
//
//  1. La EDICIÓN es la unidad que se repite, igual que en la jam. Una
//     edición es el reto de un semestre: sus 28 palabras, sus inscritos,
//     sus dibujos y su podio. Al semestre siguiente se abre otra desde el
//     panel y la anterior queda archivada tal cual quedó.
//
//  2. El DÍA no se guarda, se calcula. Que el reto vaya en el día 7 y en la
//     segunda semana sale de la fecha de arranque y de cuántos días dura; no
//     hay un botón que alguien tenga que apretar cada mañana a las seis. De
//     ahí sale también qué palabra ya se puede ver: la del día 12 no existe
//     para el público hasta que llega el día 12.
//
//  3. Los archivos NO viven aquí. Los estudiantes suben sus dibujos a una
//     carpeta de Drive con un nombre de archivo predefinido, y lo que esta
//     app guarda es el enlace de cada uno. Por eso el panel tiene una
//     herramienta para pegar la lista de la carpeta de un tirón: el trabajo
//     de la organización es revisar, no teclear 28 direcciones por persona.
// =====================================================================
const db = require("../db/database");
const { INK } = require("../config");
const { limpiarNombre } = require("./listas");
const { generarCodigo, limpiarEmail, emailValido } = require("./registro");
const { hoy, dia: diaDe, sumarDias, diasEntre } = require("./fechas");

const TECNICAS = INK.tecnicas;
const DIAS = INK.dias;
const SEMANAS = INK.semanas;

const ESTADOS_PARTICIPANTE = {
  pendiente: { label: "Por revisar", cls: "pend" },
  aprobado: { label: "Dentro", cls: "ok" },
  rechazado: { label: "No admitido", cls: "no" },
};

// Las cuatro categorías del final. El orden es el del podio y el `label` es
// lo que se lee en la página; agregar una categoría es agregarla aquí y en
// el panel, sin tocar la base.
const CATEGORIAS = {
  semana: { label: "Ganador de la semana", corto: "Semana", cuantos: SEMANAS },
  top: { label: "Top del reto", corto: "Top", cuantos: INK.top },
  digital: { label: "Mejor digital", corto: "Digital", cuantos: INK.por_tecnica },
  analogo: { label: "Mejor análogo", corto: "Análogo", cuantos: INK.por_tecnica },
};

// Una técnica que no esté en config no se guarda: el selector la ofrece, pero
// el formulario lo manda cualquiera.
function tecnica(id) {
  const limpio = String(id || "").trim().toLowerCase();
  return TECNICAS.find((t) => t.id === limpio) || null;
}

// La misma búsqueda pero admitiendo la sigla del nombre de archivo (DIG, ANA):
// es lo que se teclea al cargar los dibujos pegados de la carpeta.
function tecnicaPorSigla(v) {
  const limpio = String(v || "").trim().toLowerCase();
  return TECNICAS.find((t) => t.id === limpio || t.sigla.toLowerCase() === limpio) || null;
}

const etiquetaTecnica = (id) => (tecnica(id) || { label: "—" }).label;

/**
 * Con qué dice alguien que va a dibujar cuando se inscribe. Aquí sí vale "las
 * dos", que no es la técnica de un dibujo sino la intención de una persona:
 * cada archivo dirá después, por su nombre, si ese salió digital o análogo.
 */
function tecnicaDeclarada(v) {
  const limpio = String(v || "").trim().toLowerCase();
  if (limpio === "mixto") return "mixto";
  const t = tecnica(limpio);
  return t ? t.id : null;
}

// ---------------------------------------------------------------------
//  Ediciones
// ---------------------------------------------------------------------
const SELECT_EDICION = `
  SELECT e.*, p.codigo AS periodo, p.activo AS periodo_activo
    FROM ink_ediciones e
    LEFT JOIN periodos p ON p.id = e.periodo_id
`;

function edicion(id) {
  return db.prepare(`${SELECT_EDICION} WHERE e.id = ?`).get(Number(id)) || null;
}

function ediciones() {
  return db.prepare(`${SELECT_EDICION} ORDER BY e.created_at DESC`).all();
}

/**
 * La edición que ve el público: la del semestre activo, y si ese semestre
 * todavía no tiene reto, la última que se haya abierto. Así, el día que se
 * cambia de semestre sin haber abierto la edición nueva, la página sigue
 * mostrando la que acaba de pasar —con su galería y su podio— en vez de
 * quedarse en blanco.
 */
function edicionVigente() {
  return (
    db.prepare(`${SELECT_EDICION} WHERE p.activo = 1 ORDER BY e.created_at DESC LIMIT 1`).get() ||
    db.prepare(`${SELECT_EDICION} ORDER BY e.created_at DESC LIMIT 1`).get() ||
    null
  );
}

/**
 * Abre la edición de un semestre: deja la anterior finalizada (con sus
 * dibujos y su podio donde están) y crea una nueva, vacía y con las
 * inscripciones abiertas.
 *
 * Los valores por defecto salen de config.INK pero se copian a la fila: si un
 * semestre el reto es de 14 días, se cambia en esa edición y las viejas
 * siguen contando lo que contaron.
 */
function abrirEdicion({ periodoId, nombre, dias, semanas, cupo, driveUrl, nomenclatura }) {
  db.exec("BEGIN");
  try {
    db.prepare(
      "UPDATE ink_ediciones SET estado = 'finalizada', inscripcion_abierta = 0 WHERE estado != 'finalizada'"
    ).run();

    const info = db
      .prepare(
        `INSERT INTO ink_ediciones
           (periodo_id, nombre, estado, inscripcion_abierta, dias, semanas, cupo, drive_url, nomenclatura)
         VALUES (?, ?, 'inscripcion', 1, ?, ?, ?, ?, ?)`
      )
      .run(
        periodoId || null,
        nombre,
        Number(dias) || INK.dias,
        Number(semanas) || INK.semanas,
        Number(cupo) || null,
        String(driveUrl || "").trim() || null,
        String(nomenclatura || "").trim() || INK.nomenclatura
      );

    db.exec("COMMIT");
    return edicion(info.lastInsertRowid);
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

// ---------------------------------------------------------------------
//  El calendario: en qué día del reto estamos
// ---------------------------------------------------------------------
/**
 * Todo lo que la página necesita saber del calendario, en un solo objeto.
 *
 *   sin_edicion — no hay reto abierto todavía.
 *   sin_fecha   — hay edición pero nadie ha puesto el día de arranque.
 *   antes       — falta para empezar. `faltan` dice cuántos días.
 *   en_curso    — corriendo. `dia` va de 1 a dias y `semana` de 1 a semanas.
 *   terminado   — pasaron los 28 días (o la organización cerró la edición).
 *
 * `dia` se calcula igual en las tres fases últimas y por eso sirve para todo
 * lo demás: qué palabra se puede ver, cuántas van y qué semana está corriendo.
 */
function fase(ed, dia = hoy()) {
  if (!ed) return { clave: "sin_edicion", dias: DIAS, semanas: SEMANAS, hoy: dia };

  const dias = Number(ed.dias) || DIAS;
  const semanas = Number(ed.semanas) || SEMANAS;
  const cerrada = ed.estado === "finalizada";

  const base = {
    dias,
    semanas,
    hoy: dia,
    inicio: ed.inicio || null,
    fin: ed.inicio ? sumarDias(ed.inicio, dias - 1) : null,
    momento_inicio: diaDe(ed.inicio),
    momento_fin: ed.inicio ? diaDe(sumarDias(ed.inicio, dias - 1)) : null,
  };

  if (!ed.inicio) return { ...base, clave: cerrada ? "terminado" : "sin_fecha", dia: 0, semana: 0 };

  // El día 1 es el mismo día del arranque, así que la cuenta empieza en 1 y
  // no en 0: el día del estreno la gente ya tiene que ver su palabra.
  const corridos = diasEntre(ed.inicio, dia);
  const numero = corridos + 1;

  if (numero < 1) {
    return { ...base, clave: "antes", dia: 0, semana: 0, faltan: 1 - numero, avance: 0 };
  }

  if (cerrada || numero > dias) {
    return { ...base, clave: "terminado", dia: dias, semana: semanas, avance: 100 };
  }

  return {
    ...base,
    clave: "en_curso",
    dia: numero,
    semana: semanaDe(numero, ed),
    faltan: dias - numero,
    avance: (numero / dias) * 100,
  };
}

// A qué semana pertenece un día. Con 28 días y 4 semanas son siete días cada
// una; la división se hace con los números de la edición para que un reto de
// otro tamaño siga partiéndose bien.
function semanaDe(numero, ed) {
  const dias = Number(ed && ed.dias) || DIAS;
  const semanas = Number(ed && ed.semanas) || SEMANAS;
  const porSemana = Math.ceil(dias / semanas);
  return Math.min(semanas, Math.floor((numero - 1) / porSemana) + 1);
}

// Los días que cubre una semana: { desde, hasta }.
function rangoSemana(semana, ed) {
  const dias = Number(ed && ed.dias) || DIAS;
  const semanas = Number(ed && ed.semanas) || SEMANAS;
  const porSemana = Math.ceil(dias / semanas);
  const desde = (semana - 1) * porSemana + 1;
  return { desde, hasta: Math.min(dias, desde + porSemana - 1) };
}

// Las semanas de una edición con sus días y sus fechas, que es lo que se
// pinta en el calendario y en el panel.
function semanasDe(ed) {
  const f = fase(ed);
  const total = Number(ed && ed.semanas) || SEMANAS;

  return Array.from({ length: total }, (_, i) => {
    const n = i + 1;
    const { desde, hasta } = rangoSemana(n, ed);
    return {
      n,
      desde,
      hasta,
      inicio: ed && ed.inicio ? diaDe(sumarDias(ed.inicio, desde - 1)) : null,
      fin: ed && ed.inicio ? diaDe(sumarDias(ed.inicio, hasta - 1)) : null,
      corriendo: f.clave === "en_curso" && f.semana === n,
      cumplida: f.dia > hasta,
    };
  });
}

// ---------------------------------------------------------------------
//  Las palabras
// ---------------------------------------------------------------------
/**
 * Las 28 palabras de una edición, siempre las 28 aunque falten por escribir,
 * y cada una con su día, su semana, su fecha y si ya se puede ver.
 *
 * `publica` es la regla del reto: una palabra se destapa el día que le toca
 * —o todas de una si la organización publicó la lista completa, que es como
 * funciona el inktober original—. Ojo: esta función devuelve el texto de
 * todas; quien se lo manda al navegador es `palabrasPublicas`.
 */
function palabras(edicionId, ed = edicion(edicionId)) {
  const filas = db
    .prepare("SELECT * FROM ink_palabras WHERE edicion_id = ? ORDER BY dia")
    .all(Number(edicionId));

  const porDia = new Map(filas.map((f) => [f.dia, f]));
  const f = fase(ed);
  const dias = Number(ed && ed.dias) || DIAS;
  const lista = Boolean(ed && ed.lista_publica);

  return Array.from({ length: dias }, (_, i) => {
    const numero = i + 1;
    const fila = porDia.get(numero);
    return {
      dia: numero,
      semana: semanaDe(numero, ed),
      palabra: fila ? fila.palabra : "",
      pista: fila ? fila.pista : null,
      fecha: ed && ed.inicio ? diaDe(sumarDias(ed.inicio, numero - 1)) : null,
      publica: Boolean(fila) && (lista || (f.dia >= numero && f.clave !== "antes")),
      hoy: f.clave === "en_curso" && f.dia === numero,
    };
  });
}

/**
 * Lo mismo, pero con las palabras que todavía no salen borradas de verdad.
 * Es lo único que ve el navegador: hasta que no llega su día, la palabra no
 * viaja al cliente ni escondida en el HTML, así que no hay forma de
 * adelantarla mirando el código fuente de la página.
 */
function palabrasPublicas(edicionId, ed = edicion(edicionId)) {
  return palabras(edicionId, ed).map((p) =>
    p.publica ? p : { ...p, palabra: "", pista: null }
  );
}

// La palabra de hoy, que es lo que va en letra gigante en la portada.
function palabraDeHoy(ed) {
  if (!ed) return null;
  const f = fase(ed);
  if (f.clave !== "en_curso") return null;
  return palabrasPublicas(ed.id, ed).find((p) => p.dia === f.dia) || null;
}

/**
 * Guarda la lista completa de palabras de un tirón. Se recibe una por línea
 * en el orden de los días: es como está escrita en cualquier parte donde se
 * haya preparado (un documento, un cuaderno, el chat de la organización).
 *
 * Las líneas de más se ignoran y las de menos dejan ese día en blanco, así
 * que se puede ir cargando por semanas sin borrar lo ya escrito.
 */
function guardarPalabras(edicionId, texto, ed = edicion(edicionId)) {
  const dias = Number(ed && ed.dias) || DIAS;
  const lineas = String(texto || "")
    .split(/\r?\n/)
    .map((l) => limpiarNombre(l).slice(0, 60));

  const borrar = db.prepare("DELETE FROM ink_palabras WHERE edicion_id = ? AND dia = ?");
  const guardar = db.prepare(
    `INSERT INTO ink_palabras (edicion_id, dia, palabra) VALUES (?, ?, ?)
       ON CONFLICT (edicion_id, dia) DO UPDATE SET palabra = excluded.palabra`
  );

  let escritas = 0;
  db.exec("BEGIN");
  try {
    for (let i = 0; i < dias; i++) {
      const palabra = lineas[i] || "";
      if (palabra) {
        guardar.run(Number(edicionId), i + 1, palabra);
        escritas++;
      } else {
        borrar.run(Number(edicionId), i + 1);
      }
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  return escritas;
}

// ---------------------------------------------------------------------
//  Inscripción
// ---------------------------------------------------------------------
function inscripcionAbierta(ed) {
  if (!ed) return false;
  if (!ed.inscripcion_abierta || ed.estado === "finalizada") return false;
  if (!ed.cupo) return true;
  return contarInscritos(ed.id) < ed.cupo;
}

function contarInscritos(edicionId) {
  return db
    .prepare("SELECT COUNT(*) AS n FROM ink_participantes WHERE edicion_id = ? AND estado != 'rechazado'")
    .get(Number(edicionId)).n;
}

// Código único de verdad: se reintenta por si dos personas caen en el mismo.
function codigoLibre() {
  const usado = db.prepare("SELECT 1 FROM ink_participantes WHERE codigo = ?");
  let codigo = generarCodigo();
  for (let i = 0; i < 5 && usado.get(codigo); i++) codigo = generarCodigo();
  return codigo;
}

/**
 * Cómo se tiene que llamar el archivo que sube alguien. Sale de la plantilla
 * de la edición, así que la nomenclatura se puede reescribir entera desde el
 * panel sin tocar código —y el estudiante ve en su página el nombre exacto de
 * cada uno de sus 28 archivos, ya resuelto, en vez de una fórmula que tenga
 * que interpretar—.
 */
function nombreArchivo(ed, { codigo, dia, tecnica: t }) {
  const plantilla = (ed && ed.nomenclatura) || INK.nomenclatura;
  const elegida = tecnica(t) || TECNICAS[0];
  return plantilla
    .replace(/\{CODIGO\}/gi, String(codigo || "").toUpperCase())
    .replace(/\{DIA\}/gi, String(dia || 0).padStart(2, "0"))
    .replace(/\{TECNICA\}/gi, elegida ? elegida.sigla : "");
}

// El ejemplo que se muestra en la página de inscripción, cuando todavía no
// hay un código que poner: se usa uno de mentira que se ve como uno de verdad.
function ejemploNombre(ed, codigo = "ABC234") {
  return `${nombreArchivo(ed, { codigo, dia: 7, tecnica: "digital" })}.jpg`;
}

// ---------------------------------------------------------------------
//  Participantes
// ---------------------------------------------------------------------
function participante(id) {
  return db.prepare("SELECT * FROM ink_participantes WHERE id = ?").get(Number(id)) || null;
}

function participantePorCodigo(codigo) {
  return (
    db
      .prepare("SELECT * FROM ink_participantes WHERE codigo = ?")
      .get(String(codigo || "").trim().toUpperCase()) || null
  );
}

/**
 * Un participante con sus dibujos y su avance: cuántos días entregó, cuáles
 * le faltan y si va al día. Es la ficha que ve él en su página y la que ve la
 * organización en el panel, que son la misma información.
 */
function conDibujos(p, ed = edicion(p.edicion_id)) {
  if (!p) return null;

  const suyos = dibujosDe(p.id);
  const porDia = new Map(suyos.map((d) => [d.dia, d]));
  const f = fase(ed);
  const dias = Number(ed && ed.dias) || DIAS;

  const grilla = Array.from({ length: dias }, (_, i) => {
    const numero = i + 1;
    const dibujo = porDia.get(numero) || null;
    return {
      dia: numero,
      semana: semanaDe(numero, ed),
      dibujo,
      // Un día está "pendiente" solo si ya pasó: los que no han llegado no
      // le faltan a nadie.
      vencido: f.dia >= numero && f.clave !== "antes" && !dibujo,
    };
  });

  return {
    ...p,
    estado_info: ESTADOS_PARTICIPANTE[p.estado] || ESTADOS_PARTICIPANTE.pendiente,
    tecnica_label: p.tecnica === "mixto" ? "Digital y análogo" : etiquetaTecnica(p.tecnica),
    dibujos: suyos,
    grilla,
    entregados: suyos.length,
    faltantes: grilla.filter((g) => g.vencido).length,
    completo: suyos.length >= dias,
    avance: dias ? (suyos.length / dias) * 100 : 0,
  };
}

/**
 * Los participantes de una edición. `estado` en null trae todos (es lo que
 * quiere el panel); el sitio público pide solo los admitidos.
 */
function participantes(edicionId, estado = "aprobado") {
  const filas = estado
    ? db
        .prepare(
          "SELECT * FROM ink_participantes WHERE edicion_id = ? AND estado = ? ORDER BY nombre COLLATE NOCASE"
        )
        .all(Number(edicionId), estado)
    : db
        .prepare("SELECT * FROM ink_participantes WHERE edicion_id = ? ORDER BY created_at DESC")
        .all(Number(edicionId));

  return filas;
}

// Los admitidos con su avance, ordenados por quién lleva más dibujos. Es el
// "muro" del reto: quién va al día y quién se quedó en el día cuatro.
function tablaAvance(edicionId, ed = edicion(edicionId)) {
  return participantes(edicionId, "aprobado")
    .map((p) => conDibujos(p, ed))
    .sort((a, b) => b.entregados - a.entregados || a.nombre.localeCompare(b.nombre));
}

// La ficha pública de alguien, por código o por id, con su edición al lado.
function fichaPorCodigo(codigo) {
  const p = participantePorCodigo(codigo);
  if (!p) return null;
  const ed = edicion(p.edicion_id);
  return { ...conDibujos(p, ed), edicion: ed, fase: fase(ed) };
}

// ---------------------------------------------------------------------
//  Dibujos
// ---------------------------------------------------------------------
const SELECT_DIBUJO = `
  SELECT d.*, p.nombre AS autor, p.codigo AS autor_codigo, p.usuario AS autor_usuario,
         p.id AS autor_id
    FROM ink_dibujos d
    JOIN ink_participantes p ON p.id = d.participante_id
`;

function dibujo(id) {
  const fila = db.prepare(`${SELECT_DIBUJO} WHERE d.id = ?`).get(Number(id));
  return fila ? conImagen(fila) : null;
}

function dibujosDe(participanteId) {
  return db
    .prepare(`${SELECT_DIBUJO} WHERE d.participante_id = ? ORDER BY d.dia`)
    .all(Number(participanteId))
    .map(conImagen);
}

/**
 * La galería, con los filtros que ofrece la página: por semana, por día, por
 * técnica y por autor. Todos son opcionales y se combinan.
 *
 * Solo salen dibujos de gente admitida: alguien cuya inscripción se rechazó
 * no aparece en la galería aunque haya alcanzado a subir archivos.
 *
 * `recientes` invierte el orden y lo pasa a por cuándo se cargaron: es lo que
 * quiere la tira de la portada, que enseña lo último que entró y no los siete
 * dibujos de la primera semana otra vez.
 */
function galeria(
  edicionId,
  { semana, dia, tecnica: t, autor, limite, recientes } = {},
  ed = edicion(edicionId)
) {
  const donde = ["d.edicion_id = ?", "p.estado = 'aprobado'"];
  const args = [Number(edicionId)];

  if (semana) {
    const { desde, hasta } = rangoSemana(Number(semana), ed);
    donde.push("d.dia BETWEEN ? AND ?");
    args.push(desde, hasta);
  }
  if (dia) {
    donde.push("d.dia = ?");
    args.push(Number(dia));
  }
  if (tecnica(t)) {
    donde.push("d.tecnica = ?");
    args.push(tecnica(t).id);
  }
  if (autor) {
    donde.push("d.participante_id = ?");
    args.push(Number(autor));
  }

  const tope = Number(limite) > 0 ? ` LIMIT ${Number(limite)}` : "";
  const orden = recientes ? "d.created_at DESC, d.id DESC" : "d.dia, p.nombre COLLATE NOCASE";

  return db
    .prepare(`${SELECT_DIBUJO} WHERE ${donde.join(" AND ")} ORDER BY ${orden}${tope}`)
    .all(...args)
    .map(conImagen);
}

/**
 * De un enlace de Drive saca la dirección que sí se puede poner en un <img>.
 *
 * Un "…/file/d/ID/view" es una página entera de Drive, no una imagen: puesto
 * en un <img> no pinta nada. La que sirve es la de miniatura, que además
 * llega redimensionada y no baja 8 MB por dibujo en una galería de 700.
 *
 * Cualquier otro enlace se devuelve tal cual: si alguien subió a Imgur o al
 * Drive del programa con enlace directo, ya funciona.
 *
 * Que la imagen se vea depende de que el archivo esté compartido con "todo el
 * que tenga el enlace". Es la única condición y por eso está dicha en el
 * panel y en las reglas del reto.
 */
function imagenDirecta(url) {
  const limpio = String(url || "").trim();
  const m =
    /drive\.google\.com\/file\/d\/([\w-]+)/.exec(limpio) ||
    /drive\.google\.com\/(?:open|uc|thumbnail)\?(?:[^#]*&)?id=([\w-]+)/.exec(limpio);
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1200` : limpio;
}

function conImagen(d) {
  return { ...d, imagen: imagenDirecta(d.url), tecnica_label: etiquetaTecnica(d.tecnica) };
}

/**
 * Registra (o corrige) el dibujo de alguien en un día. Volver a cargar el
 * mismo día reemplaza el enlace: es lo que pasa cuando alguien vuelve a subir
 * el archivo porque el primero quedó torcido.
 */
function guardarDibujo({ edicionId, participanteId, dia, tecnica: t, url, titulo }) {
  const elegida = tecnica(t) || TECNICAS[0];

  db.prepare(
    `INSERT INTO ink_dibujos (edicion_id, participante_id, dia, tecnica, url, titulo)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (participante_id, dia) DO UPDATE
        SET tecnica = excluded.tecnica, url = excluded.url, titulo = excluded.titulo`
  ).run(
    Number(edicionId),
    Number(participanteId),
    Number(dia),
    elegida.id,
    String(url).trim().slice(0, 500),
    String(titulo || "").trim().slice(0, 120) || null
  );
}

/**
 * Lee la lista que se pega desde la carpeta de Drive. Cada línea trae el
 * nombre del archivo y su enlace, en cualquier orden y separados por lo que
 * sea (un tabulador si viene de una hoja de cálculo, un espacio si viene de
 * un chat).
 *
 *   ABC234_07_DIG.jpg   https://drive.google.com/file/d/1a2b3c/view
 *
 * De ahí salen el código de quien dibujó, el día y la técnica, que es
 * exactamente para lo que existe la nomenclatura. Las líneas que no se
 * entienden no se descartan en silencio: vuelven con su motivo para que la
 * organización las vea y arregle el nombre del archivo en el Drive.
 */
function dibujosDesdePegado(texto, ed) {
  const dias = Number(ed && ed.dias) || DIAS;
  const filas = [];

  for (const cruda of String(texto || "").split(/\r?\n/)) {
    const linea = cruda.trim();
    if (!linea) continue;

    const urlM = /(https?:\/\/\S+)/i.exec(linea);
    const url = urlM ? urlM[1] : "";
    // Lo que no es el enlace es el nombre del archivo. Se le quita la
    // extensión y se parte por todos los separadores que puede traer.
    const resto = (urlM ? linea.replace(urlM[1], " ") : linea)
      .replace(/\.(jpe?g|png|gif|webp|tiff?|pdf|psd|clip|procreate)\b/gi, " ");
    const piezas = resto.split(/[\s_,;|\-\t/]+/).filter(Boolean);

    const codigo = (piezas.find((x) => /^[A-Z0-9]{6}$/i.test(x)) || "").toUpperCase();
    const diaTexto = piezas.find((x) => /^\d{1,2}$/.test(x));
    const marca = piezas.map(tecnicaPorSigla).find(Boolean);

    const fila = {
      linea,
      codigo,
      dia: Number(diaTexto) || 0,
      tecnica: marca ? marca.id : null,
      url,
      error: null,
    };

    if (!url) fila.error = "no tiene enlace";
    else if (!codigo) fila.error = "no se ve el código de nadie";
    else if (!fila.dia || fila.dia < 1 || fila.dia > dias) fila.error = `el día tiene que ir de 1 a ${dias}`;
    else if (!marca) fila.error = "no dice si es digital o análogo";

    filas.push(fila);
  }

  return filas;
}

/**
 * Carga en la base las filas que se entendieron. Devuelve el recuento de lo
 * que pasó, que es lo que el panel le muestra a quien pegó la lista.
 */
function cargarDibujos(edicionId, filas, ed = edicion(edicionId)) {
  const buscar = db.prepare(
    "SELECT * FROM ink_participantes WHERE edicion_id = ? AND codigo = ?"
  );

  const resultado = { guardados: 0, problemas: [] };

  db.exec("BEGIN");
  try {
    for (const fila of filas) {
      if (fila.error) {
        resultado.problemas.push(fila);
        continue;
      }

      const persona = buscar.get(Number(edicionId), fila.codigo);
      if (!persona) {
        resultado.problemas.push({ ...fila, error: `no hay nadie con el código ${fila.codigo}` });
        continue;
      }
      if (persona.estado !== "aprobado") {
        resultado.problemas.push({ ...fila, error: `${persona.nombre} todavía no está admitido` });
        continue;
      }

      guardarDibujo({
        edicionId,
        participanteId: persona.id,
        dia: fila.dia,
        tecnica: fila.tecnica,
        url: fila.url,
      });
      resultado.guardados++;
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  return resultado;
}

// ---------------------------------------------------------------------
//  El podio
// ---------------------------------------------------------------------
const SELECT_PREMIO = `
  SELECT pr.*, d.url, d.dia, d.tecnica, d.titulo,
         p.nombre AS autor, p.codigo AS autor_codigo, p.usuario AS autor_usuario,
         p.id AS autor_id
    FROM ink_premios pr
    JOIN ink_dibujos d       ON d.id = pr.dibujo_id
    JOIN ink_participantes p ON p.id = pr.participante_id
`;

/**
 * Los premios de una edición, agrupados por categoría y en orden de puesto.
 * Siempre devuelve las cuatro llaves aunque estén vacías: la vista pregunta
 * por `podio.top.length` sin tener que protegerse.
 */
function premios(edicionId) {
  const filas = db
    .prepare(`${SELECT_PREMIO} WHERE pr.edicion_id = ? ORDER BY pr.semana, pr.puesto`)
    .all(Number(edicionId))
    .map((f) => ({ ...f, imagen: imagenDirecta(f.url), tecnica_label: etiquetaTecnica(f.tecnica) }));

  const salida = { semana: [], top: [], digital: [], analogo: [] };
  for (const f of filas) if (salida[f.tipo]) salida[f.tipo].push(f);
  return salida;
}

// Cómo se lee un premio en una línea. Vive aquí y no en la vista porque lo
// dicen igual la página del podio, el panel y el correo que le llega a quien
// ganó: si el nombre de una categoría cambia, cambia en los tres.
function etiquetaPremio(p) {
  if (!p) return "";
  if (p.tipo === "semana") return `Ganador de la semana ${p.semana}`;
  if (p.tipo === "top") return `Top ${p.puesto} del reto`;
  if (p.tipo === "digital") return `Mejor digital · puesto ${p.puesto}`;
  if (p.tipo === "analogo") return `Mejor análogo · puesto ${p.puesto}`;
  return "";
}

function hayPodio(edicionId) {
  return db.prepare("SELECT COUNT(*) AS n FROM ink_premios WHERE edicion_id = ?").get(Number(edicionId)).n > 0;
}

// El podio se ve cuando el jurado terminó Y la organización lo publicó: dos
// condiciones separadas a propósito, porque el podio se arma en varias
// sentadas y no puede irse asomando a medias.
function podioPublico(ed) {
  return Boolean(ed && ed.resultados_publicos && hayPodio(ed.id));
}

function guardarPremio({ edicionId, tipo, semana, puesto, dibujoId, nota }) {
  if (!CATEGORIAS[tipo]) return false;

  const d = db.prepare("SELECT * FROM ink_dibujos WHERE id = ? AND edicion_id = ?").get(
    Number(dibujoId),
    Number(edicionId)
  );
  if (!d) return false;

  db.prepare(
    `INSERT INTO ink_premios (edicion_id, tipo, semana, puesto, dibujo_id, participante_id, nota)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (edicion_id, tipo, semana, puesto) DO UPDATE
        SET dibujo_id = excluded.dibujo_id,
            participante_id = excluded.participante_id,
            nota = excluded.nota`
  ).run(
    Number(edicionId),
    tipo,
    tipo === "semana" ? Number(semana) || 1 : 0,
    Number(puesto) || 1,
    d.id,
    d.participante_id,
    String(nota || "").trim().slice(0, 200) || null
  );

  return true;
}

// La galería está pensada para mirar dibujos, no para elegirlos: el panel
// necesita además poder buscar uno concreto por código y día, que es como se
// dictan los ganadores en una reunión de jurado.
function dibujoPorCodigoYDia(edicionId, codigo, dia) {
  return (
    db
      .prepare(
        `SELECT d.* FROM ink_dibujos d
           JOIN ink_participantes p ON p.id = d.participante_id
          WHERE d.edicion_id = ? AND p.codigo = ? AND d.dia = ?`
      )
      .get(Number(edicionId), String(codigo || "").trim().toUpperCase(), Number(dia)) || null
  );
}

// ---------------------------------------------------------------------
//  Cifras
// ---------------------------------------------------------------------
function resumen(edicionId) {
  const id = Number(edicionId);
  const base = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM ink_participantes WHERE edicion_id = ? AND estado = 'aprobado')  AS inscritos,
         (SELECT COUNT(*) FROM ink_participantes WHERE edicion_id = ? AND estado = 'pendiente') AS pendientes,
         (SELECT COUNT(*) FROM ink_participantes WHERE edicion_id = ? AND estado = 'rechazado') AS rechazados,
         (SELECT COUNT(*) FROM ink_dibujos d JOIN ink_participantes p ON p.id = d.participante_id
           WHERE d.edicion_id = ? AND p.estado = 'aprobado')                                    AS dibujos,
         (SELECT COUNT(*) FROM ink_palabras WHERE edicion_id = ?)                               AS palabras,
         (SELECT COUNT(*) FROM ink_participantes
           WHERE edicion_id = ? AND estado = 'aprobado' AND drive_enviado_at IS NULL)           AS sin_enlace`
    )
    .get(id, id, id, id, id, id);

  // Cuántos van completos sale de contar dibujos por persona; en SQL de una
  // sola línea quedaría ilegible y esto se llama una vez por página.
  const ed = edicion(id);
  const dias = Number(ed && ed.dias) || DIAS;
  const completos = db
    .prepare(
      `SELECT COUNT(*) AS n FROM (
         SELECT d.participante_id FROM ink_dibujos d
           JOIN ink_participantes p ON p.id = d.participante_id
          WHERE d.edicion_id = ? AND p.estado = 'aprobado'
          GROUP BY d.participante_id HAVING COUNT(*) >= ?
       )`
    )
    .get(id, dias).n;

  return { ...base, completos };
}

// Cuántos dibujos hay de cada técnica. Es el dato que dice si el reto salió
// mitad y mitad o si se llenó de tabletas.
function porTecnica(edicionId) {
  const filas = db
    .prepare(
      `SELECT d.tecnica, COUNT(*) AS n FROM ink_dibujos d
         JOIN ink_participantes p ON p.id = d.participante_id
        WHERE d.edicion_id = ? AND p.estado = 'aprobado'
        GROUP BY d.tecnica`
    )
    .all(Number(edicionId));

  const cuenta = new Map(filas.map((f) => [f.tecnica, f.n]));
  return TECNICAS.map((t) => ({ ...t, n: cuenta.get(t.id) || 0 })).filter((x) => x.n > 0);
}

/**
 * Lo que consulta la página cada tanto: el día del servidor, en qué día del
 * reto vamos y la palabra de hoy. Una sola petición trae todo lo que puede
 * cambiar mientras alguien tiene la página abierta —que aquí es poco, pero a
 * medianoche cambia la palabra y quien dejó la pestaña abierta desde ayer
 * tiene que verlo—.
 */
function estadoPublico(edicionId) {
  const ed = edicion(edicionId);
  if (!ed) return { hoy: hoy(), clave: "sin_edicion" };

  const f = fase(ed);
  const palabra = palabraDeHoy(ed);

  return {
    hoy: f.hoy,
    clave: f.clave,
    dia: f.dia,
    semana: f.semana,
    dias: f.dias,
    avance: f.avance || 0,
    palabra: palabra ? palabra.palabra : null,
    inscripcion_abierta: inscripcionAbierta(ed),
    galeria_publica: Boolean(ed.galeria_publica),
    resultados_publicos: podioPublico(ed),
    inscritos: resumen(ed.id).inscritos,
  };
}

module.exports = {
  TECNICAS,
  DIAS,
  SEMANAS,
  CATEGORIAS,
  ESTADOS_PARTICIPANTE,
  tecnica,
  tecnicaPorSigla,
  tecnicaDeclarada,
  etiquetaTecnica,
  edicion,
  ediciones,
  edicionVigente,
  abrirEdicion,
  fase,
  semanaDe,
  rangoSemana,
  semanasDe,
  palabras,
  palabrasPublicas,
  palabraDeHoy,
  guardarPalabras,
  inscripcionAbierta,
  contarInscritos,
  codigoLibre,
  nombreArchivo,
  ejemploNombre,
  participante,
  participantePorCodigo,
  participantes,
  conDibujos,
  tablaAvance,
  fichaPorCodigo,
  dibujo,
  dibujosDe,
  galeria,
  imagenDirecta,
  guardarDibujo,
  dibujosDesdePegado,
  cargarDibujos,
  dibujoPorCodigoYDia,
  premios,
  etiquetaPremio,
  hayPodio,
  podioPublico,
  guardarPremio,
  resumen,
  porTecnica,
  estadoPublico,
  limpiarEmail,
  emailValido,
  diaDe,
};
