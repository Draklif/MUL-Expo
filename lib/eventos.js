// =====================================================================
//  Qué evento manda este semestre.
//
//  Los eventos del programa no se solapan, así que la raíz "/" no es un menú:
//  es directamente el evento del semestre. Cuál es no se calcula ni se
//  adivina, lo dice `activo: true` en config.EVENTOS —una línea, un solo
//  lugar—. Aquí se lee, y de aquí salen también los datos de cualquier
//  evento por su slug.
// =====================================================================
const { EVENTOS } = require("../config");
const { contenidoEvento } = require("./contenido");

function porSlug(slug) {
  return EVENTOS.find((e) => e.slug === slug) || null;
}

// El evento de la raíz: el que esté marcado en config. EVENTO=slug en el .env
// pesa más y sirve para mirar otro sin tocar el archivo, que es lo que se hace
// mientras se está armando el que viene.
//
// Sin ninguno marcado el sitio no se queda sin portada: manda el orden de la
// lista. Es una red de seguridad, no una forma de configurarlo.
function activo() {
  const forzado = String(process.env.EVENTO || "").trim();
  if (forzado) {
    const fijo = porSlug(forzado);
    if (fijo) return fijo;
    console.warn(`  ! EVENTO="${forzado}" no está en config.EVENTOS; sigo con el de config.`);
  }

  return EVENTOS.find((e) => e.activo) || EVENTOS[0];
}

/**
 * Si un evento está recibiendo inscripciones. Son dos condiciones y las dos
 * salen de config: que sea el evento del semestre y que tenga las
 * inscripciones abiertas. Un evento que no es el de este semestre no recibe a
 * nadie aunque se le olvide a alguien bajar la bandera.
 *
 * Es la puerta de entrada de los tres formularios del sitio (la Expo, el
 * torneo y la jam), para que "cerrar" signifique lo mismo en los tres.
 */
function inscripcionesAbiertas(slug) {
  const evento = porSlug(slug);
  if (!evento) return false;
  return Boolean(evento.inscripciones) && evento.slug === activo().slug;
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
//
// Y lo mismo con las banderas: dos eventos activos a la vez es la clase de
// error que no se nota hasta que alguien abre la raíz y ve el que no era.
(function revisar() {
  const vistos = new Set();
  EVENTOS.forEach((e) => {
    if (!e.slug) console.warn(`  ! Hay un evento sin slug en config.EVENTOS ("${e.nombre}").`);
    else if (vistos.has(e.slug)) console.warn(`  ! El slug "${e.slug}" está repetido en config.EVENTOS.`);
    vistos.add(e.slug);
  });

  const activos = EVENTOS.filter((e) => e.activo);
  if (activos.length > 1) {
    console.warn(
      `  ! Hay ${activos.length} eventos con activo:true en config.EVENTOS ` +
        `(${activos.map((e) => e.slug).join(", ")}). Mando con el primero.`
    );
  } else if (!activos.length) {
    console.warn(`  ! Ningún evento tiene activo:true en config.EVENTOS; mando con "${EVENTOS[0].slug}".`);
  }

  // Inscripciones abiertas en un evento que no es el del semestre no hacen
  // nada, pero casi siempre significan que se marcó la bandera equivocada.
  EVENTOS.filter((e) => e.inscripciones && !e.activo).forEach((e) => {
    console.warn(`  ! "${e.slug}" tiene inscripciones:true pero no es el evento activo: no recibe a nadie.`);
  });
})();

module.exports = { EVENTOS, activo, porSlug, url, fechaLarga, contenidoDe, inscripcionesAbiertas };
