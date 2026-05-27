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

## ⚠️ Antes de arrancar: edita `config.js`

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
  ✓ Expo Eval corriendo en http://localhost:3000
  ✓ Para exponer con ngrok:  ngrok http 3000
```

Abre `http://localhost:3000` en el navegador del PC.

## Exponer con ngrok

En otra terminal:

```bash
ngrok http 3000
```

Comparte la URL `https://xxxxx.ngrok-free.app` con los docentes. Pueden
abrirla en el celular y entrar con su código.

> Si usas el túnel de VS Code en su lugar, expón el puerto 3000 y comparte la URL.

## Cómo se usa

1. **Login**: cada docente elige su nombre del desplegable o teclea su código.
2. **Crear materia**: en el home hay un campo arriba para crear materias al vuelo.
3. **Crear proyecto**: al entrar a una materia hay un formulario para agregar
   un proyecto con su título y los integrantes (uno por línea).
4. **Calificar**: cada proyecto tiene una hoja con la rúbrica. Toca un botón
   por criterio (0 a 5) y guarda. Puedes volver y actualizar tu calificación
   cuantas veces quieras.
5. **Tablero en vivo**: ranking de proyectos por promedio, con auto-refresh
   cada 3 segundos. Filtrable por materia. Cada fila se puede expandir para
   ver el detalle por criterio.

## Cómo se calcula el promedio

Para cada proyecto:

1. Cada docente que lo calificó obtiene su propio promedio (media de los
   criterios que dio).
2. El promedio del proyecto es el promedio entre esos promedios por docente.

Así, un docente que solo califique algunos criterios no distorsiona los pesos.

## Reiniciar todo

Si quieres borrar materias/proyectos/calificaciones (dejando solo los
docentes), elimina `db/expo.db` y reinicia.

## Estructura

```
expo-eval/
├── config.js            ← edita docentes y criterios aquí
├── server.js
├── package.json
├── db/
│   ├── database.js      ← esquema + seed
│   └── expo.db          ← se crea al arrancar (gitignored)
├── routes/
│   ├── auth.js
│   ├── materias.js
│   ├── proyectos.js
│   └── api.js           ← endpoint JSON del ranking en vivo
├── views/               ← EJS
└── public/
    └── styles.css
```

## Troubleshooting

- **`SyntaxError: node:sqlite ... unknown`** → tu Node es anterior a 22.5.
  Actualízalo desde [nodejs.org](https://nodejs.org).
- **El celular no carga la URL de ngrok** → revisa que ngrok esté corriendo
  y que la URL sea `https://...` (no `http`).
- **No veo el promedio actualizándose** → el tablero refresca cada 3 segundos;
  si guardas una nota desde otro dispositivo, tarda máx. 3s en aparecer.
