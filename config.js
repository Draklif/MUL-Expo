// =====================================================================
//  CONFIGURACIÓN — Edita este archivo ANTES de correr la app por primera vez.
//  Al reiniciar, los docentes se sincronizan automáticamente con esta lista.
// =====================================================================

// Semestre con el que arranca la base la primera vez. Después se crean y se
// cambian desde el panel; esto ya no se vuelve a mirar.
const PERIODO_INICIAL = "2026-20";

// Dominio institucional. Todo correo (docentes y estudiantes) tiene que
// terminar en @DOMINIO; cualquier otro se rechaza.
const DOMINIO = "uniboyaca.edu.co";

// ---------------------------------------------------------------------
//  EVENTOS DEL PROGRAMA
// ---------------------------------------------------------------------
// No hay dos eventos a la vez: la raíz "/" muestra el que esté más próximo a
// suceder y ese es el único que ve quien llegue sin enlace. Cada evento vive
// además en su propia dirección (/slug), que nunca cambia y sirve para
// compartirlo antes o después de su turno.
//
// Para mover la raíz basta con las fechas: se escribe la de cada evento y el
// sitio se acomoda solo el día que toque. El orden de esta lista solo decide
// el desempate cuando ninguno tiene fecha futura.
//
//   slug   — la dirección (/expo). No se cambia una vez repartida.
//   fecha  — AAAA-MM-DD del día del evento. Vacío = "por confirmar".
//   lema   — una línea para la página de aviso mientras no tenga la suya.
//   datos  — archivo de data/ con el contenido. Vacío = todavía no tiene.
//   vista  — plantilla de views/. Vacío = usa la página de aviso.
const EVENTOS = [
  {
    slug: "expo",
    nombre: "Expo Multimedia",
    fecha: "",
    lema: "Todos los proyectos finales del semestre, en un solo recorrido.",
    datos: "expo.json",
    vista: "landing",
  },
  {
    slug: "virtual-champions",
    nombre: "Virtual Champions",
    fecha: "",
    lema: "",
    datos: "",
    vista: "",
  },
  {
    slug: "jam-de-altura",
    nombre: "Jam de Altura",
    fecha: "",
    lema: "",
    datos: "",
    vista: "",
  },
  {
    slug: "music-fest",
    nombre: "Multimedia Music Fest",
    fecha: "",
    lema: "",
    datos: "",
    vista: "",
  },
];

// Deja la raíz clavada en un evento, pase lo que pase con las fechas: se pone
// aquí su slug (o EVENTO=slug en el .env, que pesa más y sirve para probar sin
// tocar el archivo). Vacío = manda la fecha, que es lo normal.
const EVENTO_ACTIVO = "";

// Contraseña compartida para todos los docentes.
// El correo identifica a cada quien; esta clave es la segunda barrera.
//
// Va en el .env (PASSWORD_DOCENTES) y NO aquí: este archivo se sube a git, y
// con la clave a la vista más los correos de abajo, cualquiera que lea el
// repositorio puede entrar al panel. Sin ella la app no arranca.
const PASSWORD = String(process.env.PASSWORD_DOCENTES || "").trim();

// Lista de docentes habilitados. Entran con su correo + la contraseña de arriba.
//
// Para cambiar un correo mal escrito: se corrige aquí y se reinicia. La
// identidad es el NOMBRE, así que la persona conserva sus materias, sus
// calificaciones y los registros que haya revisado. Cambiar el nombre de
// alguien que ya tiene datos, en cambio, crea un docente nuevo.
const DOCENTES = [
  { name: "Jose Rentería",   email: "jmrenteria@uniboyaca.edu.co" },
  { name: "Juan Niño",       email: "juaestnino@uniboyaca.edu.co" },
  { name: "Manuel Corredor", email: "mancorredor@uniboyaca.edu.co" },
  { name: "Oscar Pérez",     email: "lperez54@uniboyaca.edu.co" },
];

// Correos automáticos (código de registro, resultado de la revisión y aviso
// del certificado). La cuenta y la contraseña de aplicación NO van aquí: van
// en el archivo .env, que no se sube a git. Sin esas dos variables la app
// funciona igual, solo que nadie recibe avisos.
const CORREO = {
  // Nombre que ve el estudiante como remitente.
  remitente: "Expo Multimedia",
  // A dónde va la respuesta si le contesta al correo. Vacío = a la cuenta que
  // envía (la de Gmail).
  responder_a: "",
};

// Criterios de la rúbrica (los mismos para TODOS los proyectos).
// Escala 0 a 5. El promedio final del proyecto es el promedio de
// (promedio de criterios) entre todos los docentes que calificaron.
const CRITERIOS = [
  { key: "contenido",   label: "Contenido / Investigación" },
  { key: "diseno",      label: "Diseño y calidad visual" },
  { key: "tecnica",     label: "Aspectos técnicos" },
  { key: "exposicion",  label: "Exposición y dominio" },
  { key: "innovacion",  label: "Innovación / Creatividad" },
];

// Criterios de la rúbrica INDIVIDUAL (por integrante del grupo).
const CRITERIOS_IND = [
  { key: "dominio",       label: "Dominio del tema" },
  { key: "comunicacion",  label: "Comunicación oral" },
  { key: "aporte",        label: "Aporte al proyecto" },
];

// Escala máxima por criterio (0 a ESCALA_MAX).
const ESCALA_MAX = 5;

module.exports = {
  PERIODO_INICIAL,
  DOMINIO,
  EVENTOS,
  EVENTO_ACTIVO,
  PASSWORD,
  DOCENTES,
  CORREO,
  CRITERIOS,
  CRITERIOS_IND,
  ESCALA_MAX,
};
