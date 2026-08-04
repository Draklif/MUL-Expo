// =====================================================================
//  Lector mínimo de .env.
//
//  La contraseña del correo no puede vivir en config.js: ese archivo sí
//  se sube a git. Node 22.18 todavía no trae --env-file-if-exists (llegó
//  en la 22.9) y no vale la pena una dependencia para veinte líneas: si
//  el archivo no está, la app arranca igual, solo que sin correos.
// =====================================================================
const fs = require("fs");
const path = require("path");

const RUTA = path.join(__dirname, "..", ".env");

function cargarEnv(ruta = RUTA) {
  let texto;
  try {
    texto = fs.readFileSync(ruta, "utf8");
  } catch {
    return false; // sin .env no pasa nada
  }

  for (const linea of texto.split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;

    const corte = limpia.indexOf("=");
    if (corte < 1) continue;

    const clave = limpia.slice(0, corte).trim();
    let valor = limpia.slice(corte + 1).trim();

    // Las comillas envuelven el valor, no forman parte de él.
    if (valor.length > 1 && /^(".*"|'.*')$/.test(valor)) valor = valor.slice(1, -1);

    // Lo que ya venga del sistema manda sobre el archivo.
    if (process.env[clave] === undefined) process.env[clave] = valor;
  }

  return true;
}

module.exports = { cargarEnv };
