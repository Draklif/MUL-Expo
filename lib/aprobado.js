// =====================================================================
//  QUÉ SE PUEDE ANUNCIAR Y QUÉ NO
//
//  Un interruptor por cada parte pública del sitio —los cuatro eventos, las
//  salidas y el semillero— y una sola pregunta: ¿está aprobado?
//
//  Existe porque el sitio va por delante de la facultad. Las páginas se
//  escriben, se prueban y quedan listas semanas antes de que alguien firme
//  que ese evento va, y hasta que eso pase no puede haber ni una página
//  pública ni un renglón en el índice del programa diciendo que existe. Con
//  esto puesto en false esa parte del sitio se apaga entera; el día que se
//  apruebe, se cambia una palabra en config y aparece completa.
//
//  Ojo con lo que NO es. No es SOLO_EVENTO_ACTIVO —esa es de calendario, y lo
//  que aparta se sigue contando como historia del programa— ni es
//  `inscripciones` —eso es dejar de recibir gente, con la página en pie—.
//  Esto es más duro que las dos: lo apagado no se anuncia, no se cuenta y no
//  responde.
//
//  Y lo que nunca apaga: los paneles. El docente entra con contraseña
//  justamente a preparar lo que todavía no se aprueba, así que bloquearle el
//  panel dejaría el interruptor sin sentido.
// =====================================================================
const { APROBADO } = require("../config");

// Las partes del sitio que no son eventos y por eso no tienen slug en
// config.EVENTOS. Se nombran aquí para poder avisar de una clave mal escrita.
const SECCIONES = ["salidas", "semillero"];

/**
 * Si una parte del sitio se puede enseñar.
 *
 * Lo que no está en la lista cuenta como aprobado: un evento nuevo tiene que
 * aparecer desde el minuto uno, y una parte del sitio no puede desaparecer
 * porque alguien olvidó agregarle un renglón al config.
 */
function aprobado(clave) {
  return APROBADO[String(clave || "")] !== false;
}

/**
 * El guardia de una página pública. Va como primer middleware de cada ruta y
 * NO como un router.use(): los routers públicos se montan en "/" y por ellos
 * pasan también las peticiones de los paneles, que no se apagan nunca.
 *
 * Manda a la raíz, sin página intermedia: no hay nada que explicarle a quien
 * llegó a algo que todavía no se anuncia, y una explicación confirmaría que
 * existe. Es 302 porque esto se aprueba, y el día que se apruebe un
 * permanente se le habría quedado cacheado al navegador para siempre.
 */
function guardia(clave) {
  return (req, res, next) => {
    if (aprobado(clave)) return next();

    // Lo que alimenta una página en vivo se responde con JSON: un redirect lo
    // seguiría el fetch() hasta la portada y se traería su HTML con un 200,
    // que parece una respuesta buena y no lo es.
    if (req.path.includes("/api/")) {
      return res.status(404).json({ error: "no disponible" });
    }

    res.redirect("/");
  };
}

// Una clave mal escrita apagaría algo que nadie quiso apagar, o —peor— dejaría
// encendido lo que se creía apagado. Se avisa al arrancar y no en la primera
// visita, que es cuando ya sería tarde.
(function revisar() {
  const { EVENTOS } = require("../config");
  const validas = new Set([...EVENTOS.map((e) => e.slug), ...SECCIONES]);

  Object.keys(APROBADO).forEach((clave) => {
    if (!validas.has(clave)) {
      console.warn(`  ! config.APROBADO tiene "${clave}", que no es un evento ni una sección: no apaga nada.`);
    }
  });

  const apagadas = Object.keys(APROBADO).filter((c) => APROBADO[c] === false && validas.has(c));
  if (apagadas.length) {
    console.log(`  · Sin aprobar (no se anuncian ni responden): ${apagadas.join(", ")}.`);
  }
})();

module.exports = { aprobado, guardia, SECCIONES };
