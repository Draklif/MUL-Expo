// =====================================================================
//  Acceso al panel de las becas.
//
//  Octava herramienta, octava puerta. La lista de docentes es la misma de
//  config.js —el correo institucional sigue siendo la identidad—, pero la
//  contraseña y la sesión son propias.
//
//  Aquí no hay puerta pública que proteger: este módulo ES el panel y nada
//  más, así que esta es la única entrada que tiene. Lo que hay adentro es el
//  cumplimiento de una beca, que en la práctica es plata, y por eso la clave va
//  aparte de la del semillero y de la de la Expo.
// =====================================================================
const db = require("../db/database");
const { PASSWORD_BECAS } = require("../config");
const { conDominio, esInstitucional, DOMINIO } = require("./correos");
const { crearLimite } = require("./limite");

// Contador propio, como en todas: los intentos fallidos en otra herramienta no
// tienen por qué cerrarle la puerta a quien viene a registrar unas horas.
const limiteAcceso = crearLimite({ ventanaMs: 10 * 60 * 1000, maximo: 15 });

// Sin contraseña en el .env el módulo entero queda cerrado. A diferencia de las
// salidas o del semillero, aquí eso no deja a nadie a medias: no hay sitio
// público que siga funcionando porque no hay sitio público.
const configurado = () => Boolean(PASSWORD_BECAS);

function requireBecas(req, res, next) {
  if (!req.session.docenteBecas) return res.redirect("/becas/acceso");
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
      error: "El panel de becas todavía no está habilitado. Falta PASSWORD_BECAS en el .env.",
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

  if (!docente || clave.trim() !== PASSWORD_BECAS) {
    limiteAcceso.registrar(ip);
    return { error: "Correo o contraseña incorrectos.", status: 401 };
  }

  return { docente: { id: docente.id, name: docente.name, email: docente.code } };
}

module.exports = { requireBecas, verificar, configurado };
