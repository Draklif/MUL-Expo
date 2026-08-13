// =====================================================================
//  Qué evento manda este semestre.
//
//  Los eventos del programa no se solapan, así que la raíz "/" no es un menú:
//  es directamente el evento del semestre. Cuál es no se calcula ni se
//  adivina, lo dice `activo: true` en config.EVENTOS —una línea, un solo
//  lugar—. Aquí se lee, y de aquí salen también los datos de cualquier
//  evento por su slug.
//
//  Y puede no haber ninguno. Entre un semestre y otro —o mientras se decide
//  cuál toca— ningún evento tiene la bandera puesta, y eso NO es un error que
//  haya que tapar: es un estado del programa. Cuando pasa, `activo()` devuelve
//  null y la raíz lleva al índice del programa (/info), que dice justamente
//  que ahora mismo no hay nada en curso y enseña todo lo que se ha hecho.
// =====================================================================
const { EVENTOS, SOLO_EVENTO_ACTIVO } = require("../config");
const { contenidoEvento } = require("./contenido");
const { aprobado } = require("./aprobado");

function porSlug(slug) {
  return EVENTOS.find((e) => e.slug === slug) || null;
}

// Los eventos que se pueden anunciar. Es la lista con la que trabaja todo lo
// público: el índice del programa, la raíz y los enlaces entre eventos. Un
// evento sin aprobar sigue en config.EVENTOS —y su panel sigue abierto—, pero
// hacia afuera no existe.
function publicos() {
  return EVENTOS.filter((e) => aprobado(e.slug));
}

// El evento de la raíz: el que esté marcado en config. EVENTO=slug en el .env
// pesa más y sirve para mirar otro sin tocar el archivo, que es lo que se hace
// mientras se está armando el que viene.
//
// Sin ninguno marcado devuelve null. Antes caía al primero de la lista, y esa
// red de seguridad hacía daño: bajar todas las banderas —lo normal en
// vacaciones— dejaba la Expo anunciándose sola en la raíz como si estuviera
// pasando. Ahora ese caso tiene su propia página y no hay que fingir nada.
//
// Un evento sin aprobar no puede quedarse con la raíz aunque tenga la bandera
// puesta: anunciarlo es exactamente lo que todavía no se puede hacer. Si era
// el único activo, el sitio se comporta como en vacaciones y la raíz lleva al
// índice, que es la verdad —no hay nada que anunciar—.
function activo() {
  const forzado = String(process.env.EVENTO || "").trim();
  if (forzado) {
    const fijo = porSlug(forzado);
    if (fijo && aprobado(fijo.slug)) return fijo;
    if (fijo) {
      console.warn(`  ! EVENTO="${forzado}" no está aprobado en config.APROBADO; sigo con el de config.`);
    } else {
      console.warn(`  ! EVENTO="${forzado}" no está en config.EVENTOS; sigo con el de config.`);
    }
  }

  return publicos().find((e) => e.activo) || null;
}

// Si el semestre tiene evento. Es la pregunta que se hacen la raíz y el índice
// del programa, y se lee mejor así que comparando contra null en cada sitio.
function hayEvento() {
  return Boolean(activo());
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
  const vigente = activo();
  // Sin evento del semestre no se admite a nadie en ninguno, aunque a alguien
  // se le haya quedado la bandera de inscripciones puesta: si no hay evento,
  // no hay a qué inscribirse.
  if (!vigente) return false;
  return Boolean(evento.inscripciones) && evento.slug === vigente.slug;
}

/**
 * Si las páginas públicas de un evento están cerradas al público.
 *
 * Cerrar las inscripciones y cerrar la puerta son dos cosas distintas: lo
 * primero es dejar de admitir gente, lo segundo es que la página del torneo
 * del semestre pasado no se pueda visitar por saberse la dirección. Esto es lo
 * segundo, y lo mandan dos cosas de config: SOLO_EVENTO_ACTIVO (el calendario)
 * y APROBADO (el permiso).
 *
 * Las dos cierran la misma puerta pero no dicen lo mismo, y quien lea esto
 * arriba tiene que distinguirlas: un evento apartado por el calendario se
 * sigue contando en /info sin enlace, y uno sin aprobar ni siquiera sale.
 */
function cerrado(slug) {
  // Sin aprobar no hay nada que discutir, y no depende del calendario: aunque
  // fuera el evento del semestre, la puerta sigue cerrada.
  if (!aprobado(slug)) return true;

  if (!SOLO_EVENTO_ACTIVO) return false;
  const evento = porSlug(slug);
  if (!evento) return false;

  // Sin evento del semestre no hay a quién darle la exclusiva. Esta bandera
  // existe para que nada le robe atención al evento en curso; cuando no hay
  // ninguno, cerrarlo todo dejaría el sitio entero en una sola página y el
  // índice del programa lleno de enlaces que rebotan contra él mismo.
  const vigente = activo();
  if (!vigente) return false;

  return evento.slug !== vigente.slug;
}

/**
 * El guardia de las páginas públicas de un evento. Va como primer middleware
 * de cada ruta pública y NO como un router.use(): estos routers se montan en
 * "/" y por ellos pasan también las peticiones de los demás, así que un
 * middleware suelto bloquearía media aplicación.
 *
 * Manda a la raíz, que es donde está el evento del semestre: quien llegó aquí
 * por un enlace viejo termina viendo lo que sí está pasando, sin una página
 * intermedia que le explique algo que no le sirve. De paso no confirma nada
 * —ni el nombre del evento, ni que la dirección exista—, que era la idea.
 *
 * Es 302 y no 301: el año que viene este mismo evento será el activo, y un
 * permanente se le queda cacheado al navegador para siempre.
 */
function soloActivo(slug) {
  return (req, res, next) => {
    if (!cerrado(slug)) return next();

    // Lo que alimenta un marcador en vivo se responde con JSON. Un redirect
    // aquí lo seguiría el fetch() hasta la portada y se traería su HTML con un
    // 200, que parece una respuesta buena y no lo es.
    if (req.path.includes("/api/")) {
      return res.status(404).json({ error: "no disponible" });
    }

    res.redirect("/");
  };
}

// Dirección canónica de un evento. El vigente vive en la raíz; los demás, en su
// slug. Los enlaces de las vistas salen de aquí para que el que está en la
// portada no se enlace a sí mismo por la puerta de atrás.
//
// Sin evento del semestre la raíz no es de nadie, así que todos se enlazan por
// su slug: es la dirección que nunca cambia y la que se repartió.
function url(evento, vigente = activo()) {
  return vigente && evento.slug === vigente.slug ? "/" : `/${evento.slug}`;
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
    // No es un error: es el sitio entre un semestre y otro. Se dice igual,
    // porque olvidar la bandera al empezar el semestre se ve exactamente así.
    console.log("  · Ningún evento tiene activo:true en config.EVENTOS: la raíz lleva al índice (/info).");
  }

  // Inscripciones abiertas en un evento que no es el del semestre no hacen
  // nada, pero casi siempre significan que se marcó la bandera equivocada.
  EVENTOS.filter((e) => e.inscripciones && !e.activo).forEach((e) => {
    console.warn(`  ! "${e.slug}" tiene inscripciones:true pero no es el evento activo: no recibe a nadie.`);
  });

  // El cruce que más despista: la bandera del semestre puesta en algo que
  // todavía no se aprueba. El sitio se ve como en vacaciones y el config dice
  // lo contrario, así que se nombran las dos banderas juntas.
  EVENTOS.filter((e) => e.activo && !aprobado(e.slug)).forEach((e) => {
    console.warn(
      `  ! "${e.slug}" tiene activo:true pero está en false en config.APROBADO: ` +
        `no se anuncia y la raíz lleva al índice.`
    );
  });
})();

module.exports = {
  EVENTOS,
  publicos,
  activo,
  hayEvento,
  porSlug,
  url,
  fechaLarga,
  contenidoDe,
  inscripcionesAbiertas,
  cerrado,
  soloActivo,
};
