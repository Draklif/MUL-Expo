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
    activo: true,
    inscripciones: true,
    fecha: "2026-11-20",
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
    slug: "inkreible",
    nombre: "INKreible",
    activo: false,
    inscripciones: false,
    fecha: "",
    lema: "Veintiocho días, veintiocho palabras, veintiocho dibujos.",
    datos: "inkreible.json",
    vista: "ink/landing",
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
//  QUÉ ESTÁ APROBADO
// ---------------------------------------------------------------------
// El listado de todo lo que el sitio puede enseñar al público, con un sí o un
// no al lado. En false, esa parte del sitio DEJA DE EXISTIR hacia afuera:
//
//   · no sale su banda en el índice del programa (/info) ni su atajo;
//   · sus páginas públicas no responden —quien llegue por un enlace viejo o
//     sabiéndose la dirección sale rebotado a la raíz—;
//   · si es un evento, tampoco puede quedarse con la raíz aunque tenga
//     activo: true, porque anunciarlo es justamente lo que no se puede.
//
// Esto NO es lo mismo que SOLO_EVENTO_ACTIVO, y por eso son dos banderas. Esa
// es de calendario —"ahora manda este y los demás se apartan"— y lo que
// aparta se sigue contando en /info como parte de lo que hizo el programa.
// Esta es de PERMISO: un evento que la facultad todavía no aprueba no es que
// esté fuera de temporada, es que no se puede anunciar todavía. Por eso aquí
// no queda ni el rastro de que existe.
//
// Lo que NO apaga nunca, igual que la otra bandera: los paneles (el docente
// tiene que poder preparar lo que aún no se aprueba) y los certificados ya
// emitidos, cuyo QR está impreso.
//
// Las cuatro primeras claves son slugs de EVENTOS; las dos últimas son las
// partes del sitio que no son eventos. Lo que no esté en esta lista se
// considera aprobado: así un evento nuevo aparece desde el minuto uno y no
// desaparece por un olvido.
const APROBADO = {
  expo: true,
  "virtual-champions": false,
  "jam-de-altura": true,
  inkreible: true,
  "music-fest": false,

  // No son eventos: van por su cuenta y se apagan por su cuenta.
  salidas: false,
  semillero: true,
};

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
    // ---- DATOS DE PRUEBA: las tres salidas pasadas que llenan el archivo de
    // /info ("a dónde se ha ido"). Se borran quitando estos tres objetos.
    {
      id: "sofa-2024",
      nombre: "SOFA 2024",
      lema: "El Salón del Ocio y la Fantasía, en Bogotá.",
      lugar: "Corferias · Bogotá",
      objetivo:
        "La primera salida del programa a la feria: videojuegos nacionales, animación y las empresas que contratan multimedia.",
      asignaturas: ["Diseño de Videojuegos", "Animación 3D"],
      inscripciones: false,
      salida: "2024-10-18 05:00",
      regreso: "2024-10-18 23:00",
      punto: "Portería principal · Universidad de Boyacá, sede Tunja",
      cupo: 40,
      costos: { transporte: 45000, poliza: 8000 },
      consentimiento: "/documents/CONSENTIMIENTO.docx",
      docente: {
        nombre: "Jose Rentería",
        email: "jmrenteria@uniboyaca.edu.co",
        telefono: "320 000 0000",
        donde: "Oficina de Multimedia · lunes a viernes, 8:00 a. m. a 12:00 m.",
      },
    },
    {
      id: "chicaque-2025",
      nombre: "Parque Chicaque",
      lema: "Captura de exteriores en el bosque de niebla.",
      lugar: "Chicaque · San Antonio del Tequendama",
      objetivo:
        "Salida de captura: fotogrametría de troncos y piedra, grabación de ambientes y referencia de luz natural para los proyectos de tiempo real.",
      asignaturas: ["Producción Multimedia", "Animación 3D"],
      inscripciones: false,
      salida: "2025-04-25 06:00",
      regreso: "2025-04-25 19:00",
      punto: "Portería principal · Universidad de Boyacá, sede Tunja",
      cupo: 25,
      costos: { transporte: 42000, poliza: 8000 },
      consentimiento: "/documents/CONSENTIMIENTO.docx",
      docente: {
        nombre: "Manuel Corredor",
        email: "mancorredor@uniboyaca.edu.co",
        telefono: "320 000 0000",
        donde: "Oficina de Multimedia · lunes a viernes, 8:00 a. m. a 12:00 m.",
      },
    },
    {
      id: "canal-capital",
      nombre: "Canal Capital",
      lema: "Un día en un canal de televisión de verdad.",
      lugar: "Canal Capital · Bogotá",
      objetivo:
        "Recorrido por estudios, control maestro, switcher y sala de edición. Se ve cómo se produce en vivo y con qué equipo, que es lo que no cabe en un salón.",
      asignaturas: ["Edición de Audio y Video"],
      inscripciones: false,
      salida: "2025-09-12 06:00",
      regreso: "2025-09-12 18:00",
      punto: "Portería principal · Universidad de Boyacá, sede Tunja",
      cupo: 20,
      costos: { transporte: 40000, poliza: 8000 },
      consentimiento: "/documents/CONSENTIMIENTO.docx",
      docente: {
        nombre: "Juan Niño",
        email: "juaestnino@uniboyaca.edu.co",
        telefono: "320 000 0000",
        donde: "Oficina de Multimedia · lunes a viernes, 8:00 a. m. a 12:00 m.",
      },
    },
    // ---- fin de los datos de prueba
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

// ---------------------------------------------------------------------
//  INKREIBLE
// ---------------------------------------------------------------------
// El reto de dibujo: una palabra por día durante cuatro semanas. Aquí no hay
// equipos —se participa solo— y tampoco hay un reloj de horas: la unidad es
// el DÍA, y de la fecha de arranque sale todo lo demás (qué palabra toca hoy,
// en qué semana vamos y cuántos días quedan).
//
// Como en la jam, lo que se repite cada semestre es la EDICIÓN entera, y la
// abre sola db/database.js al arrancar con el semestre de PERIODO. Estos
// números son los que se copian a la fila al crearla: cada edición guarda los
// suyos, así que cambiarlos aquí no toca las que ya pasaron.
//
//   dias        — cuántos dibujos tiene el reto. 28 = cuatro semanas justas.
//   semanas     — en cuántos tramos se parte. dias/semanas tiene que dar
//                 entero: es lo que decide a qué semana pertenece cada día y
//                 cuántos ganadores semanales hay.
//   cupo        — tope de participantes por edición. null = sin tope.
//   top         — cuántos dibujos entran en el top del final.
//   por_tecnica — cuántos se premian de cada técnica (digitales y análogos).
//   tecnicas    — con qué se puede dibujar. El `id` va en el nombre del
//                 archivo que sube el estudiante (la nomenclatura), así que no
//                 se cambia una vez repartida; `sigla` es lo que se teclea.
//   nomenclatura— cómo se tiene que llamar cada archivo en el Drive. Las
//                 piezas entre llaves las reemplaza el sitio con los datos de
//                 cada quien, así que la plantilla se puede reescribir entera
//                 sin tocar código.
const INK = {
  dias: 28,
  semanas: 4,
  cupo: null,
  top: 10,
  por_tecnica: 3,
  tecnicas: [
    { id: "digital", label: "Digital", sigla: "DIG" },
    { id: "analogo", label: "Análogo", sigla: "ANA" },
  ],
  nomenclatura: "{CODIGO}_{DIA}_{TECNICA}",
};

// ---------------------------------------------------------------------
//  SEMILLERO DE INVESTIGACIÓN — SAMI
// ---------------------------------------------------------------------
// Tampoco es un evento. Es una alternativa de grado que dura TRES semestres y
// que está andando siempre, así que no va en EVENTOS, no le pelea la raíz "/"
// a nadie y no la apaga SOLO_EVENTO_ACTIVO. Vive en /semillero.
//
// QUÉ ES ESTA PARTE DEL SITIO, que conviene tener claro antes de tocarla: una
// herramienta del semillero para adelantar trabajo, no un trámite. El trámite
// se hace en persona —en la dirección del programa, en el Consejo de Facultad y
// con el docente que asesora la propuesta— y aquí no se sustituye ninguno de
// esos pasos. Lo que hace el formulario es dejar los datos del estudiante
// escritos una sola vez, para que cuando llegue a esas puertas no haya que
// volver a copiarlos.
//
// De ahí sale una regla que se nota en varios sitios: la página NUNCA dice que
// algo "ya quedó hecho". Dice qué sigue y a dónde hay que ir.
//
// El trámite en sí está escrito en el código —es el mismo desde hace años y no
// lo cambia un docente— pero el TEXTO con el que se le cuenta al estudiante sí
// está aquí abajo, en `pasos` y `etapas`, porque eso sí se reescribe.
//
// Lo que NO está aquí y conviene saber dónde está: la escalera de estados del
// proyecto (de "intención registrada" hasta "finalizado") vive en lib/sami.js.
// Es una máquina de estados, no una preferencia: si estuviera aquí, cambiar una
// clave rompería los proyectos ya guardados sin avisar.
//
//   inscripciones   — true mientras el formulario de intención reciba gente.
//                     Cerrarlo no borra nada: los proyectos en curso siguen
//                     igual y el panel sigue funcionando.
//   semestre_minimo — desde qué semestre de la carrera se puede entrar. El
//                     formulario rechaza a quien escriba menos.
//   semestres       — cuántos dura el proyecto. Es el tope que el panel avisa
//                     cuando alguien va por el IV.
//   horas_semestre  — las que pide el plan de trabajo del G-01-SEM por
//                     semestre. Solo se muestra; no se lleva la cuenta.
//   calendario      — LAS FECHAS DE INICIO de cada semestre de reuniones, y
//                     cuántas semanas dura uno. Las dieciséis semanas NO se
//                     escriben en ninguna parte: salen solas de esa fecha, una
//                     cada siete días, y con ellas los rótulos "S1 · 3 a 7 de
//                     agosto" que hoy titulan cada hoja del archivo de
//                     seguimiento.
//
//                     `inicios` es un MAPA y no una fecha suelta, y esa es toda
//                     la diferencia: al empezar semestre se AGREGA un renglón,
//                     no se reemplaza el de antes. Con una sola fecha, abrir el
//                     semestre pasado en el panel mostraba las semanas del
//                     actual —o ninguna—, porque el calendario contra el que se
//                     dibujaban se había sobrescrito. Un archivo de seguimiento
//                     que no puede enseñar el semestre pasado no es un archivo.
//
//                     Al semestre que no tenga renglón aquí no le pasa nada
//                     grave: el panel funciona igual y solo deja de dibujarle la
//                     tira de semanas, diciendo por qué.
//
//                     Es lo ÚNICO que hay que cambiar al empezar semestre,
//                     junto con PERIODO.
//   desde           — el semestre más antiguo del que hay datos del semillero.
//                     El panel no ofrece semestres anteriores: la base tiene
//                     periodos viejos de otros módulos, y un selector con
//                     semestres en los que el semillero no existía solo sirve
//                     para abrir páginas vacías.
//
//                     NO hace falta moverlo al agregar calendarios: un semestre
//                     con renglón en `inicios` ya se ofrece, porque escribirle
//                     su lunes de arranque es decir que el semillero existía
//                     entonces. Manda la más antigua de las dos cosas. Antes
//                     había que tocar las dos y era una trampa: se agregaban
//                     cuatro calendarios viejos y el selector seguía igual.
//
//                     Sirve para lo que `inicios` no cubre: un semestre del que
//                     hay proyectos pero no reuniones —los que vinieron de la
//                     hoja vieja— y al que por eso nadie le escribió calendario.
//   direccion       — a dónde hay que ir a notificar la intención. Es el dato
//                     más importante de la página: sin eso el estudiante se
//                     queda con un código y sin saber qué hacer con él.
//   formato         — la guía de propuesta, servida desde public/.
//   perfiles        — con qué se siente cómodo el estudiante. NO es la línea
//                     de investigación ni decide qué proyecto va a hacer.
//   linea/sublinea  — las del programa, que son fijas y las mismas para todos.
//                     Se muestran para que el estudiante las copie en su
//                     G-01-SEM; no se le preguntan ni se guardan por proyecto.
const SAMI = {
  nombre: "SAMI",
  completo:
    "Semillero de investigación en aplicaciones, ambientes interactivos, " +
    "animación y contenido multimedia",
  lema: "Investigar en multimedia como alternativa de grado.",

  inscripciones: true,
  semestre_minimo: 6,
  semestres: 3,
  horas_semestre: 64,

  // El lunes de la S1 de CADA semestre, y cuántas semanas dura uno. Todo lo
  // demás se calcula. Al estrenar semestre se agrega un renglón arriba; los de
  // abajo se quedan para siempre, que es lo que permite abrir el semestre
  // pasado y ver sus semanas como eran.
  calendario: {
    semanas: 16,
    inicios: {
      "2026-20": "2026-08-03",
      "2026-10": "2026-02-02",
      "2025-20": "2025-08-04",
      "2025-10": "2025-02-03",
      "2024-20": "2024-08-05",
      "2024-10": "2024-02-05",
      "2023-20": "2023-08-07",
    },
  },

  // Del semillero solo hay datos desde este semestre.
  desde: "2025-20",

  formato: "/documents/G-01-SEM.docx",

  direccion: {
    nombre: "Ing. Mauricio Ochoa Echeverría",
    cargo: "Director del Programa de Ingeniería en Multimedia",
    email: "ingenmultimedia@uniboyaca.edu.co",
    donde: "Oficina de Dirección del Programa · EM2",
  },

  // La línea y la sublínea del semillero son las del programa: fijas y las
  // mismas para todos los proyectos. Por eso son dos textos y no una lista de
  // opciones, y por eso no se le preguntan al estudiante: se le muestran para
  // que las copie tal cual en su G-01-SEM.
  //
  // Vacías = no se muestran. Llénalas con las que estén aprobadas.
  linea: "",
  sublinea: "",

  // Los cuatro perfiles del semillero, que son los cuatro que trae su propio
  // nombre. Es con cuál se siente cómodo el estudiante, no la línea de
  // investigación y no lo que va a terminar haciendo: sirve para saber a quién
  // ponerlo a hablar con quién, y nada más.
  perfiles: [
    {
      clave: "aplicaciones",
      nombre: "Aplicaciones",
      texto: "Software a la medida: aplicaciones móviles, web y de escritorio.",
    },
    {
      clave: "interactivos",
      nombre: "Ambientes interactivos",
      texto: "Realidad virtual y aumentada, recorridos, videojuegos e instalaciones.",
    },
    {
      clave: "animacion",
      nombre: "Animación",
      texto: "Animación 2D y 3D, modelado y dirección de arte.",
    },
    {
      clave: "contenido",
      nombre: "Contenido multimedia",
      texto: "Audiovisual, sonido, narrativas interactivas y divulgación.",
    },
  ],

  // El trámite, tal como se le cuenta al estudiante. Cuatro pasos, y los cuatro
  // se hacen FUERA de esta página: el orden importa y la página los numera
  // sola.
  pasos: [
    {
      titulo: "Notificas tu intención en la dirección del programa",
      texto:
        "Desde sexto semestre vas a hablar con la dirección del programa y le dices que quieres pertenecer al semillero. Es en persona y es el paso que abre todo lo demás.",
    },
    {
      titulo: "Radicas la carta al Consejo de Facultad",
      texto:
        "Una carta donde indicas que tomarás Semillero de Investigación como tu alternativa de grado. Sin ese radicado el proceso no avanza.",
    },
    {
      titulo: "Construyes la propuesta con un asesor",
      texto:
        "Contactas a un docente del programa para que te asesore y diligencias con él la guía G-01-SEM, que descargas de esta página. Con ese docente queda formalizada tu vinculación al semillero.",
    },
    {
      titulo: "Estudian tu propuesta",
      texto:
        "El comité la revisa y te informa si queda aprobada y quiénes serán tu director y —si aplica— tu codirector. Ahí empieza tu primer semestre en el semillero.",
    },
  ],

  // Las tres etapas de los tres semestres. Varían según el proyecto, y por eso
  // se dicen como lo que son: lo que usualmente ocupa cada semestre.
  etapas: [
    {
      titulo: "Anteproyecto y comités",
      texto:
        "Presentación y sustentación del anteproyecto ante jurados, y aprobación del Comité de Ética y Bioética y —si aplica— del Comité de Propiedad Intelectual.",
    },
    {
      titulo: "Desarrollo y documentación",
      texto:
        "El grueso del trabajo: construir lo que se propuso y dejarlo escrito en el documento del proyecto.",
    },
    {
      titulo: "Sustentaciones y ajustes finales",
      texto:
        "Radicación del documento, sustentación final del proyecto y las correcciones que dejen los jurados.",
    },
  ],
};

// Contraseña del panel del semillero (PASSWORD_SAMI en el .env). Séptima
// herramienta, séptima clave. Aquí se guardan calificaciones y notas de
// semestre, que es dato de otra naturaleza que una inscripción a un torneo.
const PASSWORD_SAMI = String(process.env.PASSWORD_SAMI || "").trim();

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

// Y la de INKreible, misma razón de siempre. Va en el .env (PASSWORD_INK).
const PASSWORD_INK = String(process.env.PASSWORD_INK || "").trim();

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
  APROBADO,
  VC,
  JAM,
  MUSIC,
  SALIDAS,
  INK,
  SAMI,
  PATROCINIOS,
  PASSWORD,
  PASSWORD_VC,
  PASSWORD_JAM,
  PASSWORD_MUSIC,
  PASSWORD_SALIDAS,
  PASSWORD_INK,
  PASSWORD_SAMI,
  DOCENTES,
  CORREO,
  CRITERIOS,
  CRITERIOS_IND,
  ESCALA_MAX,
};
