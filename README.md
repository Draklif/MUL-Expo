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

Solo descarga Express, EJS y session. **No compila nada nativo.**

Abre `config.js` y:

1. Reemplaza el array `DOCENTES` con los docentes reales. Cada uno con un
   `code` único (lo que tecleará para entrar) y su `name`.
2. Ajusta `CRITERIOS` si quieres otros nombres de rúbrica.
3. Cambia `ESCALA_MAX` si prefieres 0-10 en vez de 0-5.

> Si después agregas docentes a `config.js` y reinicias, se suman sin borrar
> los datos existentes. Si renombras a un docente (mismo `code`, distinto
> `name`), se actualiza.

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
| `/` | Cualquiera, sin login | Landing pública de la Expo: el recorrido, el plano y cómo se evalúa |
| `/acceso` | Docentes | Login (enlace discreto al pie de la landing) |
| `/panel` | Docentes | Materias, estudiantes y proyectos |
| `/tablero` | Docentes | Ranking en vivo |

### Editar el contenido público

Todo lo que se ve en `/` vive en `data/expo.json`. Se edita el archivo y se
recarga el navegador: el servidor lo relee cuando cambia, **sin reiniciar**.

- `evento` — nombre, tipo, cuándo, dónde y la descripción del hero.
- `salas` — las experiencias del recorrido, con su lema, montaje, `horario` y
  las asignaturas que exponen ahí. El color sale de `accent`
  (`code`, `story`, `realtime` o `design`).
- `jornada` e `itinerario` — los horarios.
- `mapa` — el plano interactivo.

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

## Cargar materias y estudiantes de una vez

Todo se puede pegar desde Excel, Word o WhatsApp: la app limpia espacios,
numeración (`1.`, `-`, `•`) y repetidos.

**Materias en lote** — en la pantalla principal, abre *"Crear varias materias
de una vez"* y pega una por línea. Las que ya existen se omiten.

**Estudiantes por materia** — dentro de la materia, en *"Estudiantes"*, pega la
lista (uno por línea, o separados por comas si va todo en un renglón). Si pegas
dos columnas desde Excel (nombre + código), se toma solo la primera.

**Crear proyectos** — al agregar un proyecto, los integrantes se eligen tocando
los nombres de la lista de la materia; ya no hay que escribirlos. Si alguien no
está en la lista, se puede agregar a mano y queda guardado en la materia para la
próxima vez.

En la lista de estudiantes, un ✓ marca a quien ya está en algún proyecto, para
ver de un vistazo quién falta. Quitar a un estudiante de la lista **no** borra
proyectos ni calificaciones.

## Exponer con ngrok

En otra terminal:

```bash
ngrok http 3000
```

Comparte la URL `https://xxxxx.ngrok-free.app`: quien la abra cae en la landing
de la Expo. Los docentes entran por `…/acceso` con su nombre y la contraseña
compartida.

> Si usas el túnel de VS Code en su lugar, expón el puerto 3000 y comparte la URL.