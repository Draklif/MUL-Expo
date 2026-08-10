// =====================================================================
//  Qué evento manda hoy.
//
//  Los eventos del programa no se solapan, así que la raíz "/" no es un menú:
//  es directamente el que esté más próximo a suceder. Aquí se decide cuál es,
//  y de aquí salen también los datos de cualquiera de ellos por su slug.
// =====================================================================
const { EVENTOS, EVENTO_ACTIVO } = require("../config");
const { contenidoEvento } = require("./contenido");
// El día de hoy sale de lib/fechas: es local y no UTC, que con toISOString()
// saltaría al día siguiente cada tarde (Colombia va cinco horas detrás) y el
// evento del día cambiaría a las 7 p.m.
const { hoy } = require("./fechas");

function porSlug(slug) {
  return EVENTOS.find((e) => e.slug === slug) || null;
}

// El evento de la raíz: el primero cuya fecha aún no ha pasado. Un evento sigue
// siendo el vigente durante todo su día (fecha >= hoy), que es cuando más se
// visita la página.
//
// Si nadie tiene fecha futura —porque todavía no se han escrito, o porque el
// año ya pasó— manda el orden de config.EVENTOS. Así el sitio nunca se queda
// sin portada.
function activo() {
  const forzado = String(process.env.EVENTO || EVENTO_ACTIVO || "").trim();
  if (forzado) {
    const fijo = porSlug(forzado);
    if (fijo) return fijo;
    console.warn(`  ! EVENTO="${forzado}" no está en config.EVENTOS; mando por fecha.`);
  }

  const dia = hoy();
  const proximos = EVENTOS.filter((e) => e.fecha && e.fecha >= dia).sort((a, b) =>
    a.fecha.localeCompare(b.fecha)
  );

  return proximos[0] || EVENTOS[0];
}

// Dirección canónica de un evento. El vigente vive en la raíz; los demás, en su
// slug. Los enlaces de las vistas salen de aquí para que el que está en la
// portada no se enlace a sí mismo por la puerta de atrás.
function url(evento, vigente = activo()) {
  return evento.slug === vigente.slug ? "/" : `/${evento.slug}`;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// "2026-11-20" → "20 de noviembre de 2026". Se parte la cadena en vez de pasar
// por Date: new Date("2026-11-20") es medianoche UTC y en Colombia caería el 19.
function fechaLarga(fecha) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha || ""));
  if (!m) return "";
  return `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}`;
}

// Contenido de un evento por slug. Lo usan las partes de la app que son de un
// evento concreto (el registro de expositores y las salas son de la Expo).
function contenidoDe(slug) {
  const evento = porSlug(slug);
  return contenidoEvento(evento ? evento.datos : "");
}

// Un slug repetido dejaría uno de los dos eventos inalcanzable, y sin slug no
// hay dirección que repartir. Se avisa al arrancar, no en la primera visita.
(function revisar() {
  const vistos = new Set();
  EVENTOS.forEach((e) => {
    if (!e.slug) console.warn(`  ! Hay un evento sin slug en config.EVENTOS ("${e.nombre}").`);
    else if (vistos.has(e.slug)) console.warn(`  ! El slug "${e.slug}" está repetido en config.EVENTOS.`);
    vistos.add(e.slug);
  });
})();

module.exports = { EVENTOS, activo, porSlug, url, fechaLarga, contenidoDe };
