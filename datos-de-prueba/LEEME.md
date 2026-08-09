# Datos de prueba

Ocho semestres inventados (2022-10 … 2025-20) para ver `/info` con historia:
Expos con podio, torneos con campeón, jams con tema y juegos entregados,
festivales con cartel y los registros de tres salidas pasadas.

- `sembrar.js` — lo que los metió. Se vuelve a correr con `node datos-de-prueba/sembrar.js`
  (ojo: correrlo dos veces los duplica).
- `respaldo-base/` — la base **antes** de sembrar nada, con su `-wal` y su `-shm`.

## Cómo se borra todo

1. Parar la app.
2. `cp datos-de-prueba/respaldo-base/expo.db* db/` — los TRES archivos, o SQLite
   le aplica un WAL que no es suyo a una base que no lo espera.
3. Quitar de `config.js` los tres objetos marcados como datos de prueba en
   `SALIDAS.salidas` (sofa-2024, chicaque-2025, canal-capital).
4. Borrar esta carpeta.
