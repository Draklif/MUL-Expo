// =====================================================================
//  Acceso al panel del semillero SAMI.
//
//  Séptima herramienta, séptima puerta. La lista de docentes es la misma de
//  config.js —el correo institucional sigue siendo la identidad—, pero la
//  contraseña y la sesión son propias.
//
//  Aquí la separación pesa por lo que se guarda del otro lado: calificaciones
//  de reunión y notas de semestre de estudiantes con nombre propio. Eso no
//  tiene por qué abrirse con la misma clave con la que se inscribe un equipo a
//  un torneo.
//
//  Ojo con lo que este archivo NO decide: entrar al panel no da permiso para
//  escribir en cualquier proyecto. Quién puede registrar reuniones y notas lo
//  decide sami.esDirector(), proyecto por proyecto. La puerta es una; los
//  cuartos, no.
// =====================================================================
const db = require("../db/database");
const { PASSWORD_SAMI } = require("../config");
const { conDominio, esInstitucional, DOMINIO } = require("./correos");
const { crearLimite } = require("./limite");

// Contador propio: los intentos fallidos en otra herramienta no tienen por qué
// cerrarle la puerta a quien viene a registrar la reunión del martes.
const limiteAcceso = crearLimite({ ventanaMs: 10 * 60 * 1000, maximo: 15 });

// Sin contraseña en el .env el panel queda cerrado, pero el sitio público del
// semillero funciona igual: la gente sigue registrando su intención.
const configurado = () => Boolean(PASSWORD_SAMI);

function requireSami(req, res, next) {
  if (!req.session.docenteSami) return res.redirect("/semillero/acceso");
  next();
}

/**
 * Comprueba unas credenciales. Devuelve { docente } o { error, status }.
 * El mensaje es el mismo para correo desconocido y para clave equivocada: así
 * la página no sirve para averiguar quiénes son docentes.
 */
function verificar({ email, password, ip }) {
  const correo = conDominio(email);
  const clave = String(password || "");

  if (!configurado()) {
    return {
      error: "El panel del semillero todavía no está habilitado. Falta PASSWORD_SAMI en el .env.",
      status: 503,
    };
  }

  if (!correo || !clave) {
    return { error: "Escribe tu correo institucional y la contraseña.", status: 400 };
  }

  if (!esInstitucional(correo)) {
    return { error: `Usa tu correo @${DOMINIO}.`, status: 400 };
  }

  if (limiteAcceso.alcanzado(ip)) {
    return {
      error: "Demasiados intentos fallidos. Espera unos minutos y vuelve a probar.",
      status: 429,
    };
  }

  const docente = db
    .prepare("SELECT id, name, code FROM docentes WHERE code = ? COLLATE NOCASE")
    .get(correo);

  if (!docente || clave.trim() !== PASSWORD_SAMI) {
    limiteAcceso.registrar(ip);
    return { error: "Correo o contraseña incorrectos.", status: 401 };
  }

  return { docente: { id: docente.id, name: docente.name, email: docente.code } };
}

module.exports = { requireSami, verificar, configurado };
