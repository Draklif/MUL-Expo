// =====================================================================
//  Acceso al panel de las salidas pedagógicas.
//
//  Cuarta herramienta, cuarta puerta. La lista de docentes es la misma de
//  config.js —el correo institucional sigue siendo la identidad—, pero la
//  contraseña y la sesión son propias.
//
//  Aquí la separación pesa más que en las otras tres: quien entra a este panel
//  está confirmando pagos en efectivo, y eso no tiene por qué abrirse con la
//  misma clave con la que se califica un proyecto.
// =====================================================================
const db = require("../db/database");
const { PASSWORD_SALIDAS } = require("../config");
const { normalizar, esInstitucional, DOMINIO } = require("./correos");
const { crearLimite } = require("./limite");

// Contador propio: los intentos fallidos en otra herramienta no tienen por qué
// cerrarle la puerta a quien viene a cobrar una salida.
const limiteAcceso = crearLimite({ ventanaMs: 10 * 60 * 1000, maximo: 15 });

// Sin contraseña en el .env el panel queda cerrado, pero el sitio público de
// las salidas funciona igual: la gente se sigue registrando.
const configurado = () => Boolean(PASSWORD_SALIDAS);

function requireSalidas(req, res, next) {
  if (!req.session.docenteSalidas) return res.redirect("/salidas/acceso");
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
      error: "El panel de salidas todavía no está habilitado. Falta PASSWORD_SALIDAS en el .env.",
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

  if (!docente || clave.trim() !== PASSWORD_SALIDAS) {
    limiteAcceso.registrar(ip);
    return { error: "Correo o contraseña incorrectos.", status: 401 };
  }

  return { docente: { id: docente.id, name: docente.name, email: docente.code } };
}

module.exports = { requireSalidas, verificar, configurado };
