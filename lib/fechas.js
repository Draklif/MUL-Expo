// =====================================================================
//  Fechas y horas locales.
//
//  La regla de la casa: las fechas que escribe un docente se guardan como
//  texto ("2026-11-20 19:30") y se leen partiendo la cadena, NUNCA pasándola
//  por Date. Colombia va cinco horas detrás de UTC, así que
//  new Date("2026-11-20") es medianoche UTC y aquí cae el día 19: una jam que
//  empieza el viernes se anunciaría el jueves.
//
//  Date solo aparece en dos sitios de este archivo y en los dos con los
//  números ya sacados de la cadena: para saber qué día de la semana cae y
//  para convertir a milisegundos (que es lo que necesita un contador).
// =====================================================================

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// Las piezas sueltas de "2026-11-20 19:30" (o con la T del input HTML).
// Devuelve null si la cadena no tiene esa forma.
function partir(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(texto || ""));
  if (!m) return null;
  return {
    anio: Number(m[1]),
    mes: Number(m[2]),
    dia: Number(m[3]),
    hora: Number(m[4]),
    minuto: Number(m[5]),
    fecha: `${m[1]}-${m[2]}-${m[3]}`,
  };
}

// "2026-11-20 19:30" → { dia: "viernes 20 de noviembre", hora: "7:30 p. m." }
function momento(inicio) {
  const p = partir(inicio);
  if (!p) return null;

  const diaSemana = DIAS[new Date(p.anio, p.mes - 1, p.dia).getDay()];
  const sufijo = p.hora < 12 ? "a. m." : "p. m.";
  const hora12 = p.hora % 12 === 0 ? 12 : p.hora % 12;

  return {
    fecha: p.fecha,
    dia: `${diaSemana} ${p.dia} de ${MESES[p.mes - 1]}`,
    diaCorto: `${p.dia} ${MESES[p.mes - 1].slice(0, 3)}`,
    hora: `${hora12}:${String(p.minuto).padStart(2, "0")} ${sufijo}`,
  };
}

// Milisegundos desde 1970 de un instante local. Es lo que come el contador:
// el servidor manda un número y el navegador resta.
function instante(texto) {
  const p = partir(texto);
  if (!p) return null;
  return new Date(p.anio, p.mes - 1, p.dia, p.hora, p.minuto, 0, 0).getTime();
}

// Lo que quiere un <input type="datetime-local">: con T y sin segundos.
function paraInput(texto) {
  const p = partir(texto);
  return p ? `${p.fecha}T${String(p.hora).padStart(2, "0")}:${String(p.minuto).padStart(2, "0")}` : "";
}

// Lo que manda ese mismo input, listo para guardar. Se cambia la T por un
// espacio para que ordene bien como texto y se lea igual.
function desdeInput(valor) {
  const p = partir(valor);
  if (!p) return null;
  return `${p.fecha} ${String(p.hora).padStart(2, "0")}:${String(p.minuto).padStart(2, "0")}`;
}

// "2026-11-20 19:30" más unas horas, otra vez como texto guardable. Sirve
// para decir a qué hora se cierra una jam de 48 horas sin que el que lo lee
// tenga que sumar de cabeza.
function sumarHoras(texto, horas) {
  const base = instante(texto);
  if (base === null) return null;
  const d = new Date(base + Number(horas || 0) * 3600000);
  const dos = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

module.exports = { DIAS, MESES, partir, momento, instante, paraInput, desdeInput, sumarHoras };
