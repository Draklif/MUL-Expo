// =====================================================================
//  Virtual Champions — el panel de la organización.
//
//  Aquí se crean los torneos, se revisan las inscripciones, se arman los
//  equipos con quienes se apuntaron solos, se genera el bracket y se lleva
//  el marcador en vivo.
//
//  Va con su propia contraseña y su propia sesión (lib/vc-auth.js): son los
//  mismos docentes que los de la Expo, pero son dos herramientas distintas.
// =====================================================================
const express = require("express");
const db = require("../db/database");
const vc = require("../lib/vc");
const bracket = require("../lib/vc-bracket");
const envios = require("../lib/envios");
const periodos = require("../lib/periodos");
const eventos = require("../lib/eventos");
const { VC } = require("../config");
const { limpiarNombre } = require("../lib/listas");
const { requireVC, verificar, configurado } = require("../lib/vc-auth");
const premios = require("../lib/premios");
const certificados = require("../lib/certificados");

const router = express.Router();

const EVENTO = "virtual-champions";

// Marco común de las pantallas del panel.
function marco(extra = {}) {
  return {
    css: "/vc.css",
    themeColor: "#0e0f13",
    juegos: vc.JUEGOS,
    formatos: VC.formatos,
    momentoDe: vc.momento,
    title: "Panel · Virtual Champions",
    ...extra,
  };
}

// ---------------------------------------------------------------------
//  Acceso
// ---------------------------------------------------------------------
router.get("/acceso", (req, res) => {
  if (req.session.docenteVC) return res.redirect("/vc/panel");
  res.render("vc/acceso", marco({ title: "Acceso · Virtual Champions", error: null, email: "", configurado: configurado() }));
});

router.post("/acceso", (req, res) => {
  const { docente, error, status } = verificar({
    email: req.body.email,
    password: req.body.password,
    ip: req.ip,
  });

  if (error) {
    return res.status(status).render(
      "vc/acceso",
      marco({
        title: "Acceso · Virtual Champions",
        error,
        email: String(req.body.email || ""),
        configurado: configurado(),
      })
    );
  }

  req.session.docenteVC = docente;
  res.redirect("/vc/panel");
});

// Al salir se vuelve al sitio público del torneo, no a la raíz: la raíz puede
// estar mostrando otro evento.
router.post("/salir", (req, res) => {
  delete req.session.docenteVC;
  res.redirect("/virtual-champions");
});

// El guardia se cuelga de /panel y no del router entero a propósito: este
// router se monta en /vc, que es también donde vive el sitio público del
// torneo. Un `router.use(requireVC)` a secas mandaría al login a cualquiera
// que escribiera mal una dirección pública.
router.use("/panel", requireVC, (req, res, next) => {
  res.locals.periodoVC = periodos.activo();
  next();
});

// ---------------------------------------------------------------------
//  Torneos
//
//  Aquí no se crea ninguno: el torneo de cada juego para el semestre en curso
//  se abre solo al arrancar, según config.PERIODO y config.VC.juegos. El panel
//  los muestra y los opera, y los de semestres pasados quedan abajo, de
//  consulta.
// ---------------------------------------------------------------------
router.get("/panel", (req, res) => {
  const torneos = db
    .prepare(
      `SELECT t.*, p.codigo AS periodo, p.activo AS periodo_activo,
              (SELECT COUNT(*) FROM vc_equipos e
                WHERE e.torneo_id = t.id AND e.estado = 'aprobado')  AS n_equipos,
              (SELECT COUNT(*) FROM vc_equipos e
                WHERE e.torneo_id = t.id AND e.estado = 'pendiente') AS n_pendientes,
              (SELECT COUNT(*) FROM vc_jugadores j
                WHERE j.torneo_id = t.id AND j.equipo_id IS NULL)    AS n_libres,
              (SELECT COUNT(*) FROM vc_partidas m
                WHERE m.torneo_id = t.id AND m.estado = 'en_vivo')   AS n_vivo
         FROM vc_torneos t
         LEFT JOIN periodos p ON p.id = t.periodo_id
        ORDER BY t.created_at DESC`
    )
    .all()
    .map((t) => ({ ...t, juego_info: vc.juego(t.juego) }));

  res.render(
    "vc/panel",
    marco({
      // Los del semestre en curso arriba y separados: son los únicos en los
      // que va a pasar algo esta temporada.
      torneos: torneos.filter((t) => t.periodo_activo),
      pasados: torneos.filter((t) => !t.periodo_activo),
      // Si el sitio del torneo está recibiendo equipos ahora mismo, para poder
      // decirlo en el panel en vez de que alguien lo adivine.
      abierta: eventos.inscripcionesAbiertas("virtual-champions"),
      aviso: req.query,
    })
  );
});

// Estado del torneo e interruptor de inscripciones.
router.post("/panel/torneos/:id/estado", (req, res) => {
  const id = Number(req.params.id);
  const estados = ["inscripcion", "en_curso", "finalizado"];
  const estado = estados.includes(req.body.estado) ? req.body.estado : null;
  const abierta = req.body.inscripcion_abierta === "1" ? 1 : 0;

  db.prepare(
    "UPDATE vc_torneos SET estado = COALESCE(?, estado), inscripcion_abierta = ? WHERE id = ?"
  ).run(estado, abierta, id);

  res.redirect(`/vc/panel/torneos/${id}?ok=1`);
});

// Un torneo con equipos inscritos no se borra de un clic: eso es el trabajo de
// un semestre entero y no hay forma de deshacerlo. Es el mismo freno que tiene
// la jam al borrar una edición.
router.post("/panel/torneos/:id/borrar", (req, res) => {
  const torneo = vc.torneo(req.params.id);
  if (!torneo) return res.redirect("/vc/panel");

  if (vc.contarEquipos(torneo.id) > 0) {
    return res.redirect(`/vc/panel/torneos/${torneo.id}?error=con_equipos`);
  }

  db.prepare("DELETE FROM vc_torneos WHERE id = ?").run(torneo.id);
  res.redirect("/vc/panel?borrado=1");
});

// ---------------------------------------------------------------------
//  Un torneo: inscripciones, equipos y quienes esperan equipo
// ---------------------------------------------------------------------
router.get("/panel/torneos/:id", (req, res) => {
  const torneo = vc.torneo(req.params.id);
  if (!torneo) return res.redirect("/vc/panel");

  const juego = vc.juego(torneo.juego);
  const todos = vc.equiposDe(torneo.id, null).map((e) => ({
    ...e,
    estado_info: vc.ESTADOS_EQUIPO[e.estado] || vc.ESTADOS_EQUIPO.pendiente,
  }));

  res.render(
    "vc/torneo",
    marco({
      title: `${torneo.nombre} · Panel`,
      themeColor: juego ? juego.acento : "#0e0f13",
      torneo,
      juego,
      pendientes: todos.filter((e) => e.estado === "pendiente"),
      aprobados: todos.filter((e) => e.estado === "aprobado"),
      rechazados: todos.filter((e) => e.estado === "rechazado"),
      libres: vc.agentesLibres(torneo.id),
      bracket: vc.bracketDe(torneo.id),
      sePuedeRegenerar: bracket.sePuedeRegenerar(torneo.id),
      premios: premios.paraElPanel(EVENTO, torneo.id),
      certificados: certificados.deLote(EVENTO, torneo.id),
      correoActivo: envios.activo(),
    })
  );
});

// Aprobar o rechazar un equipo.
router.post("/panel/equipos/:id/revisar", (req, res) => {
  const equipo = vc.equipo(req.params.id);
  if (!equipo) return res.redirect("/vc/panel");

  const estado = req.body.estado === "aprobado" ? "aprobado" : "rechazado";
  const nota = String(req.body.nota_docente || "").trim().slice(0, 400) || null;

  db.prepare(
    `UPDATE vc_equipos
        SET estado = ?, nota_docente = ?, revisado_por = ?, revisado_at = CURRENT_TIMESTAMP
      WHERE id = ?`
  ).run(estado, nota, req.session.docenteVC.id, equipo.id);

  const torneo = vc.torneo(equipo.torneo_id);
  const juego = torneo ? vc.juego(torneo.juego) : null;

  envios.vcAvisoRevision(
    {
      codigo: equipo.codigo,
      nombre: equipo.contacto_nombre,
      email: equipo.contacto_email,
      equipo: equipo.nombre,
      juego: juego ? juego.nombre : "Virtual Champions",
      estado,
      nota_docente: nota,
    },
    envios.urlBase(req)
  );

  res.redirect(`/vc/panel/torneos/${equipo.torneo_id}?revisado=1#inscripciones`);
});

// Armar un equipo con los que se inscribieron solos.
router.post("/panel/torneos/:id/armar", (req, res) => {
  const torneo = vc.torneo(req.params.id);
  if (!torneo) return res.redirect("/vc/panel");

  const juego = vc.juego(torneo.juego);
  const ids = [].concat(req.body.jugador || []).map(Number).filter(Boolean);
  const nombre = limpiarNombre(req.body.nombre).slice(0, 40);
  const tag = String(req.body.tag || "").trim().toUpperCase().slice(0, 5);

  if (!nombre || ids.length < 2) {
    return res.redirect(`/vc/panel/torneos/${torneo.id}?error=armar#libres`);
  }

  // Solo se pueden usar los que siguen libres en ESTE torneo: si alguien ya
  // fue asignado desde otra pestaña, se queda donde está.
  const libres = vc.agentesLibres(torneo.id).filter((j) => ids.includes(j.id));
  if (libres.length < 2) {
    return res.redirect(`/vc/panel/torneos/${torneo.id}?error=armar#libres`);
  }

  const codigo = vc.codigoLibre();
  let equipoId;

  db.exec("BEGIN");
  try {
    const info = db
      .prepare(
        `INSERT INTO vc_equipos
           (torneo_id, codigo, nombre, tag, estado, armado, contacto_nombre, contacto_email,
            revisado_por, revisado_at)
         VALUES (?, ?, ?, ?, 'aprobado', 1, ?, ?, ?, CURRENT_TIMESTAMP)`
      )
      .run(
        torneo.id,
        codigo,
        nombre,
        tag || null,
        libres[0].nombre,
        libres[0].email,
        req.session.docenteVC.id
      );
    equipoId = info.lastInsertRowid;

    // El primero de la lista queda de capitán. El código individual NO se
    // borra: es el que esa persona anotó al inscribirse y el único que
    // conoce, así que tiene que seguir sirviéndole para consultar —ahora
    // muestra el equipo que le tocó—.
    const asignar = db.prepare(
      "UPDATE vc_jugadores SET equipo_id = ?, capitan = ?, suplente = ?, orden = ? WHERE id = ?"
    );
    libres.forEach((j, i) => {
      asignar.run(equipoId, i === 0 ? 1 : 0, juego && i >= juego.titulares ? 1 : 0, i, j.id);
    });

    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  // Cada uno se entera de con quién le tocó.
  const base = envios.urlBase(req);
  for (const j of libres) {
    envios.vcAvisoAsignado(
      {
        nombre: j.nombre,
        email: j.email,
        equipo: nombre,
        juego: juego ? juego.nombre : "Virtual Champions",
        companeros: libres.filter((o) => o.id !== j.id).map((o) => o.nombre),
        equipoId,
      },
      base
    );
  }

  res.redirect(`/vc/panel/torneos/${torneo.id}?armado=${libres.length}#equipos`);
});

router.post("/panel/equipos/:id/borrar", (req, res) => {
  const equipo = vc.equipo(req.params.id);
  if (!equipo) return res.redirect("/vc/panel");
  // Los jugadores no se borran con el equipo: vuelven a la bolsa de libres
  // (equipo_id queda en NULL por el ON DELETE SET NULL) y se les puede
  // reasignar sin pedirles que se inscriban otra vez.
  db.prepare("DELETE FROM vc_equipos WHERE id = ?").run(equipo.id);
  res.redirect(`/vc/panel/torneos/${equipo.torneo_id}?borrado=1#equipos`);
});

// ---------------------------------------------------------------------
//  Bracket
// ---------------------------------------------------------------------
router.post("/panel/torneos/:id/bracket", (req, res) => {
  const torneo = vc.torneo(req.params.id);
  if (!torneo) return res.redirect("/vc/panel");

  if (!bracket.sePuedeRegenerar(torneo.id)) {
    return res.redirect(`/vc/panel/torneos/${torneo.id}?error=jugadas#bracket`);
  }

  const equipos = vc.equiposDe(torneo.id, "aprobado");
  if (equipos.length < 2) {
    return res.redirect(`/vc/panel/torneos/${torneo.id}?error=pocos#bracket`);
  }

  try {
    bracket.generar(torneo.id, equipos, {
      formato: Number(req.body.formato) || VC.formato_ronda,
      formatoFinal: Number(req.body.formato_final) || VC.formato_final,
      finalPresencial: req.body.final_presencial === "1",
    });
  } catch (e) {
    console.error(`  ! No se pudo armar el bracket: ${e.message}`);
    return res.redirect(`/vc/panel/torneos/${torneo.id}?error=bracket#bracket`);
  }

  // Con bracket armado el torneo ya está andando.
  db.prepare("UPDATE vc_torneos SET estado = 'en_curso', inscripcion_abierta = 0 WHERE id = ?").run(
    torneo.id
  );

  res.redirect(`/vc/panel/torneos/${torneo.id}?bracket=1#bracket`);
});

// Formato y sede de una ronda entera.
router.post("/panel/rondas/:id", (req, res) => {
  const ronda = db.prepare("SELECT * FROM vc_rondas WHERE id = ?").get(Number(req.params.id));
  if (!ronda) return res.redirect("/vc/panel");

  const formato = VC.formatos.includes(Number(req.body.formato))
    ? Number(req.body.formato)
    : ronda.formato;

  db.prepare("UPDATE vc_rondas SET formato = ?, presencial = ? WHERE id = ?").run(
    formato,
    req.body.presencial === "1" ? 1 : 0,
    ronda.id
  );

  // El formato cambia cuántos mapas hay que ganar, así que las partidas de la
  // ronda que no tengan formato propio pueden quedar cerradas o abiertas de
  // otra forma. Se vuelven a contar todas.
  for (const p of db
    .prepare("SELECT id FROM vc_partidas WHERE ronda_id = ?")
    .all(ronda.id)) {
    vc.recalcular(p.id);
  }

  res.redirect(`/vc/panel/torneos/${ronda.torneo_id}?ok=1#bracket`);
});

// ---------------------------------------------------------------------
//  Una partida: datos y consola en vivo
// ---------------------------------------------------------------------
router.get("/panel/partidas/:id", (req, res) => {
  const partida = vc.partidaConTodo(req.params.id);
  if (!partida) return res.redirect("/vc/panel");

  const torneo = vc.torneo(partida.torneo_id);
  const juego = vc.juego(partida.juego);

  res.render(
    "vc/partida-admin",
    marco({
      title: `${partida.equipo_a} vs ${partida.equipo_b} · Panel`,
      themeColor: juego ? juego.acento : "#0e0f13",
      partida,
      torneo,
      juego,
      equipos: vc.equiposDe(partida.torneo_id, "aprobado"),
    })
  );
});

// Datos de la partida (día, hora, sede, transmisión, formato, rivales).
router.post("/panel/partidas/:id", (req, res) => {
  const partida = vc.partida(req.params.id);
  if (!partida) return res.redirect("/vc/panel");

  const num = (v) => (Number(v) ? Number(v) : null);
  const texto = (v, max) => {
    const s = String(v || "").trim().slice(0, max);
    return s || null;
  };

  // El formato en blanco significa "el de la ronda", que es lo normal: solo
  // se guarda uno propio si de verdad esta partida se sale de la regla.
  const formato = VC.formatos.includes(Number(req.body.formato)) ? Number(req.body.formato) : null;

  db.prepare(
    `UPDATE vc_partidas
        SET equipo_a_id = ?, equipo_b_id = ?, formato = ?, inicio = ?,
            lugar = ?, stream_url = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`
  ).run(
    num(req.body.equipo_a_id),
    num(req.body.equipo_b_id),
    formato,
    // El input datetime-local manda "2026-11-20T19:30"; se guarda con espacio
    // para que ordene bien como texto y se lea igual.
    texto(String(req.body.inicio || "").replace("T", " "), 16),
    texto(req.body.lugar, 80),
    texto(req.body.stream_url, 300),
    partida.id
  );

  vc.recalcular(partida.id);
  res.redirect(`/vc/panel/partidas/${partida.id}?ok=1`);
});

// El interruptor de "en vivo". Cerrar una partida no se hace desde aquí: eso
// lo decide el marcador de los mapas.
router.post("/panel/partidas/:id/estado", (req, res) => {
  const partida = vc.partida(req.params.id);
  if (!partida) return res.redirect("/vc/panel");

  const estados = ["programada", "en_vivo", "aplazada"];
  const estado = estados.includes(req.body.estado) ? req.body.estado : "programada";

  db.prepare("UPDATE vc_partidas SET estado = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
    estado,
    partida.id
  );

  // Por si venía cerrada: si el marcador ya alcanza, recalcular la vuelve a
  // cerrar y no deja una partida terminada anunciándose como en vivo.
  vc.recalcular(partida.id);
  res.redirect(`/vc/panel/partidas/${partida.id}?ok=1`);
});

// Agregar un mapa a la serie.
router.post("/panel/partidas/:id/mapas", (req, res) => {
  const partida = vc.partida(req.params.id);
  if (!partida) return res.redirect("/vc/panel");

  const yaHay = vc.mapasDe(partida.id).length;
  // Más mapas que el formato no tienen sentido: un BO3 son tres, no cinco.
  if (yaHay >= partida.formato_real) {
    return res.redirect(`/vc/panel/partidas/${partida.id}?error=mapas`);
  }

  db.prepare(
    "INSERT INTO vc_mapas (partida_id, orden, mapa, estado) VALUES (?, ?, ?, 'en_vivo')"
  ).run(partida.id, yaHay, String(req.body.mapa || "").trim().slice(0, 60) || null);

  res.redirect(`/vc/panel/partidas/${partida.id}?ok=1#mapas`);
});

// Marcador de un mapa. Es el botón que más se usa durante una partida.
router.post("/panel/mapas/:id", (req, res) => {
  const mapa = db.prepare("SELECT * FROM vc_mapas WHERE id = ?").get(Number(req.params.id));
  if (!mapa) return res.redirect("/vc/panel");

  const puntos = (v) => Math.max(0, Math.min(99, Number(v) || 0));
  const puntosA = puntos(req.body.puntos_a);
  const puntosB = puntos(req.body.puntos_b);

  // "Cerrar" el mapa es lo que lo hace contar para la serie. El ganador sale
  // del marcador, salvo empate, donde hay que decirlo a mano (en LoL no hay
  // empates, pero un mapa de Valorant sí puede llegar 12-12 y decidirse en
  // muerte súbita con el mismo número en pantalla).
  const cerrar = req.body.accion === "cerrar";
  let ganador = null;
  if (cerrar) {
    if (req.body.ganador === "a" || req.body.ganador === "b") ganador = req.body.ganador;
    else if (puntosA > puntosB) ganador = "a";
    else if (puntosB > puntosA) ganador = "b";
  }

  db.prepare("UPDATE vc_mapas SET puntos_a = ?, puntos_b = ?, ganador = ?, estado = ? WHERE id = ?").run(
    puntosA,
    puntosB,
    ganador,
    cerrar && ganador ? "jugado" : "en_vivo",
    mapa.id
  );

  vc.recalcular(mapa.partida_id);
  res.redirect(`/vc/panel/partidas/${mapa.partida_id}?ok=1#mapas`);
});

router.post("/panel/mapas/:id/borrar", (req, res) => {
  const mapa = db.prepare("SELECT * FROM vc_mapas WHERE id = ?").get(Number(req.params.id));
  if (!mapa) return res.redirect("/vc/panel");

  db.prepare("DELETE FROM vc_mapas WHERE id = ?").run(mapa.id);
  // Al quitar un mapa el marcador cambia, y con él puede cambiar el ganador:
  // recalcular reabre la partida y baja al que había subido si hace falta.
  vc.recalcular(mapa.partida_id);
  res.redirect(`/vc/panel/partidas/${mapa.partida_id}?ok=1#mapas`);
});

// ---------------------------------------------------------------------
//  Premios y certificados
// ---------------------------------------------------------------------

// Quién se lleva cada categoría. El bracket dice quién ganó la final, pero el
// premio lo declara alguien: la final es presencial y un mapa corregido puede
// cambiar el ganador después de que ya se entregó el trofeo.
router.post("/panel/torneos/:id/premios", (req, res) => {
  const torneo = vc.torneo(req.params.id);
  if (!torneo) return res.redirect("/vc/panel");

  for (const categoria of premios.catalogo(EVENTO)) {
    if (!(categoria.id in req.body)) continue;
    premios.asignar(EVENTO, torneo.id, categoria.id, req.body[categoria.id], req.session.docenteVC.id);
  }

  res.redirect(`/vc/panel/torneos/${torneo.id}?premios=1#certificados`);
});

// Emitir. Uno por jugador de los equipos aprobados, suplentes incluidos: la
// banca también estuvo en el torneo.
router.post("/panel/torneos/:id/certificados", (req, res) => {
  const torneo = vc.torneo(req.params.id);
  if (!torneo) return res.redirect("/vc/panel");

  const r = certificados.emitirDeTorneo(
    torneo.id,
    torneo.periodo_id || periodos.activo().id,
    req.session.docenteVC.name
  );

  res.redirect(
    `/vc/panel/torneos/${torneo.id}?emitidos=${r.emitidos}&actualizados=${r.actualizados}#certificados`
  );
});

// Avisar es un paso aparte de emitir: emitir se repite sin consecuencias, un
// correo no se devuelve.
router.post("/panel/torneos/:id/certificados/avisos", async (req, res) => {
  const torneo = vc.torneo(req.params.id);
  if (!torneo) return res.redirect("/vc/panel");

  let r = { enviados: 0, fallaron: 0 };
  try {
    r = await certificados.avisarPendientes(EVENTO, torneo.id, envios.urlBase(req));
  } catch (e) {
    console.error(`  ! Avisos de certificados del torneo ${torneo.id}: ${e.message}`);
  }

  res.redirect(
    `/vc/panel/torneos/${torneo.id}?avisados=${r.enviados}&fallaron=${r.fallaron}#certificados`
  );
});

module.exports = router;
