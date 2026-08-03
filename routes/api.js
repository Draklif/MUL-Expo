const express = require("express");
const db = require("../db/database");
const { CRITERIOS, CRITERIOS_IND, ESCALA_MAX } = require("../config");

const router = express.Router();

/**
 * Devuelve, para cada proyecto: promedio global, n° de jueces,
 * promedio por criterio. Filtra por materia si viene ?materia_id=
 */
router.get("/ranking", (req, res) => {
  const materiaFilter = req.query.materia_id ? Number(req.query.materia_id) : null;

  const proyectos = materiaFilter
    ? db.prepare(
        `SELECT p.id, p.titulo, p.integrantes, m.nombre AS materia_nombre
         FROM proyectos p JOIN materias m ON m.id = p.materia_id
         WHERE p.periodo_id = ? AND p.materia_id = ?`
      ).all(req.periodo.id, materiaFilter)
    : db.prepare(
        `SELECT p.id, p.titulo, p.integrantes, m.nombre AS materia_nombre
         FROM proyectos p JOIN materias m ON m.id = p.materia_id
         WHERE p.periodo_id = ?`
      ).all(req.periodo.id);

  // Para cada proyecto: agrupamos calificaciones por docente, sacamos
  // el promedio de criterios de cada docente, y luego el promedio entre docentes.
  const califsStmt = db.prepare(
    `SELECT docente_id, criterio, puntaje FROM calificaciones WHERE proyecto_id = ?`
  );

  const resultados = proyectos.map((p) => {
    const califs = califsStmt.all(p.id);

    // Agrupa por docente
    const porDocente = {};
    for (const c of califs) {
      if (!porDocente[c.docente_id]) porDocente[c.docente_id] = {};
      porDocente[c.docente_id][c.criterio] = c.puntaje;
    }

    // Promedio de cada docente sobre criterios que SÍ calificó
    const promediosDocentes = [];
    for (const docId of Object.keys(porDocente)) {
      const valores = Object.values(porDocente[docId]);
      if (!valores.length) continue;
      const avg = valores.reduce((a, b) => a + b, 0) / valores.length;
      promediosDocentes.push(avg);
    }

    const promedio = promediosDocentes.length
      ? promediosDocentes.reduce((a, b) => a + b, 0) / promediosDocentes.length
      : null;

    // Promedio por criterio (entre todos los docentes que lo calificaron)
    const porCriterio = {};
    for (const { key } of CRITERIOS) {
      const vals = califs.filter((c) => c.criterio === key).map((c) => c.puntaje);
      porCriterio[key] = vals.length
        ? vals.reduce((a, b) => a + b, 0) / vals.length
        : null;
    }

    return {
      id: p.id,
      titulo: p.titulo,
      materia: p.materia_nombre,
      integrantes: p.integrantes,
      n_jueces: promediosDocentes.length,
      promedio,
      por_criterio: porCriterio,
    };
  });

  // Ordenar: con nota primero (mayor a menor), luego los no calificados
  resultados.sort((a, b) => {
    if (a.promedio == null && b.promedio == null) return 0;
    if (a.promedio == null) return 1;
    if (b.promedio == null) return -1;
    return b.promedio - a.promedio;
  });

  res.json({ escala_max: ESCALA_MAX, criterios: CRITERIOS, resultados });
});

/**
 * Exporta todos los resultados como CSV.
 * Columnas: Posición, Proyecto, Materia, Integrantes, Promedio General,
 *           un promedio por cada criterio, N° Jueces.
 */
router.get("/export.csv", (req, res) => {
  const proyectos = db
    .prepare(
      `SELECT p.id, p.titulo, p.integrantes, m.nombre AS materia_nombre
       FROM proyectos p JOIN materias m ON m.id = p.materia_id
       WHERE p.periodo_id = ?`
    )
    .all(req.periodo.id);

  const califsStmt = db.prepare(
    `SELECT docente_id, criterio, puntaje FROM calificaciones WHERE proyecto_id = ?`
  );

  const resultados = proyectos.map((p) => {
    const califs = califsStmt.all(p.id);

    const porDocente = {};
    for (const c of califs) {
      if (!porDocente[c.docente_id]) porDocente[c.docente_id] = {};
      porDocente[c.docente_id][c.criterio] = c.puntaje;
    }

    const promediosDocentes = [];
    for (const docId of Object.keys(porDocente)) {
      const valores = Object.values(porDocente[docId]);
      if (!valores.length) continue;
      promediosDocentes.push(valores.reduce((a, b) => a + b, 0) / valores.length);
    }

    const promedio = promediosDocentes.length
      ? promediosDocentes.reduce((a, b) => a + b, 0) / promediosDocentes.length
      : null;

    const porCriterio = {};
    for (const { key } of CRITERIOS) {
      const vals = califs.filter((c) => c.criterio === key).map((c) => c.puntaje);
      porCriterio[key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    }

    return { ...p, promedio, porCriterio, n_jueces: promediosDocentes.length };
  });

  // Ordenar igual que el ranking
  resultados.sort((a, b) => {
    if (a.promedio == null && b.promedio == null) return 0;
    if (a.promedio == null) return 1;
    if (b.promedio == null) return -1;
    return b.promedio - a.promedio;
  });

  // ── Calificaciones individuales ──────────────────────────────────
  const califsIndStmt = db.prepare(
    `SELECT integrante, criterio, puntaje FROM calificaciones_ind WHERE proyecto_id = ?`
  );

  // Función para escapar celdas CSV
  const esc = (v) => {
    if (v == null) return "";
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  // ── Sección 1: Proyectos ─────────────────────────────────────────
  const headersP = [
    "Posición", "Proyecto", "Materia", "Integrantes",
    "Promedio General",
    ...CRITERIOS.map((c) => c.label),
    "N° Jueces",
  ];

  const rowsP = resultados.map((r, i) => [
    i + 1,
    r.titulo,
    r.materia_nombre,
    (r.integrantes || "").replace(/\n/g, " / "),
    r.promedio != null ? r.promedio.toFixed(2) : "",
    ...CRITERIOS.map((c) =>
      r.porCriterio[c.key] != null ? r.porCriterio[c.key].toFixed(2) : ""
    ),
    r.n_jueces,
  ]);

  // ── Sección 2: Integrantes ───────────────────────────────────────
  const headersI = [
    "Proyecto", "Materia", "Integrante",
    "Promedio Individual",
    ...CRITERIOS_IND.map((c) => c.label),
    "N° Jueces",
  ];

  const rowsI = [];
  for (const r of resultados) {
    const califsInd = califsIndStmt.all(r.id);

    // Agrupar por integrante → criterio → [puntajes]
    const porIntegrante = {};
    for (const c of califsInd) {
      if (!porIntegrante[c.integrante]) porIntegrante[c.integrante] = {};
      if (!porIntegrante[c.integrante][c.criterio]) porIntegrante[c.integrante][c.criterio] = [];
      porIntegrante[c.integrante][c.criterio].push(c.puntaje);
    }

    // Extraer la lista ordenada de integrantes del proyecto
    const nombresOrdenados = (r.integrantes || "")
      .split("\n").map((s) => s.trim()).filter(Boolean);

    for (const nombre of nombresOrdenados) {
      const datos = porIntegrante[nombre] || {};
      const promediosCrit = CRITERIOS_IND.map(({ key }) => {
        const vals = datos[key] || [];
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      });
      const nJueces = Math.max(
        ...CRITERIOS_IND.map(({ key }) => (datos[key] || []).length), 0
      );
      const promInd = promediosCrit.filter((v) => v != null);
      const promedioInd = promInd.length
        ? promInd.reduce((a, b) => a + b, 0) / promInd.length
        : null;

      rowsI.push([
        r.titulo,
        r.materia_nombre,
        nombre,
        promedioInd != null ? promedioInd.toFixed(2) : "",
        ...promediosCrit.map((v) => (v != null ? v.toFixed(2) : "")),
        nJueces,
      ]);
    }
  }

  const toCSV = (headers, rows) =>
    [headers, ...rows].map((row) => row.map(esc).join(",")).join("\r\n");

  const csv =
    "PROYECTOS\r\n" +
    toCSV(headersP, rowsP) +
    "\r\n\r\nINTEGRANTES\r\n" +
    toCSV(headersI, rowsI);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="expo-resultados-${req.periodo.codigo}.csv"`
  );
  res.send("﻿" + csv); // BOM para Excel
});

module.exports = router;
