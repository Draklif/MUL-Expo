// =====================================================================
//  EL ÍNDICE DEL PROGRAMA — /info
//
//  Una sola página, y es la única del sitio que no es de un evento: es de
//  Ingeniería en Multimedia. Cuenta qué hace el programa fuera del salón —la
//  Expo, el torneo, la jam, el festival y las salidas pedagógicas—, qué se
//  hizo la última vez y qué viene.
//
//  Vive en dos sitios según el semestre y por eso está en su propio router:
//
//    · con un evento activo, /info es una página más y se llega a ella por el
//      pie de cualquier página pública. Discreta a propósito: quien entró al
//      sitio del festival vino al festival;
//    · sin ningún evento activo, la raíz manda aquí (server.js). Entre un
//      semestre y otro no hay nada que anunciar, y "no hay nada ahora mismo,
//      pero mira todo esto" es mejor portada que un evento viejo fingiendo
//      que está pasando.
//
//  No tiene login de docentes ni formularios: aquí no se hace nada, se mira.
//  Y no lleva guardia de SOLO_EVENTO_ACTIVO porque no es un evento; lo que sí
//  hace es no enlazar las páginas que esa bandera tenga cerradas (lib/programa
//  pone `url: null` en esos casos y la vista los deja sin enlace).
// =====================================================================
const express = require("express");
const programa = require("../lib/programa");
const { VC, JAM, MUSIC, INK } = require("../config");

const router = express.Router();

router.get("/", (req, res) => {
  const datos = programa.indice();

  res.render("info", {
    ...datos,
    // Los números que definen cada evento salen de config y no de un texto
    // escrito a mano: si mañana la jam dura 72 horas, esta página lo dice.
    VC,
    JAM,
    MUSIC,
    INK,
    css: "/info.css",
    themeColor: "#0b0b10",
    title: "Ingeniería en Multimedia · Universidad de Boyacá",
  });
});

module.exports = router;
