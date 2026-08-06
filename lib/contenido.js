// =====================================================================
//  Contenido público de las páginas. Vive en data/*.json — un archivo por
//  evento, el que diga config.EVENTOS.
//  Cada archivo se relee solo cuando cambia: editas el JSON, recargas el
//  navegador y listo, sin reiniciar el servidor.
// =====================================================================
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "data");

// Un cache por archivo. Con un solo par cache/marca compartido, los eventos se
// pisarían el mtime entre ellos y cada petición releería todos —justo lo que el
// cache venía a evitar—.
const caches = new Map();

// Las secciones opcionales arrancan en null a propósito: la vista las protege
// con un if y un JSON incompleto renderiza una página corta en vez de reventar.
const VACIO = {
  programa: "Ingeniería en Multimedia",
  institucion: "Universidad de Boyacá",
  evento: { name: "", tipo: "", estado: "", cuando: "", sede: "", desc: "" },
  categorias: {},
  salas: [],
  jornada: null,
  itinerario: [],
  mapa: null,
  registro: null,
  requisitos: null,
};

function leer(archivo) {
  const ruta = path.join(DIR, archivo);
  let entrada = caches.get(archivo);

  try {
    const { mtimeMs } = fs.statSync(ruta);
    if (!entrada || mtimeMs !== entrada.marca) {
      const datos = { ...VACIO, ...JSON.parse(fs.readFileSync(ruta, "utf8")) };
      entrada = { datos, marca: mtimeMs };
      caches.set(archivo, entrada);
    }
  } catch (e) {
    // Un JSON a medio escribir no puede tumbar el sitio: se queda con lo
    // último bueno y vuelve a intentar en la siguiente petición —la marca
    // solo se guarda tras un parse exitoso, así que el reintento es
    // automático—.
    console.error(`No se pudo leer data/${archivo}:`, e.message);
    if (!entrada) {
      entrada = { datos: VACIO, marca: 0 };
      caches.set(archivo, entrada);
    }
  }

  return entrada.datos;
}

// Contenido de un evento por su archivo de datos. Un evento que todavía no
// tenga archivo devuelve la plantilla vacía: la página de aviso se arma con lo
// que hay en config.
function contenidoEvento(archivo) {
  return archivo ? leer(archivo) : VACIO;
}

module.exports = { contenidoEvento };
