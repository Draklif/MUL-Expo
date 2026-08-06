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

1. Ajusta el array `DOCENTES`: cada uno con su `name` y su `email`
   institucional, que es con lo que entra.
   Y `PERIODO_INICIAL`, el semestre con el que arranca la base.
2. Ajusta `CRITERIOS` si quieres otros nombres de rúbrica.
3. Cambia `ESCALA_MAX` si prefieres 0-10 en vez de 0-5.

Copia `.env.example` como `.env` —lo secreto— y llénalo:

| Variable | Para qué | ¿Obligatoria? |
|---|---|---|
| `PASSWORD_DOCENTES` | La contraseña compartida de los docentes | **Sí**: sin ella la app no arranca |
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
  · Multimedia Music Fest    http://localhost:3000/music-fest
  ✓ Acceso docentes:         http://localhost:3000/acceso
  ✓ Panel Virtual Champions: http://localhost:3000/vc/acceso
  ✓ Panel Jam de Altura:     http://localhost:3000/jam/acceso
  ✓ Para exponer con ngrok:  ngrok http 3000
```

Abre `http://localhost:3000` en el navegador del PC.

## Las dos caras de la app

| Ruta | Quién entra | Qué es |
|---|---|---|
| `/` | Cualquiera, sin login | El [evento vigente](#los-eventos): el que esté más próximo a suceder |
| `/expo` | Cualquiera, sin login | Página pública de la Expo: el recorrido, el plano, los horarios |
| `/virtual-champions`, `/jam-de-altura`, `/music-fest` | Cualquiera, sin login | Los otros eventos del programa |
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

Son **tres herramientas con tres contraseñas**: la de la Expo
(`PASSWORD_DOCENTES`), la del torneo (`PASSWORD_VC`) y la de la jam
(`PASSWORD_JAM`). Los docentes son los mismos —la lista de `config.js`— pero
entrar a una no abre las otras. Si a una le falta su clave en el `.env`, ese
panel queda cerrado y todo lo demás funciona igual.

## Los eventos

El programa tiene varios eventos y **nunca hay dos a la vez**, así que la raíz
`/` no es un menú de entrada: es directamente **el evento más próximo a
suceder**. Quien llegue sin enlace ve lo que viene, sin un clic de por medio.

Todo se maneja desde `EVENTOS`, en `config.js`:

```js
{ slug: "expo", nombre: "Expo Multimedia", fecha: "2026-11-20",
  lema: "…", datos: "expo.json", vista: "landing" }
```

| Campo | Para qué |
|---|---|
| `slug` | La dirección propia del evento (`/expo`). No se cambia una vez repartida |
| `fecha` | `AAAA-MM-DD` del día del evento. Vacío = "por confirmar" |
| `lema` | Una línea para la página de aviso, mientras no tenga la suya |
| `datos` | Archivo de `data/` con su contenido. Vacío = todavía no tiene |
| `vista` | Plantilla de `views/`. Vacío = usa `evento-proximo.ejs` |

**Cómo se decide la raíz:** gana el evento con la fecha más cercana que aún no
haya pasado (el día del evento cuenta como vigente). O sea que basta con
escribir las fechas una vez: el sitio cambia solo el día que toca. Si ninguno
tiene fecha futura —porque están vacías o porque ya pasaron todas— manda el
orden de la lista, y así el sitio nunca se queda sin portada.

**Para forzarlo** —probar, o clavar la raíz en un evento pase lo que pase— hay
dos llaves: `EVENTO_ACTIVO` en `config.js`, y `EVENTO=slug` en el `.env`, que
pesa más y sirve para mirar una página sin tocar el archivo.

Cada evento vive **además** en su propia dirección, que no cambia nunca: la
Expo está siempre en `/expo`, esté o no en la raíz. Los enlaces repartidos
sirven antes y después de su turno, y el pie de todas las páginas lleva a los
demás eventos.

**Un evento nuevo:** se agrega a la lista con su `slug` y ya es visitable —sale
la página de aviso, con el nombre, la fecha y el lema—. Cuando tenga contenido
se le crea su `data/*.json` y su vista, se apuntan en `datos` y `vista`, y la
dirección sigue siendo la misma. Si quiere identidad visual propia, la vista
puede pasarle otra hoja al head (`css: '/loquesea.css'`), que reemplaza a
`styles.css` entera en vez de apilarse encima.

## Jam de Altura

La gamejam de 48 horas, completamente virtual: se anuncia un tema, arranca un
reloj y los equipos entregan un videojuego antes de que llegue a cero. Vive en
`/jam-de-altura` y tiene identidad propia —pixel, `public/jam.css`—, su propia
base (`jam_*`) y su propio panel.

### La edición es la unidad que se repite

Una **edición** es la jam de un semestre: sus equipos, su tema y sus juegos.
Para el semestre siguiente **no se borra nada**: se abre otra edición y la
anterior queda archivada tal como quedó.

Eso se hace desde `/jam/panel`, en **Abrir la edición de un semestre**:

- se elige un semestre de la lista o se escribe uno nuevo (`2027-10`) y se crea;
- con la casilla marcada, ese pasa a ser el **semestre activo del programa** —el
  mismo que usan la Expo y el torneo—;
- la edición que estuviera abierta queda cerrada, y la nueva arranca vacía y
  **con las inscripciones abiertas**.

Después de eso ya no hay nada más que preparar: el sitio público muestra la
edición nueva y el formulario empieza a recibir. Los enlaces de los equipos
viejos (`/jam/equipo/12`) siguen funcionando para siempre.

### Las herramientas del panel, en orden de uso

| # | Herramienta | Qué hace |
|---|---|---|
| 1 | **Cronograma** | Día, hora y duración. Es lo único que mueve el reloj gigante de la página |
| 2 | **El tema** | Se escribe y se guarda **escondido**; un botón aparte lo revela |
| 3 | **Inscripciones** | Admitir o rechazar equipos. Al hacerlo sale un correo al líder |
| 4 | **Armar equipos** | Con los que se inscribieron solos, viendo la disciplina de cada uno |
| 5 | **Equipos admitidos** | Quién entregó qué, y sacar a alguien de un equipo si se retiró |
| 6 | **Tablón** | Avisos que salen en la página pública sin recargar |

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

Quien no tiene equipo se inscribe solo, dice de qué se encarga y queda en una
lista; la organización arma los equipos mezclando disciplinas y a cada uno le
llega un correo con quiénes le tocaron.

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

**Cerrar el registro:** en `data/expo.json`, `registro.abierto: false`. El
formulario deja de recibir y la página de la Expo muestra `aviso_cerrado` en lugar del
botón.

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

La app sirve para la Expo de este semestre y para las que vengan. **Las materias
no se repiten por semestre**: se crean una vez y siguen ahí. Lo que arranca de
cero cada semestre son los registros, los proyectos, las notas y los
certificados.

En el panel, arriba, están los semestres. El que tiene el punto verde es el
**activo**: ahí caen los registros que hagan los estudiantes, sin importar qué
semestre esté mirando cada docente. Tocar otro semestre cambia lo que se ve
—materias con sus conteos, proyectos, estudiantes, podio, certificados, tablero
y CSV— y se recuerda en la sesión.

Para empezar el siguiente: **Abrir un semestre nuevo**, con el código en formato
`AAAA-NN` (`2027-10` para el primero del año, `2027-20` para el segundo). Con la
casilla marcada queda activo de una vez; si no, se abre para preparar y se
activa después con el botón que aparece al verlo.

- El semestre con el que arranca una base nueva sale de `PERIODO_INICIAL` en
  `config.js`. Después se maneja todo desde el panel.
- Al actualizar una base existente, todo lo que había queda asignado al semestre
  inicial.
- Un mismo estudiante puede repetir materia en otro semestre: la clave única es
  materia + semestre + correo.
- Los certificados de semestres pasados siguen públicos y verificables con su
  QR; nada se reescribe al abrir uno nuevo.

## Certificados

Al final de cada materia, **Generar certificados** emite **uno por estudiante**:
puesto para los tres primeros y constancia de participación para el resto.

- El **puesto sale de las notas** con el mismo cálculo del tablero: cada docente
  promedia los criterios que calificó y la nota del proyecto es el promedio
  entre docentes. Los empates comparten puesto y el siguiente salta (1.°, 1.°,
  3.°). Un proyecto sin calificar no entra al podio: sale con participación.
- Cada certificado lleva un **código de 8 caracteres** y vive en
  `/certificado/CODIGO`, público y sin login. Su **QR apunta a esa misma
  página**, así que escanearlo es la verificación.
- Los datos quedan **congelados** al emitir (nombre, proyecto, materia, sala,
  compañeros, docente que firma). Si después cambia una nota o se borra el
  proyecto, lo que alguien ya compartió sigue diciendo lo mismo.
- **Regenerar es seguro**: actualiza los puestos sin crear certificados nuevos
  ni cambiar los enlaces que ya circulan.

El estudiante lo encuentra en `/registro/estado` con el mismo código con el que
consultó su registro. Desde la página puede **compartir** (usa el menú nativo
del celular, o copia el enlace) y **descargar en PDF**, que imprime solo el
certificado sobre fondo blanco.

Lo que va en el certificado se decidió así: nombre, puesto, proyecto, materia,
sala, compañeros de equipo, fecha, firma del docente y «Universidad de Boyacá ·
Ingeniería en Multimedia». **La nota numérica no aparece.** El emisor se cambia
con `institucion` en `data/expo.json`, y `evento.fecha` (hoy vacío) reemplaza la
fecha de emisión cuando se defina el día de la Expo.

## Correos automáticos

La app le escribe al estudiante en tres momentos. Todo es **opcional**: sin
configurar nada funciona igual que antes, solo que sin avisos.

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

Emitir certificados es idempotente y se repite cada vez que cambia una nota;
un correo, en cambio, no se puede devolver. Por eso **generar no avisa**: en la
materia aparece un botón *«Avisar por correo a N estudiantes»* que se toca
cuando el podio ya está definitivo.

- A cada estudiante se le avisa **una sola vez**: regenerar los certificados no
  vuelve a escribirle a nadie. En la lista de certificados cada uno dice
  `✉ avisado` o `sin avisar`.
- Si un correo no sale, ese certificado **queda pendiente** y el botón sigue
  ahí para reintentar. Nadie recibe el aviso dos veces.
- Los certificados sin correo (de proyectos cargados a mano, sin registro) no
  se pueden avisar y quedan por fuera de la cuenta.
- Si después de avisar cambia un puesto, ese correo ya salió: lo que se manda
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