// =====================================================================
//  CONFIGURACIÓN — Edita este archivo ANTES de correr la app por primera vez.
//  Al reiniciar, los docentes se sincronizan automáticamente con esta lista.
// =====================================================================

// ---------------------------------------------------------------------
//  EL SEMESTRE EN CURSO
// ---------------------------------------------------------------------
// Esta línea es EL interruptor del sitio entero. Todo lo que hacen los
// estudiantes —el registro de la Expo, los equipos del torneo, la jam—
// cuelga del semestre que diga aquí.
//
// Empezar un semestre nuevo es cambiar el código y reiniciar. Al arrancar:
//
//   · si el semestre no existe, se crea y queda activo;
//   · el torneo de cada juego y la edición de la jam se abren solos, vacíos;
//   · lo del semestre pasado NO se borra: queda archivado y se sigue
//     consultando desde el panel y desde los certificados ya emitidos.
//
// Después de eso solo falta abrir las inscripciones del evento que toque, ahí
// abajo en EVENTOS.
//
// Formato AAAA-NN: 10 para el primer semestre del año, 20 para el segundo.
const PERIODO = "2026-20";

// Dominio institucional. Todo correo (docentes y estudiantes) tiene que
// terminar en @DOMINIO; cualquier otro se rechaza.
const DOMINIO = "uniboyaca.edu.co";

// ---------------------------------------------------------------------
//  EVENTOS DEL PROGRAMA
// ---------------------------------------------------------------------
// No hay dos eventos a la vez. Un semestre es de la Expo, o del torneo, o de
// la jam: el que tenga `activo: true` es el que ve quien llegue a la raíz "/"
// sin enlace. Cada evento vive además en su propia dirección (/slug), que
// nunca cambia y sirve para compartirlo antes o después de su turno.
//
// Dos banderas y ya está. No hay botones equivalentes en ningún panel: esto
// es lo único que decide qué está pasando en el sitio.
//
//   activo        — true en UNO solo. Es el evento del semestre: el que toma
//                   la raíz "/" y el único al que se le abren inscripciones.
//   inscripciones — true mientras el formulario reciba gente. Se pone en true
//                   al empezar el semestre y en false el día que se cierra;
//                   cerrarlo no borra nada, solo deja de admitir.
//
//   slug   — la dirección (/expo). No se cambia una vez repartida.
//   fecha  — AAAA-MM-DD del día del evento. Vacío = "por confirmar".
//   lema   — una línea para la página de aviso mientras no tenga la suya.
//   datos  — archivo de data/ con el contenido. Vacío = todavía no tiene.
//   vista  — plantilla de views/. Vacío = usa la página de aviso.
//   ruta   — true si el evento trae su propio router (su página necesita
//            datos de la base, no solo del JSON). El servidor entonces no le
//            registra la dirección automática: la pone el router.
const EVENTOS = [
  {
    slug: "expo",
    nombre: "Expo Multimedia",
    activo: true,
    inscripciones: true,
    fecha: "",
    lema: "Todos los proyectos finales del semestre, en un solo recorrido.",
    datos: "expo.json",
    vista: "landing",
  },
  {
    slug: "virtual-champions",
    nombre: "Virtual Champions",
    activo: false,
    inscripciones: false,
    fecha: "",
    lema: "El torneo de esports del programa. Clasificatorias en línea, final en vivo.",
    datos: "virtual-champions.json",
    vista: "vc/landing",
    ruta: true,
  },
  {
    slug: "jam-de-altura",
    nombre: "Jam de Altura",
    activo: false,
    inscripciones: false,
    fecha: "",
    lema: "Cuarenta y ocho horas, un tema y un videojuego. Todo en línea.",
    datos: "jam-de-altura.json",
    vista: "jam/landing",
    ruta: true,
  },
  {
    slug: "music-fest",
    nombre: "Multimedia Music Fest",
    activo: false,
    inscripciones: false,
    fecha: "",
    lema: "",
    datos: "",
    vista: "",
  },
];

// ---------------------------------------------------------------------
//  VIRTUAL CHAMPIONS
// ---------------------------------------------------------------------
// El torneo de esports. Cada juego que se vaya a jugar entra en la lista de
// abajo: agregarlo o quitarlo es todo lo que hace falta para que aparezca (o
// desaparezca) del sitio público y del panel. Nada más en el código nombra a
// Valorant ni a League of Legends.
//
// El torneo de cada juego para el semestre en curso se abre solo al arrancar,
// vacío; no hay que crearlo a mano desde ningún lado.
//
//   id         — identificador corto. Va en la dirección (/vc/valorant/bracket)
//                y en la clase de CSS (.juego-valorant), así que no se cambia
//                una vez haya torneos creados.
//   acento     — el color del juego. Manda en su página y en sus tarjetas.
//   titulares  — cuántos juegan. Es el mínimo que se le pide a un equipo al
//                inscribirse y el tamaño de los equipos que arma el docente.
//   suplentes  — cuántos más se admiten en el registro.
//   roles      — las opciones del selector de rol en la inscripción.
//   nick       — cómo se llama el nombre en el juego, para no pedir "usuario"
//                a secas.
//   mapas      — sugerencias del selector al cargar un mapa en vivo. La consola
//                deja escribir cualquier otro, así que la lista puede quedar
//                corta sin bloquear a nadie.
const VC = {
  juegos: [
    {
      id: "valorant",
      nombre: "Valorant",
      acento: "#ff4655",
      titulares: 5,
      suplentes: 2,
      roles: ["Duelista", "Iniciador", "Controlador", "Centinela", "Flex"],
      nick: { label: "Riot ID", ejemplo: "Nairo#LAN" },
      mapas: ["Ascent", "Bind", "Haven", "Split", "Lotus", "Sunset", "Icebox", "Breeze"],
    },
    {
      id: "lol",
      nombre: "League of Legends",
      acento: "#c8aa6e",
      titulares: 5,
      suplentes: 2,
      roles: ["Top", "Jungla", "Medio", "ADC", "Soporte"],
      nick: { label: "Riot ID", ejemplo: "Nairo#LAN" },
      mapas: ["Grieta del Invocador"],
    },
  ],

  // Formatos de serie disponibles al armar el bracket. BO1 = una partida,
  // BO3 = el primero que gane dos, BO5 = el primero que gane tres.
  formatos: [1, 3, 5],

  // Con qué formato arranca cada ronda al generar el bracket: las eliminatorias
  // son virtuales a una sola partida y la final es presencial al mejor de cinco.
  formato_ronda: 1,
  formato_final: 5,
  final_presencial: true,
};

// ---------------------------------------------------------------------
//  JAM DE ALTURA
// ---------------------------------------------------------------------
// La gamejam de 48 horas, completamente virtual. A diferencia del torneo, aquí
// no hay varios juegos ni varias jams a la vez: hay UNA edición por semestre y
// todo el sitio habla de ella. La edición del semestre en curso se abre sola
// al arrancar, con los valores de aquí abajo; no hay que crearla a mano.
//
//   max_integrantes — el tope de un equipo. Inscribirse solo también vale.
//   horas           — cuánto dura la jam. Es lo que cuenta el reloj gigante.
//   cupo_equipos    — tope de equipos por edición. null = sin tope.
//   disciplinas     — de qué puede encargarse cada quien. Se pide en la
//                     inscripción y es lo que hace visible si un equipo es
//                     interdisciplinar o son cuatro programadores juntos.
//                     Agregar o quitar una de esta lista es todo lo que hace
//                     falta: el formulario y el panel salen de aquí.
const JAM = {
  max_integrantes: 4,
  horas: 48,
  cupo_equipos: null,
  disciplinas: [
    "Programación",
    "Arte 2D",
    "Arte 3D",
    "Diseño de juego",
    "Animación",
    "Audio y música",
    "Narrativa",
    "Producción",
  ],
};

// Contraseña del panel de Virtual Champions. Es DISTINTA a la de la Expo a
// propósito: los mismos docentes, pero dos herramientas separadas. Va en el
// .env (PASSWORD_VC). Sin ella el panel del torneo queda cerrado, pero el
// resto del sitio funciona igual.
const PASSWORD_VC = String(process.env.PASSWORD_VC || "").trim();

// Contraseña del panel de la Jam de Altura, por la misma razón: tercera
// herramienta, tercera clave. Va en el .env (PASSWORD_JAM).
const PASSWORD_JAM = String(process.env.PASSWORD_JAM || "").trim();

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
  PERIODO,
  DOMINIO,
  EVENTOS,
  VC,
  JAM,
  PASSWORD,
  PASSWORD_VC,
  PASSWORD_JAM,
  DOCENTES,
  CORREO,
  CRITERIOS,
  CRITERIOS_IND,
  ESCALA_MAX,
};
