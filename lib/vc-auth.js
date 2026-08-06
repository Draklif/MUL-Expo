// =====================================================================
//  Acceso al panel de Virtual Champions.
//
//  Misma idea que el de la Expo (correo institucional de la lista de
//  config.js + una contraseña compartida), pero con OTRA contraseña y OTRA
//  sesión: quien opera el bracket no entra a las notas de la Expo, y quien
//  califica proyectos no toca el torneo. Entrar a uno no abre el otro.
// =====================================================================
const db = require("../db/database");
const { PASSWORD_VC } = require("../config");
const { normalizar, esInstitucional, DOMINIO } = require("./correos");
const { crearLimite } = require("./limite");

// Freno propio, con su propio contador: los intentos fallidos en la Expo no
// tienen por qué cerrarle la puerta a quien viene al torneo.
const limiteAcceso = crearLimite({ ventanaMs: 10 * 60 * 1000, maximo: 15 });

// Sin contraseña en el .env el panel queda cerrado, pero el sitio público del
// torneo funciona igual. Se dice al arrancar, no en el primer intento.
const configurado = () => Boolean(PASSWORD_VC);

function requireVC(req, res, next) {
  if (!req.session.docenteVC) return res.redirect("/vc/acceso");
  next();
}

/**
 * Comprueba unas credenciales. Devuelve { docente } o { error, status }.
 * El mensaje es el mismo para correo desconocido y para clave equivocada:
 * así la página no sirve para averiguar quiénes son docentes.
 */
function verificar({ email, password, ip }) {
  const correo = normalizar(email);
  const clave = String(password || "");

  if (!configurado()) {
    return {
      error: "El panel del torneo todavía no está habilitado. Falta PASSWORD_VC en el .env.",
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

  if (!docente || clave.trim() !== PASSWORD_VC) {
    limiteAcceso.registrar(ip);
    return { error: "Correo o contraseña incorrectos.", status: 401 };
  }

  return { docente: { id: docente.id, name: docente.name, email: docente.code } };
}

module.exports = { requireVC, verificar, configurado };
