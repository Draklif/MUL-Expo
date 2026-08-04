// =====================================================================
//  Contenido público de las páginas. Vive en data/*.json.
//  Cada archivo se relee solo cuando cambia: editas el JSON, recargas el
//  navegador y listo, sin reiniciar el servidor.
// =====================================================================
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "data");

// Un cache por archivo. Con un solo par cache/marca compartido, expo.json y
// programa.json se pisarían el mtime entre ellos y cada petición releería los
// dos —justo lo que el cache venía a evitar—.
const caches = new Map();

function leer(archivo, VACIO) {
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

// ---------- Expo Multimedia (/expo) ----------
const VACIO_EXPO = {
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

// ---------- Portada del programa (/) ----------
// Las secciones opcionales arrancan en null a propósito: la vista las
// protege con un if y un JSON incompleto renderiza una página corta en vez
// de reventar.
const VACIO_PROGRAMA = {
  programa: "Ingeniería en Multimedia",
  institucion: "Universidad de Boyacá",
  facultad: "",
  seo: { titulo: "Ingeniería en Multimedia", descripcion: "" },
  marca: { logo: "", logo_pie: "", alt: "" },
  nav: { items: [] },
  hero: null,
  ficha: null,
  quees: null,
  ejes: null,
  expo: null,
  agenda: null,
  laboratorios: null,
  contacto: null,
};

function contenidoExpo() {
  return leer("expo.json", VACIO_EXPO);
}

function contenidoPrograma() {
  return leer("programa.json", VACIO_PROGRAMA);
}

module.exports = { contenidoExpo, contenidoPrograma };
