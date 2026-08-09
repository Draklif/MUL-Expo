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
//                   En NINGUNO también es una respuesta válida —entre un
//                   semestre y otro no está pasando nada—: entonces la raíz
//                   lleva a /info, el índice del programa, que lo dice de
//                   frente y enseña todo lo que se ha hecho y lo que viene.
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
    activo: false,
    inscripciones: false,
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
    lema: "Los grupos culturales del programa en vivo, con la producción entera en manos de los estudiantes.",
    datos: "music-fest.json",
    vista: "music/landing",
    ruta: true,
  },
];

// Con esto en true, las páginas públicas de los eventos que NO son el de este
// semestre no responden: quien llegue a una sale rebotado a la raíz, que es
// donde está el evento que sí está pasando. Es el complemento de `activo`: esa
// bandera decide qué se muestra en la raíz, y esta decide que lo demás ni
// siquiera se pueda visitar sabiéndose la dirección.
//
// Ponlo en false para probar en paz —la jam del semestre entrante, el torneo
// que todavía no arranca— y vuélvelo a true antes de repartir el enlace.
//
// Lo que NO bloquea nunca, y a propósito:
//
//   · los paneles (/vc, /jam, /salidas y /panel). Se entra con contraseña, y
//     el docente tiene que poder preparar el evento que viene;
//   · los certificados. Su código QR está impreso y tiene que seguir abriendo
//     dentro de tres años;
//   · las salidas pedagógicas, que no son un evento del semestre;
//   · /patrocinios, que va por su cuenta (PATROCINIOS.abierto): a las marcas
//     se les habla con meses de anticipación.
const SOLO_EVENTO_ACTIVO = false;

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

  // Los premios del torneo. De aquí salen las tres cosas a la vez: lo que
  // promete la página, lo que el panel deja adjudicar y lo que termina escrito
  // en el certificado. Una sola lista para que no haya dos verdades.
  //
  //   ambito — a quién se le entrega. 'equipo' certifica a la plantilla
  //            entera; 'persona', a un solo jugador.
  //   cls    — el color de la medalla: oro, plata o bronce.
  //
  // Quitar una categoría de aquí la borra del panel y de la página; los
  // certificados que ya se emitieron con ella siguen diciendo lo mismo, porque
  // lo suyo quedó congelado al emitirlos.
  premios: [
    { id: "campeon", label: "Campeón", ambito: "equipo", cls: "oro" },
    { id: "subcampeon", label: "Subcampeón", ambito: "equipo", cls: "plata" },
    { id: "mvp", label: "MVP de la final", ambito: "persona", cls: "bronce" },
  ],
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

  // Los premios de la jam. Aquí no hay nota que calcular —quién hizo el mejor
  // apartado artístico lo decide un jurado mirando los juegos—, así que el
  // panel los adjudica a mano y de aquí sale la lista.
  //
  // El certificado de participación no está en esta lista y no hace falta que
  // esté: lo recibe todo el que entregó, sin que nadie lo declare.
  premios: [
    { id: "mejor-juego", label: "Mejor juego", ambito: "equipo", cls: "oro" },
    { id: "mejor-tema", label: "Mejor uso del tema", ambito: "equipo", cls: "plata" },
    { id: "mejor-arte", label: "Mejor apartado artístico", ambito: "equipo", cls: "bronce" },
  ],
};

// ---------------------------------------------------------------------
//  MULTIMEDIA MUSIC FEST
// ---------------------------------------------------------------------
// Una tarde de música y baile con los grupos culturales de la universidad, y
// con la producción —luces, sonido y visuales— en manos de estudiantes del
// programa. Se organiza desde Edición de Audio y Video, pero el equipo no se
// limita a esa asignatura: quien quiera pararse detrás de la consola puede.
//
// Hay UNA edición por semestre y se abre sola al arrancar, como la jam.
//
//   cupo_actos      — cuántos grupos caben en el cartel. Una tarde no da para
//                     más, y un cartel sin tope termina en veinte grupos de
//                     diez minutos cada uno. null = sin tope.
//   cupo_produccion — cuántas manos caben detrás. null = sin tope.
//   tipos           — qué sube a la tarima. El selector del formulario sale
//                     de aquí.
//   areas           — de qué se encarga el equipo. Cada área es una consola
//                     distinta y por eso se elige una, no varias: la persona
//                     que mezcla no está moviendo luces al mismo tiempo.
//                     Agregar o quitar una es todo lo que hace falta.
const MUSIC = {
  cupo_actos: 8,
  cupo_produccion: 15,
  tipos: ["Grupo musical", "Grupo de baile", "Grupo de teatro"],
  areas: [
    { id: "sonido", nombre: "Sonido", desc: "Consola, microfoneo, monitores y la mezcla de sala." },
    { id: "luces", nombre: "Luces", desc: "Diseño de iluminación y operación durante el show." },
    { id: "visuales", nombre: "Visuales", desc: "Contenido en pantalla, VJ y cámaras." },
  ],

  // Los reconocimientos de la tarde. El festival no es una competencia y por
  // eso son pocos y no hay podio: se trata de nombrar lo que se destacó, no de
  // ordenar a nadie.
  //
  //   ambito — 'acto' se adjudica a un grupo del cartel y 'produccion' a
  //            alguien del equipo técnico. Son dos listas distintas porque son
  //            dos tablas distintas.
  premios: [
    { id: "mejor-acto", label: "Mejor acto del festival", ambito: "acto", cls: "oro" },
    { id: "revelacion", label: "Revelación del cartel", ambito: "acto", cls: "plata" },
    {
      id: "produccion-destacada",
      label: "Reconocimiento de producción",
      ambito: "produccion",
      cls: "bronce",
    },
  ],
};

// Contraseña del panel del Music Fest (PASSWORD_MUSIC en el .env). Quinta
// herramienta, quinta clave, por la misma razón que las otras cuatro.
const PASSWORD_MUSIC = String(process.env.PASSWORD_MUSIC || "").trim();

// ---------------------------------------------------------------------
//  SALIDAS PEDAGÓGICAS
// ---------------------------------------------------------------------
// Esto NO es un evento del programa: es una salida académica —SOFA, una feria,
// un museo, una visita a un estudio— y por eso no está en EVENTOS ni le pelea
// la raíz "/" a nadie. Vive siempre en /salidas y se comparte por enlace.
//
// La página es UNA sola y sirve para todas: lo que cambia de una salida a otra
// —a dónde se va, cuándo, para qué, qué asignaturas van y quién cobra— está
// aquí abajo y en ningún otro lado. Agregar una salida es agregar un objeto a
// la lista; el sitio y el panel salen de eso.
//
// El trámite es siempre el mismo y por eso está escrito en el código y no aquí:
//
//   1. el estudiante se registra y le queda un código;
//   2. descarga el consentimiento y lo hace firmar de sus padres o acudientes;
//   3. lleva el consentimiento firmado y le paga al docente el transporte y la
//      póliza —el consentimiento se revisa ahí, en persona—;
//   4. el docente marca los dos pagos en el panel y al estudiante le llega el
//      correo que lo deja confirmado para la salida.
//
// Los campos de cada salida:
//
//   id            — la dirección (/salidas/sofa-2026) y lo que queda guardado
//                   en cada registro. No se cambia una vez repartida.
//   inscripciones — true mientras el formulario reciba gente. A diferencia de
//                   los eventos, aquí no hay bandera "activo": puede haber dos
//                   salidas abiertas a la vez, porque son de asignaturas
//                   distintas y no compiten por el semestre.
//   salida        — AAAA-MM-DD HH:MM de cuándo arranca el bus.
//   regreso       — lo mismo, para la hora de recogida.
//   punto         — de dónde sale y a dónde vuelve.
//   costos        — lo que se paga, en pesos. null = "consultar con el docente".
//   cupo          — cuántos caben en el bus. null = sin tope.
//   docente       — quién cobra y cómo ubicarlo. Es el dato más importante de
//                   la página: sin eso nadie puede pagar.
//   consentimiento— el archivo que se descarga, servido desde public/.
const SALIDAS = {
  // Los documentos que puede tener un estudiante. Lo que no esté en esta lista
  // no se guarda: el selector la ofrece, pero el formulario lo manda cualquiera.
  tipos_id: [
    "Cédula de ciudadanía",
    "Tarjeta de identidad",
    "Cédula de extranjería",
    "Pasaporte",
  ],

  // Las normas de la salida. Son las mismas para todas —es un tema de la
  // universidad, no de la feria a la que se vaya—, así que se escriben una vez
  // y salen en la página, en la consulta del código y en los dos correos.
  normas: [
    "El estudiante viaja en el transporte contratado, de ida y de regreso. Irse por cuenta propia sin avisar al docente encargado deja al grupo buscando a alguien que no está.",
    "Se respetan las horas de salida y de recogida. El bus no espera: quien no esté a la hora de regreso se devuelve por sus propios medios y bajo su propia responsabilidad.",
    "Durante toda la salida se representa a la Universidad de Boyacá y al programa. Lo que se haga allá se responde aquí.",
    "Prohibido el consumo de alcohol y de sustancias psicoactivas antes y durante la salida.",
    "Se acatan las indicaciones del docente encargado y las normas del lugar que se visita.",
    "Quien tenga una condición médica, un tratamiento o una alergia se lo informa al docente encargado ANTES de la salida.",
    "El estudiante responde por sus objetos personales y por cualquier daño que cause en el transporte o en el lugar visitado.",
  ],

  // Las dos advertencias que hay que decir de frente y antes de que alguien
  // pague, no en letra chica después. Van juntas en la página, en la consulta
  // y en los correos.
  advertencias: [
    "Una vez realizado el pago, la inasistencia no es causal de reembolso del valor pagado.",
    "El incumplimiento de cualquiera de las normas durante la salida es causal de llamado de atención, informado a la dirección del programa y a decanatura.",
  ],

  salidas: [
    {
      id: "sofa-2026",
      nombre: "SOFA 2026",
      lema: "El Salón del Ocio y la Fantasía, en Bogotá.",
      lugar: "Corferias · Bogotá",
      objetivo:
        "Recorrer la feria de industrias creativas más grande del país: videojuegos nacionales, animación, cómic, cosplay y las empresas que contratan multimedia. Se va a ver qué se está produciendo y quién lo produce.",
      asignaturas: ["Diseño de Videojuegos", "Animación 3D", "Producción Multimedia"],
      inscripciones: true,
      salida: "2026-10-16 05:00",
      regreso: "2026-10-16 23:00",
      punto: "Portería principal · Universidad de Boyacá, sede Tunja",
      cupo: 40,
      costos: { transporte: 55000, poliza: 9000 },
      consentimiento: "/documents/CONSENTIMIENTO.docx",
      docente: {
        nombre: "Jose Rentería",
        email: "jmrenteria@uniboyaca.edu.co",
        telefono: "320 000 0000",
        donde: "Oficina de Multimedia · lunes a viernes, 8:00 a. m. a 12:00 m.",
      },
    },
    {
      id: "museo-del-oro",
      nombre: "Museo del Oro y Centro de Memoria",
      lema: "Una mañana de patrimonio y narrativa, en Bogotá.",
      lugar: "Museo del Oro · Bogotá",
      objetivo:
        "Ver cómo se cuenta una historia sin palabras: museografía, iluminación, recorrido y las piezas interactivas del museo. Es una salida de observación para Narrativa Visual y Diseño de Experiencias, y se vuelve con un registro fotográfico del montaje.",
      asignaturas: ["Narrativa Visual", "Diseño de Experiencias"],
      inscripciones: true,
      salida: "2026-09-11 06:30",
      regreso: "2026-09-11 18:00",
      punto: "Portería principal · Universidad de Boyacá, sede Tunja",
      cupo: 25,
      costos: { transporte: 38000, poliza: 9000 },
      consentimiento: "/documents/CONSENTIMIENTO.docx",
      docente: {
        nombre: "Jose Rentería",
        email: "jmrenteria@uniboyaca.edu.co",
        telefono: "320 000 0000",
        donde: "Oficina de Multimedia · lunes a viernes, 8:00 a. m. a 12:00 m.",
      },
    },
  ],
};

// ---------------------------------------------------------------------
//  PATROCINIOS DE LA EXPO
// ---------------------------------------------------------------------
// Las marcas que acompañan la Expo. Son DOS cosas separadas y conviene no
// mezclarlas:
//
//   · las que YA acompañan y salen en la página se curan a mano en
//     data/expo.json, con su logo en public/images. Ahí se decide qué se
//     publica, y ahí y en ningún otro lado;
//   · lo de aquí abajo es solo la puerta: el formulario donde una marca deja
//     sus datos. Que llegue una solicitud no publica a nadie.
//
//   abierto   — true mientras el formulario reciba propuestas. Es una bandera
//               PROPIA y no la de "inscripciones" del evento: los patrocinios
//               se buscan con meses de anticipación y en otro calendario, así
//               que cerrarle el registro a los estudiantes no tiene por qué
//               cerrarle la puerta a un patrocinador.
//   avisar_a  — a dónde llega cada solicitud. No hay panel donde revisarlas:
//               esto es la bandeja de entrada.
//   tipos     — lo que puede ofrecer una marca. El selector del formulario
//               sale de esta lista; agregar o quitar una es todo lo que hace
//               falta.
const PATROCINIOS = {
  abierto: true,
  avisar_a: "jmrenteria@uniboyaca.edu.co",
  tipos: [
    "Patrocinio económico",
    "Premios o insumos",
    "Charla o taller",
    "Difusión y medios",
    "Otro",
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

// Contraseña del panel de las salidas pedagógicas (PASSWORD_SALIDAS en el
// .env). Aquí la separación importa más que en las otras: quien opera este
// panel está confirmando pagos en efectivo, y eso no tiene por qué abrirse con
// la misma clave con la que se califica un proyecto.
const PASSWORD_SALIDAS = String(process.env.PASSWORD_SALIDAS || "").trim();

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
  SOLO_EVENTO_ACTIVO,
  VC,
  JAM,
  MUSIC,
  SALIDAS,
  PATROCINIOS,
  PASSWORD,
  PASSWORD_VC,
  PASSWORD_JAM,
  PASSWORD_MUSIC,
  PASSWORD_SALIDAS,
  DOCENTES,
  CORREO,
  CRITERIOS,
  CRITERIOS_IND,
  ESCALA_MAX,
};
