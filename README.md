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

Solo descarga Express, EJS, session y `qrcode-svg` (para el QR de los
certificados, sin dependencias propias). **No compila nada nativo.**

Abre `config.js` y:

1. Ajusta el array `DOCENTES`: cada uno con su `name` y su `email`
   institucional, que es con lo que entra.
2. Cambia `PASSWORD`: es la misma para todos los docentes.
3. Ajusta `CRITERIOS` si quieres otros nombres de rúbrica.
4. Cambia `ESCALA_MAX` si prefieres 0-10 en vez de 0-5.

`DOMINIO` es el dominio institucional (`uniboyaca.edu.co`). Todo correo de la
app —el de los docentes al entrar y el de los estudiantes al registrarse— tiene
que terminar en él; cualquier otro se rechaza.

> Agregar docentes a `config.js` y reiniciar los suma sin tocar lo existente.
> **La identidad es el `name`**: corregir un correo mal escrito actualiza a la
> misma persona y conserva sus materias, calificaciones y revisiones. Quitar a
> alguien de la lista lo borra solo si no dejó datos; si dejó, se conserva (con
> un aviso en consola) y simplemente deja de poder entrar.

## Cómo entran los docentes

En `/acceso`, con **correo institucional + la contraseña compartida**. El correo
dice quién es cada quien; la contraseña es la segunda barrera. Ya no hay lista
de nombres desplegable: quien no sepa un correo válido no ve a nadie.

Si el correo o la clave están mal, el mensaje es el mismo ("Correo o contraseña
incorrectos") para que la página no sirva para averiguar quiénes son docentes.
El login aguanta 10 intentos cada 10 minutos por dispositivo.

## Arrancar

```bash
npm start
```

Verás:

```
  ✓ Expo Multimedia corriendo en http://localhost:3000
  ✓ Acceso docentes:         http://localhost:3000/acceso
  ✓ Para exponer con ngrok:  ngrok http 3000
```

Abre `http://localhost:3000` en el navegador del PC.

## Las dos caras de la app

| Ruta | Quién entra | Qué es |
|---|---|---|
| `/` | Cualquiera, sin login | Landing pública de la Expo: el recorrido, el plano, los horarios |
| `/expositores` | Estudiantes, sin login | Guía de montaje: qué debe tener el stand |
| `/registro` | Estudiantes, sin login | Registro de expositores |
| `/registro/estado` | Estudiantes, sin login | Consulta del estado con el código |
| `/certificado/:codigo` | Cualquiera, sin login | Certificado a pantalla completa (a donde apunta su QR) |
| `/acceso` | Docentes | Login (enlace discreto al pie de la landing) |
| `/panel` | Docentes | Materias, registros por revisar, estudiantes y proyectos |
| `/tablero` | Docentes | Ranking en vivo |

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
formulario deja de recibir y la landing muestra `aviso_cerrado` en lugar del
botón.

### Editar el contenido público

Todo lo que se ve en `/` vive en `data/expo.json`. Se edita el archivo y se
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
medidas en el JSON, la landing se redibuja sola.

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

Comparte la URL `https://xxxxx.ngrok-free.app`: quien la abra cae en la landing
de la Expo. Los docentes entran por `…/acceso` con su nombre y la contraseña
compartida.

> Si usas el túnel de VS Code en su lugar, expón el puerto 3000 y comparte la URL.