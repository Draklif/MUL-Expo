// =====================================================================
//  Multimedia Music Fest — el panel de la organización.
//
//  La edición del semestre NO se abre desde aquí: ya está abierta y vacía
//  desde que arrancó el servidor, según config.PERIODO. Lo que queda son tres
//  herramientas:
//
//    1. Poner el día y el lugar, y abrir o cerrar las inscripciones.
//    2. Armar el cartel: confirmar o rechazar grupos, y ordenarlos. El orden
//       es el del afiche —el que cierra la tarde va de primero y más grande—,
//       no la hora: las horas se escriben en el itinerario de
//       data/music-fest.json, igual que en la Expo.
//    3. Armar el equipo de producción: confirmar o rechazar, mirando que no
//       queden tres personas en visuales y ninguna en sonido.
//
//  Va con su propia contraseña y su propia sesión (lib/music-auth.js): son los
//  mismos docentes del resto del sitio, pero son cinco herramientas.
// =====================================================================
const express = require("express");
const db = require("../db/database");
const music = require("../lib/music");
const envios = require("../lib/envios");
const periodos = require("../lib/periodos");
const { requireMusic, verificar, configurado } = require("../lib/music-auth");

const router = express.Router();

function marco(extra = {}) {
  return {
    css: "/music.css",
    themeColor: "#0a0710",
    areas: music.AREAS,
    title: "Panel · Music Fest",
    ...extra,
  };
}

// ---------------------------------------------------------------------
//  Acceso
// ---------------------------------------------------------------------
router.get("/acceso", (req, res) => {
  if (req.session.docenteMusic) return res.redirect("/music/panel");
  res.render(
    "music/acceso",
    marco({ title: "Acceso · Music Fest", error: null, email: "", configurado: configurado() })
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
      "music/acceso",
      marco({
        title: "Acceso · Music Fest",
        error,
        email: String(req.body.email || ""),
        configurado: configurado(),
      })
    );
  }

  req.session.docenteMusic = docente;
  res.redirect("/music/panel");
});

// Al salir se vuelve al sitio público del festival, no a la raíz: la raíz
// puede estar mostrando otro evento.
router.post("/salir", (req, res) => {
  delete req.session.docenteMusic;
  res.redirect("/music-fest");
});

// El guardia se cuelga de /panel y no del router entero a propósito: este
// router se monta en /music, que es también donde viven las páginas públicas
// del festival. Un `router.use(requireMusic)` a secas mandaría al login a
// cualquiera que escribiera mal una dirección pública.
router.use("/panel", requireMusic, (req, res, next) => {
  res.locals.periodoMusic = periodos.activo();
  next();
});

// ---------------------------------------------------------------------
//  El panel
// ---------------------------------------------------------------------
router.get("/panel", (req, res) => {
  const edicion = music.edicionVigente();

  if (!edicion) {
    return res.render(
      "music/panel",
      marco({ edicion: null, aviso: req.query, correoActivo: envios.activo() })
    );
  }

  const actos = music.actos(edicion.id, null);
  const gente = music.produccion(edicion.id, null);

  res.render(
    "music/panel",
    marco({
      edicion,
      // Los pendientes primero, en las dos listas: es lo único que pide una
      // decisión, y una lista ordenada por fecha los deja repartidos entre los
      // que ya no necesitan nada.
      pendientes: actos.filter((a) => a.estado === "pendiente"),
      confirmados: actos.filter((a) => a.estado === "confirmado"),
      rechazados: actos.filter((a) => a.estado === "rechazado"),
      prodPendientes: gente.filter((p) => p.estado === "pendiente"),
      prodConfirmados: gente.filter((p) => p.estado === "confirmado"),
      prodRechazados: gente.filter((p) => p.estado === "rechazado"),
      porArea: music.porArea(edicion.id),
      cifras: music.resumen(edicion.id),
      correoActivo: envios.activo(),
      aviso: req.query,
    })
  );
});

// ---------------------------------------------------------------------
//  La edición: cuándo, dónde y si recibe
// ---------------------------------------------------------------------
router.post("/panel/edicion", (req, res) => {
  const edicion = music.edicionVigente();
  if (!edicion) return res.redirect("/music/panel");

  const estado = ["inscripcion", "cartel", "finalizada"].includes(req.body.estado)
    ? req.body.estado
    : edicion.estado;

  db.prepare(
    `UPDATE music_ediciones
        SET fecha = ?, lugar = ?, inscripcion_abierta = ?, estado = ?
      WHERE id = ?`
  ).run(
    String(req.body.fecha || "").trim().slice(0, 60) || null,
    String(req.body.lugar || "").trim().slice(0, 120) || null,
    req.body.inscripcion_abierta ? 1 : 0,
    estado,
    edicion.id
  );

  res.redirect("/music/panel?ok=1#edicion");
});

// ---------------------------------------------------------------------
//  El cartel
// ---------------------------------------------------------------------
/**
 * Confirmar o rechazar un grupo. El correo sale aquí y una sola vez: avisado_at
 * es lo que impide que cambiar de opinión dos veces le llene la bandeja a
 * nadie —se avisa del primer veredicto, y de un cambio posterior se habla—.
 */
router.post("/panel/actos/:id/revisar", (req, res) => {
  const acto = music.acto(req.params.id);
  if (!acto) return res.redirect("/music/panel");

  const estado = req.body.estado === "confirmado" ? "confirmado" : "rechazado";
  const nota = String(req.body.nota_docente || "").trim().slice(0, 400) || null;

  db.prepare(
    `UPDATE music_actos
        SET estado = ?, nota_docente = ?, revisado_por = ?, revisado_at = CURRENT_TIMESTAMP
      WHERE id = ?`
  ).run(estado, nota, req.session.docenteMusic.id, acto.id);

  if (!acto.avisado_at) {
    envios.musicAvisoRevision(
      {
        codigo: acto.codigo,
        nombre: acto.contacto_nombre,
        email: acto.contacto_email,
        titulo: acto.nombre,
        que: "acto",
        estado,
        nota_docente: nota,
      },
      envios.urlBase(req)
    );
    db.prepare("UPDATE music_actos SET avisado_at = CURRENT_TIMESTAMP WHERE id = ?").run(acto.id);
  }

  res.redirect("/music/panel?revisado=1#cartel");
});

/**
 * Mover un grupo en el cartel. Sube y baja de a uno intercambiando el orden
 * con el vecino: es la única forma de ordenar una lista corta sin arrastrar
 * nada con el dedo, que en un celular no funciona.
 */
router.post("/panel/actos/:id/mover", (req, res) => {
  const acto = music.acto(req.params.id);
  if (!acto) return res.redirect("/music/panel");

  const lista = music.actos(acto.edicion_id, "confirmado");
  const i = lista.findIndex((a) => a.id === acto.id);
  const j = req.body.dir === "sube" ? i - 1 : i + 1;

  if (i >= 0 && j >= 0 && j < lista.length) {
    // El orden se reescribe entero y no se intercambian dos números: las filas
    // nuevas entran todas con orden 0, así que sin esto los primeros
    // movimientos no harían nada visible.
    const nuevo = [...lista];
    [nuevo[i], nuevo[j]] = [nuevo[j], nuevo[i]];
    const guardar = db.prepare("UPDATE music_actos SET orden = ? WHERE id = ?");
    nuevo.forEach((a, k) => guardar.run(k + 1, a.id));
  }

  res.redirect("/music/panel#cartel");
});

router.post("/panel/actos/:id/borrar", (req, res) => {
  const acto = music.acto(req.params.id);
  if (!acto) return res.redirect("/music/panel");

  db.prepare("DELETE FROM music_actos WHERE id = ?").run(acto.id);
  res.redirect("/music/panel?borrado=1#cartel");
});

// ---------------------------------------------------------------------
//  El equipo de producción
// ---------------------------------------------------------------------
router.post("/panel/produccion/:id/revisar", (req, res) => {
  const persona = music.persona(req.params.id);
  if (!persona) return res.redirect("/music/panel");

  const estado = req.body.estado === "confirmado" ? "confirmado" : "rechazado";
  const nota = String(req.body.nota_docente || "").trim().slice(0, 400) || null;

  db.prepare(
    `UPDATE music_produccion
        SET estado = ?, nota_docente = ?, revisado_por = ?, revisado_at = CURRENT_TIMESTAMP
      WHERE id = ?`
  ).run(estado, nota, req.session.docenteMusic.id, persona.id);

  if (!persona.avisado_at) {
    envios.musicAvisoRevision(
      {
        codigo: persona.codigo,
        nombre: persona.nombre,
        email: persona.email,
        titulo: (persona.area_info || {}).nombre || "Equipo de producción",
        que: "produccion",
        estado,
        nota_docente: nota,
      },
      envios.urlBase(req)
    );
    db.prepare("UPDATE music_produccion SET avisado_at = CURRENT_TIMESTAMP WHERE id = ?").run(
      persona.id
    );
  }

  res.redirect("/music/panel?revisado=1#equipo");
});

router.post("/panel/produccion/:id/borrar", (req, res) => {
  const persona = music.persona(req.params.id);
  if (!persona) return res.redirect("/music/panel");

  db.prepare("DELETE FROM music_produccion WHERE id = ?").run(persona.id);
  res.redirect("/music/panel?borrado=1#equipo");
});

// ---------------------------------------------------------------------
//  La lista, para imprimir
// ---------------------------------------------------------------------
/**
 * Todo el festival en un CSV: el cartel arriba y el equipo abajo, con los
 * teléfonos. Es lo que se lleva impreso el día del evento, cuando el wifi de
 * la plazoleta no sirve y hay que llamar al grupo que no ha llegado.
 */
router.get("/panel/lista.csv", (req, res) => {
  const edicion = music.edicionVigente();
  if (!edicion) return res.redirect("/music/panel");

  // Punto y coma y BOM: es lo que hace que Excel en español abra el archivo en
  // columnas en vez de meter todo en la primera.
  const escapar = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

  const filas = [
    ["CARTEL"],
    ["Orden", "Grupo", "Tipo", "Género", "En tarima", "Estado", "Contacto", "Correo", "Teléfono", "Necesidades"],
    ...music.actos(edicion.id, null).map((a, i) => [
      a.estado === "confirmado" ? i + 1 : "",
      a.nombre,
      a.tipo,
      a.genero,
      a.integrantes,
      a.estado_info.label,
      a.contacto_nombre,
      a.contacto_email,
      a.telefono,
      a.necesidades,
    ]),
    [],
    ["EQUIPO DE PRODUCCIÓN"],
    ["Nombre", "Área", "Semestre", "Estado", "Correo", "Teléfono"],
    ...music.produccion(edicion.id, null).map((p) => [
      p.nombre,
      (p.area_info || {}).nombre || p.area,
      p.semestre,
      p.estado_info.label,
      p.email,
      p.telefono,
    ]),
  ];

  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", 'attachment; filename="music-fest.csv"');
  res.send("﻿" + filas.map((f) => f.map(escapar).join(";")).join("\r\n"));
});

module.exports = router;
