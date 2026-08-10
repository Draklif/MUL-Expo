// =====================================================================
//  Acceso al panel de INKreible.
//
//  Cuarta herramienta, cuarta puerta. La lista de docentes es la misma de
//  config.js —el correo institucional sigue siendo la identidad—, pero la
//  contraseña y la sesión son propias: entrar al reto de dibujo no abre la
//  Expo, ni el torneo, ni la jam, y al revés tampoco.
// =====================================================================
const db = require("../db/database");
const { PASSWORD_INK } = require("../config");
const { normalizar, esInstitucional, DOMINIO } = require("./correos");
const { crearLimite } = require("./limite");

// Contador propio: los intentos fallidos en otra herramienta no tienen por qué
// cerrarle la puerta a quien viene al reto.
const limiteAcceso = crearLimite({ ventanaMs: 10 * 60 * 1000, maximo: 15 });

// Sin contraseña en el .env el panel queda cerrado, pero el sitio público del
// reto funciona igual. Se dice al arrancar, no en el primer intento.
const configurado = () => Boolean(PASSWORD_INK);

function requireInk(req, res, next) {
  if (!req.session.docenteInk) return res.redirect("/ink/acceso");
  next();
}

/**
 * Comprueba unas credenciales. Devuelve { docente } o { error, status }.
 * El mensaje es el mismo para correo desconocido y para clave equivocada: así
 * la página no sirve para averiguar quiénes son docentes.
 */
function verificar({ email, password, ip }) {
  const correo = normalizar(email);
  const clave = String(password || "");

  if (!configurado()) {
    return {
      error: "El panel de INKreible todavía no está habilitado. Falta PASSWORD_INK en el .env.",
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

  if (!docente || clave.trim() !== PASSWORD_INK) {
    limiteAcceso.registrar(ip);
    return { error: "Correo o contraseña incorrectos.", status: 401 };
  }

  return { docente: { id: docente.id, name: docente.name, email: docente.code } };
}

module.exports = { requireInk, verificar, configurado };
