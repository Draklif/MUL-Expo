# Expo Eval — Evaluación en vivo Expo Multimedia

App en Node.js + SQLite para que varios docentes califiquen proyectos desde el
celular durante el evento, con promedios en tiempo real.

## Requisitos

- **Node.js 22.5 o superior** (la app usa `node:sqlite`, módulo incorporado, sin compilar nada).
  Verifícalo con: `node --version`
- (Opcional) **ngrok** para exponer el servidor a internet.

## Instalación

```bash
npm install
```

Solo descarga Express, EJS, session, `qrcode-svg` (para el QR de los
certificados) y `nodemailer` (para los correos). Ninguno tiene dependencias
propias y **no se compila nada nativo.**

La configuración vive en dos archivos, y la diferencia importa: **`config.js`
se sube a git y el `.env` no.**

Abre `config.js` —cómo funciona la app— y:

1. Pon `PERIODO`, el semestre en curso (`2026-20`). Es **el** interruptor del
   sitio: todo lo que hagan los estudiantes cuelga de ahí. Ver
   [Semestres](#semestres).
2. En `EVENTOS`, marca con `activo: true` el evento del semestre —uno solo— y
   con `inscripciones: true` el día que abras el formulario. Ver
   [Los eventos](#los-eventos).
3. Ajusta el array `DOCENTES`: cada uno con su `name` y su `email`
   institucional, que es con lo que entra.
4. Ajusta `CRITERIOS` si quieres otros nombres de rúbrica.
5. Cambia `ESCALA_MAX` si prefieres 0-10 en vez de 0-5.

Copia `.env.example` como `.env` —lo secreto— y llénalo:

| Variable | Para qué | ¿Obligatoria? |
|---|---|---|
| `PASSWORD_DOCENTES` | La contraseña compartida de los docentes | **Sí**: sin ella la app no arranca |
| `PASSWORD_VC`, `PASSWORD_JAM`, `PASSWORD_INK` | Los paneles del torneo, la jam y el reto de dibujo: [una clave por herramienta](#las-dos-caras-de-la-app) | No: sin una de ellas ese panel queda cerrado y el resto del sitio funciona igual |
| `SESSION_SECRET` | Firma las cookies de sesión | No, pero sin ella cada reinicio cierra las sesiones |
| `PORT` | Puerto del servidor (vacío = 3000) | No |
| `EVENTO` | Clava la raíz en un [evento](#los-eventos) (vacío = manda la fecha) | No |
| `SMTP_USER`, `SMTP_PASS`, `SITIO_URL` | Los [correos automáticos](#correos-automáticos) | No: sin ellas no salen avisos y ya |

> **Nada de contraseñas en `config.js`.** Con la clave a la vista en el
> repositorio y los correos de `DOCENTES` al lado, cualquiera que lo lea entra
> al panel a aprobar registros o borrar materias. Lo mismo con la firma de las
> sesiones: si es un texto fijo en el código, se fabrica la cookie de un
> docente sin necesitar la contraseña. Por eso las dos salieron a `.env`.

`DOMINIO` es el dominio institucional (`uniboyaca.edu.co`). Todo correo de la
app —el de los docentes al entrar y el de los estudiantes al registrarse— tiene
que terminar en él; cualquier otro se rechaza.

> Agregar docentes a `config.js` y reiniciar los suma sin tocar lo existente.
> **La identidad es el `name`**: corregir un correo mal escrito actualiza a la
> misma persona y conserva sus materias, calificaciones y revisiones. Quitar a
> alguien de la lista lo borra solo si no dejó datos; si dejó, se conserva (con
> un aviso en consola) y simplemente deja de poder entrar.

## Cómo entran los docentes

En `/acceso`, con **correo institucional + la contraseña compartida**
(`PASSWORD_DOCENTES` en el `.env`). El correo dice quién es cada quien; la
contraseña es la segunda barrera. Ya no hay lista de nombres desplegable: quien
no sepa un correo válido no ve a nadie.

Si el correo o la clave están mal, el mensaje es el mismo ("Correo o contraseña
incorrectos") para que la página no sirva para averiguar quiénes son docentes.
El login aguanta 10 intentos cada 10 minutos por dispositivo.

## Arrancar

```bash
npm start
```

Verás (la primera línea es el evento que esté vigente):

```
  ✓ Expo Multimedia en http://localhost:3000
  · Virtual Champions        http://localhost:3000/virtual-champions
  · Jam de Altura            http://localhost:3000/jam-de-altura
  · INKreible                http://localhost:3000/inkreible
  · Multimedia Music Fest    http://localhost:3000/music-fest
  ✓ Acceso docentes:         http://localhost:3000/acceso
  ✓ Panel Virtual Champions: http://localhost:3000/vc/acceso
  ✓ Panel Jam de Altura:     http://localhost:3000/jam/acceso
  ✓ Panel INKreible:         http://localhost:3000/ink/acceso
  ✓ Para exponer con ngrok:  ngrok http 3000
```

Abre `http://localhost:3000` en el navegador del PC.

## Las dos caras de la app

| Ruta | Quién entra | Qué es |
|---|---|---|
| `/` | Cualquiera, sin login | El [evento vigente](#los-eventos); si no hay ninguno activo, manda a `/info` |
| `/info` | Cualquiera, sin login | El [índice del programa](#el-índice-del-programa-info): todos los eventos y las salidas |
| `/expo` | Cualquiera, sin login | Página pública de la Expo: el recorrido, el plano, los horarios |
| `/virtual-champions`, `/jam-de-altura`, `/inkreible`, `/music-fest` | Cualquiera, sin login | Los otros eventos del programa |
| `/expositores` | Estudiantes, sin login | Guía de montaje: qué debe tener el stand |
| `/registro` | Estudiantes, sin login | Registro de expositores |
| `/registro/estado` | Estudiantes, sin login | Consulta del estado con el código |
| `/certificado/:codigo` | Cualquiera, sin login | Certificado a pantalla completa (a donde apunta su QR) |
| `/acceso` | Docentes | Login (enlace discreto al pie de la página del evento) |
| `/panel` | Docentes | Materias, registros por revisar, estudiantes y proyectos |
| `/tablero` | Docentes | Ranking en vivo |
| `/jam/inscripcion` | Estudiantes, sin login | Inscripción a la [Jam de Altura](#jam-de-altura) |
| `/jam/inscripcion/estado` | Estudiantes, sin login | Consulta del código **y entrega del juego** |
| `/jam/equipos` | Cualquiera, sin login | Los equipos de la edición vigente |
| `/jam/acceso`, `/jam/panel` | Docentes | Panel de la jam, con **su propia contraseña** |
| `/vc/acceso`, `/vc/panel` | Docentes | Panel de Virtual Champions, con la suya |
| `/ink/inscripcion` | Estudiantes, sin login | Inscripción a [INKreible](#inkreible) |
| `/ink/inscripcion/estado` | Estudiantes, sin login | Consulta del código: **la carpeta, los nombres de archivo y los días que lleva** |
| `/ink/palabras` | Cualquiera, sin login | El calendario de las 28 palabras |
| `/ink/galeria` | Cualquiera, sin login | Todos los dibujos del reto |
| `/ink/resultados` | Cualquiera, sin login | El podio: semanas, top, digitales y análogos |
| `/ink/acceso`, `/ink/panel` | Docentes | Panel del reto, con la suya |
| `/salidas`, `/salidas/:id` | Estudiantes, sin login | Las [salidas pedagógicas](#salidas-pedagógicas): a dónde, cuándo, qué cuesta y las normas |
| `/salidas/:id/registro` | Estudiantes, sin login | Registro para una salida |
| `/salidas/estado` | Estudiantes, sin login | Consulta del código: en qué va el trámite y qué pago falta |
| `/salidas/acceso`, `/salidas/panel` | Docentes | Panel de salidas: confirmar pagos, con la suya |
| `/semillero` | Cualquiera, sin login | El [semillero SAMI](#semillero-de-investigación-sami): qué es, el trámite y en qué se está investigando |
| `/semillero/registro` | Estudiantes, sin login | Registro de la intención de entrar al semillero |
| `/semillero/estado` | Estudiantes, sin login | Consulta del código: en qué va el trámite y qué se comprometió a entregar |
| `/semillero/acceso`, `/semillero/panel` | Docentes | Panel del semillero: el trámite, las reuniones y las notas, con la suya |

Son **siete herramientas con siete contraseñas**: la de la Expo
(`PASSWORD_DOCENTES`), la del torneo (`PASSWORD_VC`), la de la jam
(`PASSWORD_JAM`), la del festival (`PASSWORD_MUSIC`), la del reto de dibujo
(`PASSWORD_INK`), la de las salidas (`PASSWORD_SALIDAS`) y la del semillero
(`PASSWORD_SAMI`). Los docentes son los mismos —la lista de `config.js`— pero
entrar a una no abre las otras. Si a una le falta su clave en el `.env`, ese panel
queda cerrado y todo lo demás funciona igual.

## Los eventos

El programa tiene varios eventos y **nunca hay dos a la vez**: un semestre es
de la Expo, o del torneo, o de la jam. Así que la raíz `/` no es un menú de
entrada: es directamente **el evento del semestre**. Quien llegue sin enlace ve
lo que hay, sin un clic de por medio.

Todo se maneja desde `EVENTOS`, en `config.js`:

```js
{ slug: "expo", nombre: "Expo Multimedia",
  activo: true, inscripciones: true,
  fecha: "2026-11-20", lema: "…", datos: "expo.json", vista: "landing" }
```

| Campo | Para qué |
|---|---|
| `activo` | `true` en **uno solo**: es el evento del semestre y el que toma la raíz `/` |
| `inscripciones` | `true` mientras el formulario reciba gente |
| `slug` | La dirección propia del evento (`/expo`). No se cambia una vez repartida |
| `fecha` | `AAAA-MM-DD` del día del evento. Vacío = "por confirmar" |
| `lema` | Una línea para la página de aviso, mientras no tenga la suya |
| `datos` | Archivo de `data/` con su contenido. Vacío = todavía no tiene |
| `vista` | Plantilla de `views/`. Vacío = usa `evento-proximo.ejs` |

### Las dos banderas

Son **el único** sitio donde se decide qué está pasando. No hay botones
equivalentes en ningún panel, y es a propósito: con un botón y una línea de
config diciendo lo mismo habría dos verdades, y tarde o temprano una de las dos
estaría equivocada.

- **`activo`** manda en la raíz. Al arrancar, la consola dice cuál quedó. Si
  hay dos marcados, avisa y manda con el primero; si no hay ninguno, la raíz
  lleva al [índice del programa](#el-índice-del-programa-info) —que es un
  estado normal del sitio, no una avería—.
- **`inscripciones`** abre y cierra el formulario del evento —el registro de
  expositores de la Expo, la inscripción de equipos del torneo, la de la jam—.
  Cerrarlo **no borra nada**: deja de admitir, y quien ya se inscribió sigue
  consultando su código igual. El botón de "Inscribirme" desaparece de las
  páginas en vez de quedarse ahí apagado.

Los dos candados se piden juntos: un evento con `inscripciones: true` que no
sea el activo **no recibe a nadie** (y la consola lo avisa al arrancar, porque
casi siempre significa que se marcó la bandera equivocada).

**Para probar sin tocar el archivo** está `EVENTO=slug` en el `.env`, que pesa
más que `activo` y sirve para mirar la página de otro evento un rato.

Cada evento vive **además** en su propia dirección, que no cambia nunca: la
Expo está siempre en `/expo`, esté o no en la raíz. Los enlaces repartidos
sirven antes y después de su turno, y el pie de todas las páginas lleva al
[índice del programa](#el-índice-del-programa-info), que es por donde se
descubren los demás.

**Un evento nuevo:** se agrega a la lista con su `slug` y ya es visitable —sale
la página de aviso, con el nombre, la fecha y el lema—. Cuando tenga contenido
se le crea su `data/*.json` y su vista, se apuntan en `datos` y `vista`, y la
dirección sigue siendo la misma. Si quiere identidad visual propia, la vista
puede pasarle otra hoja al head (`css: '/loquesea.css'`), que reemplaza a
`styles.css` entera en vez de apilarse encima.

## El índice del programa (`/info`)

Una página, y es la única pública que **no es de un evento**: es de Ingeniería
en Multimedia. Cuenta qué hace el programa fuera del salón —los cuatro eventos
y las salidas pedagógicas—, qué se hizo la última vez y qué viene.

Vive en dos sitios según el semestre:

- **con un evento activo**, es una página más. Se llega desde el pie de
  cualquier página pública ("Todo lo que hace el programa"), y desde ahí
  arriba se vuelve al evento en curso. Va en el pie y no en la cabecera a
  propósito: quien entró al sitio del festival vino al festival;
- **sin ningún evento activo**, la raíz `/` redirige aquí. Entre un semestre y
  otro no hay nada que anunciar, y dejar la portada del último evento se leería
  como si todavía estuviera pasando. La página lo dice de frente —"no hay
  ninguno en curso"— y enseña todo lo demás.

No tiene login ni formularios: aquí no se hace nada, se mira.

**Cómo está armada.** No es una rejilla de tarjetas: es una **pila de bandas**
a ancho completo, y cada banda se viste como el sitio del que habla —la Expo
editorial, el torneo negro y condensado, la jam de píxel, el festival como un
afiche y las salidas como papel—. Cinco tarjetas iguales no dirían qué es
ninguno de los cinco. Cada banda vive en su archivo (`views/info/banda-*.ejs`)
y la hoja es `public/info.css`, que define el armazón en variables y deja que
cada banda solo cambie sus colores y sus letras.

**De dónde sale lo que dice.** De `lib/programa.js`, y de ningún texto escrito
a mano:

- lo que **es** cada evento sale de su `data/*.json` y de `config.EVENTOS`;
- los **números** que lo definen (los juegos del torneo, las horas de la jam,
  las áreas del festival) salen de `config`;
- el **historial** —cuántos equipos, qué juegos se entregaron, quién ganó, qué
  grupos estuvieron en el cartel— se **cuenta** contra la base, semestre por
  semestre. Solo entra lo aprobado o confirmado, y de las salidas pasadas se
  dice cuántos *viajaron*, no cuántos se registraron.

Un evento sin historial todavía sale igual, con lo que se sabe de él; y un
evento nuevo en `config.EVENTOS` que aún no tenga banda propia cae en la
genérica y aparece desde el minuto uno.

**Cuando ya hay años acumulados.** Cada banda enseña completas solo las
últimas ediciones y de ahí para atrás cada semestre se queda en un renglón —las
cifras y la cosa que lo distingue: el tema de la jam, el cabeza de cartel, quién
ganó—. Pasado ese segundo tope, se dicen cuántas más hubo y desde cuándo:

| Banda | Completas | En un renglón | Después |
|---|---|---|---|
| Expo | 6 semestres en la tabla | — | "Y N semestres más, desde…" |
| Virtual Champions | el último torneo de cada juego | 6 semestres | "Y N ediciones más" |
| Jam de Altura | 3 ediciones | 6 | "Y N ediciones más, desde…" |
| Music Fest | 3 carteles | 6 | "Y N ediciones más, desde…" |
| Salidas | las que vienen, todas | 8 pasadas | manda a `/salidas` |

Los topes están en cada `views/info/banda-*.ejs` (`TOPE` y `RESTO`) y no en un
sitio común: lo que cabe depende de lo que ocupa cada pieza —un cartel del
festival ocupa lo que ocupa, un renglón de tabla no—. Con esto la página se
estabiliza: probada con **catorce semestres** de historia mide ~8.300 px, casi
lo mismo que con ocho, y de ahí en adelante solo cambian los números de las
líneas de "y N más".

**Con `SOLO_EVENTO_ACTIVO: true`**, los eventos que no son el del semestre se
siguen contando —fueron parte de lo que hizo el programa— pero **sin enlace**:
un botón que rebota al visitante de vuelta sin explicarle nada es peor que no
ponerlo. Y esa bandera no bloquea nada cuando no hay evento activo: sin nadie a
quien darle la exclusiva, cerrarlo todo dejaría el índice lleno de enlaces
muertos.

## Virtual Champions

El torneo de esports: clasificatorias en línea y final en vivo. Vive en
`/virtual-champions`, con identidad propia (`public/vc.css`), su propia base
(`vc_*`) y su propio panel.

**Los juegos salen de `config.VC.juegos`.** Agregar o quitar uno de esa lista
es todo lo que hace falta para que aparezca (o desaparezca) del sitio y del
panel: nada más en el código nombra a Valorant ni a League of Legends. Cada uno
trae su `acento`, cuántos `titulares` lleva un equipo, sus `roles` y cómo se
llama el nick.

Hay **un torneo por juego y por semestre**, y se abren solos al arrancar. Ver
[Semestres](#semestres).

### El juego manda en el color

El `acento` de cada juego se inyecta en `--juego` y toda la hoja lee esa
variable, así que la página entera —cabecera, botones, marcadores— se pinta del
color del juego que se está viendo. Agregar un juego nuevo no pide tocar ni una
regla de CSS.

Tres páginas no llevan el juego en la dirección: la portada, la inscripción y
la consulta del código. Esas aceptan **`?juego=<id>`**, y todos los enlaces
internos se lo cuelgan. Sin eso, alguien mirando el bracket de LoL tocaba
"Inicio" y la página se le volvía roja de Valorant sin haber pedido nada.

De ahí salen tres detalles que conviene conocer:

- **Cambiar de juego se queda en la misma sección.** Estando en el calendario
  de Valorant, la pestaña de LoL lleva al calendario de LoL —no al bracket,
  como antes—. Lo que se está cambiando es el juego, no la página.
- **La inscripción llega con el juego ya elegido** en la primera casilla, y
  cambiarlo ahí **repinta la página en vivo**: quien elige LoL ve dorado antes
  de terminar de llenar el formulario.
- **Con un solo juego en `config.VC.juegos`** el parámetro no se pone: no hay
  entre qué elegir y solo ensuciaría las direcciones que se comparten.

## Jam de Altura

La gamejam de 48 horas, completamente virtual: se anuncia un tema, arranca un
reloj y los equipos entregan un videojuego antes de que llegue a cero. Vive en
`/jam-de-altura` y tiene identidad propia —pixel, `public/jam.css`—, su propia
base (`jam_*`) y su propio panel.

### La edición es la unidad que se repite

Una **edición** es la jam de un semestre: sus equipos, su tema y sus juegos.
Para el semestre siguiente **no se borra nada**: sale otra edición y la anterior
queda archivada tal como quedó.

**No se abre desde el panel.** La edición del semestre en curso ya está abierta
y vacía desde que arrancó el servidor: la crea `config.PERIODO` con los valores
de `config.JAM` (horas, tope de integrantes, cupo). Ver
[Semestres](#semestres).

Los valores se **copian** a la fila al crearla, no se leen de config cada vez:
si un semestre la jam dura 72 horas se cambia ahí y las ediciones viejas siguen
contando lo que contaron.

Lo único que falta para empezar a recibir es `inscripciones: true` en el evento
`jam-de-altura`. Los enlaces de los equipos viejos (`/jam/equipo/12`) siguen
funcionando para siempre.

### Las herramientas del panel, en orden de uso

| # | Herramienta | Qué hace |
|---|---|---|
| 1 | **Cronograma** | Día, hora y duración. Es lo único que mueve el reloj gigante de la página |
| 2 | **El tema** | Se escribe y se guarda **escondido**; un botón aparte lo revela |
| 3 | **Inscripciones** | Admitir o rechazar equipos. Al hacerlo sale un correo al líder |
| 4 | **Armar equipos** | Con los que se inscribieron solos, viendo la disciplina de cada uno |
| 5 | **Equipos admitidos** | Quién entregó qué, y sacar a alguien de un equipo si se retiró |
| 6 | **Tablón** | Avisos que salen en la página pública sin recargar |

Abrir y cerrar la jam **no** está en esta lista: eso es `config.js`.

### El reloj y el tema

El reloj no tiene interruptor: la fase sale de la hora de arranque y de cuánto
dura. Antes cuenta hacia el arranque, después cuenta lo que queda, y al llegar a
cero la página se recarga sola y pasa a la fase siguiente. La hora que manda es
**la del servidor**: al cargar, el navegador mide su desfase y lo corrige, así
que un computador con el reloj corrido no cuenta de más.

El tema sí es un botón, y a propósito. Mientras no se revele **no sale del
servidor**: no está escondido en el HTML ni en la API, así que no hay forma de
adelantarlo mirando el código fuente. Una vez revelado aparece en la página de
todo el que la tenga abierta, sin que nadie recargue, y hay un segundo botón
—aparte— para mandarlo por correo a todos los inscritos.

### Inscripción y entrega

Igual que en el resto del sitio, sin cuentas: se llena el formulario y sale un
**código de 6 caracteres**. Con ese código se consulta el estado y, cuando la
jam arranca, **se entrega el juego** (nombre, enlace jugable y una descripción).
Se puede volver a entregar las veces que haga falta mientras las entregas estén
abiertas.

#### Las tres formas de entrar

Entrar solo puede significar dos cosas opuestas —"hago mi juego yo" y "no tengo
con quién, ayúdenme"— y el formulario deja decir cuál:

| Modalidad | Qué es | Dónde queda |
|---|---|---|
| **Con mi equipo** | Ya saben quiénes son. Se inscribe el grupo entero | Un equipo, con todos sus integrantes |
| **Yo solo** | Va a hacer su juego por su cuenta y así se queda | Un **equipo de una persona**: sale en la galería y entrega con su código, como cualquier otro |
| **Busco equipo** | Está solo pero no quiere estarlo | En la lista, **sin equipo todavía**, hasta que la organización lo ubique |

Las dos primeras quedan admitidas de una y a revisión. La tercera queda
esperando: la organización arma los equipos mezclando disciplinas —eso es lo
que muestra el panel al lado de cada nombre— y a cada uno le llega un correo
con quiénes le tocaron.

Detalles que importan:

- A quien entra **en solitario** no se le exige nombre de equipo: si lo deja en
  blanco, sale con el suyo. La página dice "En solitario" y no "1 integrante",
  porque entró solo porque quiso y no porque le faltara gente.
- Un equipo de **una sola persona** en la modalidad "con mi equipo" se rechaza
  con un mensaje que señala la tarjeta correcta: casi siempre es que se eligió
  la equivocada.
- Si llega el arranque y a alguien de la lista **no se le pudo armar equipo**,
  el panel tiene **Solitario** al lado de su nombre: lo convierte en equipo de
  uno —conservando su código— para que alcance a participar. Sin eso no tendría
  dónde entregar el juego.

**Las entregas no se cierran solas** cuando el reloj llega a cero: eso es un
interruptor del panel, porque siempre hay un equipo subiendo el build tres
minutos tarde y esa decisión es de quien organiza.

### Lo que se configura

En `config.js`, el bloque `JAM`:

| Campo | Para qué |
|---|---|
| `max_integrantes` | Tope de un equipo (4). Cada edición guarda el suyo y se puede cambiar |
| `horas` | Cuánto dura (48). Igual: se copia a la edición al abrirla |
| `cupo_equipos` | Tope de equipos por edición. `null` = sin tope |
| `disciplinas` | Las opciones de "de qué te encargas". Agregar o quitar una es todo lo que hace falta: el formulario, el panel y las tarjetas salen de esta lista |

## Salidas pedagógicas

Esto **no es un evento del programa**: es una salida académica —SOFA, una feria,
un museo, una visita a un estudio— y por eso no está en `config.EVENTOS` ni le
pelea la raíz `/` a nadie. Vive siempre en `/salidas` y se comparte por enlace.

La página es **una sola y sirve para todas**. Lo que cambia de una salida a otra
está en `config.js`, en el bloque `SALIDAS`, y en ningún otro lado: montar la
salida del semestre siguiente es escribir un objeto en esa lista. No hay pantalla
de "crear salida" en ningún panel.

### El trámite, que es el punto entero

Registrarse **no aparta cupo**, y la página lo dice cuatro veces porque es lo que
más se malentiende:

1. **El estudiante se registra** en `/salidas/<id>/registro`: nombre, código
   estudiantil, tipo y número de documento, teléfono y correo institucional. Le
   queda un código de seis caracteres —el mismo invento del resto del sitio— y le
   llega un correo con él.
2. **Descarga el consentimiento** (está en `public/documents/`) y lo firman sus
   padres o acudientes.
3. **Lo lleva firmado y paga**, en persona, al docente encargado: transporte y
   póliza. La firma se revisa ahí mismo, en ese escritorio.
4. **El docente marca los dos pagos** en el panel. Cuando quedan los dos, al
   estudiante le sale el correo que lo confirma, con las normas y las dos
   advertencias.

> **El consentimiento no tiene casilla propia**, y es a propósito. Se revisa en
> el mismo momento en que se recibe la plata, así que marcar el pago del
> transporte *es* haber visto el papel firmado. Una casilla aparte solo serviría
> para marcarla sin haberlo visto.

### Lo que el estudiante ve

`/salidas/estado` con su código: en qué va (falta pagar / pago incompleto /
confirmado), cuál de los dos pagos falta, a quién pagarle y dónde, la boleta con
la hora de salida y de regreso, sus propios datos —para que alcance a corregir un
documento mal escrito antes de que lo rechace la aseguradora— y las normas.

Las dos advertencias van en la página, en el formulario, en la consulta y en los
dos correos, porque hay que decirlas antes de que alguien pague:

- una vez realizado el pago, la inasistencia **no es causal de reembolso**;
- incumplir cualquier norma es causal de **llamado de atención**, informado a
  dirección del programa y a decanatura.

### El panel

`/salidas/acceso`, con **su propia contraseña** (`PASSWORD_SALIDAS` en el `.env`).
Cuarta herramienta, cuarta clave: quien entra aquí está confirmando pagos en
efectivo, y eso no se abre con la misma clave con la que se califica un proyecto.

Hace una sola cosa —marcar quién pagó— y está pensado para usarse de pie, con el
celular en una mano y la plata en la otra:

- **los que faltan van primero**, que son a los que hay que perseguir;
- dos casillas por persona, transporte y póliza, y el botón de guardar;
- **el recaudo va separado por concepto**: son dos cuentas distintas, la del bus
  y la de la aseguradora, y sumarlas no le sirve a ninguna de las dos;
- **la lista en CSV**, que es la que se imprime y sube al bus (con documento y
  teléfono de todos: es lo que pide la aseguradora y lo que hay que tener a mano
  si pasa algo en la carretera);
- una **nota** por estudiante, solo para el docente.

Dos reglas que el panel no deja saltarse:

- **el correo de confirmación sale una sola vez.** Desmarcar y volver a marcar no
  se lo repite al estudiante. Si de verdad hizo falta —Gmail rechazó, lo borró—,
  hay un **Reenviar confirmación** explícito.
- **a quien ya pagó no se le borra el registro.** Es el comprobante de que
  entregó un dinero. Si se retiró, se le desmarcan los pagos y queda la
  constancia de que los tuvo.

### Lo que se configura

En `config.js`, el bloque `SALIDAS`. Fuera de la lista de salidas hay tres cosas
comunes: `tipos_id` (los documentos del selector), `normas` (las mismas para
todas: son de la universidad, no de la feria) y `advertencias`.

| Campo de una salida | Para qué |
|---|---|
| `id` | La dirección (`/salidas/sofa-2026`) y lo que queda en cada registro. No se cambia una vez repartida |
| `inscripciones` | `true` mientras el formulario reciba gente. Aquí **no** hay bandera `activo`: puede haber dos salidas abiertas a la vez, porque son de asignaturas distintas |
| `salida` / `regreso` | `AAAA-MM-DD HH:MM`. Una fecha de salida ya pasada cierra los registros sola |
| `punto` | De dónde sale y a dónde vuelve el bus |
| `lugar`, `objetivo`, `asignaturas` | Lo que se cuenta en la página |
| `cupo` | Cuántos caben. `null` = sin tope. El cupo se aparta al **registrarse**, no al pagar |
| `costos` | `transporte` y `poliza`, en pesos. Vacío = "consultar con el docente" |
| `docente` | `nombre`, `email`, `telefono`, `donde`. Es el dato más importante de la página: sin eso nadie puede pagar |
| `consentimiento` | Ruta del archivo servido desde `public/` |

## Semillero de Investigación (SAMI)

Tampoco es un evento, y por la razón contraria a las salidas: **no tiene fecha
porque no termina nunca**. SAMI —Semillero de investigación en aplicaciones,
ambientes interactivos, animación y contenido multimedia— es una **alternativa de
grado que dura tres semestres**, con proyectos que se solapan. Vive siempre en
`/semillero`.

Esto reemplaza **dos hojas de cálculo** que el programa venía llevando a mano y
que están en `public/documents/`:

- `Seguimiento Proyectos SAMI.xlsx` — una hoja por semestre con el estado de cada
  proyecto, sus jurados, sus fechas y sus comités;
- `202620 - Seguimiento y Evaluación.xlsx` — dieciséis hojas, una por semana de
  reunión, con los adelantos, los compromisos y la calificación de cada quien.

Las dos se sostenían con `IMPORTRANGE`, `INDIRECT` y `XLOOKUP` **entre archivos**,
y las cifras que el programa necesita —cuántos van, cuántos terminaron, a quién le
falta el CEB— había que sacarlas a mano cada vez. Aquí son una consulta.

### El trámite de vinculación, que esta app NO hace

Conviene tenerlo claro antes de tocar cualquier texto de estas páginas: **el
sitio no es parte del trámite**. Los cuatro pasos se hacen en persona y ninguno
se puede cumplir desde aquí. Lo que hace el formulario es dejar los datos del
estudiante escritos una sola vez, para que cuando llegue a esas puertas no haya
que volver a copiarlos, y para que el semillero los tenga desde antes.

De ahí sale la regla que se repite en todo el módulo: **la página nunca dice que
algo ya quedó hecho.** Dice qué sigue y a dónde hay que ir. Que se sintiera como
un trámite terminado sería el peor resultado posible —alguien se quedaría
esperando una respuesta que nadie le va a mandar—.

Los cuatro pasos:

1. **El estudiante notifica su intención en la dirección del programa**, en
   persona, desde 6.º semestre. Es el paso que abre todo lo demás.
2. **Radica una carta al Consejo de Facultad** indicando que tomará Semillero de
   Investigación como su alternativa de grado.
3. **Contacta a un docente** que lo asesore y arma con él la propuesta en el
   formato `G-01-SEM.docx`, que se descarga de la página. **Con ese docente queda
   formalizada su vinculación al semillero.**
4. **El comité estudia la propuesta** y le informa quién será su director y —si
   aplica— su codirector. Cuando el panel pasa el proyecto a *Propuesta aprobada*,
   al estudiante le sale el correo que se lo dice, **una sola vez**.

Lo que sí hace `/semillero/registro`: guarda los datos, el título tentativo y el
perfil, y le entrega al estudiante un código de seis caracteres —el mismo invento
del resto del sitio—. Lo primero que ve al enviarlo, antes que el código, es a
quién tiene que ir a buscar y dónde.

> **A la dirección del programa no se le manda ningún correo**, y no es un
> olvido. El paso 1 es que el estudiante vaya en persona; un correo automático
> diciendo lo mismo dejaría a las dos partes creyendo que el aviso ya lo dio el
> otro, que es la mejor forma de perder a alguien en un trámite. El único correo
> del registro va al estudiante, y lo que hace es recordarle a dónde ir.

> **La propuesta tampoco se llena en el sitio.** Se construye con un asesor
> durante semanas en el Word del formato; meterla en un formulario daría la
> impresión de que se llena de una sentada.

Después vienen **tres semestres**, que suelen repartirse en anteproyecto y
comités, desarrollo y documentación, y sustentación y ajustes finales. Cada
semestre el estudiante recibe una nota y asiste a las reuniones que programe su
director.

### Perfiles, que no son líneas

Los cuatro **perfiles** son los que trae el nombre del semillero —aplicaciones,
ambientes interactivos, animación y contenido multimedia—. El estudiante elige
con cuál se siente cómodo, y eso **no decide qué proyecto va a hacer** ni lo
encierra en nada: sirve para saber a quién ponerlo a hablar con quién. La mayoría
de proyectos terminan tocando dos o tres.

La **línea** y la **sublínea** de investigación son otra cosa: son del programa,
son fijas y son las mismas para todos los proyectos. Por eso viven en
`config.SAMI` como dos textos y no como una lista de opciones, no se le preguntan
al estudiante y no se guardan por proyecto —una columna que puede decir cuatro
cosas distintas de algo que tiene una sola respuesta es una columna que tarde o
temprano miente—. Se muestran en la página para que se copien tal cual en el
G-01-SEM; si están vacías en el config, esa parte no aparece.

### La escalera de estados

Trece peldaños, en `lib/sami.js`. Los ocho del final son los del documento del
programa; los cinco primeros son el trámite de vinculación, que hasta ahora no
estaba en ninguna hoja. **No está en `config.js` a propósito**: es una máquina de
estados y no una preferencia, y cambiar una clave rompería los proyectos ya
guardados sin avisar.

El primero, **En el registro**, es donde caen los que llenan el formulario, y va
separado de **Intención notificada** por lo mismo de arriba: llenar un formulario
no es haber ido a una oficina. A *Intención notificada* lo mueve un docente
cuando conste que sí fue.

| En el panel | En la hoja del programa |
|---|---|
| En el registro · Intención notificada · Carta radicada · Propuesta en construcción · Propuesta aprobada | `1. Propuesta` |
| Anteproyecto | `2. Anteproyecto` |
| Sustentación de anteproyecto | `3. Sustentación anteproyecto` |
| Aprobación de comités | `4. Aprobación CB` |
| Desarrollo del proyecto | `5. Desarrollo proyecto` |
| Radicación del proyecto | `6. Radicación proyecto` |
| Sustentación del proyecto | `7. Sustentación proyecto` |
| Finalizado · Retirado del semillero | — |

La columna de la derecha existe solo para el CSV: lo exportado se pega en el
documento viejo sin traducir nada. Un proyecto no cuenta como activo hasta que le
aprueban la propuesta, que es por lo que cinco estados de aquí son un solo
`1. Propuesta` allá.

El estado **se guarda**, no se calcula —al revés que en las salidas—. Allá el
estado sale de dos casillas de pago, que son hechos verificables; aquí "en qué va"
es un juicio del comité que ninguna columna puede deducir. Una fecha de
sustentación no dice si el anteproyecto quedó aprobado.

### Lo que el estudiante ve

`/semillero/estado` con su código: en qué va el trámite, quién quedó de director y
codirector, las fechas que ya pasaron, el concepto de los jurados y **lo que se
comprometió a entregar en la última reunión**.

El mapa de los cuatro pasos **desaparece en cuanto le aprueban la propuesta**.
Cuatro casillas todas palomeadas no le dicen nada a quien ya está en su segundo
semestre de proyecto: lo que necesita a esas alturas es su director, sus fechas y
sus compromisos, y dejarle un trámite terminado ocupando media pantalla es
hacerle leer dos veces para llegar a lo que sí le sirve.

**No ve calificaciones ni notas de semestre.** Seis caracteres que se dictan por
teléfono y se comparten por WhatsApp no son una contraseña, y una nota no es un
dato de trámite. Las notas viven en el panel.

### El panel

`/semillero/acceso`, con **su propia contraseña** (`PASSWORD_SAMI` en el `.env`).
Séptima herramienta, séptima clave: aquí se guardan calificaciones y notas de
semestre de estudiantes con nombre propio.

**Dos permisos y no uno**, que es lo que lo diferencia del panel de salidas:

- **todo docente que entra VE el semillero entero.** Es el documento del programa;
  esconderle a un docente en qué van los proyectos de los demás no protege a nadie
  y le quita el mapa a quien dirige el semillero;
- **pero registrar reuniones y notas solo se puede donde uno es director.**
  Calificar el trabajo de un semestre es del director, y un panel que deja hacerlo
  a cualquiera termina con notas que nadie sabe quién puso. Se comprueba en el
  servidor y no escondiendo el botón.

Lo administrativo —estado, semestre, jurados, fechas, comités, asignar director—
queda abierto a todos: son actos del comité que registra quien esté a la mano.

Las herramientas, en orden de uso:

- **la portada** parte en *mis proyectos* (editables) y *todo el semillero*
  (lectura), con las cifras arriba y, aparte, solo las cosas que hay que
  perseguir: intenciones sin tramitar, proyectos sin director, comités pendientes
  y quien se pasó de los tres semestres. Un cero con un rótulo alarmante enseña a
  ignorar el rótulo, así que esas cifras aparecen únicamente cuando existen;
- **`/semillero/panel/solicitudes`** es la bandeja: las intenciones que todavía no
  son proyecto, con los datos completos de quien se registró y lo único que se
  decide ahí —en qué paso va y quién lo dirige—;
- **la ficha de un proyecto** tiene arriba lo que se toca cada semana (las
  reuniones), en medio las notas del semestre y abajo el trámite, que se toca de
  tanto en tanto.

**El selector de semestre** solo ofrece los semestres desde `SAMI.desde`. La
tabla `periodos` es de la app entera y arrastra semestres viejos de la Expo y del
torneo; ofrecer aquí uno en el que el semillero no existía solo sirve para abrir
una página vacía y hacer dudar a quien la abre.

### El calendario, que no se escribe

Lo único que se configura es **la fecha de inicio** (`SAMI.calendario.inicio`, el
lunes de la S1) y cuántas semanas dura. Las dieciséis salen de ahí, una cada
siete días, y con ellas los rótulos `S1 · 3 a 7 de agosto` que hoy titulan a mano
cada hoja del archivo de seguimiento —dieciséis títulos escritos a mano por
semestre son dieciséis oportunidades de equivocarse—.

La ficha de cada proyecto enseña las dieciséis casillas y cuáles ya tienen
reunión registrada, que es la pregunta que se hace un director en noviembre.

El número de semana **se guarda resuelto** en cada reunión, no se recalcula al
leer: corregir el calendario del semestre no puede cambiar la semana de reuniones
que ya pasaron.

### Cargar un lote desde la hoja

`/semillero/panel/importar`. El semillero lleva años en un Excel, así que el
módulo tiene que poder arrancar con lo que ya hay adentro y no con la base en
cero. Se abre la hoja del semestre en *Seguimiento Proyectos SAMI*, se
seleccionan las filas de la `A` a la `O` y se pegan ahí: el portapapeles de Excel
trae las celdas separadas por tabuladores, que es justo lo que espera el parser.

Respeta el formato de la hoja tal como está: **los datos del proyecto van solo en
su primera fila**, y las de abajo traen el segundo estudiante o el segundo jurado
con lo demás en blanco. Una fila con nombre de proyecto empieza uno nuevo; las
que siguen le pertenecen. La cabecera, si se pega, se ignora sola.

**Son dos pasos, no uno.** Primero se ve qué va a entrar y solo entonces se
guarda: importar treinta proyectos no se deshace con un botón. La vista previa
marca los dos choques que importan —un estudiante que ya está en otro proyecto y
un director que no se reconoce—, y el paso de confirmar vuelve a parsear el mismo
texto en vez de fiarse de lo que se calculó antes, así que lo que se guarda es
exactamente lo que se vio.

Tres traducciones que hace solo:

- **el estado**, de la etiqueta de la hoja a la de aquí (`4. Aprobación CB` →
  *Aprobación de comités*). `1. Propuesta` entra como *Propuesta en construcción*:
  quien ya está en la hoja de seguimiento evidentemente notificó su intención y
  radicó su carta, y meterlo en *En el registro* le borraría dos pasos que sí
  hizo;
- **el director**, contra `config.DOCENTES`, sin tildes y comparando primer
  nombre y último apellido —en la hoja el mismo docente aparece como *Oscar
  Leonardo Peréz*, *Oscar Peréz* y *Oscar Pérez* según quién llenó la celda—. El
  que no se reconoce entra sin director y la vista previa lo avisa, porque un
  proyecto sin director es un proyecto que nadie puede calificar;
- **las fechas**, en `d/m/aaaa` o `aaaa-mm-dd`. Lo que no tenga forma de fecha se
  descarta callado: en la hoja real esa celda tiene cosas como *"Se retira de
  semillero"*, y rechazar el lote entero por eso sería inútil.

Los errores son **de fila y no cortan el lote**: se importa lo que sirve y se dice
qué se quedó fuera. Un lote de treinta proyectos rechazado entero por un correo
mal escrito es un lote que nadie va a volver a intentar.

No hay subida de archivos, y es la misma decisión del resto del sitio: pegar no
pide una dependencia nueva, funciona desde cualquier equipo y no deja un `.xlsx`
del semestre pasado tirado en el servidor.

**Una reunión se registra entera y en un solo guardado**: la fecha, los adelantos,
los compromisos y —por cada estudiante— si vino y qué nota sacó. Los adelantos y
los compromisos son **del proyecto**; la asistencia y la calificación son **de cada
estudiante**, porque en un proyecto de dos el avance es del trabajo pero la falta
es de una persona. La semana (S1…S16) sale sola del calendario y se guarda ya
resuelta, para que corregir el calendario no cambie las reuniones que ya pasaron.

La asistencia tiene **tres valores y no dos**, igual que en las salidas: sin marcar
no es lo mismo que no vino. Y una reunión sin calificación **no vale cero**: vale
que no está, y no entra en el promedio.

**La nota del semestre se escribe a mano, siempre.** Al lado de las casillas va lo
que llevan de reuniones, el porcentaje de asistencia y el promedio —lo que en la
hoja eran las columnas `#S`, `ASIST` y `PROM`—, pero **no se precargan**: el
docente pesa cosas que no están en esta base, y una nota puesta sola por un
promedio sería una nota que nadie decidió. Cuando hay codirector, la nota final es
el promedio de las dos; cuando no, la del director sola —un codirector que no
respondió no tiene por qué bajarle la nota a nadie a la mitad—.

Tres reglas que el panel no deja saltarse:

- **a un integrante no se le borra la fila.** Si se retiró se marca, y sus
  reuniones y sus notas quedan: son la constancia de lo que sí trabajó mientras
  estuvo. El mismo botón deshace.
- **una nota se corrige, pero nunca queda anónima**: se guarda quién la cerró y
  cuándo, y el semestre (I, II, III) se congela al guardarla —dentro de un año hay
  que poder decir que esta fue la nota del II, aunque el proyecto ya vaya en el
  III—.
- **el correo de propuesta aprobada sale una sola vez.** Mover el estado de ida y
  vuelta no se lo repite al estudiante.

### Los tres CSV

Reproducen columna por columna las hojas de siempre, con las **mismas etiquetas**
(`4. Aprobación CB`, no `aprobacion_cb`), con `;` y BOM para que Excel en español
los abra en columnas:

| Archivo | Qué reemplaza |
|---|---|
| `seguimiento.csv` | La hoja del semestre de *Seguimiento Proyectos SAMI* |
| `finalizados.csv` | La hoja *Proyectos Finalizados* |
| `reuniones.csv` | Las hojas `S1…S16` de *Seguimiento y Evaluación*, más las columnas `#S`, `ASIST` y `PROM` ya calculadas |

### Lo que se configura

En `config.js`, el bloque `SAMI`.

| Campo | Para qué |
|---|---|
| `inscripciones` | `true` mientras el formulario de intención reciba gente. Cerrarlo no borra nada: los proyectos en curso siguen igual |
| `semestre_minimo` | Desde qué semestre de la carrera se puede entrar. El formulario rechaza a quien escriba menos |
| `semestres` | Cuántos dura el proyecto. Es el tope que el panel señala cuando alguien va por el IV |
| `horas_semestre` | Las que pide el plan de trabajo del G-01-SEM. Solo se muestra; no se lleva la cuenta |
| `calendario` | `inicio` (el lunes de la S1) y `semanas`. Las dieciséis salen de ahí; no se escriben en ninguna parte. **Es lo único que hay que cambiar al empezar semestre, junto con `PERIODO`** |
| `desde` | El semestre más antiguo del que hay datos del semillero. El selector del panel no ofrece anteriores |
| `direccion` | A dónde hay que ir a notificar la intención: nombre, cargo, oficina y correo. Es el dato más importante de la página —sin eso el estudiante se queda con un código y sin saber qué hacer con él— |
| `formato` | La guía de propuesta, servida desde `public/` |
| `perfiles` | Los cuatro del semillero. El selector del formulario sale de esta lista |
| `linea`, `sublinea` | Las del programa, fijas. Se muestran para copiar en el G-01-SEM; vacías = no aparecen |
| `pasos`, `etapas` | El texto con el que se le cuenta el trámite y los tres semestres al estudiante. Texto, no lógica |

### Lo que no hace, y por qué

- **No guarda archivos.** Ni el G-01-SEM diligenciado ni el documento del
  proyecto. Es la misma decisión de INKreible: [los archivos no viven en esta
  app](#los-archivos-no-viven-en-esta-app). Si hace falta, se guarda un enlace.
- **No emite certificados.** El semillero es alternativa de grado: lo que se emite
  al final es un acta, no una constancia de participación.
- **El codirector no entra al sistema.** Se guarda su nombre como texto libre
  porque casi siempre es de otro programa o de otra universidad, y su nota la
  transcribe el director.
- **No hay datos de prueba en `datos-de-prueba/sembrar.js`**, y no hacen falta:
  los proyectos reales entran por [cargar un lote](#cargar-un-lote-desde-la-hoja).
  Los nombres, documentos y teléfonos de las hojas tampoco podrían quedar ahí:
  son datos personales de estudiantes y ese archivo va a git.

## INKreible

El reto de dibujo: **28 días, 28 palabras, un dibujo por día**, repartidos en
cuatro semanas. Al final se premia un ganador por semana, un top de los diez
mejores del reto y los mejores digitales y análogos aparte; y queda una galería
con todo lo que salió. Vive en `/inkreible`, tiene identidad propia —papel y
tinta, `public/ink.css`, la única clara de las cuatro—, su propia base (`ink_*`)
y su propio panel.

Aquí **no hay equipos**: se participa solo, y la unidad no es un reloj de horas
sino el **día**.

### Los archivos no viven en esta app

Es la decisión que explica todo lo demás. Los dibujos se suben a **una carpeta
de Drive** cuyo enlace se le manda a cada quien al admitirlo, con un **nombre de
archivo predefinido**. Esta app no recibe imágenes: guarda el enlace de cada
dibujo y arma con eso la galería y el podio.

La nomenclatura es lo que hace que eso funcione, porque de un nombre de archivo
salen solos el autor, el día y la técnica:

```
ABC234_07_DIG.jpg     código de la persona · día 07 · digital
XY7KLM_12_ANA.png     código de la persona · día 12 · análogo
```

La plantilla se edita desde el panel (`{CODIGO}`, `{DIA}`, `{TECNICA}`), y en la
página de cada participante **no sale la fórmula sino el nombre exacto** de los
siete archivos de esa semana, listo para copiar. Es lo que más se pregunta y lo
que más se equivoca.

### La edición es la unidad que se repite

Igual que en la jam: una **edición** es el reto de un semestre —sus palabras,
sus inscritos, sus dibujos y su podio—. Para el siguiente no se borra nada: sale
otra edición y la anterior queda archivada tal como quedó.

**No se abre desde el panel.** La edición del semestre en curso ya está abierta
y vacía desde que arrancó el servidor: la crea `config.PERIODO` con los valores
de `config.INK` (días, semanas, cupo, nomenclatura). Ver
[Semestres](#semestres).

La carpeta de Drive y el día 1 son lo único que no sale de ahí, y es a
propósito: no existen hasta que alguien crea la carpeta del semestre y decide
cuándo arranca. Se ponen desde la sala de control, con las dos primeras
herramientas de la lista de abajo.

### Las herramientas del panel, en orden de uso

| # | Herramienta | Qué hace |
|---|---|---|
| 1 | **Cronograma** | El día 1, cuántos días y en cuántas semanas. Es lo único que mueve el calendario público |
| 2 | **Las palabras** | Las 28 de un tirón, una por línea. Escribirlas **no las publica** |
| 3 | **La carpeta** | El enlace de Drive y la nomenclatura, más el botón de mandárselos a quien no los tenga |
| 4 | **Inscripciones** | Admitir o rechazar. Al admitir sale un correo **con la carpeta y el nombre de archivo** |
| 5 | **Quiénes dibujan** | Cuánto lleva cada quien: sirve para escribirle a mitad de reto a quien se está quedando |
| 6 | **Cargar dibujos** | Se pega la lista de la carpeta y de cada nombre salen autor, día y técnica |
| 7 | **El podio** | Los ganadores, dictados por código y día. Se publica todo de una vez |
| 8 | **Ajustes** | Estado, cupo, y los dos interruptores del final: galería y podio |

### El día no tiene interruptor

Como el reloj de la jam, **la fase se calcula**: de la fecha de arranque salen
en qué día va el reto, qué semana corre y cuánto falta. Nadie tiene que apretar
nada a las seis de la mañana.

Y de ahí sale también qué palabra se puede ver: **la del día 12 no existe para
el público hasta el día 12**. No está escondida en el HTML ni en la API —el
servidor manda el texto en blanco—, así que no hay forma de adelantarla mirando
el código fuente. Quien prefiera jugarlo como el inktober original tiene un
botón para **publicar la lista completa** desde el primer día.

La galería y el podio son los otros dos interruptores, y están cerrados
mientras el reto corre: la idea es que nadie mire lo que hizo el vecino antes de
resolver su propia palabra.

### Cargar los dibujos de la carpeta

Son 28 dibujos por persona: nadie va a teclear eso a mano. Se pega la lista de
la carpeta —nombre del archivo y enlace, en cualquier orden y separados por lo
que sea— y la herramienta reparte cada línea a quien le corresponde. Volver a
cargar un día que ya estaba **reemplaza el enlace**, así que se puede pegar la
lista completa cada semana sin duplicar nada.

Lo que no se entiende **no se descarta en silencio**: vuelve a la pantalla con
el motivo (`no hay nadie con el código MALO99`, `no dice si es digital o
análogo`), que casi siempre es un archivo mal nombrado en el Drive.

Un detalle que hace que la galería exista de verdad: un enlace de Drive de los
de `…/file/d/ID/view` es una página, no una imagen. La app lo convierte sola a
su miniatura, así que se ve en la galería y no baja 8 MB por dibujo. Lo único
que hace falta es que el archivo esté compartido con **"cualquiera con el
enlace"** —está dicho en las reglas, en el panel y en el correo—.

### Lo que se configura

En `config.js`, el bloque `INK`:

| Campo | Para qué |
|---|---|
| `dias` | Cuántos dibujos tiene el reto (28) |
| `semanas` | En cuántos tramos se parte (4). De aquí sale a qué semana pertenece cada día y cuántos ganadores semanales hay |
| `cupo` | Tope de participantes por edición. `null` = sin tope |
| `top` | Cuántos entran al top del final (10) |
| `por_tecnica` | Cuántos se premian de cada técnica (3 digitales y 3 análogos) |
| `tecnicas` | Con qué se puede dibujar. El `id` va en el nombre del archivo, así que no se cambia una vez repartida la nomenclatura |
| `nomenclatura` | Cómo se llama cada archivo. Cada edición guarda la suya y se edita desde el panel |

## Registro de expositores

El docente **solo crea la materia y aprueba**. No da de alta estudiantes ni
proyectos a mano: todo entra por el registro que llenan los propios
estudiantes.

> **Quien no se registre, no existe para la app.** Si un estudiante no aparece
> en un proyecto aprobado, no hay a quién calificar y su nota queda en 0.0. Eso
> está dicho tal cual en el formulario y en la vista del docente.

**El estudiante** entra a `/registro` sin contraseña y en un solo formulario:
elige la materia, pone el título del proyecto, elige en qué sala va a estar,
escribe su nombre y correo, y agrega a sus compañeros —**cada uno con su nombre
y su correo institucional**—. Al enviar recibe un **código de seis caracteres**
(por ejemplo `K7M2QP`) con el que puede consultar el estado en
`/registro/estado`. Un mismo equipo puede registrar varios proyectos: es un
registro por proyecto.

En `/panel` el toggle **Todas / Solo las mías** deja ver únicamente las materias
que uno creó, que es lo cómodo para calificar. La elección se guarda en la
sesión: al volver de una materia, el panel sigue como se dejó.

**El docente** ve los registros de su materia al abrirla, arriba del todo, y en
`/panel` cada materia muestra cuántos tiene por revisar:

- **Aprobar** crea el proyecto (ya calificable, con su sala), suma a los
  integrantes a la lista de estudiantes registrados, y marca el registro como
  aprobado.
- **Rechazar** guarda un motivo opcional que el estudiante ve con su código. No
  crea nada.

Debajo, **Estudiantes registrados** es la lista de todos los que ya tienen
proyecto aprobado, con su correo y el proyecto al que pertenecen. Ahí el docente
compara contra su lista de clase y ve quién falta por registrarse.

### La identidad es el correo

Dos estudiantes pueden llamarse igual; el correo no se repite. `estudiantes`
tiene `UNIQUE (materia_id, email)`, así que la misma persona que expone en dos
proyectos de la misma materia es **una** fila (y en la lista aparecen sus dos
proyectos). Si ya estaba registrada, se conserva el nombre del primer registro
aprobado para que no cambie a espaldas del docente.

Lo que el formulario cuida solo: quien registra queda siempre en el equipo,
un correo repetido dentro del mismo formulario no agrega a nadie dos veces,
**todos los correos tienen que ser @uniboyaca.edu.co** (se guardan en
minúscula) y ningún compañero pasa sin correo. Si alguien manda dos veces el
mismo título en la misma materia se le muestra el código del registro que ya
existe en vez de duplicarlo. El endpoint es público, así que tiene un tope de 6
envíos cada 10 minutos por dispositivo.

**Cerrar el registro:** en `config.js`, `inscripciones: false` en el evento
`expo`. El formulario deja de recibir y la página de la Expo muestra
`aviso_cerrado` en lugar del botón. Es el mismo interruptor que cierra el
torneo y la jam: uno por evento y en un solo archivo, para que "cerrar"
signifique lo mismo en los tres. Ver [Las dos banderas](#las-dos-banderas).

> El bloque `registro` de `data/expo.json` sigue existiendo, pero ya solo pone
> los **textos** (`titulo`, `nota`, `cierra`, `aviso_cerrado`). Si tiene un
> `abierto`, se ignora.

### Editar el contenido público

Todo lo que se ve en `/expo` vive en `data/expo.json`. Se edita el archivo y se
recarga el navegador: el servidor lo relee cuando cambia, **sin reiniciar**.

- `evento` — nombre, tipo, cuándo, dónde y la descripción del hero.
- `salas` — las experiencias del recorrido, con su lema, montaje, `horario` y
  las asignaturas que exponen ahí. El color sale de `accent`
  (`code`, `story`, `realtime` o `design`).
- `jornada` e `itinerario` — los horarios.
- `mapa` — el plano interactivo.
- `registro` — el estado del registro de expositores y sus textos.
- `requisitos` — la guía de montaje de `/expositores`.

El contenido salió del tablero del plan integrador (`Plan/data/*.json`), pero a
partir de aquí las dos cosas son independientes: editar uno no toca al otro.

### Horarios e itinerario

Mientras no esté cerrada la franja del evento, el contenido lo dice de frente en
vez de inventarse una hora:

- `jornada` — `apertura` y `cierre` son la jornada base (8:00–12:00);
  `cierre_extendido` es el "hasta las 18:00" que todavía está por confirmar, y
  se pinta en ámbar. `estado` y `nota` son el aviso que se lee arriba de todo.
- Cada sala tiene su `horario` con `abre`, `cierra` y `extendido`. Si
  `extendido` es `null`, esa sala no se queda en la tarde y no muestra la nota.
  Hoy están marcadas para extenderse **Indie Alley** y **Trazo Cero** (la
  galería es la más fácil de dejar montada); cambiar eso es cambiar un campo.
- `itinerario` — la lista de actividades. Se puede escribir en cualquier orden:
  la página las ordena por `hora` y agrupa las que coinciden.

```json
{ "hora": "09:00", "fin": "09:45", "sala": "tras-bambalinas",
  "tipo": "Función", "titulo": "Función 1 · Del guion al storyboard",
  "desc": "Proyección y conversación con los equipos." }
```

- `sala` — id de la experiencia: le da el color y el nombre del lugar. Para algo
  que no pasa en una sala (apertura, cierre) se pone `"sala": null` y se usa
  `lugar` con texto libre; esas actividades se ven siempre, aunque el visitante
  filtre por una sala.
- `tipo` — texto libre, es la etiqueta pequeña de arriba (Función, Demo por
  turnos, Taller abierto…).
- `"tentativo": true` agrega debajo el aviso de `jornada.aviso_tarde`.

Los botones de filtro salen solos de la lista de salas: el visitante toca
«Tras Bambalinas» y ve solo sus funciones para calcular a qué hora venir.

### La guía de montaje

`/expositores` sale entero de `requisitos` en el JSON, así que las exigencias se
cambian sin tocar código. Arriba de todo va `aviso`, que deja claro que **cada
docente puede pedir cosas distintas** y que esto es solo el mínimo común.

`bloques` son las secciones (hoy: el stand, los videos de Tras Bambalinas, y
montaje y desmontaje) y cada `item` es una tarjeta numerada. La numeración la
pone el CSS y se reinicia en cada bloque: se pueden insertar, mover o borrar
requisitos sin renumerar nada a mano.

```json
{
  "titulo": "Banner vertical",
  "etiqueta": "Obligatorio",
  "desc": "Cada equipo deberá contar con un banner tipo roll-up…",
  "lista": ["Nombre del proyecto.", "Logotipo."],
  "no": "No se aceptarán hojas impresas pegadas simulando un banner.",
  "ejemplo": ["Animacion_EcosDelBosque_G03.mp4"],
  "nota": "Texto secundario, en gris.",
  "alerta": true
}
```

- `etiqueta` — «Obligatorio» se pinta neutro; «Prohibido» y «Penalización», en
  rojo; cualquier otra cosa (por ejemplo «Recomendado»), en verde.
- `no` — lo que **no** se acepta, con una ✕ roja.
- `ejemplo` — cada línea en un recuadro punteado, para nombres de archivo o
  textos de pantalla.
- `alerta: true` — pinta toda la tarjeta en rojo. Hoy solo lo usa la
  penalización por desmontaje anticipado.
- Un bloque con `"sala": "tras-bambalinas"` toma el color de esa sala y enlaza
  a su parte del recorrido.

### El plano del lugar

`mapa` es una cuadrícula de `cols` × `filas` unidades. Cada espacio se ubica con
`x`, `y` (esquina superior izquierda), `w` y `h` en esas unidades — se admiten
decimales, y quien mande los planos reales solo tiene que pasarlos a esa escala:

```json
{ "id": "e-ingreso", "tipo": "acceso", "name": "Ingreso",
  "desc": "Entrada principal.", "x": 0, "y": 8, "w": 3, "h": 2 }
```

- `tipo` — `sala`, `pasillo`, `acceso` o `servicio`. Define el estilo del rectángulo.
- Un espacio de tipo `sala` no lleva `name` ni `desc`: toma el nombre, el color y
  la descripción de la experiencia que se indique en `sala`.
- Los espacios más altos que anchos rotan su etiqueta solos.

El plano actual es **tentativo** y así está rotulado en la página. Al cambiar las
medidas en el JSON, la página se redibuja sola.

## Semestres

**El semestre es el único interruptor de la app**, y es el mismo para los tres
eventos: la Expo, el torneo y la jam cuelgan todos de él.

### Empezar un semestre

Dos líneas de `config.js` y un reinicio:

```js
const PERIODO = "2027-10";          // el semestre en curso
// …y en EVENTOS, en el que toque:
{ slug: "expo", activo: true, inscripciones: true, … }
```

Al arrancar, la app sola:

- crea el semestre si no existía y lo deja como el único activo;
- **abre el torneo de cada juego** de `config.VC.juegos`, vacío y con las
  inscripciones listas;
- **abre la edición de la jam**, vacía, con las horas y el tope de integrantes
  de `config.JAM`;
- deja lo del semestre pasado **marcado como cerrado**, pero intacto.

Y ya. No hay nada que crear a mano, ni un botón de "abrir edición", ni uno de
"crear torneo": desaparecieron. La consola del arranque dice qué semestre quedó
y si las inscripciones están abiertas o cerradas.

### Qué se conserva y qué arranca de cero

**Las materias no se repiten por semestre**: se crean una vez y siguen ahí. Lo
que arranca de cero son los registros, los proyectos, las notas, los
certificados, los equipos del torneo y los de la jam.

Nada se borra. El torneo del semestre pasado conserva sus equipos, su bracket y
sus marcadores; la edición pasada de la jam conserva su tema y sus juegos
entregados; los certificados siguen públicos y verificables con su QR. Todo eso
queda de consulta —abajo, en la sección "Archivo" de cada panel— y ninguno de
los tres vuelve a admitir a nadie: un torneo o una edición de otro semestre no
pasa los candados de inscripción aunque su fila diga que están abiertas.

### El selector del panel es para mirar

En el panel de la Expo, arriba, están los semestres. El que tiene el punto verde
es el activo. Tocar otro cambia lo que se ve —materias con sus conteos,
proyectos, estudiantes, podio, certificados, tablero y CSV— y se recuerda en la
sesión, pero **no cambia dónde caen los registros nuevos**: eso lo decide
`PERIODO` y nada más.

- Al actualizar una base que venía de antes de los semestres, todo lo que había
  queda asignado al semestre **más antiguo**, no al que esté en curso.
- Un mismo estudiante puede repetir materia en otro semestre: la clave única es
  materia + semestre + correo.

## Certificados

El certificado no es una cosa de la Expo: es una cosa del programa. **Los cinco
—la muestra, el torneo, la jam, el festival y las salidas— emiten por el mismo
sitio**, con un solo código, una sola página y un solo QR. Cambia quién
califica y qué dice la frase; lo demás es igual.

- Cada certificado lleva un **código de 8 caracteres** y vive en
  `/certificado/CODIGO`, público y sin login. Su **QR apunta a esa misma
  página**, así que escanearlo es la verificación.
- Los datos quedan **congelados** al emitir (nombre, qué hizo, dónde,
  compañeros, quién firma). Si después cambia una nota, se borra un proyecto o
  se le cambia el nombre a un equipo, lo que alguien ya compartió sigue
  diciendo lo mismo.
- **Regenerar es seguro**: actualiza los premios sin crear certificados nuevos
  ni cambiar los enlaces que ya circulan.
- Desde la página se puede **compartir** (usa el menú nativo del celular, o
  copia el enlace) y **descargar en PDF**, que imprime solo el certificado
  sobre fondo blanco.

### Quién recibe qué

| Evento | Certificado de participación | Premios |
|---|---|---|
| Expo Multimedia | Uno por estudiante de cada proyecto | El **puesto sale de las notas**: 1.°, 2.° y 3.° del ranking de la materia |
| Virtual Champions | Cada jugador de los equipos aprobados, **suplentes incluidos** | `config.VC.premios`, adjudicados en el panel del torneo |
| Jam de Altura | Cada integrante de los equipos que **entregaron** | `config.JAM.premios`, adjudicados en el panel de la edición |
| Multimedia Music Fest | Un grupo confirmado = **un certificado al contacto**; una persona de producción = el suyo | `config.MUSIC.premios` |
| Salidas pedagógicas | Quien aparece como **asistió**, no quien pagó | No hay: una salida no es una competencia |

El puesto de la Expo se calcula con el mismo cálculo del tablero: cada docente
promedia los criterios que calificó y la nota del proyecto es el promedio entre
docentes. Los empates comparten puesto y el siguiente salta (1.°, 1.°, 3.°). Un
proyecto sin calificar no entra al podio: sale con participación.

En Music Fest solo se certifica al contacto de cada grupo porque la inscripción
de un acto **no pide la lista de quiénes lo integran**, solo cuántos son: no hay
nombres que poner. El día que se pidan, `emitirDeMusic` es donde se reparten.

### Los premios que no se calculan

El podio de la Expo sale de las notas. El torneo, la jam y el festival no tienen
notas —quién hizo el mejor apartado artístico lo decide un jurado—, así que
alguien lo declara desde el panel y queda en la tabla `premios_evento`.

Las **categorías viven en `config.js`** (`VC.premios`, `JAM.premios`,
`MUSIC.premios`), no en los JSON de contenido: de ahí salen a la vez la promesa
de la página pública, el selector del panel y lo que termina escrito en el
certificado, para que no puedan decir tres cosas distintas. En
`data/<evento>.json` queda solo **qué se lleva** cada categoría, buscado por su
id. Cada categoría se entrega una sola vez por torneo o por edición: declarar
otro ganador reemplaza al anterior en vez de dejar dos campeones.

En Virtual Champions el selector de «Campeón» llega **preseleccionado** con
quien ganó la última partida cerrada del bracket. Es una sugerencia y no se
escribe sola: la final es presencial, hay torneos que se resuelven fuera del
bracket y corregir un mapa puede cambiar el ganador después.

### Dónde lo encuentra quien participó

Con el mismo código con el que consulta todo lo demás: `/registro/estado` en la
Expo, `/vc/inscripcion/estado`, `/jam/inscripcion/estado`,
`/music/inscripcion/estado` y `/salidas/estado`. El bloque aparece solo cuando
la organización ya emitió; antes de eso no se promete nada.

Lo que va en el certificado se decidió así: nombre, reconocimiento, qué hizo,
dónde, compañeros de equipo, fecha, firma y «Universidad de Boyacá · Ingeniería
en Multimedia». **La nota numérica no aparece.** Firma quien apretó el botón en
el panel, salvo en las salidas, donde firma el docente encargado que está en
`config.SALIDAS` porque es quien responde por ella. El emisor se cambia con
`institucion` en `data/expo.json`, y `evento.fecha` reemplaza la fecha de
emisión cuando el evento tenga día definido.

## Correos automáticos

En la Expo, la app le escribe al estudiante en tres momentos —el torneo, la jam
y [INKreible](#inkreible) tienen los suyos, contados en sus secciones—. Todo es
**opcional**: sin configurar nada funciona igual que antes, solo que sin avisos.

| Cuándo | A quién | Qué lleva |
|---|---|---|
| Al registrarse | Al contacto que llenó el formulario | El código, la materia, la sala, el equipo y el enlace para consultar el estado |
| Al aprobar o rechazar | Al mismo contacto | El resultado, la sala si quedó aprobado y el motivo si el docente lo escribió |
| Al avisar los certificados | A cada integrante, uno por uno | Su reconocimiento y el enlace a su certificado |

### Configurarlo

Copia `.env.example` como `.env` (ese archivo **no se sube a git**) y llena:

```
SMTP_USER=tucuenta@gmail.com
SMTP_PASS=abcd efgh ijkl mnop
SITIO_URL=https://xxxxx.ngrok-free.app
```

`SMTP_PASS` **no es la contraseña de tu Gmail**: es una *contraseña de
aplicación* de 16 letras que se genera en
[myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords),
y para eso la cuenta necesita la verificación en dos pasos activa. Se puede
pegar con espacios o sin ellos.

`SITIO_URL` es la dirección por la que entran los estudiantes: es la que llevan
los enlaces del correo, y **con ngrok cambia cada vez que se levanta el túnel**.
Si se deja vacía, cada enlace sale de la dirección por la que llegó esa visita:
sirve para el estudiante que se registra desde el túnel, pero el docente que
aprueba desde `localhost` mandaría enlaces a `localhost`. Al arrancar, la
consola avisa si eso está pasando.

Al arrancar se ve desde qué cuenta salen los correos:

```
  ✓ Correos:                 desde tucuenta@gmail.com
```

Lo que se ve en `config.js` es solo la cara del remitente: `CORREO.remitente`
(el nombre que aparece como quien envía) y `CORREO.responder_a` (a dónde va la
respuesta si el estudiante le contesta al correo; vacío = a la cuenta de
Gmail).

### El aviso de los certificados es un botón aparte

Emitir certificados es idempotente y se repite cada vez que cambia una nota o
se declara un premio; un correo, en cambio, no se puede devolver. Por eso
**generar no avisa**: al lado del botón de emitir hay otro, *«Avisar por correo
a N…»*, que se toca cuando el podio ya está definitivo. Es igual en los cinco
paneles.

- A cada quien se le avisa **una sola vez**: regenerar los certificados no
  vuelve a escribirle a nadie. En la lista de certificados cada uno dice
  `✉ avisado` o `sin avisar`.
- Si un correo no sale, ese certificado **queda pendiente** y el botón sigue
  ahí para reintentar. Nadie recibe el aviso dos veces.
- Los certificados sin correo (de proyectos cargados a mano, sin registro) no
  se pueden avisar y quedan por fuera de la cuenta.
- Si después de avisar cambia un premio, ese correo ya salió: lo que se manda
  es un enlace, y el certificado en `/certificado/CODIGO` sí muestra siempre el
  dato actualizado.

### Si algo falla

Ningún fallo de correo tumba lo que lo provocó: un registro queda guardado y
una aprobación crea el proyecto aunque el envío reviente. Los avisos del
registro y de la revisión salen en segundo plano —el estudiante ve su código en
pantalla sin esperar al correo— y lo único que dejan es un renglón en la
consola:

```
  ✉ mfrios@uniboyaca.edu.co · Registro recibido · código K7M2QP
  ! No se pudo enviar a apena@uniboyaca.edu.co: Invalid login: 535-5.7.8 …
```

Cosas que conviene saber antes del evento:

- Gmail gratuito aguanta unos **500 correos al día**. Para una Expo entera
  alcanza de sobra, pero si se pasa, Google bloquea el envío por 24 horas.
- Un correo de Gmail a `@uniboyaca.edu.co` puede caer en **no deseado**. La
  página de confirmación ya se lo dice al estudiante, y el código igual se ve
  en pantalla y se consulta en `/registro/estado`.
- Si el correo está apagado, la vista de la materia lo dice en vez de mostrar
  el botón de avisos.

## Crear varias materias de una vez

En la pantalla principal, abre *"Crear varias materias de una vez"* y pega una
por línea: se puede pegar desde Excel, Word o WhatsApp, porque la app limpia
espacios, numeración (`1.`, `-`, `•`) y repetidos. Las materias que ya existen
se omiten.

Es lo único que se carga en lote. Los estudiantes y los proyectos entran por el
registro, nunca a mano.

## Exponer con ngrok

En otra terminal:

```bash
ngrok http 3000
```

Comparte la URL `https://xxxxx.ngrok-free.app`: quien la abra cae en la página
del evento vigente. Los docentes entran por `…/acceso` con su nombre y la contraseña
compartida.

> Si usas el túnel de VS Code en su lugar, expón el puerto 3000 y comparte la URL.