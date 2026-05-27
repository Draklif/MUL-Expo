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