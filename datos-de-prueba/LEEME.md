# Datos de prueba

Un programa que lleva años funcionando, inventado, para poder enseñar el sitio
con algo que se parezca a como va a quedar.

Son dos cosas distintas y conviene no confundirlas:

**Ocho semestres pasados** (2022-10 … 2025-20), cerrados y con su historia:
Expos con sus proyectos calificados y su podio, torneos con campeón, jams con
tema y juegos entregados, festivales con cartel y tres ediciones de INKreible
con su galería. Es lo que se ve en `/info`.

**El semestre en curso**, a medio hacer: inscripciones abiertas, cosas por
revisar en cada panel, notas puestas por unos docentes y no por otros, pagos a
medias. Es lo que hace que `/panel`, `/tablero` y los cinco paneles de evento
tengan algo que enseñar.

## Los archivos

- `sembrar.js` — lo que los metió. Se corre con `node datos-de-prueba/sembrar.js`.
  Correrlo dos veces no duplica nada: se planta y avisa, salvo `--forzar`.
- `respaldo-base/` — la base **antes** de sembrar nada, con su `-wal` y su `-shm`.

Todo lo que siembra lleva un código que empieza por `S` y correos
`@uniboyaca.edu.co` inventados, así que se distingue de lo real de un vistazo.
El azar tiene semilla fija: dos corridas sobre una base limpia dan exactamente
lo mismo.

## Las imágenes de INKreible

Los dibujos apuntan a `picsum.photos`, que devuelve una imagen distinta por
cada semilla. Es a propósito: con enlaces de Drive inventados la galería sería
una parrilla de cuadros rotos y no se podría enseñar. `lib/ink.imagenDirecta`
deja pasar tal cual lo que no sea de Drive, así que no hubo que tocar nada
para que funcionara.

Necesitan internet para verse. Sin conexión, la galería sale con los marcos
vacíos y todo lo demás funciona igual.

## Cómo se borra todo

1. Parar la app.
2. `cp datos-de-prueba/respaldo-base/expo.db* db/` — los TRES archivos, o SQLite
   le aplica un WAL que no es suyo a una base que no lo espera.
3. Quitar de `config.js` los tres objetos marcados como datos de prueba en
   `SALIDAS.salidas` (sofa-2024, chicaque-2025, canal-capital).
4. Dejar la Expo como estaba en `config.EVENTOS`: `activo: false`,
   `inscripciones: false` y `fecha: ""`. Se puso en `true` para la muestra,
   porque solo el evento activo recibe inscripciones.
5. Borrar esta carpeta.
