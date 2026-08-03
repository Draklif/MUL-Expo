// =====================================================================
//  CONFIGURACIÓN — Edita este archivo ANTES de correr la app por primera vez.
//  Al reiniciar, los docentes se sincronizan automáticamente con esta lista.
// =====================================================================

// Semestre con el que arranca la base la primera vez. Después se crean y se
// cambian desde el panel; esto ya no se vuelve a mirar.
const PERIODO_INICIAL = "2026-20";

// Dominio institucional. Todo correo (docentes y estudiantes) tiene que
// terminar en @DOMINIO; cualquier otro se rechaza.
const DOMINIO = "uniboyaca.edu.co";

// Contraseña compartida para todos los docentes.
// El correo identifica a cada quien; esta clave es la segunda barrera.
const PASSWORD = "expo2026";

// Lista de docentes habilitados. Entran con su correo + la contraseña de arriba.
//
// Para cambiar un correo mal escrito: se corrige aquí y se reinicia. La
// identidad es el NOMBRE, así que la persona conserva sus materias, sus
// calificaciones y los registros que haya revisado. Cambiar el nombre de
// alguien que ya tiene datos, en cambio, crea un docente nuevo.
const DOCENTES = [
  { name: "Jose Rentería",   email: "jmrenteria@uniboyaca.edu.co" },
  { name: "Juan Niño",       email: "juaestnino@uniboyaca.edu.co" },
  { name: "Manuel Corredor", email: "mancorredor@uniboyaca.edu.co" },
  { name: "Oscar Pérez",     email: "lperez54@uniboyaca.edu.co" },
];

// Criterios de la rúbrica (los mismos para TODOS los proyectos).
// Escala 0 a 5. El promedio final del proyecto es el promedio de
// (promedio de criterios) entre todos los docentes que calificaron.
const CRITERIOS = [
  { key: "contenido",   label: "Contenido / Investigación" },
  { key: "diseno",      label: "Diseño y calidad visual" },
  { key: "tecnica",     label: "Aspectos técnicos" },
  { key: "exposicion",  label: "Exposición y dominio" },
  { key: "innovacion",  label: "Innovación / Creatividad" },
];

// Criterios de la rúbrica INDIVIDUAL (por integrante del grupo).
const CRITERIOS_IND = [
  { key: "dominio",       label: "Dominio del tema" },
  { key: "comunicacion",  label: "Comunicación oral" },
  { key: "aporte",        label: "Aporte al proyecto" },
];

// Escala máxima por criterio (0 a ESCALA_MAX).
const ESCALA_MAX = 5;

module.exports = {
  PERIODO_INICIAL,
  DOMINIO,
  PASSWORD,
  DOCENTES,
  CRITERIOS,
  CRITERIOS_IND,
  ESCALA_MAX,
};
