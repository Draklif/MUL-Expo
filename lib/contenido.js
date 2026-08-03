// =====================================================================
//  Contenido público de la Expo (landing). Vive en data/expo.json.
//  Se relee solo cuando el archivo cambia: editas el JSON, recargas el
//  navegador y listo, sin reiniciar el servidor.
// =====================================================================
const fs = require("fs");
const path = require("path");

const RUTA = path.join(__dirname, "..", "data", "expo.json");

const VACIO = {
  programa: "",
  institucion: "",
  evento: { name: "Expo Multimedia", tipo: "", estado: "", cuando: "", sede: "", desc: "" },
  categorias: {},
  salas: [],
  jornada: null,
  itinerario: [],
  mapa: null,
  registro: { abierto: true },
  requisitos: null,
};

let cache = null;
let marca = 0;

function contenidoExpo() {
  try {
    const { mtimeMs } = fs.statSync(RUTA);
    if (!cache || mtimeMs !== marca) {
      cache = { ...VACIO, ...JSON.parse(fs.readFileSync(RUTA, "utf8")) };
      marca = mtimeMs;
    }
  } catch (e) {
    console.error("No se pudo leer data/expo.json:", e.message);
    if (!cache) cache = VACIO;
  }
  return cache;
}

module.exports = { contenidoExpo };
