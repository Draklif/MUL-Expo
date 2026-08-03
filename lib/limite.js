// =====================================================================
//  Freno por IP para los endpoints públicos (login y registro).
//  En memoria: se reinicia con el servidor y basta para el evento.
//
//  Va separado en `alcanzado` y `registrar` a propósito: así solo gastan
//  cupo los intentos que interesa frenar (un login fallido, un registro
//  que sí entró) y nunca los usos legítimos. Detrás de ngrok o del wifi
//  del campus mucha gente comparte IP, y un contador que cuente todo
//  termina bloqueando a quien no debe.
// =====================================================================

function crearLimite({ ventanaMs, maximo }) {
  const marcas = new Map();

  const vigentes = (clave, ahora) =>
    (marcas.get(clave) || []).filter((t) => ahora - t < ventanaMs);

  return {
    // ¿Ya se pasó del cupo? No consume nada.
    alcanzado(clave) {
      const ahora = Date.now();
      const previas = vigentes(clave, ahora);
      marcas.set(clave, previas);
      return previas.length >= maximo;
    },

    // Anota un intento que sí cuenta.
    registrar(clave) {
      const ahora = Date.now();
      const previas = vigentes(clave, ahora);
      previas.push(ahora);
      marcas.set(clave, previas);

      if (marcas.size > 500) {
        for (const [k, v] of marcas) {
          if (!v.some((t) => ahora - t < ventanaMs)) marcas.delete(k);
        }
      }
    },
  };
}

module.exports = { crearLimite };
