// =====================================================================
//  DATOS DE PRUEBA para ver /info con historia.
//
//  Siembra ocho semestres anteriores (2022-10 … 2025-20) en la base real:
//  Expos con su podio, torneos con campeón, jams con tema y juegos
//  entregados, festivales con cartel, y los registros de tres salidas
//  pasadas.
//
//  Todo lo que mete lleva el código empezando por 'S', 'T' o 'U', y los
//  semestres nuevos son los ocho anteriores al actual: se borra con el
//  limpiar.js de al lado.
// =====================================================================
const RAIZ = "/home/jose/projects/MUL-Expo";
const db = require(`${RAIZ}/db/database`);

let n = 0;
const cod = () => `S${String(++n).padStart(5, "0")}`;

function periodo(codigo) {
  const y = db.prepare("SELECT * FROM periodos WHERE codigo = ?").get(codigo);
  if (y) return y;
  db.prepare("INSERT INTO periodos (codigo, activo) VALUES (?, 0)").run(codigo);
  return db.prepare("SELECT * FROM periodos WHERE codigo = ?").get(codigo);
}

let materia = db.prepare("SELECT * FROM materias LIMIT 1").get();
if (!materia) {
  const d = db.prepare("SELECT * FROM docentes LIMIT 1").get();
  db.prepare("INSERT INTO materias (nombre, created_by) VALUES (?, ?)").run("Proyecto Integrador", d.id);
  materia = db.prepare("SELECT * FROM materias LIMIT 1").get();
}

const SEMESTRES = ["2022-10", "2022-20", "2023-10", "2023-20", "2024-10", "2024-20", "2025-10", "2025-20"];

const EXPO = {
  "2022-10": { proys: 12, equipo: 2, podio: ["Primer Piso", "Ocho Cuadras"] },
  "2022-20": { proys: 15, equipo: 2, podio: ["La Vuelta", "Media Res", "Zócalo"] },
  "2023-10": { proys: 18, equipo: 2, podio: ["Bajo Cero", "Papel Quemado", "Tres Ríos"] },
  "2023-20": { proys: 21, equipo: 2, podio: ["Sal y Piedra", "Andén", "Contraluz"] },
  "2024-10": { proys: 18, equipo: 2, podio: ["Raíz de Agua", "Ruta 55", "Casa Vacía"] },
  "2024-20": { proys: 24, equipo: 2, podio: ["Nimbo", "El Último Bus", "Trece Grados"] },
  "2025-10": { proys: 21, equipo: 3, podio: ["Cordillera", "Tinta Sobre Piedra", "Vuelta Canela"] },
  "2025-20": { proys: 29, equipo: 2, podio: ["Eco de Montaña", "Barro y Bit", "Ala Delta"] },
};

const VC = {
  "2022-20": { valorant: { eq: 5, campeon: "Panela Gaming" } },
  "2023-10": { valorant: { eq: 6, campeon: "Boyacá Esports" } },
  "2023-20": { valorant: { eq: 6, campeon: "Frailejones" } },
  "2024-20": { valorant: { eq: 6, campeon: "Cóndores de Tunja" } },
  "2025-10": { valorant: { eq: 8, campeon: "Panela Gaming" }, lol: { eq: 5, campeon: "Frailejones" } },
  "2025-20": { valorant: { eq: 10, campeon: "Cóndores de Tunja" }, lol: { eq: 7, campeon: "Alto Ricaurte" } },
};

const JAM = {
  "2022-10": { tema: "Dos botones", juegos: ["Doble Clic", "Dos"] },
  "2022-20": { tema: "Se repite", juegos: ["Bucle", "Otra Vez", "Deja Vu"] },
  "2023-10": { tema: "Bajo el agua", juegos: ["Fondo", "Corriente", "Marea"] },
  "2023-20": { tema: "Lo que dejaste atrás", juegos: ["Baúl", "Lo Que Queda"] },
  "2024-20": { tema: "Una sola habitación", juegos: ["Cuarto 12", "Sin Puerta", "El Inquilino"] },
  "2025-10": { tema: "Se rompe al usarlo", juegos: ["Frágil", "Vidrio Molido", "Última Cuerda", "Rompe"] },
  "2025-20": { tema: "Nadie te está mirando", juegos: ["Turno de Noche", "Vigía", "Cámara Oculta", "Escondite", "Sin Testigos"] },
};

const MUSIC = {
  "2022-20": { fecha: "Viernes 18 de noviembre", lugar: "Plazoleta central", cartel: ["Tambores de Tunja", "Banda del Sur", "Aires de Boyacá"], prod: 6, mejor: 0 },
  "2023-10": { fecha: "Viernes 19 de mayo", lugar: "Plazoleta central", cartel: ["Aires de Boyacá", "Nudo Ciego", "Coro Uniboyacá", "Semilla"], prod: 7, mejor: 1 },
  "2023-20": { fecha: "Jueves 16 de noviembre", lugar: "Auditorio Central", cartel: ["Raíz Andina", "Tambores de Tunja", "La Sonora del Ocho"], prod: 8, mejor: 0 },
  "2025-10": { fecha: "Viernes 16 de mayo", lugar: "Plazoleta central", cartel: ["Los Hijos del Páramo", "Cumbia Mutante", "Batucada Uniboyacá", "Semilla", "Tierra Adentro"], prod: 9, mejor: 0 },
  "2025-20": { fecha: "Jueves 20 de noviembre", lugar: "Auditorio Central", cartel: ["La Sonora del Ocho", "Kilómetro Cero", "Los Cantores de Chipuco", "Cumbia Mutante", "Raíz Andina", "Nudo Ciego"], prod: 12, mejor: 2 },
};

for (const codigo of SEMESTRES) {
  const per = periodo(codigo);

  // ---------- EXPO ----------
  const e = EXPO[codigo];
  if (e) {
    for (let i = 0; i < e.proys; i++) {
      const titulo = i < e.podio.length ? e.podio[i] : `Proyecto ${codigo}-${i + 1}`;
      const r = db
        .prepare(
          `INSERT INTO solicitudes (codigo, materia_id, titulo, sala, contacto_nombre, contacto_email, estado, periodo_id)
           VALUES (?, ?, ?, 'Indie Alley', 'Contacto', 'prueba@uniboyaca.edu.co', 'aprobado', ?)`
        )
        .run(cod(), materia.id, titulo, per.id);
      for (let k = 0; k < e.equipo; k++) {
        db.prepare("INSERT INTO solicitud_integrantes (solicitud_id, nombre) VALUES (?, ?)")
          .run(r.lastInsertRowid, `Estudiante ${codigo}-${i}-${k}`);
      }
    }
    e.podio.forEach((titulo, i) => {
      db.prepare(
        `INSERT INTO certificados (codigo, evento, periodo_id, ref_tipo, ref_id, lote, persona, titulo, puesto, premio_label, premio_cls)
         VALUES (?, 'expo', ?, 'proyecto', ?, ?, ?, ?, ?, ?, ?)`
      ).run(cod(), per.id, `prueba-${codigo}-${i}`, String(materia.id), `Estudiante ${codigo}-${i}`, titulo,
        i + 1, ["Primer puesto", "Segundo puesto", "Tercer puesto"][i], ["oro", "plata", "bronce"][i]);
    });
  }

  // ---------- VIRTUAL CHAMPIONS ----------
  const vc = VC[codigo];
  if (vc) {
    for (const [juego, d] of Object.entries(vc)) {
      const t = db
        .prepare(
          `INSERT INTO vc_torneos (juego, nombre, periodo_id, estado, inscripcion_abierta)
           VALUES (?, ?, ?, 'finalizado', 0)`
        )
        .run(juego, `Virtual Champions · ${juego} · ${codigo}`, per.id);

      let campeonId = null;
      for (let i = 0; i < d.eq; i++) {
        const nombre = i === 0 ? d.campeon : `Equipo ${juego}-${codigo}-${i}`;
        const q = db
          .prepare("INSERT INTO vc_equipos (torneo_id, codigo, nombre, estado) VALUES (?, ?, ?, 'aprobado')")
          .run(t.lastInsertRowid, cod(), nombre);
        if (i === 0) campeonId = q.lastInsertRowid;
        for (let k = 0; k < 5; k++) {
          db.prepare("INSERT INTO vc_jugadores (torneo_id, equipo_id, nombre, email) VALUES (?, ?, ?, ?)")
            .run(t.lastInsertRowid, q.lastInsertRowid, `Jugador ${i}-${k}`, `${cod()}@uniboyaca.edu.co`);
        }
      }
      db.prepare(
        `INSERT INTO premios_evento (evento, lote, premio, ref_tipo, ref_id)
         VALUES ('virtual-champions', ?, 'campeon', 'vc_equipo', ?)`
      ).run(String(t.lastInsertRowid), campeonId);
    }
  }

  // ---------- JAM ----------
  const j = JAM[codigo];
  if (j) {
    const ed = db
      .prepare(
        `INSERT INTO jam_ediciones (periodo_id, nombre, estado, inscripcion_abierta, entregas_abiertas, horas, tema, tema_revelado)
         VALUES (?, ?, 'finalizada', 0, 0, 48, ?, 1)`
      )
      .run(per.id, `Jam de Altura · ${codigo}`, j.tema);

    let mejor = null;
    j.juegos.forEach((titulo, i) => {
      const q = db
        .prepare(
          `INSERT INTO jam_equipos (edicion_id, codigo, nombre, estado, juego_titulo, entregado_at)
           VALUES (?, ?, ?, 'aprobado', ?, datetime('now'))`
        )
        .run(ed.lastInsertRowid, cod(), `Equipo ${titulo}`, titulo);
      if (i === 0) mejor = q.lastInsertRowid;
    });
    db.prepare("INSERT INTO jam_equipos (edicion_id, codigo, nombre, estado) VALUES (?, ?, ?, 'aprobado')")
      .run(ed.lastInsertRowid, cod(), `Los que no alcanzaron ${codigo}`);

    db.prepare(
      `INSERT INTO premios_evento (evento, lote, premio, ref_tipo, ref_id)
       VALUES ('jam-de-altura', ?, 'mejor-juego', 'jam_equipo', ?)`
    ).run(String(ed.lastInsertRowid), mejor);
  }

  // ---------- MUSIC FEST ----------
  const m = MUSIC[codigo];
  if (m) {
    const ed = db
      .prepare(
        `INSERT INTO music_ediciones (periodo_id, nombre, estado, inscripcion_abierta, fecha, lugar, cupo_actos, cupo_produccion)
         VALUES (?, ?, 'cerrada', 0, ?, ?, 8, 15)`
      )
      .run(per.id, `Multimedia Music Fest · ${codigo}`, m.fecha, m.lugar);

    const actos = [];
    m.cartel.forEach((nombre, i) => {
      const q = db
        .prepare(
          `INSERT INTO music_actos (edicion_id, codigo, nombre, tipo, integrantes, contacto_nombre, contacto_email, estado, orden)
           VALUES (?, ?, ?, 'Grupo musical', 6, 'Contacto', ?, 'confirmado', ?)`
        )
        .run(ed.lastInsertRowid, cod(), nombre, `${cod()}@uniboyaca.edu.co`, i);
      actos.push(q.lastInsertRowid);
    });
    for (let i = 0; i < m.prod; i++) {
      db.prepare(
        `INSERT INTO music_produccion (edicion_id, codigo, nombre, email, area, estado)
         VALUES (?, ?, ?, ?, ?, 'confirmado')`
      ).run(ed.lastInsertRowid, cod(), `Técnico ${codigo}-${i}`, `${cod()}@uniboyaca.edu.co`,
        ["sonido", "luces", "visuales"][i % 3]);
    }
    db.prepare(
      `INSERT INTO premios_evento (evento, lote, premio, ref_tipo, ref_id)
       VALUES ('music-fest', ?, 'mejor-acto', 'music_acto', ?)`
    ).run(String(ed.lastInsertRowid), actos[m.mejor]);
  }
}

// ---------- REGISTROS DE LAS SALIDAS PASADAS ----------
// Las salidas viven en config; aquí solo va quién viajó.
const VIAJEROS = { "sofa-2024": 38, "chicaque-2025": 22, "canal-capital": 16 };
for (const [id, cuantos] of Object.entries(VIAJEROS)) {
  const yaHay = db.prepare("SELECT COUNT(*) AS n FROM salida_registros WHERE salida = ?").get(id).n;
  if (yaHay) continue;
  for (let i = 0; i < cuantos; i++) {
    db.prepare(
      `INSERT INTO salida_registros
         (salida, periodo_id, codigo, nombre, codigo_estudiante, tipo_id, num_id, telefono, email,
          pago_transporte, pago_poliza, asistio)
       VALUES (?, 1, ?, ?, '2024', 'Cédula de ciudadanía', '1', '3000000000', ?, 1, 1, 1)`
    ).run(id, cod(), `Estudiante ${i}`, `${cod()}@uniboyaca.edu.co`);
  }
}

console.log(`Sembrados ${SEMESTRES.length} semestres y ${Object.keys(VIAJEROS).length} salidas pasadas.`);
