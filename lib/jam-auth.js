// =====================================================================
//  Acceso al panel de la Jam de Altura.
//
//  Tercera herramienta, tercera puerta. La lista de docentes es la misma de
//  config.js —el correo institucional sigue siendo la identidad—, pero la
//  contraseña y la sesión son propias: entrar a la Jam no abre la Expo ni el
//  torneo, y al revés tampoco.
// =====================================================================
const db = require("../db/database");
const { PASSWORD_JAM } = require("../config");
const { conDominio, esInstitucional, DOMINIO } = require("./correos");
const { crearLimite } = require("./limite");

// Contador propio: los intentos fallidos en otra herramienta no tienen por qué
// cerrarle la puerta a quien viene a la jam.
const limiteAcceso = crearLimite({ ventanaMs: 10 * 60 * 1000, maximo: 15 });

// Sin contraseña en el .env el panel queda cerrado, pero el sitio público de
// la jam funciona igual. Se dice al arrancar, no en el primer intento.
const configurado = () => Boolean(PASSWORD_JAM);

function requireJam(req, res, next) {
  if (!req.session.docenteJam) return res.redirect("/jam/acceso");
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
      error: "El panel de la jam todavía no está habilitado. Falta PASSWORD_JAM en el .env.",
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

  if (!docente || clave.trim() !== PASSWORD_JAM) {
    limiteAcceso.registrar(ip);
    return { error: "Correo o contraseña incorrectos.", status: 401 };
  }

  return { docente: { id: docente.id, name: docente.name, email: docente.code } };
}

module.exports = { requireJam, verificar, configurado };
