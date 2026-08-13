// =====================================================================
//  Semillero SAMI — el panel del docente.
//
//  Es el reemplazo de dos hojas de cálculo, y hace lo que ellas hacían más lo
//  que no podían: contar solo.
//
//  Dos permisos y no uno, que es lo que lo diferencia del panel de salidas:
//
//    · TODO docente que entra VE el semillero entero. Es el documento del
//      programa; esconderle a un docente en qué van los proyectos de los demás
//      no protege a nadie y le quita el mapa a quien dirige el semillero.
//
//    · Pero registrar REUNIONES y NOTAS solo se puede en los proyectos donde
//      uno es director. Calificar el trabajo de un semestre es del director, y
//      un panel que deja hacerlo a cualquiera termina con notas que nadie sabe
//      quién puso.
//
//  Lo administrativo del trámite —estado, semestre, jurados, fechas, comités,
//  asignar director— queda abierto a todos a propósito: son actos del comité
//  que registra quien esté a la mano, y todos quedan con fecha.
//
//  Dos reglas que el panel no deja saltarse:
//
//    · nada de lo que se deshace queda anónimo. Una nota se puede corregir,
//      pero se guarda quién la cerró y cuándo; un proyecto se puede cancelar,
//      pero con motivo, con dueño y con fecha;
//    · un estudiante que se va se marca 'retirado', no se quita de la lista.
//      Sus reuniones y sus notas siguen siendo ciertas.
//
//  Lo que el panel SÍ deja hacer, y a propósito, es eliminar un proyecto
//  entero por muchas reuniones y notas que tenga. Lo de abajo explica por qué:
//  el candado que lo impedía solo atrapaba los proyectos de prueba.
// =====================================================================
const express = require("express");
const db = require("../db/database");
const sami = require("../lib/sami");
const envios = require("../lib/envios");
const periodos = require("../lib/periodos");
const { SAMI, ESCALA_MAX } = require("../config");
const { requireSami, verificar, configurado } = require("../lib/sami-auth");

const router = express.Router();

function marco(extra = {}) {
  return {
    css: "/sami.css",
    themeColor: "#f2f5fa",
    title: "Panel · Semillero SAMI",
    sami: SAMI,
    // Dos listas y no una: `estados` es la escalera entera, que se dibuja
    // completa siempre; `estadosManuales` es lo que el selector ofrece, sin
    // 'cancelado' —ese tiene su propio botón—.
    estados: sami.ESTADOS,
    estadosManuales: sami.ESTADOS_MANUALES,
    semestres: sami.SEMESTRES,
    perfiles: sami.PERFILES,
    conceptos: sami.CONCEPTOS,
    comites: sami.COMITES,
    escala: ESCALA_MAX,
    rutaPeriodo: "/semillero/panel",
    ...extra,
  };
}

// ---------------------------------------------------------------------
//  Acceso
// ---------------------------------------------------------------------
router.get("/acceso", (req, res) => {
  if (req.session.docenteSami) return res.redirect("/semillero/panel");
  res.render(
    "sami/acceso",
    marco({
      title: "Acceso · Semillero SAMI",
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
      "sami/acceso",
      marco({
        title: "Acceso · Semillero SAMI",
        error,
        email: String(req.body.email || ""),
        configurado: configurado(),
      })
    );
  }

  req.session.docenteSami = docente;
  res.redirect("/semillero/panel");
});

router.post("/salir", (req, res) => {
  delete req.session.docenteSami;
  res.redirect("/semillero");
});

// El guardia se cuelga de /panel y no del router entero a propósito: este
// router se monta en /semillero, que es también donde viven las páginas
// públicas. Un `router.use(requireSami)` a secas mandaría al login a cualquier
// estudiante que escribiera mal la dirección.
//
// conPeriodo va aquí mismo: TODO lo que se ve en el panel —reuniones, notas,
// cifras— es de un semestre, y mirar otro es mirar otro documento.
router.use("/panel", requireSami, periodos.conPeriodo, (req, res, next) => {
  // El selector se queda solo con los semestres en los que el semillero
  // existió. La tabla `periodos` es de la app entera y arrastra semestres
  // viejos de la Expo y del torneo; ofrecerlos aquí solo sirve para abrir
  // páginas vacías y hacer dudar a quien las abre.
  res.locals.periodos = sami.periodosVisibles(res.locals.periodos);
  next();
});

// ---------------------------------------------------------------------
//  Ayudas comunes
// ---------------------------------------------------------------------
const yo = (req) => req.session.docenteSami;

// La lista de docentes para los selectores de director y de jurado. Sale de la
// tabla, que db/database.js sincroniza con config.DOCENTES al arrancar.
const docentes = () => db.prepare("SELECT id, name FROM docentes ORDER BY name").all();

/**
 * El permiso de escritura sobre reuniones y notas. Se comprueba en el
 * servidor y no solo escondiendo el botón: esconder un control no es un
 * permiso, y la ruta se puede llamar a mano.
 */
function soloDirector(req, res, proyecto) {
  if (sami.esDirector(proyecto, yo(req))) return true;
  res.redirect(`/semillero/panel/proyecto/${proyecto.id}?error=no_director`);
  return false;
}

/**
 * El otro guardia de las escrituras, y va junto al de arriba en las mismas
 * rutas: en un semestre anterior al de ingreso el proyecto no existía, así que
 * no se le registra nada.
 *
 * Se comprueba en el servidor y no solo escondiendo los formularios, por lo
 * mismo de siempre: esconder un control no es una regla. `periodo` deja mirar el
 * semestre de la FILA que se está tocando —el de una reunión que se edita— y no
 * solo el que se esté viendo en el selector.
 */
function desdeElIngreso(req, res, proyecto, periodo = req.periodo) {
  if (!sami.antesDelIngreso(periodo && periodo.codigo, proyecto)) return true;
  res.redirect(volverA(proyecto, "?error=antes_de_ingreso"));
  return false;
}

const volverA = (proyecto, extra = "") =>
  `/semillero/panel/proyecto/${proyecto.id}${extra || "?ok=1"}`;

/**
 * Un integrante de este proyecto que ya esté en OTRO proyecto vivo.
 *
 * Se pregunta al revivir un proyecto cerrado —reabrir uno cancelado, sacar uno
 * de 'retirado'—. Mientras estuvo cerrado sus integrantes quedaron libres y
 * pudieron radicar otra propuesta; devolverlo a la vida sin mirar los dejaría
 * con dos alternativas de grado a la vez, que es justo lo que la cancelación
 * había resuelto.
 */
function integranteOcupado(proyecto) {
  return (
    sami
      .estudiantesDe(proyecto.id)
      .filter((e) => e.activo)
      .map((e) => sami.proyectoDe(e.email))
      .find(Boolean) || null
  );
}

// ---------------------------------------------------------------------
//  Portada: mis proyectos arriba, el semillero entero abajo
// ---------------------------------------------------------------------
router.get("/panel", (req, res) => {
  const todos = sami.todos();
  const mio = (p) => Number(p.director_id) === Number(yo(req).id);

  // Cada proyecto llega con el rendimiento de sus estudiantes en el semestre
  // que se está mirando: es lo que hace que la portada diga a quién le falta
  // registrar reuniones sin tener que entrar proyecto por proyecto.
  const conCifras = (p) => ({
    ...p,
    reuniones: db
      .prepare("SELECT COUNT(*) AS n FROM sami_reuniones WHERE proyecto_id = ? AND periodo_id = ?")
      .get(p.id, req.periodo.id).n,
  });

  const activos = todos.filter((p) => p.vinculado).map(conCifras);

  res.render(
    "sami/panel",
    marco({
      resumen: sami.resumen(),
      estudiantes: sami.contarEstudiantes(),
      mios: activos.filter(mio),
      otros: activos.filter((p) => !mio(p)),
      cerrados: todos.filter((p) => p.cerrado),
      intenciones: todos.filter((p) => !p.vinculado && !p.cerrado).length,
      aviso: req.query,
    })
  );
});

// ---------------------------------------------------------------------
//  Las intenciones: lo que todavía no es un proyecto
// ---------------------------------------------------------------------
router.get("/panel/solicitudes", (req, res) => {
  res.render(
    "sami/solicitudes",
    marco({
      title: "Intenciones · Semillero SAMI",
      rutaPeriodo: "/semillero/panel/solicitudes",
      // Con el rastro de cada uno: la bandeja es donde caen los registros de
      // prueba y los repetidos, así que es donde más falta hace poder borrar
      // sin entrar a la ficha. Y donde hay que saber cuáles no se pueden.
      pendientes: sami.todos({ fase: "vinculacion" }).map((p) => ({ ...p, rastro: sami.rastro(p.id) })),
      docentes: docentes(),
      aviso: req.query,
    })
  );
});

// ---------------------------------------------------------------------
//  La ficha de un proyecto
// ---------------------------------------------------------------------
router.get("/panel/proyecto/:id", (req, res) => {
  const proyecto = sami.porId(req.params.id);
  if (!proyecto) return res.redirect("/semillero/panel");

  // Los objetivos son del proyecto, así que su promedio se saca una vez y es el
  // mismo para los dos integrantes. Lo que los diferencia —su promedio de
  // reuniones— entra abajo, estudiante por estudiante.
  const objetivos = sami.objetivosDe(proyecto.id, req.periodo.id);
  const avance = sami.promedioObjetivos(objetivos);

  const estudiantes = sami.estudiantesDe(proyecto.id).map((e) => {
    const suyo = sami.notaDe(e.id, req.periodo.id);
    return {
      ...e,
      ...suyo,
      // La sugerencia del semestre. Va calculada desde aquí y no en la vista
      // porque es una regla del dominio —cuánto pesa cada cosa— y no una
      // manera de enseñarla.
      sugerido: sami.sugerido(avance.promedio, suyo.rendimiento.promedio),
      // Lo único que cruza semestres: cómo va en total. Va arriba, en el
      // resumen, y no en la sección de notas, que es de este semestre.
      acumulado: sami.acumulado(e.id),
    };
  });

  res.render(
    "sami/proyecto",
    marco({
      title: `${proyecto.titulo} · Semillero SAMI`,
      rutaPeriodo: `/semillero/panel/proyecto/${proyecto.id}`,
      proyecto,
      estudiantes,
      objetivos,
      avance,
      jurados: sami.juradosDe(proyecto.id),
      reuniones: sami.reunionesDe(proyecto.id, req.periodo.id),
      // Las dieciséis semanas DEL SEMESTRE QUE SE ESTÁ MIRANDO, calculadas de su
      // fecha de inicio. Sirven para ver de un vistazo cuáles ya tienen reunión
      // registrada, que es la pregunta que se hace un director en noviembre; y
      // al cambiar de semestre en el selector cambian con él, porque el semestre
      // pasado empezó en otra fecha.
      semanas: sami.semanas(req.periodo.codigo),
      docentes: docentes(),
      // Lo que cuelga del proyecto: decide si se puede eliminar y, sobre todo,
      // le deja decir a la página POR QUÉ no se puede.
      rastro: sami.rastro(proyecto.id),
      // Los dos permisos, para esconder lo que de todos modos el servidor
      // rechaza: ser el director, y que el semestre que se mira no sea anterior
      // al de ingreso —en ese el proyecto no existía—.
      puedeCalificar: sami.esDirector(proyecto, yo(req)),
      antesDelIngreso: sami.antesDelIngreso(req.periodo.codigo, proyecto),
      aviso: req.query,
    })
  );
});

// ---------------------------------------------------------------------
//  El trámite: abierto a cualquier docente del panel
// ---------------------------------------------------------------------

/**
 * Estado y semestre.
 *
 * Al pasar a 'aprobada' sale el correo que le dice al estudiante quién quedó
 * de director. Una sola vez: avisado_at es lo que impide que mover el estado
 * de ida y vuelta le llene la bandeja.
 */
router.post("/panel/proyecto/:id/estado", (req, res) => {
  const proyecto = sami.porId(req.params.id);
  if (!proyecto) return res.redirect("/semillero/panel");

  const estado = sami.estadoValido(req.body.estado);
  if (!estado) return res.redirect(volverA(proyecto, "?error=estado"));

  // Cancelar no se pone desde aquí aunque alguien mande el formulario a mano:
  // tiene su propio botón porque pide el motivo y guarda de dónde venía.
  if (estado === "cancelado") return res.redirect(volverA(proyecto, "?error=cancelar#riesgo"));

  // Sacarlo de un estado que soltaba a sus integrantes es volver a ocuparles la
  // alternativa de grado, y eso solo se puede si siguen libres.
  if (sami.libera(proyecto.estado) && !sami.libera(estado)) {
    const ocupado = integranteOcupado(proyecto);
    if (ocupado) {
      return res.redirect(volverA(proyecto, `?error=ya_vinculado&otro=${ocupado.codigo}`));
    }
  }

  const semestre = sami.semestreValido(req.body.semestre);

  // Mover el estado a mano deshace la cancelación, así que se limpia lo suyo:
  // un proyecto en desarrollo que siga diciendo quién lo canceló y por qué es
  // una fila que se contradice sola.
  db.prepare(
    `UPDATE sami_proyectos
        SET estado = ?, semestre = ?, cancelado_at = NULL, cancelado_por = NULL,
            cancelado_motivo = NULL, cancelado_desde = NULL
      WHERE id = ?`
  ).run(
    estado,
    // Antes de que se apruebe la propuesta no hay semestre de semillero que
    // contar: guardar uno ahí diría que ya empezó a correr el plazo.
    sami.vinculado(estado) || sami.cerrado(estado) ? semestre : null,
    proyecto.id
  );

  if (estado === "aprobada" && !proyecto.avisado_at) {
    const estudiantes = sami.estudiantesDe(proyecto.id).filter((e) => e.activo);
    envios
      .samiAvisoAprobada(
        {
          codigo: proyecto.codigo,
          titulo: proyecto.titulo,
          director: proyecto.director || "por asignar",
          codirector: proyecto.codirector,
          estudiantes,
          sami: SAMI,
        },
        envios.urlBase(req)
      )
      .then((ok) => {
        if (ok) {
          db.prepare("UPDATE sami_proyectos SET avisado_at = CURRENT_TIMESTAMP WHERE id = ?").run(
            proyecto.id
          );
        }
      });
  }

  res.redirect(volverA(proyecto));
});

router.post("/panel/proyecto/:id/direccion", (req, res) => {
  const proyecto = sami.porId(req.params.id);
  if (!proyecto) return res.redirect("/semillero/panel");

  // "" en el selector es NO ASIGNADO, que es un estado normal del semillero y
  // no un dato faltante.
  const directorId = Number(req.body.director_id) || null;

  db.prepare("UPDATE sami_proyectos SET director_id = ?, codirector = ? WHERE id = ?").run(
    directorId,
    sami.limpiarNombre(req.body.codirector).slice(0, 160) || null,
    proyecto.id
  );

  res.redirect(volverA(proyecto));
});

router.post("/panel/proyecto/:id/datos", (req, res) => {
  const proyecto = sami.porId(req.params.id);
  if (!proyecto) return res.redirect("/semillero/panel");

  const titulo = sami.limpiarNombre(req.body.titulo).slice(0, 300);
  if (!titulo) return res.redirect(volverA(proyecto, "?error=titulo"));

  db.prepare(
    `UPDATE sami_proyectos SET titulo = ?, perfil = ?, ods = ?, publicacion = ? WHERE id = ?`
  ).run(
    titulo,
    sami.perfilValido(req.body.perfil),
    String(req.body.ods || "").trim().slice(0, 160) || null,
    String(req.body.publicacion || "").trim().slice(0, 20) || null,
    proyecto.id
  );

  res.redirect(volverA(proyecto));
});

/**
 * Las fechas del trámite y los dos comités.
 *
 * Van juntas en un solo formulario porque se llenan juntas: quien está
 * poniendo al día un proyecto tiene el acta delante y copia las seis de una
 * vez. Un formulario por fecha serían seis guardados para una sola sentada.
 */
router.post("/panel/proyecto/:id/fechas", (req, res) => {
  const proyecto = sami.porId(req.params.id);
  if (!proyecto) return res.redirect("/semillero/panel");

  const ingreso = sami.fechaValida(req.body.ingreso_at);

  // El "Entró en" del proyecto sale de la fecha de ingreso y no al revés.
  //
  // Antes se guardaba al crearlo —el semestre que estuviera activo ese día— y se
  // quedaba pegado ahí para siempre, así que corregir la fecha no lo movía: la
  // ficha decía "entró en 2026-20" con una fecha de febrero delante. El dato que
  // un docente escribe mirando el acta es el DÍA; el semestre se deduce.
  //
  // Si ese semestre todavía no existe en la app —la tabla `periodos` los crea
  // config.PERIODO al arrancar— no se inventa: se deja el que tenía y se dice,
  // porque quedarse callado aquí es exactamente lo que hace pensar que guardar
  // la fecha no sirvió de nada.
  const codigo = ingreso ? sami.periodoDeFecha(ingreso) : null;
  const suyo = codigo ? periodos.porCodigo(codigo) : null;
  if (suyo && suyo.id !== proyecto.periodo_id) {
    db.prepare("UPDATE sami_proyectos SET periodo_id = ? WHERE id = ?").run(suyo.id, proyecto.id);
  }

  db.prepare(
    `UPDATE sami_proyectos
        SET ingreso_at = ?, carta_at = ?, propuesta_at = ?, aprobacion_at = ?,
            anteproyecto_at = ?, ceb = ?, ceb_at = ?, cpi = ?, cpi_at = ?,
            sustentacion_at = ?
      WHERE id = ?`
  ).run(
    ingreso,
    sami.fechaValida(req.body.carta_at),
    sami.fechaValida(req.body.propuesta_at),
    sami.fechaValida(req.body.aprobacion_at),
    sami.fechaValida(req.body.anteproyecto_at),
    sami.comiteValido(req.body.ceb),
    sami.fechaValida(req.body.ceb_at),
    sami.comiteValido(req.body.cpi),
    sami.fechaValida(req.body.cpi_at),
    sami.fechaValida(req.body.sustentacion_at),
    proyecto.id
  );

  res.redirect(
    volverA(proyecto, codigo && !suyo ? `?sin_semestre=${codigo}#tramite` : "?ok=1#tramite")
  );
});

/**
 * Los jurados del anteproyecto y su concepto.
 *
 * Se reescriben enteros en cada guardado en vez de editarlos uno por uno: son
 * dos o tres filas que se llenan en la misma sentada —cuando llega el acta—, y
 * un formulario por jurado obligaría a guardar tres veces lo que es un solo
 * hecho.
 */
router.post("/panel/proyecto/:id/jurados", (req, res) => {
  const proyecto = sami.porId(req.params.id);
  if (!proyecto) return res.redirect("/semillero/panel");

  const nombres = [].concat(req.body.jurado_nombre || []);
  const conceptos = [].concat(req.body.jurado_concepto || []);
  const fechas = [].concat(req.body.jurado_fecha || []);

  sami.enTransaccion(() => {
    db.prepare("DELETE FROM sami_jurados WHERE proyecto_id = ?").run(proyecto.id);
    const insertar = db.prepare(
      `INSERT INTO sami_jurados (proyecto_id, docente_id, nombre, concepto, concepto_at, orden)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    nombres.forEach((crudo, i) => {
      const nombre = sami.limpiarNombre(crudo).slice(0, 120);
      if (!nombre) return;
      // Si el jurado está en la lista del programa se guarda su id además del
      // nombre; si es alguien de fuera, solo el nombre. Las dos cosas son
      // jurados de verdad.
      const fila = db.prepare("SELECT id FROM docentes WHERE name = ? COLLATE NOCASE").get(nombre);
      insertar.run(
        proyecto.id,
        fila ? fila.id : null,
        nombre,
        sami.conceptoValido(conceptos[i]),
        sami.fechaValida(fechas[i]),
        i
      );
    });
  });

  res.redirect(volverA(proyecto, "?ok=1#jurados"));
});

router.post("/panel/proyecto/:id/nota", (req, res) => {
  const proyecto = sami.porId(req.params.id);
  if (!proyecto) return res.redirect("/semillero/panel");

  db.prepare("UPDATE sami_proyectos SET nota = ? WHERE id = ?").run(
    sami.limpiarTexto(req.body.nota, 600) || null,
    proyecto.id
  );

  res.redirect(volverA(proyecto));
});

// ---------------------------------------------------------------------
//  Integrantes
// ---------------------------------------------------------------------
router.post("/panel/proyecto/:id/estudiantes", (req, res) => {
  const proyecto = sami.porId(req.params.id);
  if (!proyecto) return res.redirect("/semillero/panel");

  const nuevos = sami.estudiantesDesdeFormulario(req.body, 1);
  const e = nuevos[0];
  if (!e || !e.nombre || !sami.emailValido(e.email)) {
    return res.redirect(volverA(proyecto, "?error=estudiante#integrantes"));
  }

  const previo = sami.proyectoDe(e.email);
  if (previo) return res.redirect(volverA(proyecto, "?error=ya_vinculado#integrantes"));

  const orden = db
    .prepare("SELECT COALESCE(MAX(orden), -1) + 1 AS n FROM sami_estudiantes WHERE proyecto_id = ?")
    .get(proyecto.id).n;

  db.prepare(
    `INSERT INTO sami_estudiantes
       (proyecto_id, nombre, codigo_estudiante, documento, telefono, email, semestre_academico, orden)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    proyecto.id,
    e.nombre,
    e.codigo_estudiante,
    e.documento,
    e.telefono,
    e.email,
    e.semestre_academico,
    orden
  );

  res.redirect(volverA(proyecto, "?ok=1#integrantes"));
});

/**
 * Retirar o reincorporar a un integrante.
 *
 * Nunca se borra la fila: sus reuniones y sus notas siguen siendo ciertas, y
 * son la constancia de lo que sí trabajó mientras estuvo. El mismo botón
 * deshace, que es lo que hace falta cuando alguien se marca por error.
 */
router.post("/panel/estudiantes/:id/activo", (req, res) => {
  const estudiante = sami.estudiante(req.params.id);
  if (!estudiante) return res.redirect("/semillero/panel");

  const proyecto = sami.porId(estudiante.proyecto_id);
  db.prepare("UPDATE sami_estudiantes SET activo = ? WHERE id = ?").run(
    estudiante.activo ? 0 : 1,
    estudiante.id
  );

  res.redirect(volverA(proyecto, "?ok=1#integrantes"));
});

// ---------------------------------------------------------------------
//  Cancelar y eliminar
//
//  Dos salidas y no una, porque son dos cosas distintas y confundirlas es lo
//  que hace que la gente termine borrando lo que no debía:
//
//    · CANCELAR es un hecho del semillero. El proyecto existió, se registró, y
//      ahora no va: cambiaron de idea, la propuesta se cae, se rehace con otro
//      título. La fila SE QUEDA —con el motivo, con quién lo decidió y con el
//      estado en el que iba— y lo que hace es soltar a sus estudiantes, para
//      que puedan volver a radicar sin que el registro anterior les diga que
//      ya están en un proyecto. Eso era lo que antes obligaba a inventarse
//      correos o a marcar como 'retirado' a alguien que no se ha retirado de
//      nada.
//
//    · ELIMINAR es admitir que la fila nunca debió existir: la prueba que se
//      hizo para ver cómo se veía el formulario, el registro repetido, el que
//      se llenó con el nombre de otro. Se borra entera y no queda nada.
//
//  Eliminar NO tiene tope. Se intentó ponerle uno —prohibirlo en cuanto el
//  proyecto tuviera una reunión o una nota, por aquello de que son la
//  constancia del trabajo de un semestre— y era un error: probar el módulo
//  pasa por escribir una nota de prueba, y esa nota dejaba el proyecto de
//  prueba imborrable para siempre. Un candado que solo atrapa lo que hay que
//  limpiar no protege nada, y la constancia que de verdad importa está
//  protegida por otra cosa: nadie borra un proyecto vivo sin querer.
//
//  Lo que hay en su lugar es proporcional. Si el borrado se lleva trabajo
//  registrado, hay que escribir el código del proyecto: seis caracteres que no
//  se teclean sin querer y que obligan a mirar CUÁL se está borrando, que es el
//  error de verdad. Si no se lleva nada, basta el aviso del navegador.
//
//  Las dos las puede hacer cualquier docente del panel, como el resto del
//  trámite. Quien entra aquí es la dirección del programa; poner a pedir
//  permiso para limpiar un registro de prueba solo consigue que el registro de
//  prueba se quede ahí para siempre.
// ---------------------------------------------------------------------

router.post("/panel/proyecto/:id/cancelar", (req, res) => {
  const proyecto = sami.porId(req.params.id);
  if (!proyecto) return res.redirect("/semillero/panel");
  if (proyecto.estado === "cancelado") return res.redirect(volverA(proyecto));

  // El motivo es obligatorio y es el punto entero de tener un botón propio:
  // dentro de un semestre, "¿por qué se cayó este?" es la única pregunta que
  // alguien va a hacerle a esta fila.
  const motivo = sami.limpiarTexto(req.body.motivo, 300);
  if (!motivo) return res.redirect(volverA(proyecto, "?error=motivo#riesgo"));

  db.prepare(
    `UPDATE sami_proyectos
        SET estado = 'cancelado', cancelado_desde = ?, cancelado_motivo = ?,
            cancelado_por = ?, cancelado_at = CURRENT_TIMESTAMP
      WHERE id = ?`
  ).run(proyecto.estado, motivo, yo(req).id, proyecto.id);

  res.redirect(volverA(proyecto, "?cancelado=1"));
});

/**
 * Deshacer una cancelación: vuelve al estado en el que iba.
 *
 * Con una salvedad que no es un detalle. Cancelar le devolvió el cupo a sus
 * estudiantes, y puede que alguno YA lo haya usado para registrar otro
 * proyecto. Reabrir entonces lo dejaría en dos alternativas de grado vivas a la
 * vez, que es justo lo que la cancelación deshizo. Se dice y no se hace.
 */
router.post("/panel/proyecto/:id/reabrir", (req, res) => {
  const proyecto = sami.porId(req.params.id);
  if (!proyecto) return res.redirect("/semillero/panel");
  if (proyecto.estado !== "cancelado") return res.redirect(volverA(proyecto));

  const ocupado = integranteOcupado(proyecto);
  if (ocupado) {
    return res.redirect(volverA(proyecto, `?error=ya_vinculado&otro=${ocupado.codigo}#riesgo`));
  }

  db.prepare(
    `UPDATE sami_proyectos
        SET estado = ?, cancelado_at = NULL, cancelado_por = NULL,
            cancelado_motivo = NULL, cancelado_desde = NULL
      WHERE id = ?`
  ).run(sami.estadoValido(proyecto.cancelado_desde) || "registro", proyecto.id);

  res.redirect(volverA(proyecto));
});

router.post("/panel/proyecto/:id/borrar", (req, res) => {
  const proyecto = sami.porId(req.params.id);
  if (!proyecto) return res.redirect("/semillero/panel");

  // La bandeja de intenciones borra desde su propia lista y quiere volver a
  // ella: mandar a la portada a quien está limpiando cinco registros de prueba
  // es hacerle navegar de vuelta cinco veces.
  const desdeBandeja = req.body.volver === "solicitudes";
  const bandeja = desdeBandeja ? "/semillero/panel/solicitudes" : "/semillero/panel";

  // Si se lleva trabajo registrado por delante hay que escribir el código del
  // proyecto. No es un permiso —cualquier docente del panel puede borrar lo que
  // sea— sino la diferencia entre pulsar un botón y decidir: seis caracteres
  // que no se teclean sin querer y que además obligan a mirar cuál se está
  // borrando, que es el error de verdad y no el de borrar a propósito.
  if (sami.dejaRastro(sami.rastro(proyecto.id))) {
    const escrito = String(req.body.confirmar || "").trim().toUpperCase();
    if (escrito !== proyecto.codigo) return res.redirect(volverA(proyecto, "?error=confirmar#riesgo"));
  }

  // Se lleva por delante estudiantes, jurados, reuniones y notas por las llaves
  // foráneas de db/database.js, que están en ON DELETE CASCADE con
  // `PRAGMA foreign_keys = ON`. Borrarlos a mano aquí sería repetir en JavaScript
  // lo que el esquema ya declara, y repetirlo es donde se olvida una tabla.
  db.prepare("DELETE FROM sami_proyectos WHERE id = ?").run(proyecto.id);

  res.redirect(`${bandeja}?eliminado=${encodeURIComponent(proyecto.codigo)}`);
});

// ---------------------------------------------------------------------
//  Reuniones — solo el director
// ---------------------------------------------------------------------

/**
 * Registrar una reunión.
 *
 * Es la fila de la hoja semanal, entera y en un solo guardado: la fecha, lo
 * que mostraron, a qué se comprometieron y —por cada estudiante— si vino y qué
 * nota sacó. Guardarlo por partes daría reuniones a medias, que es lo que
 * pasaba con la hoja.
 */
router.post("/panel/proyecto/:id/reuniones", (req, res) => {
  const proyecto = sami.porId(req.params.id);
  if (!proyecto) return res.redirect("/semillero/panel");
  if (!soloDirector(req, res, proyecto)) return;
  if (!desdeElIngreso(req, res, proyecto)) return;

  const fecha = sami.fechaValida(req.body.fecha);
  if (!fecha) return res.redirect(volverA(proyecto, "?error=fecha#reuniones"));

  const marcas = leerMarcas(req.body);
  if (marcas === false) return res.redirect(volverA(proyecto, "?error=calificacion#reuniones"));

  const id = sami.enTransaccion(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO sami_reuniones
           (proyecto_id, periodo_id, fecha, semana, adelantos, compromisos, docente_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        proyecto.id,
        req.periodo.id,
        fecha,
        sami.semanaDe(fecha, req.periodo.codigo),
        sami.limpiarTexto(req.body.adelantos) || null,
        sami.limpiarTexto(req.body.compromisos) || null,
        yo(req).id
      );

    escribirMarcas(lastInsertRowid, proyecto.id, marcas);
    return lastInsertRowid;
  });

  res.redirect(volverA(proyecto, `?ok=1#r${id}`));
});

router.post("/panel/reuniones/:id", (req, res) => {
  const reunion = sami.reunion(req.params.id);
  if (!reunion) return res.redirect("/semillero/panel");

  const proyecto = sami.porId(reunion.proyecto_id);
  if (!soloDirector(req, res, proyecto)) return;

  // La semana se recalcula contra el calendario del semestre de LA REUNIÓN y no
  // contra el que se esté mirando. Son el mismo casi siempre —la ficha solo
  // lista las de este semestre—, pero el que manda es el de la fila.
  const suyo = periodos.porId(reunion.periodo_id);
  if (!desdeElIngreso(req, res, proyecto, suyo)) return;

  const fecha = sami.fechaValida(req.body.fecha);
  if (!fecha) return res.redirect(volverA(proyecto, `?error=fecha#r${reunion.id}`));

  const marcas = leerMarcas(req.body);
  if (marcas === false) {
    return res.redirect(volverA(proyecto, `?error=calificacion#r${reunion.id}`));
  }

  sami.enTransaccion(() => {
    db.prepare(
      `UPDATE sami_reuniones SET fecha = ?, semana = ?, adelantos = ?, compromisos = ?
        WHERE id = ?`
    ).run(
      fecha,
      sami.semanaDe(fecha, suyo ? suyo.codigo : null),
      sami.limpiarTexto(req.body.adelantos) || null,
      sami.limpiarTexto(req.body.compromisos) || null,
      reunion.id
    );
    escribirMarcas(reunion.id, proyecto.id, marcas);
  });

  res.redirect(volverA(proyecto, `?ok=1#r${reunion.id}`));
});

router.post("/panel/reuniones/:id/borrar", (req, res) => {
  const reunion = sami.reunion(req.params.id);
  if (!reunion) return res.redirect("/semillero/panel");

  const proyecto = sami.porId(reunion.proyecto_id);
  if (!soloDirector(req, res, proyecto)) return;

  db.prepare("DELETE FROM sami_reuniones WHERE id = ?").run(reunion.id);
  res.redirect(volverA(proyecto, "?borrado=1#reuniones"));
});

/**
 * Lee la asistencia y la calificación de cada estudiante del formulario.
 *
 * Devuelve `false` —y no una lista a medias— si alguna nota está fuera de
 * escala: es mejor rechazar la reunión entera y que el docente corrija, que
 * guardar cinco marcas bien y una en blanco sin decírselo.
 */
function leerMarcas(body) {
  // Los campos vienen indexados por el id del estudiante y no como listas
  // paralelas: los tres radios de una persona tienen que ser SU grupo, y un
  // name repetido los agruparía a todos en uno solo.
  const out = [];

  for (const crudo of [].concat(body.marca_estudiante || [])) {
    const id = Number(crudo);
    if (!id) continue;

    const nota = sami.calificacion(body[`marca_nota_${id}`]);
    if (nota === false) return false;

    const asistio = String(body[`marca_asistio_${id}`] || "");
    out.push({
      estudianteId: id,
      // "" es sin marcar, que es distinto de "no vino". Los tres valores del
      // control se guardan tal cual.
      asistio: asistio === "1" ? 1 : asistio === "0" ? 0 : null,
      calificacion: nota,
    });
  }

  return out;
}

// Escribe las marcas de una reunión. Solo se aceptan estudiantes de ESE
// proyecto: los ids vienen de un formulario y un formulario lo manda cualquiera.
function escribirMarcas(reunionId, proyectoId, marcas) {
  const suyo = db.prepare("SELECT 1 FROM sami_estudiantes WHERE id = ? AND proyecto_id = ?");
  const guardar = db.prepare(
    `INSERT INTO sami_asistencias (reunion_id, estudiante_id, asistio, calificacion)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (reunion_id, estudiante_id)
     DO UPDATE SET asistio = excluded.asistio, calificacion = excluded.calificacion`
  );

  for (const m of marcas) {
    if (!suyo.get(m.estudianteId, proyectoId)) continue;
    guardar.run(reunionId, m.estudianteId, m.asistio, m.calificacion);
  }
}

// ---------------------------------------------------------------------
//  Los objetivos del semestre — solo el director
//
//  Un solo guardado para las tres cosas que se hacen aquí —corregir el texto,
//  poner las notas y pegar los que falten—, porque las tres pasan en la misma
//  sentada: se abre la propuesta, se pegan los objetivos, y meses después se
//  vuelve con el acta a poner las notas de una vez. Tres formularios serían
//  tres guardados para lo que el docente vive como uno.
//
//  Los objetivos son parte de calificar y por eso van con el mismo permiso que
//  las reuniones y las notas: los pone el director. Un objetivo que aparece o
//  desaparece mueve la nota sugerida de un semestre entero, y eso no es un acto
//  administrativo que registre quien esté a la mano.
// ---------------------------------------------------------------------
router.post("/panel/proyecto/:id/objetivos", (req, res) => {
  const proyecto = sami.porId(req.params.id);
  if (!proyecto) return res.redirect("/semillero/panel");
  if (!soloDirector(req, res, proyecto)) return;
  if (!desdeElIngreso(req, res, proyecto)) return;

  // Lo que hay hoy, indexado. Sirve para dos cosas: para no tocar filas de otro
  // proyecto —los ids vienen de un formulario, y un formulario lo manda
  // cualquiera— y para escribir solo lo que de verdad cambió.
  const actuales = new Map(sami.objetivosDe(proyecto.id, req.periodo.id).map((o) => [o.id, o]));

  const ids = [].concat(req.body.objetivo_id || []).map(Number);
  const textos = [].concat(req.body.objetivo_texto || []);

  // Las notas se leen y se validan ANTES de escribir nada: una sola fuera de
  // escala tumba el guardado entero. Es lo mismo que hacen las reuniones, y por
  // lo mismo: guardar seis bien y una en blanco sin avisar es peor que no
  // guardar.
  const notas = new Map();
  for (const id of ids) {
    if (!actuales.has(id)) continue;
    const n = sami.calificacion(req.body[`objetivo_nota_${id}`]);
    if (n === false) return res.redirect(volverA(proyecto, "?error=calificacion#objetivos"));
    notas.set(id, n);
  }

  const nuevos = sami.lineas(req.body.nuevos);

  sami.enTransaccion(() => {
    const texto = db.prepare("UPDATE sami_objetivos SET texto = ?, orden = ? WHERE id = ?");
    const calificar = db.prepare(
      `UPDATE sami_objetivos
          SET nota = ?, calificado_por = ?, calificado_at = CURRENT_TIMESTAMP
        WHERE id = ?`
    );
    // Borrar la nota borra también de quién era: una casilla vacía que siga
    // diciendo que alguien la calificó el martes es una fila que miente.
    const descalificar = db.prepare(
      "UPDATE sami_objetivos SET nota = NULL, calificado_por = NULL, calificado_at = NULL WHERE id = ?"
    );
    const quitar = db.prepare("DELETE FROM sami_objetivos WHERE id = ?");
    const insertar = db.prepare(
      "INSERT INTO sami_objetivos (proyecto_id, periodo_id, texto, orden) VALUES (?, ?, ?, ?)"
    );

    let orden = 0;

    ids.forEach((id, i) => {
      const actual = actuales.get(id);
      if (!actual) return;

      // Un objetivo sin texto se quita, como un jurado sin nombre. Se dice en la
      // página, y es la forma de borrar uno que no necesita un botón más en una
      // fila que ya tiene dos campos.
      const nuevo = sami.limpiarTexto(textos[i], 300);
      if (!nuevo) return quitar.run(id);

      if (nuevo !== actual.texto || orden !== actual.orden) texto.run(nuevo, orden, id);

      // La nota solo se toca si cambió. Reescribirla en cada guardado movería la
      // fecha de "cuándo se calificó" cada vez que alguien corrige una coma.
      const nota = notas.get(id);
      if (nota !== actual.nota) {
        if (nota === null) descalificar.run(id);
        else calificar.run(nota, yo(req).id, id);
      }

      orden++;
    });

    nuevos.forEach((t) => insertar.run(proyecto.id, req.periodo.id, t, orden++));
  });

  res.redirect(volverA(proyecto, "?ok=1#objetivos"));
});

// ---------------------------------------------------------------------
//  La nota del semestre — solo el director
// ---------------------------------------------------------------------
/**
 * Se escribe a mano, siempre. El panel muestra al lado el promedio de las
 * reuniones y el porcentaje de asistencia, pero no los precarga en la casilla:
 * el docente pesa cosas que no están en esta base, y una nota puesta sola por
 * un promedio sería una nota que nadie decidió.
 *
 * El semestre (I, II, III) se CUENTA desde el ingreso del proyecto y se congela
 * en la fila: dentro de un año hay que poder decir que esta nota fue la del
 * semestre II, aunque el proyecto ya vaya en el III.
 *
 * Se contaba mal: se copiaba `proyecto.semestre`, que es dónde está HOY. Al
 * calificar el 2025-20 de un proyecto que ya iba por el III, la nota del primer
 * semestre quedaba sellada como "III", y dos notas del mismo estudiante decían
 * las dos que eran del III. La etiqueta existe justamente para distinguirlas.
 */
router.post("/panel/estudiantes/:id/nota", (req, res) => {
  const estudiante = sami.estudiante(req.params.id);
  if (!estudiante) return res.redirect("/semillero/panel");

  const proyecto = sami.porId(estudiante.proyecto_id);
  if (!soloDirector(req, res, proyecto)) return;
  if (!desdeElIngreso(req, res, proyecto)) return;

  const director = sami.calificacion(req.body.nota_director);
  const codirector = sami.calificacion(req.body.nota_codirector);
  if (director === false || codirector === false) {
    return res.redirect(volverA(proyecto, `?error=calificacion#n${estudiante.id}`));
  }

  db.prepare(
    `INSERT INTO sami_notas
       (estudiante_id, periodo_id, semestre, nota_director, nota_codirector, observacion,
        cerrada_por, cerrada_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (estudiante_id, periodo_id) DO UPDATE SET
       semestre        = excluded.semestre,
       nota_director   = excluded.nota_director,
       nota_codirector = excluded.nota_codirector,
       observacion     = excluded.observacion,
       cerrada_por     = excluded.cerrada_por,
       cerrada_at      = CURRENT_TIMESTAMP`
  ).run(
    estudiante.id,
    req.periodo.id,
    // Contado desde el ingreso. El campo del proyecto solo entra si no se puede
    // contar —un proyecto sin semestre de entrada—, y ahí vale más lo que haya
    // escrito el director que nada.
    sami.semestreEn(proyecto, req.periodo.codigo) || proyecto.semestre,
    director,
    codirector,
    sami.limpiarTexto(req.body.observacion, 600) || null,
    yo(req).id
  );

  res.redirect(volverA(proyecto, `?ok=1#n${estudiante.id}`));
});

// ---------------------------------------------------------------------
//  Cargar un lote pegado desde la hoja
//
//  El semillero lleva años en un Excel, así que el módulo tiene que poder
//  arrancar con lo que ya hay adentro y no con la base en cero. Se seleccionan
//  las filas en la hoja, se copian y se pegan aquí.
//
//  Son DOS pasos y no uno: primero se ve qué va a entrar, y solo entonces se
//  guarda. Importar treinta proyectos es la clase de cosa que no se puede
//  deshacer con un botón, así que la vista previa no es un lujo.
//
//  El paso de confirmar vuelve a parsear el mismo texto en vez de guardarse lo
//  que se calculó en la vista previa: sin estado que sincronizar no hay forma
//  de que lo que se confirmó sea distinto de lo que se vio.
// ---------------------------------------------------------------------
function vistaImportar(req, extra = {}) {
  return marco({
    title: "Cargar un lote · Semillero SAMI",
    rutaPeriodo: "/semillero/panel/importar",
    columnas: sami.COLUMNAS_HOJA,
    pegado: "",
    proyectos: null,
    errores: [],
    ...extra,
  });
}

router.get("/panel/importar", (req, res) => {
  res.render("sami/importar", vistaImportar(req));
});

// Vista previa: parsea y enseña, sin escribir nada.
router.post("/panel/importar", (req, res) => {
  const pegado = String(req.body.pegado || "");
  const { proyectos, errores } = sami.parsearLote(pegado);

  // Los choques con lo que YA está en la base solo se pueden ver aquí, no en
  // el parser: son una pregunta a la base y no una cuestión de formato.
  const conChoques = proyectos.map((p) => ({
    ...p,
    director_id: (docentes().find((d) => sami.mismoNombre(d.name, p.director)) || {}).id || null,
    estudiantes: p.estudiantes.map((e) => ({ ...e, ya: sami.proyectoDe(e.email) })),
  }));

  res.render(
    "sami/importar",
    vistaImportar(req, { pegado, proyectos: conChoques, errores })
  );
});

router.post("/panel/importar/confirmar", (req, res) => {
  const pegado = String(req.body.pegado || "");
  const { proyectos } = sami.parsearLote(pegado);
  const lista = docentes();

  let creados = 0;
  let omitidos = 0;

  sami.enTransaccion(() => {
    const nuevoProyecto = db.prepare(
      `INSERT INTO sami_proyectos
         (codigo, titulo, estado, semestre, director_id, codirector,
          anteproyecto_at, ceb, cpi, periodo_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const nuevoEstudiante = db.prepare(
      `INSERT INTO sami_estudiantes
         (proyecto_id, nombre, codigo_estudiante, documento, telefono, email, orden)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const nuevoJurado = db.prepare(
      `INSERT INTO sami_jurados (proyecto_id, docente_id, nombre, concepto, orden)
       VALUES (?, ?, ?, ?, ?)`
    );

    for (const p of proyectos) {
      // Quien ya está vinculado a un proyecto vivo no se importa dos veces: es
      // casi siempre la misma persona en dos hojas de semestres distintos.
      const nuevos = p.estudiantes.filter((e) => !sami.proyectoDe(e.email));
      if (!nuevos.length) {
        omitidos++;
        continue;
      }

      const director = lista.find((d) => sami.mismoNombre(d.name, p.director));
      const { lastInsertRowid } = nuevoProyecto.run(
        sami.codigoLibre(),
        p.titulo,
        p.estado,
        p.semestre,
        director ? director.id : null,
        p.codirector,
        p.anteproyecto_at,
        p.ceb,
        p.cpi,
        req.periodo.id
      );

      nuevos.forEach((e, i) =>
        nuevoEstudiante.run(
          lastInsertRowid,
          e.nombre,
          e.codigo_estudiante,
          e.documento,
          e.telefono,
          e.email,
          i
        )
      );

      p.jurados.forEach((j, i) => {
        const suyo = lista.find((d) => sami.mismoNombre(d.name, j.nombre));
        nuevoJurado.run(lastInsertRowid, suyo ? suyo.id : null, j.nombre, j.concepto, i);
      });

      creados++;
    }
  });

  res.redirect(`/semillero/panel?creados=${creados}&omitidos=${omitidos}`);
});

// ---------------------------------------------------------------------
//  Los tres CSV
//
//  Reproducen columna por columna las hojas que el programa venía llevando a
//  mano, con las MISMAS etiquetas: "4. Aprobación CB" y no "aprobacion_cb".
//  Así lo exportado se pega en el documento viejo sin traducir nada, que es lo
//  que hace falta mientras el archivo institucional siga siendo esa hoja.
//
//  Punto y coma y BOM, como en el resto del sitio: es lo que hace que Excel en
//  español abra el archivo en columnas en vez de meter todo en la primera.
// ---------------------------------------------------------------------
const escapar = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

function csv(res, nombre, filas) {
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="${nombre}"`);
  res.send("﻿" + filas.map((f) => f.map(escapar).join(";")).join("\r\n"));
}

/** La hoja del semestre de "Seguimiento Proyectos SAMI". */
router.get("/panel/seguimiento.csv", (req, res) => {
  const filas = [
    [
      "NOMBRE PROYECTO", "CÓDIGO", "NOMBRES Y APELLIDOS", "DOCUMENTO", "TELÉFONO",
      "CORREO ELECTRÓNICO", "DIRECTOR", "CODIRECTOR", "SEMESTRE SEMILLERO", "ESTADO",
      "JURADO", "CONCEPTO DE JURADO", "FECHA SUSTENTACIÓN ANTEPROYECTO",
      "ESTADO CEB", "ESTADO CPI",
    ],
  ];

  for (const p of sami.todos({ fase: "proyecto" })) {
    const jurados = sami.juradosDe(p.id);
    // Una fila por estudiante, con los datos del proyecto solo en la primera:
    // es exactamente cómo está armada la hoja, y así se pega encima.
    p.estudiantes.forEach((e, i) => {
      const j = jurados[i];
      filas.push([
        i === 0 ? p.titulo : "",
        e.codigo_estudiante,
        e.nombre,
        e.documento,
        e.telefono,
        e.email,
        i === 0 ? p.director || "NO ASIGNADO" : "",
        i === 0 ? p.codirector || "N/A" : "",
        i === 0 ? p.semestre || "" : "",
        i === 0 ? p.estado_info.hoja : "",
        j ? j.nombre : "",
        j && j.concepto_info ? j.concepto_info.hoja : "",
        i === 0 && p.fechas.anteproyecto ? p.anteproyecto_at : "",
        i === 0 ? p.ceb_info.hoja : "",
        i === 0 ? p.cpi_info.hoja : "",
      ]);
    });

    // Los jurados que sobran cuando hay más jurados que estudiantes: van en
    // renglones propios, igual que en la hoja.
    jurados.slice(p.estudiantes.length).forEach((j) => {
      filas.push([
        "", "", "", "", "", "", "", "", "", "",
        j.nombre,
        j.concepto_info ? j.concepto_info.hoja : "",
        "", "", "",
      ]);
    });
  }

  csv(res, `sami-seguimiento-${req.periodo.codigo}.csv`, filas);
});

/** La hoja "Proyectos Finalizados". */
router.get("/panel/finalizados.csv", (req, res) => {
  const filas = [
    [
      "NOMBRE PROYECTO", "FECHA PUBLICACIÓN", "CÓDIGO", "NOMBRES Y APELLIDOS",
      "DOCUMENTO", "TELÉFONO", "CORREO ELECTRÓNICO", "DIRECTOR", "CODIRECTOR",
    ],
  ];

  for (const p of sami.todos().filter((x) => x.estado === "finalizado")) {
    p.estudiantes.forEach((e, i) => {
      filas.push([
        i === 0 ? p.titulo : "",
        i === 0 ? p.publicacion || "" : "",
        e.codigo_estudiante,
        e.nombre,
        e.documento,
        e.telefono,
        e.email,
        i === 0 ? p.director || "" : "",
        i === 0 ? p.codirector || "" : "",
      ]);
    });
  }

  csv(res, "sami-finalizados.csv", filas);
});

/**
 * La hoja "Seguimiento y Evaluación": una fila por reunión y por estudiante.
 *
 * Lleva además las tres columnas que en el archivo viejo eran fórmulas —#S,
 * ASIST y PROM— ya calculadas. Ese era el trabajo que la hoja no podía hacer
 * sin IMPORTRANGE entre archivos.
 */
router.get("/panel/reuniones.csv", (req, res) => {
  const filas = [
    [
      "SEMANA", "FECHA", "NOMBRE DEL PROYECTO", "ESTUDIANTE", "ADELANTOS REALIZADOS",
      "SE COMPROMETE A ENTREGAR", "ASISTENCIA", "CALIFICACIÓN DEL DOCENTE",
      "DOCENTE A CARGO", "#S", "ASIST", "PROM",
    ],
  ];

  for (const p of sami.todos()) {
    for (const r of sami.reunionesDe(p.id, req.periodo.id)) {
      for (const m of r.marcas) {
        const rend = sami.rendimiento(m.estudiante_id, req.periodo.id);
        filas.push([
          r.semana ? `S${r.semana}` : "",
          r.fecha,
          p.titulo,
          m.nombre,
          r.adelantos || "",
          r.compromisos || "",
          m.asistencia ? m.asistencia.label : "",
          m.calificacion === null ? "" : m.calificacion,
          r.docente || "",
          rend.sesiones,
          rend.asistio,
          rend.promedio === null ? "" : rend.promedio,
        ]);
      }
    }
  }

  csv(res, `sami-reuniones-${req.periodo.codigo}.csv`, filas);
});

module.exports = router;
