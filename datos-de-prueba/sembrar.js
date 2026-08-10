// =====================================================================
//  DATOS DE PRUEBA
//
//  Llena la base con un programa que lleva años funcionando, para poder
//  enseñar el sitio con algo que se parezca a como va a quedar y no con
//  tres filas inventadas a mano.
//
//  Siembra dos cosas distintas y conviene no confundirlas:
//
//  1. OCHO SEMESTRES PASADOS (2022-10 … 2025-20), cerrados y con su
//     historia: Expos con sus proyectos calificados y su podio, torneos con
//     campeón, jams con tema y juegos entregados, festivales con cartel y
//     retos de dibujo con su galería. Es lo que se ve en /info.
//
//  2. EL SEMESTRE EN CURSO, a medio hacer: inscripciones abiertas, cosas
//     por revisar en cada panel, notas puestas por unos docentes y no por
//     otros, pagos a medias. Es lo que hace que /panel, /tablero y los
//     cinco paneles de evento tengan algo que enseñar.
//
//  Todo lo que mete lleva un código que empieza por 'S' y correos
//  @uniboyaca.edu.co inventados. Correrlo dos veces no duplica nada: se
//  planta y avisa, salvo que se le pase --forzar.
//
//    node datos-de-prueba/sembrar.js
//
//  Para dejar la base como estaba, ver LEEME.md.
// =====================================================================
const path = require("path");

// La raíz sale de dónde está este archivo y no de una ruta escrita a mano:
// el repositorio se clona donde a cada quien le quede cómodo.
const RAIZ = path.join(__dirname, "..");
const db = require(path.join(RAIZ, "db", "database"));
const {
  CRITERIOS,
  CRITERIOS_IND,
  ESCALA_MAX,
  PERIODO,
  VC,
  JAM,
  MUSIC,
  INK,
} = require(path.join(RAIZ, "config"));

const FORZAR = process.argv.includes("--forzar");

// ---------------------------------------------------------------------
//  Azar repetible
// ---------------------------------------------------------------------
// Un generador propio con semilla fija, no Math.random(): sembrar dos veces
// tiene que dar exactamente lo mismo. Si no, comparar dos corridas para ver
// si algo cambió es imposible.
let semilla = 20260810;
function azar() {
  semilla = (semilla * 1664525 + 1013904223) % 4294967296;
  return semilla / 4294967296;
}
const entre = (a, b) => a + Math.floor(azar() * (b - a + 1));
const alguno = (lista) => lista[Math.floor(azar() * lista.length)];

let n = 0;
const cod = () => `S${String(++n).padStart(5, "0")}`;

// ---------------------------------------------------------------------
//  Nombres
// ---------------------------------------------------------------------
const NOMBRES = [
  "Valentina", "Santiago", "Mariana", "Sebastián", "Camila", "Nicolás", "Sofía",
  "Andrés", "Isabella", "Juan David", "Laura", "Miguel Ángel", "Daniela",
  "Samuel", "Gabriela", "Tomás", "Sara", "Emmanuel", "Antonia", "Julián",
  "Manuela", "Felipe", "Salomé", "Alejandro", "Luciana", "Diego", "Paula",
  "Esteban", "Juliana", "Mateo", "Catalina", "Simón", "Ana María", "David",
  "Silvana", "Joaquín", "Michell", "Brayan", "Yeimy", "Kevin",
];

const APELLIDOS = [
  "Rodríguez", "Gómez", "Martínez", "Sánchez", "Pérez", "Vargas", "Castro",
  "Rojas", "Moreno", "Muñoz", "Ramírez", "Suárez", "Cárdenas", "Buitrago",
  "Alfonso", "Bohórquez", "Pinilla", "Camargo", "Niño", "Sierra", "Ochoa",
  "Piraquive", "Sanabria", "Fonseca", "Avella", "Cely", "Chaparro", "Wilches",
  "Riaño", "Guerrero", "Barrera", "Corredor", "Pineda", "Salamanca",
];

const usados = new Set();
function persona() {
  for (let intento = 0; intento < 60; intento++) {
    const nombre = `${alguno(NOMBRES)} ${alguno(APELLIDOS)} ${alguno(APELLIDOS)}`;
    if (usados.has(nombre)) continue;
    usados.add(nombre);
    return nombre;
  }
  return `${alguno(NOMBRES)} ${alguno(APELLIDOS)} ${usados.size}`;
}

// El correo institucional sale del nombre, como el de verdad: inicial, primer
// apellido y un número cuando choca.
let correos = 0;
function correoDe(nombre) {
  const partes = nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z ]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  const base = `${partes[0][0]}${partes[1] || "x"}`.slice(0, 12);
  return `${base}${++correos}@uniboyaca.edu.co`;
}

const SEMESTRE_ES = (c) => `${c.slice(5) === "10" ? "primer" : "segundo"} semestre de ${c.slice(0, 4)}`;

// ---------------------------------------------------------------------
//  Freno: esto no se corre dos veces por accidente
// ---------------------------------------------------------------------
const yaSembrado = db
  .prepare("SELECT COUNT(*) AS n FROM solicitudes WHERE codigo LIKE 'S%'")
  .get().n;

if (yaSembrado && !FORZAR) {
  console.log(`
  ! La base ya tiene ${yaSembrado} registros de prueba.

    Correrlo otra vez los duplicaría: los códigos se repiten desde S00001 y
    lo que no choque contra un UNIQUE entra por segunda vez.

    Para partir de cero, restaura el respaldo (ver LEEME.md).
    Para sembrar encima de todos modos:  node datos-de-prueba/sembrar.js --forzar
`);
  process.exit(1);
}

// ---------------------------------------------------------------------
//  Semestres y materias
// ---------------------------------------------------------------------
function periodo(codigo) {
  const y = db.prepare("SELECT * FROM periodos WHERE codigo = ?").get(codigo);
  if (y) return y;
  db.prepare("INSERT INTO periodos (codigo, activo) VALUES (?, 0)").run(codigo);
  return db.prepare("SELECT * FROM periodos WHERE codigo = ?").get(codigo);
}

const docentes = db.prepare("SELECT * FROM docentes ORDER BY id").all();
if (!docentes.length) {
  console.error("  ✕ No hay docentes en la base. Arranca el servidor una vez y vuelve a correr esto.");
  process.exit(1);
}

// Varias materias y no una sola: el panel de un docente se ve distinto —y se
// prueba de verdad— cuando hay que filtrar "solo las mías".
const MATERIAS = [
  "Proyecto Integrador",
  "Producción Audiovisual",
  "Desarrollo de Videojuegos",
  "Diseño de Interacción",
  "Animación Digital",
];

const materias = MATERIAS.map((nombre, i) => {
  const y = db.prepare("SELECT * FROM materias WHERE nombre = ?").get(nombre);
  if (y) return y;
  db.prepare("INSERT INTO materias (nombre, created_by) VALUES (?, ?)").run(
    nombre,
    docentes[i % docentes.length].id
  );
  return db.prepare("SELECT * FROM materias WHERE nombre = ?").get(nombre);
});

const SALAS = ["Indie Alley", "Pantalla Grande", "Laboratorio", "Sala Abierta"];

// ---------------------------------------------------------------------
//  La Expo: registro, proyecto, estudiantes y notas
// ---------------------------------------------------------------------
const insSolicitud = db.prepare(
  `INSERT INTO solicitudes
     (codigo, materia_id, periodo_id, titulo, sala, descripcion,
      contacto_nombre, contacto_email, estado, revisado_por, revisado_at, proyecto_id)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const insIntegrante = db.prepare(
  "INSERT INTO solicitud_integrantes (solicitud_id, nombre, email, orden) VALUES (?, ?, ?, ?)"
);
const insProyecto = db.prepare(
  "INSERT INTO proyectos (materia_id, periodo_id, titulo, integrantes, sala) VALUES (?, ?, ?, ?, ?)"
);
const insEstudiante = db.prepare(
  "INSERT OR IGNORE INTO estudiantes (materia_id, periodo_id, nombre, email) VALUES (?, ?, ?, ?)"
);
const insNota = db.prepare(
  `INSERT OR IGNORE INTO calificaciones (proyecto_id, docente_id, criterio, puntaje)
   VALUES (?, ?, ?, ?)`
);
const insNotaInd = db.prepare(
  `INSERT OR IGNORE INTO calificaciones_ind (proyecto_id, docente_id, integrante, criterio, puntaje)
   VALUES (?, ?, ?, ?, ?)`
);

/**
 * Un proyecto de la Expo, de punta a punta: el registro que llenó el
 * estudiante, el proyecto que salió de aprobarlo, sus integrantes sumados a
 * la materia y las notas de los docentes que alcanzaron a calificar.
 *
 * `calidad` mueve el promedio: es lo que hace que un ranking tenga cabeza y
 * cola en vez de veinte proyectos empatados en 3.5.
 */
function proyectoExpo({ per, materia, titulo, cuantos, calidad, estado, califican }) {
  const integrantes = [];
  for (let i = 0; i < cuantos; i++) {
    const nombre = persona();
    integrantes.push({ nombre, email: correoDe(nombre) });
  }

  const contacto = integrantes[0];
  const sala = alguno(SALAS);
  const aprobada = estado === "aprobada";

  let proyectoId = null;

  if (aprobada) {
    proyectoId = insProyecto.run(
      materia.id,
      per.id,
      titulo,
      integrantes.map((i) => i.nombre).join("\n"),
      sala
    ).lastInsertRowid;

    for (const i of integrantes) {
      insEstudiante.run(materia.id, per.id, i.nombre, i.email);
    }

    // Las notas. Cada docente que califica pone las cinco de la rúbrica del
    // proyecto y las tres de cada integrante, que es lo que pide el panel.
    for (const docente of califican) {
      for (const c of CRITERIOS) {
        const bruto = calidad + (azar() - 0.5) * 1.1;
        const nota = Math.max(1, Math.min(ESCALA_MAX, Math.round(bruto * 2) / 2));
        insNota.run(proyectoId, docente.id, c.key, nota);
      }
      for (const i of integrantes) {
        for (const c of CRITERIOS_IND) {
          const bruto = calidad + (azar() - 0.5) * 1.4;
          const nota = Math.max(1, Math.min(ESCALA_MAX, Math.round(bruto * 2) / 2));
          insNotaInd.run(proyectoId, docente.id, i.nombre, c.key, nota);
        }
      }
    }
  }

  const revisor = aprobada || estado === "rechazada" ? alguno(docentes).id : null;

  const solicitudId = insSolicitud.run(
    cod(),
    materia.id,
    per.id,
    titulo,
    sala,
    "Proyecto de prueba sembrado para la muestra del sitio.",
    contacto.nombre,
    contacto.email,
    estado,
    revisor,
    revisor ? "2026-01-01 09:00:00" : null,
    proyectoId
  ).lastInsertRowid;

  integrantes.forEach((i, orden) => insIntegrante.run(solicitudId, i.nombre, i.email, orden));

  return { proyectoId, integrantes, titulo };
}

// ---------------------------------------------------------------------
//  Lo que se hizo cada semestre
// ---------------------------------------------------------------------
const SEMESTRES = ["2022-10", "2022-20", "2023-10", "2023-20", "2024-10", "2024-20", "2025-10", "2025-20"];

const EXPO = {
  "2022-10": { proys: 12, podio: ["Primer Piso", "Ocho Cuadras", "Ruido Blanco"] },
  "2022-20": { proys: 15, podio: ["La Vuelta", "Media Res", "Zócalo"] },
  "2023-10": { proys: 18, podio: ["Bajo Cero", "Papel Quemado", "Tres Ríos"] },
  "2023-20": { proys: 21, podio: ["Sal y Piedra", "Andén", "Contraluz"] },
  "2024-10": { proys: 18, podio: ["Raíz de Agua", "Ruta 55", "Casa Vacía"] },
  "2024-20": { proys: 24, podio: ["Nimbo", "El Último Bus", "Trece Grados"] },
  "2025-10": { proys: 21, podio: ["Cordillera", "Tinta Sobre Piedra", "Vuelta Canela"] },
  "2025-20": { proys: 29, podio: ["Eco de Montaña", "Barro y Bit", "Ala Delta"] },
};

// Los que no son podio. Se reparten en orden y se repiten entre semestres sin
// problema: son proyectos distintos de gente distinta.
const TITULOS = [
  "Memoria de Barrio", "Ventana Rota", "El Rastro", "Cuarto Creciente",
  "Sin Señal", "Kilómetro 12", "La Última Fila", "Ruido de Fondo",
  "Piedra Angular", "Sobremesa", "Camino Real", "Cielo Raso",
  "Tierra Firme", "Doble Fondo", "Punto Ciego", "La Vitrina",
  "Hilo Suelto", "Media Luz", "El Desvío", "Nudo Corredizo",
  "Marca de Agua", "Caja Negra", "Voz en Off", "Plano Secuencia",
  "Fuera de Campo", "Contrapicado", "Tercer Acto", "Línea de Tiempo",
  "Papel Carbón", "Cuadro por Cuadro",
];

const VC_DATOS = {
  "2022-20": { valorant: { eq: 5, campeon: "Panela Gaming" } },
  "2023-10": { valorant: { eq: 6, campeon: "Boyacá Esports" } },
  "2023-20": { valorant: { eq: 6, campeon: "Frailejones" } },
  "2024-20": { valorant: { eq: 6, campeon: "Cóndores de Tunja" } },
  "2025-10": { valorant: { eq: 8, campeon: "Panela Gaming" }, lol: { eq: 5, campeon: "Frailejones" } },
  "2025-20": { valorant: { eq: 10, campeon: "Cóndores de Tunja" }, lol: { eq: 7, campeon: "Alto Ricaurte" } },
};

const EQUIPOS_VC = [
  "Panela Gaming", "Boyacá Esports", "Frailejones", "Cóndores de Tunja",
  "Alto Ricaurte", "Puente de Boyacá", "Los Muiscas", "Tunja Norte",
  "Escuadrón 15", "Nevado Team", "Ruta del Sol", "Zaque Gaming",
];

const JAM_DATOS = {
  "2022-10": { tema: "Dos botones", juegos: ["Doble Clic", "Dos"] },
  "2022-20": { tema: "Se repite", juegos: ["Bucle", "Otra Vez", "Deja Vu"] },
  "2023-10": { tema: "Bajo el agua", juegos: ["Fondo", "Corriente", "Marea"] },
  "2023-20": { tema: "Lo que dejaste atrás", juegos: ["Baúl", "Lo Que Queda"] },
  "2024-20": { tema: "Una sola habitación", juegos: ["Cuarto 12", "Sin Puerta", "El Inquilino"] },
  "2025-10": { tema: "Se rompe al usarlo", juegos: ["Frágil", "Vidrio Molido", "Última Cuerda", "Rompe"] },
  "2025-20": { tema: "Nadie te está mirando", juegos: ["Turno de Noche", "Vigía", "Cámara Oculta", "Escondite", "Sin Testigos"] },
};

const MUSIC_DATOS = {
  "2022-20": { fecha: "Viernes 18 de noviembre", lugar: "Plazoleta central", cartel: ["Tambores de Tunja", "Banda del Sur", "Aires de Boyacá"], prod: 6, mejor: 0 },
  "2023-10": { fecha: "Viernes 19 de mayo", lugar: "Plazoleta central", cartel: ["Aires de Boyacá", "Nudo Ciego", "Coro Uniboyacá", "Semilla"], prod: 7, mejor: 1 },
  "2023-20": { fecha: "Jueves 16 de noviembre", lugar: "Auditorio Central", cartel: ["Raíz Andina", "Tambores de Tunja", "La Sonora del Ocho"], prod: 8, mejor: 0 },
  "2025-10": { fecha: "Viernes 16 de mayo", lugar: "Plazoleta central", cartel: ["Los Hijos del Páramo", "Cumbia Mutante", "Batucada Uniboyacá", "Semilla", "Tierra Adentro"], prod: 9, mejor: 0 },
  "2025-20": { fecha: "Jueves 20 de noviembre", lugar: "Auditorio Central", cartel: ["La Sonora del Ocho", "Kilómetro Cero", "Los Cantores de Chipuco", "Cumbia Mutante", "Raíz Andina", "Nudo Ciego"], prod: 12, mejor: 2 },
};

// Las 28 palabras de un reto. Son las mismas cada edición a propósito: lo que
// cambia de un semestre a otro es quién dibujó, no la lista.
const PALABRAS = [
  "Raíz", "Niebla", "Hilo", "Ventana", "Óxido", "Semilla", "Cumbre",
  "Espejo", "Puente", "Ceniza", "Nudo", "Faro", "Rama", "Sombra",
  "Piedra", "Vuelo", "Grieta", "Sal", "Reloj", "Mapa", "Ancla",
  "Brasa", "Umbral", "Marea", "Aguja", "Cráter", "Eco", "Origen",
];

// Las ediciones del reto que ya pasaron. INKreible es lo más nuevo del
// programa, así que solo tiene tres semestres de historia.
const INK_DATOS = {
  "2024-20": { inscritos: 19, completan: 6, inicio: "2024-09-02" },
  "2025-10": { inscritos: 27, completan: 11, inicio: "2025-03-03" },
  "2025-20": { inscritos: 34, completan: 15, inicio: "2025-09-01" },
};

// Un título para un dibujo. No todos llevan: en el reto de verdad la mitad
// sube el archivo y ya.
const ADJETIVOS = ["Quieto", "Roto", "Tibio", "Lento", "Hondo", "Seco", "Claro", "Áspero"];

function tituloDibujo(palabra) {
  if (azar() < 0.45) return null;
  return azar() < 0.5 ? `${palabra} ${alguno(ADJETIVOS).toLowerCase()}` : `${palabra} II`;
}

// ---------------------------------------------------------------------
//  A sembrar los semestres pasados
// ---------------------------------------------------------------------
let cuentaProyectos = 0;
let cuentaDibujos = 0;

for (const codigo of SEMESTRES) {
  const per = periodo(codigo);

  // ---------- EXPO ----------
  const e = EXPO[codigo];
  if (e) {
    const podioIds = [];

    for (let i = 0; i < e.proys; i++) {
      const enPodio = i < e.podio.length;
      const titulo = enPodio ? e.podio[i] : TITULOS[(i + SEMESTRES.indexOf(codigo) * 3) % TITULOS.length];
      // Los del podio calificaron alto; el resto se reparte. Un semestre en el
      // que todos sacan lo mismo no sirve para mirar un ranking.
      const calidad = enPodio ? 4.7 - i * 0.15 : 2.9 + azar() * 1.3;

      const hecho = proyectoExpo({
        per,
        materia: materias[i % materias.length],
        titulo,
        cuantos: entre(2, 4),
        calidad,
        estado: "aprobada",
        // Ya cerrado: calificaron todos.
        califican: docentes,
      });

      cuentaProyectos++;
      if (enPodio) podioIds.push(hecho);
    }

    // El podio se guarda como certificado, que es de donde lo lee /info: la
    // nota se puede corregir después, el certificado impreso no.
    podioIds.forEach((p, i) => {
      for (const integrante of p.integrantes) {
        db.prepare(
          `INSERT OR IGNORE INTO certificados
             (codigo, evento, periodo_id, ref_tipo, ref_id, lote, persona, email, titulo,
              puesto, premio_label, premio_cls, materia_id, proyecto_id)
           VALUES (?, 'expo', ?, 'proyecto', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          cod(),
          per.id,
          String(p.proyectoId),
          `expo-${codigo}`,
          integrante.nombre,
          integrante.email,
          p.titulo,
          i + 1,
          ["Primer puesto", "Segundo puesto", "Tercer puesto"][i],
          ["oro", "plata", "bronce"][i],
          materias[0].id,
          p.proyectoId
        );
      }
    });
  }

  // ---------- VIRTUAL CHAMPIONS ----------
  const vc = VC_DATOS[codigo];
  if (vc) {
    for (const [juego, d] of Object.entries(vc)) {
      const t = db
        .prepare(
          `INSERT INTO vc_torneos (juego, nombre, periodo_id, estado, inscripcion_abierta)
           VALUES (?, ?, ?, 'finalizado', 0)`
        )
        .run(juego, `Virtual Champions · ${juego} · ${codigo}`, per.id);

      let campeonId = null;
      const nombresUsados = new Set([d.campeon]);

      for (let i = 0; i < d.eq; i++) {
        let nombre = d.campeon;
        if (i > 0) {
          nombre = EQUIPOS_VC.find((x) => !nombresUsados.has(x)) || `Equipo ${juego} ${i}`;
          nombresUsados.add(nombre);
        }
        const q = db
          .prepare("INSERT INTO vc_equipos (torneo_id, codigo, nombre, estado) VALUES (?, ?, ?, 'aprobado')")
          .run(t.lastInsertRowid, cod(), nombre);
        if (i === 0) campeonId = q.lastInsertRowid;

        for (let k = 0; k < 5; k++) {
          const jugador = persona();
          db.prepare("INSERT INTO vc_jugadores (torneo_id, equipo_id, nombre, email) VALUES (?, ?, ?, ?)")
            .run(t.lastInsertRowid, q.lastInsertRowid, jugador, correoDe(jugador));
        }
      }

      db.prepare(
        `INSERT OR IGNORE INTO premios_evento (evento, lote, premio, ref_tipo, ref_id)
         VALUES ('virtual-champions', ?, 'campeon', 'vc_equipo', ?)`
      ).run(String(t.lastInsertRowid), campeonId);
    }
  }

  // ---------- JAM ----------
  const j = JAM_DATOS[codigo];
  if (j) {
    const ed = db
      .prepare(
        `INSERT INTO jam_ediciones (periodo_id, nombre, estado, inscripcion_abierta, entregas_abiertas, horas, tema, tema_revelado)
         VALUES (?, ?, 'finalizada', 0, 0, ?, ?, 1)`
      )
      .run(per.id, `Jam de Altura · ${codigo}`, JAM.horas, j.tema);

    let mejor = null;
    j.juegos.forEach((titulo, i) => {
      const q = db
        .prepare(
          `INSERT INTO jam_equipos (edicion_id, codigo, nombre, estado, juego_titulo, entregado_at)
           VALUES (?, ?, ?, 'aprobado', ?, datetime('now'))`
        )
        .run(ed.lastInsertRowid, cod(), `Equipo ${titulo}`, titulo);
      if (i === 0) mejor = q.lastInsertRowid;

      for (let k = 0; k < entre(2, JAM.max_integrantes); k++) {
        const quien = persona();
        db.prepare(
          `INSERT INTO jam_integrantes (edicion_id, equipo_id, codigo, nombre, email, disciplina, semestre, lider, orden)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          ed.lastInsertRowid,
          q.lastInsertRowid,
          cod(),
          quien,
          correoDe(quien),
          alguno(JAM.disciplinas),
          String(entre(3, 10)),
          k === 0 ? 1 : 0,
          k
        );
      }
    });

    // Los que se inscribieron y no entregaron. Existen en toda jam y son lo
    // que hace que la cifra de entregas signifique algo.
    db.prepare("INSERT INTO jam_equipos (edicion_id, codigo, nombre, estado) VALUES (?, ?, ?, 'aprobado')")
      .run(ed.lastInsertRowid, cod(), `Los que no alcanzaron ${codigo}`);

    db.prepare(
      `INSERT OR IGNORE INTO premios_evento (evento, lote, premio, ref_tipo, ref_id)
       VALUES ('jam-de-altura', ?, 'mejor-juego', 'jam_equipo', ?)`
    ).run(String(ed.lastInsertRowid), mejor);
  }

  // ---------- MUSIC FEST ----------
  const m = MUSIC_DATOS[codigo];
  if (m) {
    const ed = db
      .prepare(
        `INSERT INTO music_ediciones (periodo_id, nombre, estado, inscripcion_abierta, fecha, lugar, cupo_actos, cupo_produccion)
         VALUES (?, ?, 'cerrada', 0, ?, ?, ?, ?)`
      )
      .run(
        per.id,
        `Multimedia Music Fest · ${codigo}`,
        m.fecha,
        m.lugar,
        MUSIC.cupo_actos || 8,
        MUSIC.cupo_produccion || 15
      );

    const actos = [];
    m.cartel.forEach((nombre, i) => {
      const contacto = persona();
      const q = db
        .prepare(
          `INSERT INTO music_actos
             (edicion_id, codigo, nombre, tipo, genero, integrantes, propuesta,
              contacto_nombre, contacto_email, estado, orden)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmado', ?)`
        )
        .run(
          ed.lastInsertRowid,
          cod(),
          nombre,
          alguno(MUSIC.tipos),
          alguno(["Andina", "Rock", "Cumbia", "Tropical", "Coral", "Fusión"]),
          entre(4, 9),
          "Propuesta de prueba para la muestra del sitio.",
          contacto,
          correoDe(contacto),
          i
        );
      actos.push(q.lastInsertRowid);
    });

    for (let i = 0; i < m.prod; i++) {
      const quien = persona();
      db.prepare(
        `INSERT INTO music_produccion (edicion_id, codigo, nombre, email, telefono, semestre, area, estado)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmado')`
      ).run(
        ed.lastInsertRowid,
        cod(),
        quien,
        correoDe(quien),
        `31${entre(10000000, 99999999)}`,
        String(entre(3, 10)),
        MUSIC.areas[i % MUSIC.areas.length].id
      );
    }

    db.prepare(
      `INSERT OR IGNORE INTO premios_evento (evento, lote, premio, ref_tipo, ref_id)
       VALUES ('music-fest', ?, 'mejor-acto', 'music_acto', ?)`
    ).run(String(ed.lastInsertRowid), actos[m.mejor]);
  }

  // ---------- INKREIBLE ----------
  const ik = INK_DATOS[codigo];
  if (ik) {
    const ed = db
      .prepare(
        `INSERT INTO ink_ediciones
           (periodo_id, nombre, estado, inscripcion_abierta, inicio, dias, semanas,
            drive_url, nomenclatura, lista_publica, galeria_publica, resultados_publicos)
         VALUES (?, ?, 'finalizada', 0, ?, ?, ?, ?, ?, 1, 1, 1)`
      )
      .run(
        per.id,
        `INKreible · ${codigo}`,
        ik.inicio,
        INK.dias,
        INK.semanas,
        "https://drive.google.com/drive/folders/PRUEBA",
        INK.nomenclatura
      ).lastInsertRowid;

    PALABRAS.slice(0, INK.dias).forEach((palabra, i) => {
      db.prepare("INSERT OR IGNORE INTO ink_palabras (edicion_id, dia, palabra) VALUES (?, ?, ?)")
        .run(ed, i + 1, palabra);
    });

    // Quién dibujó. Los primeros terminan el reto completo; los demás se van
    // cayendo, que es lo que pasa de verdad en un reto de 28 días.
    const gente = [];
    for (let i = 0; i < ik.inscritos; i++) {
      const nombre = persona();
      const codigoPersona = cod();
      const id = db
        .prepare(
          `INSERT INTO ink_participantes
             (edicion_id, codigo, nombre, email, semestre, tecnica, usuario, estado, drive_enviado_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'aprobado', datetime('now'))`
        )
        .run(
          ed,
          codigoPersona,
          nombre,
          correoDe(nombre),
          String(entre(2, 10)),
          alguno(INK.tecnicas).id,
          `@${nombre.split(" ")[0].toLowerCase()}.dibuja`
        ).lastInsertRowid;

      // Cuántos días aguantó: los que completan llegan a 28, el resto se
      // reparte entre 3 y 26.
      const hasta = i < ik.completan ? INK.dias : entre(3, INK.dias - 2);
      gente.push({ id, nombre, hasta, tecnica: alguno(INK.tecnicas).id });
    }

    for (const p of gente) {
      for (let dia = 1; dia <= p.hasta; dia++) {
        const palabra = PALABRAS[(dia - 1) % PALABRAS.length];
        // Una imagen de verdad y no un enlace de Drive muerto: así la galería
        // de la muestra se ve como una galería. lib/ink.imagenDirecta deja
        // pasar tal cual lo que no sea de Drive.
        const url = `https://picsum.photos/seed/ink${ed}-${p.id}-${dia}/900/1200`;
        db.prepare(
          `INSERT OR IGNORE INTO ink_dibujos (edicion_id, participante_id, dia, tecnica, url, titulo)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(ed, p.id, dia, azar() < 0.62 ? p.tecnica : alguno(INK.tecnicas).id, url, tituloDibujo(palabra));
        cuentaDibujos++;
      }
    }

    // El podio. Un dibujo puede ganar su semana y estar en el top: por eso
    // ink_premios es tabla aparte y no una columna del dibujo.
    const dibujoDe = db.prepare(
      "SELECT id, participante_id FROM ink_dibujos WHERE edicion_id = ? AND dia = ? ORDER BY id LIMIT 1 OFFSET ?"
    );

    const porSemana = INK.dias / INK.semanas;
    for (let s = 1; s <= INK.semanas; s++) {
      const d = dibujoDe.get(ed, Math.ceil(s * porSemana), s - 1);
      if (!d) continue;
      db.prepare(
        `INSERT OR IGNORE INTO ink_premios (edicion_id, tipo, semana, puesto, dibujo_id, participante_id)
         VALUES (?, 'semana', ?, 1, ?, ?)`
      ).run(ed, s, d.id, d.participante_id);
    }

    for (let puesto = 1; puesto <= Math.min(INK.top, ik.completan); puesto++) {
      const d = dibujoDe.get(ed, INK.dias, puesto - 1);
      if (!d) continue;
      db.prepare(
        `INSERT OR IGNORE INTO ink_premios (edicion_id, tipo, semana, puesto, dibujo_id, participante_id)
         VALUES (?, 'top', 0, ?, ?, ?)`
      ).run(ed, puesto, d.id, d.participante_id);
    }

    for (const t of INK.tecnicas) {
      for (let puesto = 1; puesto <= INK.por_tecnica; puesto++) {
        const d = db
          .prepare(
            `SELECT id, participante_id FROM ink_dibujos
              WHERE edicion_id = ? AND tecnica = ? ORDER BY dia DESC, id LIMIT 1 OFFSET ?`
          )
          .get(ed, t.id, puesto - 1);
        if (!d) continue;
        db.prepare(
          `INSERT OR IGNORE INTO ink_premios (edicion_id, tipo, semana, puesto, dibujo_id, participante_id)
           VALUES (?, ?, 0, ?, ?, ?)`
        ).run(ed, t.id, puesto, d.id, d.participante_id);
      }
    }
  }
}

// =====================================================================
//  EL SEMESTRE EN CURSO, a medio hacer
// =====================================================================
// Aquí está la gracia de la muestra: no un semestre cerrado y perfecto, sino
// uno con cosas por revisar, notas a medio poner y pagos incompletos. Es lo
// que hace que los paneles tengan algo que hacer.
const actual = db.prepare("SELECT * FROM periodos WHERE activo = 1").get() || periodo(PERIODO);

// ---------- EXPO: unos aprobados y calificados, otros esperando ----------
const EN_CURSO = [
  { titulo: "Retumba", estado: "aprobada", calidad: 4.6 },
  { titulo: "Agua Dura", estado: "aprobada", calidad: 4.3 },
  { titulo: "Sin Anestesia", estado: "aprobada", calidad: 4.1 },
  { titulo: "Corte Directo", estado: "aprobada", calidad: 3.9 },
  { titulo: "Cuerda Floja", estado: "aprobada", calidad: 3.7 },
  { titulo: "La Trocha", estado: "aprobada", calidad: 3.5 },
  { titulo: "Segundo Piso", estado: "aprobada", calidad: 3.3 },
  { titulo: "Nicho", estado: "aprobada", calidad: 3.1 },
  { titulo: "Bandera Blanca", estado: "aprobada", calidad: 2.8 },
  { titulo: "El Relevo", estado: "aprobada", calidad: 2.6 },
  { titulo: "Punto de Fuga", estado: "pendiente", calidad: 0 },
  { titulo: "Tierra Negra", estado: "pendiente", calidad: 0 },
  { titulo: "Solo de Ida", estado: "pendiente", calidad: 0 },
  { titulo: "Media Cuadra", estado: "pendiente", calidad: 0 },
  { titulo: "Cambio de Turno", estado: "pendiente", calidad: 0 },
  { titulo: "Lo Que Suena", estado: "rechazada", calidad: 0 },
];

EN_CURSO.forEach((p, i) => {
  // Que no todos los docentes hayan calificado es el estado normal a mitad de
  // semestre, y es lo que hace visible el "faltan por calificar" del panel.
  const cuantosCalifican = i < 4 ? docentes.length : i < 8 ? 2 : 1;

  proyectoExpo({
    per: actual,
    materia: materias[i % materias.length],
    titulo: p.titulo,
    cuantos: entre(2, 4),
    calidad: p.calidad,
    estado: p.estado,
    califican: p.estado === "aprobada" ? docentes.slice(0, cuantosCalifican) : [],
  });

  if (p.estado === "aprobada") cuentaProyectos++;
});

// ---------- Los eventos del semestre ----------
// Las ediciones del semestre ya las abrió db/database.js al arrancar: aquí no
// se crean, se llenan. Si no están, es que nunca se arrancó el servidor.
function edicionActual(tabla) {
  return db.prepare(`SELECT * FROM ${tabla} WHERE periodo_id = ? ORDER BY id DESC LIMIT 1`).get(actual.id);
}

// VC: equipos inscritos, unos aprobados y otros por revisar.
for (const juego of VC.juegos) {
  const torneo = db
    .prepare("SELECT * FROM vc_torneos WHERE juego = ? AND periodo_id = ? ORDER BY id DESC LIMIT 1")
    .get(juego.id, actual.id);
  if (!torneo) continue;

  const cuantos = juego.id === "valorant" ? 9 : 6;
  for (let i = 0; i < cuantos; i++) {
    const estado = i < cuantos - 2 ? "aprobado" : "pendiente";
    const nombre = EQUIPOS_VC[(i + 3) % EQUIPOS_VC.length] + (i > 5 ? " B" : "");
    const q = db
      .prepare("INSERT INTO vc_equipos (torneo_id, codigo, nombre, estado) VALUES (?, ?, ?, ?)")
      .run(torneo.id, cod(), nombre, estado);
    for (let k = 0; k < 5; k++) {
      const jugador = persona();
      db.prepare("INSERT INTO vc_jugadores (torneo_id, equipo_id, nombre, email) VALUES (?, ?, ?, ?)")
        .run(torneo.id, q.lastInsertRowid, jugador, correoDe(jugador));
    }
  }
}

// Jam: equipos inscritos y algunos que ya entregaron.
const jamEd = edicionActual("jam_ediciones");
if (jamEd) {
  const EQUIPOS_JAM = [
    { nombre: "Equipo Cuarto Oscuro", juego: "Cuarto Oscuro", entregado: true },
    { nombre: "Equipo Sin Batería", juego: "Sin Batería", entregado: true },
    { nombre: "Equipo Nudo", juego: "Nudo", entregado: true },
    { nombre: "Equipo Página en Blanco", juego: null, entregado: false },
    { nombre: "Equipo Mala Señal", juego: null, entregado: false },
    { nombre: "Equipo Los Últimos", juego: null, entregado: false },
  ];

  EQUIPOS_JAM.forEach((eq, i) => {
    const q = db
      .prepare(
        `INSERT INTO jam_equipos (edicion_id, codigo, nombre, estado, juego_titulo, entregado_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        jamEd.id,
        cod(),
        eq.nombre,
        i >= EQUIPOS_JAM.length - 1 ? "pendiente" : "aprobado",
        eq.juego,
        eq.entregado ? "2026-08-09 22:40:00" : null
      );

    for (let k = 0; k < entre(2, JAM.max_integrantes); k++) {
      const quien = persona();
      db.prepare(
        `INSERT INTO jam_integrantes (edicion_id, equipo_id, codigo, nombre, email, disciplina, semestre, lider, orden)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        jamEd.id,
        q.lastInsertRowid,
        cod(),
        quien,
        correoDe(quien),
        alguno(JAM.disciplinas),
        String(entre(3, 10)),
        k === 0 ? 1 : 0,
        k
      );
    }
  });
}

// Music Fest: el cartel a medio armar y gente esperando respuesta.
const musicEd = edicionActual("music_ediciones");
if (musicEd) {
  const ACTOS = [
    { nombre: "Los Hijos del Páramo", estado: "confirmado" },
    { nombre: "Cumbia Mutante", estado: "confirmado" },
    { nombre: "Batucada Uniboyacá", estado: "confirmado" },
    { nombre: "Kilómetro Cero", estado: "confirmado" },
    { nombre: "Raíz Andina", estado: "pendiente" },
    { nombre: "Nudo Ciego", estado: "pendiente" },
    { nombre: "Tierra Adentro", estado: "pendiente" },
    { nombre: "La Sonora del Ocho", estado: "rechazado" },
  ];

  ACTOS.forEach((a, i) => {
    const contacto = persona();
    db.prepare(
      `INSERT INTO music_actos
         (edicion_id, codigo, nombre, tipo, genero, integrantes, propuesta, necesidades,
          contacto_nombre, contacto_email, telefono, estado, orden)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      musicEd.id,
      cod(),
      a.nombre,
      alguno(MUSIC.tipos),
      alguno(["Andina", "Rock", "Cumbia", "Tropical", "Coral", "Fusión"]),
      entre(4, 9),
      "Propuesta de prueba para la muestra del sitio.",
      "Dos micrófonos y una toma de corriente.",
      contacto,
      correoDe(contacto),
      `31${entre(10000000, 99999999)}`,
      a.estado,
      i
    );
  });

  for (let i = 0; i < 11; i++) {
    const quien = persona();
    db.prepare(
      `INSERT INTO music_produccion (edicion_id, codigo, nombre, email, telefono, semestre, area, experiencia, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      musicEd.id,
      cod(),
      quien,
      correoDe(quien),
      `31${entre(10000000, 99999999)}`,
      String(entre(3, 10)),
      MUSIC.areas[i % MUSIC.areas.length].id,
      "Ha trabajado en montajes del programa.",
      i < 8 ? "confirmado" : "pendiente"
    );
  }
}

// INKreible: el reto corriendo, a mitad de camino.
const inkEd = edicionActual("ink_ediciones");
if (inkEd) {
  // El día 1 hace once días: el reto va por la segunda semana, que es cuando
  // más se nota la diferencia entre quien va al día y quien se quedó.
  const arranque = new Date();
  arranque.setDate(arranque.getDate() - 11);
  const inicio = arranque.toISOString().slice(0, 10);

  db.prepare(
    `UPDATE ink_ediciones
        SET inicio = ?, estado = 'en_curso', drive_url = ?, lista_publica = 0,
            galeria_publica = 1, resultados_publicos = 0
      WHERE id = ?`
  ).run(inicio, "https://drive.google.com/drive/folders/PRUEBA-2026", inkEd.id);

  PALABRAS.slice(0, INK.dias).forEach((palabra, i) => {
    db.prepare("INSERT OR IGNORE INTO ink_palabras (edicion_id, dia, palabra) VALUES (?, ?, ?)")
      .run(inkEd.id, i + 1, palabra);
  });

  const gente = [];
  for (let i = 0; i < 26; i++) {
    const nombre = persona();
    // Los últimos cuatro esperan revisión: es lo que tiene que ver el panel.
    const estado = i < 22 ? "aprobado" : "pendiente";
    const id = db
      .prepare(
        `INSERT INTO ink_participantes
           (edicion_id, codigo, nombre, email, semestre, tecnica, usuario, estado, drive_enviado_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        inkEd.id,
        cod(),
        nombre,
        correoDe(nombre),
        String(entre(2, 10)),
        alguno(INK.tecnicas).id,
        `@${nombre.split(" ")[0].toLowerCase()}.dibuja`,
        estado,
        estado === "aprobado" ? "2026-08-01 10:00:00" : null
      ).lastInsertRowid;

    if (estado === "aprobado") {
      // Al día 11: unos van al día, otros llevan tres días de atraso y un par
      // no ha subido nada.
      gente.push({ id, hasta: i < 8 ? 11 : i < 16 ? entre(6, 10) : entre(0, 5), tecnica: alguno(INK.tecnicas).id });
    }
  }

  for (const p of gente) {
    for (let dia = 1; dia <= p.hasta; dia++) {
      const palabra = PALABRAS[(dia - 1) % PALABRAS.length];
      db.prepare(
        `INSERT OR IGNORE INTO ink_dibujos (edicion_id, participante_id, dia, tecnica, url, titulo)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        inkEd.id,
        p.id,
        dia,
        azar() < 0.62 ? p.tecnica : alguno(INK.tecnicas).id,
        `https://picsum.photos/seed/ink${inkEd.id}-${p.id}-${dia}/900/1200`,
        tituloDibujo(palabra)
      );
      cuentaDibujos++;
    }
  }
}

// ---------- SALIDAS ----------
// Las salidas viven en config; aquí solo va quién se registró y quién pagó.
const TIPOS_ID = ["Cédula de ciudadanía", "Tarjeta de identidad"];

function registrosSalida(id, cuantos, { pasada }) {
  const yaHay = db.prepare("SELECT COUNT(*) AS n FROM salida_registros WHERE salida = ?").get(id).n;
  if (yaHay) return 0;

  for (let i = 0; i < cuantos; i++) {
    const quien = persona();
    // En una salida pasada pagaron todos y viajaron casi todos. En una que
    // viene, el trámite está a medias: es lo que el panel tiene que resolver.
    const transporte = pasada ? 1 : i < cuantos * 0.6 ? 1 : 0;
    const poliza = pasada ? 1 : i < cuantos * 0.45 ? 1 : 0;

    db.prepare(
      `INSERT OR IGNORE INTO salida_registros
         (salida, periodo_id, codigo, nombre, codigo_estudiante, tipo_id, num_id, telefono, email,
          pago_transporte, pago_poliza, asistio)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      actual.id,
      cod(),
      quien,
      String(entre(202010000, 202520000)),
      alguno(TIPOS_ID),
      String(entre(1000000000, 1099999999)),
      `31${entre(10000000, 99999999)}`,
      correoDe(quien),
      transporte,
      poliza,
      pasada ? (i < cuantos - 2 ? 1 : 0) : null
    );
  }
  return cuantos;
}

const VIAJEROS = [
  ["sofa-2024", 38, true],
  ["chicaque-2025", 22, true],
  ["canal-capital", 16, true],
  ["sofa-2026", 41, false],
  ["museo-del-oro", 27, false],
];

let cuentaSalidas = 0;
for (const [id, cuantos, pasada] of VIAJEROS) {
  cuentaSalidas += registrosSalida(id, cuantos, { pasada });
}

// ---------- PATROCINIOS ----------
const MARCAS = [
  ["Panela Café", "https://panelacafe.example.co", "Refrigerios"],
  ["Tunja Digital", "https://tunjadigital.example.co", "Dinero"],
  ["Librería del Ocho", "https://libreriaocho.example.co", "Premios"],
  ["Estudio Frailejón", "https://frailejon.example.co", "Equipos"],
];

for (const [marca, sitio, tipo] of MARCAS) {
  const contacto = persona();
  db.prepare(
    `INSERT INTO patrocinios (periodo_id, marca, sitio, tipo, mensaje, contacto_nombre, contacto_email, telefono)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    actual.id,
    marca,
    sitio,
    tipo,
    "Escribimos ofreciendo acompañar la Expo de este semestre.",
    contacto,
    `contacto@${marca.toLowerCase().replace(/[^a-z]/g, "")}.example.co`,
    `31${entre(10000000, 99999999)}`
  );
}

// ---------------------------------------------------------------------
//  El parte
// ---------------------------------------------------------------------
const cuenta = (sql) => db.prepare(sql).get().n;

console.log(`
  ✓ Datos de prueba sembrados.

    Semestres pasados      ${SEMESTRES.length}  (${SEMESTRE_ES(SEMESTRES[0])} … ${SEMESTRE_ES(SEMESTRES[SEMESTRES.length - 1])})
    Semestre en curso      ${actual.codigo}

    Proyectos de la Expo   ${cuenta("SELECT COUNT(*) AS n FROM proyectos")}
    Estudiantes            ${cuenta("SELECT COUNT(*) AS n FROM estudiantes")}
    Notas puestas          ${cuenta("SELECT COUNT(*) AS n FROM calificaciones")}
    Certificados           ${cuenta("SELECT COUNT(*) AS n FROM certificados")}
    Equipos del torneo     ${cuenta("SELECT COUNT(*) AS n FROM vc_equipos")}
    Equipos de la jam      ${cuenta("SELECT COUNT(*) AS n FROM jam_equipos")}
    Grupos del festival    ${cuenta("SELECT COUNT(*) AS n FROM music_actos")}
    Equipo de producción   ${cuenta("SELECT COUNT(*) AS n FROM music_produccion")}
    Dibujantes             ${cuenta("SELECT COUNT(*) AS n FROM ink_participantes")}
    Dibujos                ${cuenta("SELECT COUNT(*) AS n FROM ink_dibujos")}
    Registros de salidas   ${cuenta("SELECT COUNT(*) AS n FROM salida_registros")}
    Patrocinios            ${cuenta("SELECT COUNT(*) AS n FROM patrocinios")}

    Mira /info para la historia, /panel para lo que falta por revisar.
`);
