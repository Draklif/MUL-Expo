// =====================================================================
//  Servicio Universitario — el panel del docente.
//
//  Es la herramienta más chica del sitio y la única sin cara pública: aquí no
//  entra ningún estudiante. Un becario no se inscribe ni consulta nada; la
//  Universidad manda su listado y el programa responde por las horas. Por eso
//  este archivo es el módulo entero —no hay routes/becas.js— y por eso la
//  dirección /becas lleva derecho al acceso de docentes.
//
//  Un solo permiso, a diferencia del semillero: todo docente que entra ve y
//  toca todo. No hay "mis becarios" porque no hay a quién repartírselos: el
//  responsable ante el Comité de Becas es uno solo —el director del programa—
//  y los demás docentes están ayudándole a llevar la cuenta. Repartir permisos
//  aquí solo serviría para que la tarde de trabajo de un becario se quede sin
//  registrar porque el que estaba a la mano no podía escribirla.
//
//  Lo que el panel SÍ cuida:
//
//    · cada actividad queda con el docente que la registró y su fecha. Se puede
//      corregir y se puede borrar, pero no queda anónima;
//    · un becario que pierde la beca se marca inactivo, no se borra. Las horas
//      que alcanzó a hacer siguen siendo ciertas;
//    · registrar horas de más NO se impide, se avisa. En el listado real hay
//      quien va en 22 de 20; perder el registro de una tarde de trabajo por
//      cuadrar un total sería peor.
// =====================================================================
const express = require("express");
const db = require("../db/database");
const becas = require("../lib/becas");
const periodos = require("../lib/periodos");
const { BECAS } = require("../config");
const { requireBecas, verificar, configurado } = require("../lib/becas-auth");
const { hoy } = require("../lib/fechas");

const router = express.Router();

function marco(extra = {}) {
  return {
    css: "/becas.css",
    themeColor: "#f4f5f2",
    title: "Panel · Servicio Universitario",
    becas: BECAS,
    asignaciones: becas.ASIGNACIONES,
    estados: becas.ESTADOS,
    hoy: hoy(),
    rutaPeriodo: "/becas/panel",
    ...extra,
  };
}

// ---------------------------------------------------------------------
//  Acceso
// ---------------------------------------------------------------------

// Sin página pública que ofrecer, la raíz del módulo es la puerta.
router.get("/", (req, res) => {
  res.redirect(req.session.docenteBecas ? "/becas/panel" : "/becas/acceso");
});

router.get("/acceso", (req, res) => {
  if (req.session.docenteBecas) return res.redirect("/becas/panel");
  res.render(
    "becas/acceso",
    marco({
      title: "Acceso · Servicio Universitario",
      error: null,
      email: "",
      configurado: configurado(),
    })
  );
});

router.post("/acceso", (req, res) => {
  const { docente, error, status } = verificar({
    email: req.body.email,
    password: req.body.password,
    ip: req.ip,
  });

  if (error) {
    return res.status(status).render(
      "becas/acceso",
      marco({
        title: "Acceso · Servicio Universitario",
        error,
        email: String(req.body.email || ""),
        configurado: configurado(),
      })
    );
  }

  req.session.docenteBecas = docente;
  res.redirect("/becas/panel");
});

router.post("/salir", (req, res) => {
  delete req.session.docenteBecas;
  res.redirect("/becas/acceso");
});

// El guardia va colgado de /panel y no del router entero para que /acceso siga
// abierto. conPeriodo va aquí mismo: la beca se asigna semestre a semestre, así
// que TODO lo que se ve aquí es de un semestre y mirar otro es mirar otro
// documento.
router.use("/panel", requireBecas, periodos.conPeriodo, (req, res, next) => {
  // Qué semestres ofrece el selector. La tabla `periodos` es de la app entera y
  // arrastra semestres viejos de la Expo y del torneo, así que se recorta por
  // dos lados y se ofrece la unión:
  //
  //   · los que tengan becarios cargados, siempre. Lo que tiene datos no se
  //     esconde nunca, ni aunque sea más viejo que config.BECAS.desde;
  //   · los que sean de config.BECAS.desde en adelante, aunque estén vacíos.
  //     Eso es lo que permite ABRIR un semestre anterior y cargarle su listado,
  //     que es como se mete el historial: el archivo de la Universidad va por
  //     semestres y hay que poder subir los de atrás.
  const conDatos = new Set(
    db.prepare("SELECT DISTINCT periodo_id AS id FROM becas_becarios").all().map((r) => r.id)
  );

  const desde = String(BECAS.desde || "");
  res.locals.periodos = res.locals.periodos.filter(
    (p) => conDatos.has(p.id) || (desde && p.codigo >= desde) || p.activo
  );
  next();
});

const yo = (req) => req.session.docenteBecas;

// Un campo de texto que puede quedar vacío. Vacío es NULL y no "", que en una
// columna que se agrupa —la del responsable— son dos cosas distintas y se
// verían como dos grupos.
const texto = (v, largo = 120) => String(v || "").replace(/\s+/g, " ").trim().slice(0, largo) || null;

// El semestre de la carrera. Fuera de rango es nulo y no cero: "no lo sé" es un
// estado normal en este listado, y un cero se leería como un dato.
function semestreValido(v) {
  const n = Number(becas.soloDigitos(v));
  return Number.isFinite(n) && n > 0 && n < 20 ? n : null;
}

// ---------------------------------------------------------------------
//  Portada: la lista del semestre con sus barras de horas
// ---------------------------------------------------------------------
router.get("/panel", (req, res) => {
  // El filtro por responsable se recuerda en la sesión y por semestre: lo
  // primero que hace un docente al entrar es buscar a los suyos, y volver de
  // una ficha a la lista entera para volver a filtrar es el tipo de roce que
  // hace que la herramienta se deje de usar.
  //
  // Se guarda por semestre porque los responsables cambian de un semestre a
  // otro: filtrar por alguien que ese semestre no lleva a nadie dejaría la
  // página vacía sin motivo aparente.
  req.session.becasFiltro = req.session.becasFiltro || {};
  if (req.query.responsable !== undefined) {
    const elegido = String(req.query.responsable).trim();
    if (elegido) req.session.becasFiltro[req.periodo.codigo] = elegido.slice(0, 120);
    else delete req.session.becasFiltro[req.periodo.codigo];
  }

  const responsables = becas.responsables(req.periodo.id);
  const guardado = req.session.becasFiltro[req.periodo.codigo] || null;

  // Un filtro que ya no le corresponde a nadie se suelta solo. Sin esto, un
  // responsable que este semestre no lleva becarios deja la lista vacía y sin
  // manera obvia de salir de ahí.
  const responsable = responsables.some((r) => r.nombre === guardado) ? guardado : null;
  if (guardado && !responsable) delete req.session.becasFiltro[req.periodo.codigo];

  const lista = becas.becarios(req.periodo.id, { responsable });

  res.render(
    "becas/panel",
    marco({
      resumen: becas.resumen(req.periodo.id, { responsable }),
      activos: lista.filter((b) => b.activo),
      inactivos: lista.filter((b) => !b.activo),
      responsables,
      responsable,
      // Cuántos hay en total, para poder decir "10 de 34" y que se note que se
      // está mirando un trozo.
      total: becas.becarios(req.periodo.id).filter((b) => b.activo).length,
      aviso: req.query,
    })
  );
});

// ---------------------------------------------------------------------
//  La ficha de un becario: sus horas y todas sus sesiones
// ---------------------------------------------------------------------
router.get("/panel/becario/:id", (req, res) => {
  const becario = becas.becario(req.params.id);
  if (!becario) return res.redirect("/becas/panel");

  res.render(
    "becas/becario",
    marco({
      title: `${becario.nombre} · Servicio Universitario`,
      becario,
      actividades: becas.actividadesDe(becario.id),
      responsables: becas.responsables(req.periodo.id),
      // El semestre AL QUE PERTENECE, que no siempre es el que se está mirando
      // arriba. Se enseña siempre y no solo cuando hay diferencia: en una página
      // que registra horas, de qué semestre son es un dato de la página.
      //
      // Y no limita nada: la sesión cae en el semestre del becario, así que a
      // uno de un semestre anterior se le registra igual sin tocar el selector.
      // Eso es lo que permite meter el historial de la hoja.
      suyo: periodos.porId(becario.periodo_id),
      aviso: req.query,
    })
  );
});

// ---------------------------------------------------------------------
//  Registrar una sesión de trabajo
//
//  El mismo POST sirve para uno y para varios, y esa es la única comodidad que
//  se permite este módulo: una salida pedagógica o el montaje de un evento los
//  trabajan cinco becarios el mismo día y con las mismas horas, y escribir la
//  misma fila cinco veces es exactamente el trabajo que este módulo existe para
//  quitar. Se guardan como cinco actividades independientes —que es lo que
//  son—, no como una compartida.
// ---------------------------------------------------------------------
router.post("/panel/actividad", (req, res) => {
  // Uno o varios: el formulario de la ficha manda un solo id y el de la
  // portada manda una casilla por becario marcado.
  const ids = []
    .concat(req.body.becarios || [])
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);

  // A dónde se vuelve. Desde la ficha, a esa misma ficha —donde se acaba de ver
  // la fila aparecer—; desde la portada, a la portada.
  const volver =
    req.body.volver === "ficha" && ids.length === 1 ? `/becas/panel/becario/${ids[0]}` : "/becas/panel";

  if (!ids.length) return res.redirect(`${volver}?error=sin_becario`);

  // Los ids se comprueban contra la base y no se creen a secas: son un campo de
  // un formulario.
  //
  // Lo que NO se comprueba es que sean del semestre que se está mirando, y esa
  // es la diferencia: una sesión cae en el semestre DEL BECARIO, que es el
  // único al que puede pertenecer. Así se le puede registrar trabajo a un
  // semestre anterior —para meter el historial de la hoja— sin que el selector
  // de arriba tenga nada que ver.
  const validos = ids
    .map((id) => becas.becario(id))
    .filter((b) => b && b.activo)
    .map((b) => b.id);

  // Se marcaron becarios pero ninguno sirve: no existen o ya no tienen la beca.
  // Se dice, que no es lo mismo que no haber marcado a nadie.
  if (!validos.length) return res.redirect(`${volver}?error=inactivo`);

  let escritas = 0;
  db.exec("BEGIN");
  try {
    for (const id of validos) {
      const nuevo = becas.registrarActividad({
        becarioId: id,
        fecha: req.body.fecha,
        asignacion: req.body.asignacion,
        horas: req.body.horas,
        descripcion: req.body.descripcion,
        evidencia: req.body.evidencia,
        docenteId: yo(req).id,
      });
      if (nuevo) escritas++;
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  // Ninguna escrita es siempre lo mismo: la fecha, las horas o la asignación no
  // pasaron. Se dice cuál en la página en vez de tragárselo.
  if (!escritas) return res.redirect(`${volver}?error=datos`);
  res.redirect(`${volver}?registradas=${escritas}`);
});

/** Corregir una sesión ya registrada. */
router.post("/panel/actividad/:id", (req, res) => {
  const actividad = db
    .prepare("SELECT * FROM becas_actividades WHERE id = ?")
    .get(Number(req.params.id));
  if (!actividad) return res.redirect("/becas/panel");

  const destino = `/becas/panel/becario/${actividad.becario_id}`;

  const fecha = becas.fechaValida(req.body.fecha);
  const horas = becas.horasValidas(req.body.horas);
  const asignacion = becas.asignacionValida(req.body.asignacion);

  if (!fecha || !horas || !asignacion) return res.redirect(`${destino}?error=datos`);

  db.prepare(
    `UPDATE becas_actividades
        SET fecha = ?, asignacion = ?, horas = ?, descripcion = ?, evidencia = ?
      WHERE id = ?`
  ).run(
    fecha,
    asignacion,
    horas,
    String(req.body.descripcion || "").trim().slice(0, 500) || null,
    becas.evidenciaValida(req.body.evidencia),
    actividad.id
  );

  res.redirect(`${destino}?ok=1`);
});

/**
 * Borrar una sesión. Se permite y sin ceremonia: una fila mal escrita en la
 * bitácora es una fila que hay que quitar, y aquí no hay nada que se pierda
 * salvo esa fila —las cifras se recalculan solas—.
 */
router.post("/panel/actividad/:id/borrar", (req, res) => {
  const actividad = db
    .prepare("SELECT becario_id FROM becas_actividades WHERE id = ?")
    .get(Number(req.params.id));
  if (!actividad) return res.redirect("/becas/panel");

  db.prepare("DELETE FROM becas_actividades WHERE id = ?").run(Number(req.params.id));
  res.redirect(`/becas/panel/becario/${actividad.becario_id}?borrada=1`);
});

// ---------------------------------------------------------------------
//  Los becarios: alta a mano, corrección y baja
// ---------------------------------------------------------------------

/**
 * Uno suelto, para el que llegó después de que se cargara el listado. Lo normal
 * es cargar el lote entero desde la hoja; esto es para el que falta.
 */
router.post("/panel/becario", (req, res) => {
  const nombre = String(req.body.nombre || "").replace(/\s+/g, " ").trim();
  const codigo = becas.soloDigitos(req.body.codigo);
  const meta = becas.metaValida(req.body.horas_meta);

  if (!nombre || !codigo || meta === null) return res.redirect("/becas/panel?error=datos");

  const repetido = db
    .prepare("SELECT id FROM becas_becarios WHERE periodo_id = ? AND codigo = ?")
    .get(req.periodo.id, codigo);
  if (repetido) return res.redirect(`/becas/panel?error=repetido&id=${repetido.id}`);

  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO becas_becarios
         (periodo_id, nombre, codigo, programa, semestre, dependencia, responsable, horas_meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.periodo.id,
      nombre.slice(0, 120),
      codigo.slice(0, 20),
      // El programa del estudiante se deja vacío y no se supone: quien se carga
      // a mano suele ser del programa, pero eso lo dice el listado de la
      // Universidad y no este formulario.
      null,
      semestreValido(req.body.semestre),
      BECAS.dependencia || null,
      // El responsable que se haya escrito; si no, el de config. Se puede
      // cambiar después, que es de lo que se trata.
      texto(req.body.responsable) || BECAS.responsable || null,
      meta
    );

  res.redirect(`/becas/panel/becario/${lastInsertRowid}?ok=1`);
});

/**
 * Corregir sus datos, todos.
 *
 * El que más se toca es el RESPONSABLE: el listado llega con el director del
 * programa en las treinta filas —es quien responde ante el Comité— y el trabajo
 * de verdad lo reparte cada docente con los suyos. Por eso también se puede
 * repartir a varios de un golpe, ahí abajo.
 *
 * El CÓDIGO también se deja cambiar, aunque sea la identidad: si llegó mal
 * escrito del listado, obligar a eliminar y volver a cargar se llevaría por
 * delante las sesiones que ya tenga. Lo único que no puede es chocar con otro
 * del mismo semestre.
 */
router.post("/panel/becario/:id", (req, res) => {
  const becario = becas.becario(req.params.id);
  if (!becario) return res.redirect("/becas/panel");

  const destino = `/becas/panel/becario/${becario.id}`;

  const nombre = String(req.body.nombre || "").replace(/\s+/g, " ").trim();
  const codigo = becas.soloDigitos(req.body.codigo) || becario.codigo;
  const meta = becas.metaValida(req.body.horas_meta);
  if (!nombre || meta === null) return res.redirect(`${destino}?error=datos`);

  if (codigo !== becario.codigo) {
    const choca = db
      .prepare("SELECT id FROM becas_becarios WHERE periodo_id = ? AND codigo = ? AND id <> ?")
      .get(becario.periodo_id, codigo, becario.id);
    if (choca) return res.redirect(`${destino}?error=codigo_repetido`);
  }

  db.prepare(
    `UPDATE becas_becarios
        SET nombre = ?, codigo = ?, programa = ?, semestre = ?, dependencia = ?,
            responsable = ?, horas_meta = ?, nota = ?, activo = ?
      WHERE id = ?`
  ).run(
    nombre.slice(0, 120),
    codigo.slice(0, 20),
    texto(req.body.programa),
    semestreValido(req.body.semestre),
    texto(req.body.dependencia),
    texto(req.body.responsable),
    meta,
    texto(req.body.nota, 500),
    req.body.activo === "1" ? 1 : 0,
    becario.id
  );

  res.redirect(`${destino}?ok=1`);
});

/**
 * Repartir el responsable entre varios de un golpe.
 *
 * Es el mismo puñado de casillas con el que se registra una sesión, con otro
 * botón: de las dos cosas que se hacen marcando gente en esa lista, esta es la
 * que ocurre una vez por semestre —cuando llega el listado con el director en
 * las treinta filas y hay que repartirlas—, y hacerlo de a una ficha eran
 * treinta pantallas.
 */
router.post("/panel/responsable", (req, res) => {
  const ids = []
    .concat(req.body.becarios || [])
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!ids.length) return res.redirect("/becas/panel?error=sin_becario");

  // Vacío borra el responsable, y es una operación legítima: un becario sin
  // repartir es un estado normal —así llegan todos— y hay que poder volver a él.
  const nuevo = texto(req.body.responsable);

  const marcar = db.prepare("UPDATE becas_becarios SET responsable = ? WHERE id = ?");

  let cambiados = 0;
  db.exec("BEGIN");
  try {
    for (const id of ids) {
      const becario = becas.becario(id);
      if (!becario) continue;
      marcar.run(nuevo, becario.id);
      cambiados++;
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  res.redirect(`/becas/panel?repartidos=${cambiados}`);
});

/**
 * Sacarlo del semestre con todo lo suyo.
 *
 * Existe para deshacer un lote mal pegado, que es cuando de verdad hace falta.
 * Para el que perdió la beca a mitad de semestre está la casilla de inactivo:
 * eso NO es esto, porque sus horas hechas siguen siendo ciertas y el Comité
 * puede preguntarlas.
 */
router.post("/panel/becario/:id/eliminar", (req, res) => {
  const becario = becas.becario(req.params.id);
  if (!becario) return res.redirect("/becas/panel");

  db.prepare("DELETE FROM becas_becarios WHERE id = ?").run(becario.id);
  res.redirect(`/becas/panel?eliminado=${encodeURIComponent(becario.nombre)}`);
});

// ---------------------------------------------------------------------
//  Cargar el listado pegado desde la hoja
//
//  Dos pasos y no uno, como en el semillero: primero se ve qué va a entrar
//  —con los repetidos marcados— y solo entonces se guarda.
// ---------------------------------------------------------------------
function vistaImportar(req, extra = {}) {
  return marco({
    title: "Cargar becarios · Servicio Universitario",
    columnas: becas.COLUMNAS_HOJA,
    columnasCortas: becas.COLUMNAS_CORTAS,
    pegado: "",
    lote: null,
    errores: [],
    rutaPeriodo: "/becas/panel/importar",
    ...extra,
  });
}

router.get("/panel/importar", (req, res) => {
  res.render("becas/importar", vistaImportar(req));
});

router.post("/panel/importar", (req, res) => {
  const pegado = String(req.body.pegado || "");
  const { becarios: lote, errores } = becas.parsearLote(pegado);

  res.render(
    "becas/importar",
    vistaImportar(req, {
      pegado,
      lote: becas.marcarRepetidos(lote, req.periodo.id),
      errores,
    })
  );
});

router.post("/panel/importar/confirmar", (req, res) => {
  const { becarios: lote } = becas.parsearLote(req.body.pegado);
  const conMarca = becas.marcarRepetidos(lote, req.periodo.id);

  const nuevo = db.prepare(
    `INSERT INTO becas_becarios
       (periodo_id, nombre, codigo, programa, semestre, dependencia, responsable, horas_meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  let cargados = 0;
  let omitidos = 0;

  db.exec("BEGIN");
  try {
    for (const b of conMarca) {
      // El que ya está no se pisa. Volver a pegar el mismo listado es lo más
      // normal del mundo —se corrige una fila y se copia todo otra vez—, y
      // sobrescribir borraría a mano las horas que alguien ya corrigió.
      if (b.ya) {
        omitidos++;
        continue;
      }
      nuevo.run(
        req.periodo.id,
        b.nombre,
        b.codigo,
        b.programa,
        b.semestre,
        b.dependencia,
        b.responsable,
        b.horas_meta
      );
      cargados++;
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  res.redirect(`/becas/panel?cargados=${cargados}&omitidos=${omitidos}`);
});

// ---------------------------------------------------------------------
//  El CSV de la bitácora
//
//  La razón de ser del módulo. Reproduce las cinco columnas de la hoja
//  BITÁCORA del "FORMATO SEGUIMIENTO SERVICIO UNIVERSITARIO", en su orden y con
//  sus mismas etiquetas, para pegarlo en C6 hacia abajo de un solo golpe.
//
//  SIN la columna ID, y eso es lo importante: la instrucción 2 del formato dice
//  que esa columna no se toca porque la secuencia se genera sola. Un CSV con ID
//  se pegaría encima de esa fórmula.
//
//  Las etiquetas de ESTUDIANTE y ASIGNACIÓN salen literales del listado
//  institucional —mayúsculas, tildes y todo— porque las dos celdas son listas
//  desplegables cerradas: un valor que no esté en la lista no entra.
//
//  Punto y coma y BOM, como en el resto del sitio: es lo que hace que Excel en
//  español abra el archivo en columnas en vez de meter todo en la primera.
// ---------------------------------------------------------------------
const escapar = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

// La fecha como la pide el formato: DD/MM/AAAA. Se parte la cadena, nunca Date.
function fechaHoja(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

router.get("/panel/bitacora.csv", (req, res) => {
  const filas = [
    ["FECHA", "ESTUDIANTE", "ASIGNACIÓN", "HORAS A REGISTRAR", "DESCRIPCIÓN ACTIVIDADES / OBSERVACIONES"],
  ];

  const registros = becas.bitacora(req.periodo.id, {
    desde: becas.fechaValida(req.query.desde),
    hasta: becas.fechaValida(req.query.hasta),
    becarioId: req.query.becario || null,
  });

  // Los enlaces de evidencia van al final de la descripción y solo si se piden.
  //
  // Apagado por defecto a propósito: la hoja de la Universidad la leen otros, y
  // ochenta celdas con una dirección de Drive pegada detrás se leen peor que
  // ochenta descripciones limpias. Encendido, la evidencia viaja con el
  // registro, que es lo que hace falta cuando el Comité de Becas pregunta.
  //
  // No es una columna nueva: la hoja tiene cinco y solo cinco, y DESCRIPCIÓN es
  // el único campo donde el propio formato dice que se escribe libremente.
  const conEnlaces = req.query.evidencias === "1";

  for (const a of registros) {
    const descripcion = [a.descripcion || "", conEnlaces && a.evidencia ? a.evidencia : ""]
      .filter(Boolean)
      .join(" · ");

    filas.push([
      fechaHoja(a.fecha),
      a.nombre,
      a.asignacion_info.hoja,
      // Con coma decimal: el Excel en español no lee "1.5" como número y media
      // hora se convertiría en texto en una columna que se suma.
      String(a.horas).replace(".", ","),
      descripcion,
    ]);
  }

  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="bitacora-${req.periodo.codigo}.csv"`);
  res.send("﻿" + filas.map((f) => f.map(escapar).join(";")).join("\r\n"));
});

module.exports = router;
