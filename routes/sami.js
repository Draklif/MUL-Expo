// =====================================================================
//  Semillero SAMI — el sitio público.
//
//  Cuatro páginas: qué es el semillero, el formulario de intención, el
//  código que queda y la consulta de ese código. No hay galería ni cartel,
//  porque esto no es un evento al que se venga a ver algo: es una alternativa
//  de grado que dura tres semestres y empieza con un trámite de cuatro pasos.
//
//  LO QUE ESTE FORMULARIO NO HACE, que es lo que más cuidado pide al tocar el
//  texto de estas páginas: no vincula a nadie, no avisa a nadie y no reemplaza
//  ninguno de los cuatro pasos. Los cuatro se hacen en persona. Esto adelanta
//  trabajo —deja los datos escritos una sola vez para que el semillero los
//  tenga— y por eso la página nunca dice que algo "ya quedó hecho": después de
//  registrarse, lo primero que se lee es a dónde hay que ir.
//
//  Que se sienta como un trámite terminado sería el peor resultado posible:
//  alguien se quedaría esperando una respuesta que nadie le va a mandar.
//
//  La portada está ordenada para que quien llegue sepa, en este orden: qué es,
//  qué tiene que hacer para entrar, qué le va a tomar, y en qué se ha
//  trabajado antes. Lo último no es adorno: la pregunta que de verdad tiene
//  quien está pensando en entrar es "¿qué clase de proyecto se hace aquí?", y
//  se responde mejor con doce títulos que con un párrafo.
// =====================================================================
const express = require("express");
const db = require("../db/database");
const sami = require("../lib/sami");
const envios = require("../lib/envios");
const periodos = require("../lib/periodos");
const { SAMI } = require("../config");
const { DOMINIO } = require("../lib/correos");
const { crearLimite } = require("../lib/limite");
const { guardia } = require("../lib/aprobado");

const router = express.Router();

// El interruptor de config.APROBADO. Va en CADA ruta y no en un router.use():
// este router se monta en "/" y por él pasan también las peticiones del panel,
// que no se apaga nunca —el docente entra justamente a preparar lo que aún no
// se aprueba—.
const publica = guardia("semillero");

// Mismo freno que el resto de formularios públicos: solo cuentan los registros
// que SÍ entraron, para que un salón entero apuntándose desde el mismo wifi no
// se tope con esto y un bot mandando cientos sí.
const limiteRegistro = crearLimite({ ventanaMs: 10 * 60 * 1000, maximo: 20 });

// ---------------------------------------------------------------------
//  El marco común de todas las páginas
// ---------------------------------------------------------------------
function marco(extra = {}) {
  return {
    slug: "semillero",
    css: "/sami.css",
    themeColor: "#f2f5fa",
    title: "Semillero de Investigación SAMI",
    sami: SAMI,
    // La escalera de estados se dibuja en dos vistas y siempre entera: es el
    // recorrido completo, no solo los peldaños que este proyecto ya pisó.
    estados: sami.ESTADOS,
    activa: "",
    ...extra,
  };
}

// ¿El formulario recibe gente? Una sola bandera, la del config. No hay cupo
// ni fecha que la cierre sola: el semillero está abierto todo el año y quien
// lo cierra es la dirección del programa, a mano.
const abierto = () => Boolean(SAMI.inscripciones);

// ---------------------------------------------------------------------
//  Portada
// ---------------------------------------------------------------------
router.get("/semillero", publica, (req, res) => {
  const todos = sami.todos();

  res.render(
    "sami/landing",
    marco({
      activa: "semillero",
      descripcion: SAMI.completo,
      abierto: abierto(),
      // Solo el título, el director y en qué semestre va. Ni correos ni
      // documentos ni teléfonos: esta página la ve cualquiera.
      encurso: todos.filter((p) => p.vinculado),
      finalizados: todos.filter((p) => p.estado === "finalizado"),
      estudiantes: sami.contarEstudiantes(),
    })
  );
});

// ---------------------------------------------------------------------
//  Consulta del código
// ---------------------------------------------------------------------
// Va ANTES de /semillero/:algo por la misma razón de siempre; aquí además el
// router del panel se monta después en /semillero, así que el orden de estas
// tres rutas es lo que decide quién atiende qué.
router.get("/semillero/estado", publica, (req, res) => {
  const codigo = String(req.query.codigo || "").trim().toUpperCase();
  const proyecto = codigo ? sami.porCodigo(codigo) : null;

  res.render(
    "sami/estado",
    marco({
      activa: "estado",
      title: "Tu proyecto · Semillero SAMI",
      codigo,
      proyecto,
      estudiantes: proyecto ? sami.estudiantesDe(proyecto.id) : [],
      jurados: proyecto ? sami.juradosDe(proyecto.id) : [],
      // Lo que se comprometió a entregar en la última reunión. Es suyo y le
      // sirve; las CALIFICACIONES no salen aquí a propósito —seis caracteres
      // que se comparten por WhatsApp no son una contraseña—.
      ultima: proyecto ? sami.ultimaReunion(proyecto.id) : null,
      recienHecho: false,
      correoActivo: envios.aDestinatario(),
      error: codigo && !proyecto ? "No encontramos ningún proyecto con ese código." : null,
    })
  );
});

// ---------------------------------------------------------------------
//  Registro de la intención
// ---------------------------------------------------------------------
const VACIO = {
  titulo: "",
  asesor: "",
  perfil: "",
  estudiantes: [{}, {}],
};

function vistaRegistro(extra = {}) {
  return marco({
    activa: "registro",
    title: "Registrar mi intención · Semillero SAMI",
    abierto: abierto(),
    errores: [],
    valores: VACIO,
    ...extra,
  });
}

router.get("/semillero/registro", publica, (req, res) => {
  res.render("sami/registro", vistaRegistro());
});

router.post("/semillero/registro", publica, (req, res) => {
  const estudiantes = sami.estudiantesDesdeFormulario(req.body);

  const valores = {
    titulo: sami.limpiarNombre(req.body.titulo).slice(0, 300),
    asesor: sami.limpiarNombre(req.body.asesor).slice(0, 120),
    perfil: sami.perfilValido(req.body.perfil) || "",
    // Se devuelven las filas tal como llegaron, no las saneadas: si alguien
    // escribió mal su correo tiene que ver lo que escribió para corregirlo, no
    // un campo en blanco.
    estudiantes: estudiantes.length ? estudiantes : [{}, {}],
  };

  const fallar = (errores, status = 400) =>
    res.status(status).render("sami/registro", vistaRegistro({ errores, valores }));

  const errores = [];

  if (!abierto()) {
    errores.push(
      "El registro al semillero está cerrado en este momento. Escríbele a la dirección del programa."
    );
  }

  if (!valores.titulo) errores.push("Escribe el título tentativo del proyecto.");
  if (!estudiantes.length) errores.push("Escribe los datos de al menos un estudiante.");

  // Se valida cada integrante por separado y se dice de quién es el problema:
  // "escribe el teléfono" en un formulario de dos personas no le dice a nadie
  // cuál de las dos.
  estudiantes.forEach((e, i) => {
    const quien = estudiantes.length > 1 ? `Estudiante ${i + 1}: ` : "";
    if (!e.nombre) errores.push(`${quien}escribe el nombre completo.`);
    if (!e.codigo_estudiante) errores.push(`${quien}escribe el código estudiantil.`);
    if (!e.documento) errores.push(`${quien}escribe el número de documento.`);
    if (!sami.telefonoValido(e.telefono)) {
      errores.push(`${quien}escribe un teléfono al que se te pueda llamar.`);
    }
    if (!sami.emailValido(e.email)) {
      errores.push(`${quien}el correo tiene que ser el institucional @${DOMINIO}.`);
    }
    if (e.semestre_academico === null) {
      errores.push(`${quien}escribe en qué semestre de la carrera vas.`);
    } else if (e.semestre_academico < SAMI.semestre_minimo) {
      errores.push(
        `${quien}al semillero se entra desde ${SAMI.semestre_minimo}.º semestre. ` +
          "Vuelve cuando lo cumplas: la propuesta te va a salir mejor."
      );
    }

    // Lo que cierra la puerta es tener la alternativa de grado OCUPADA —una
    // propuesta ya aprobada—, no haber dejado datos antes. Varias intenciones
    // a la vez sí se permiten: quien está buscando tema llega con dos o tres
    // propuestas y con un asesor posible para cada una, y obligarlo a escoger
    // antes de haber hablado con ninguno es pedirle la decisión justo cuando
    // menos elementos tiene para tomarla. Cada una lleva su propio código y
    // sigue su propio camino; la que prospere será la que un asesor recoja.
    const previo = e.email && sami.alternativaDe(e.email);
    if (previo) {
      errores.push(
        `${quien}ese correo ya tiene un proyecto aprobado en el semillero (código ${previo.codigo}). ` +
          "Consulta su estado con el código, o habla con la dirección del programa."
      );
    }

    // La MISMA propuesta otra vez no es una segunda idea: es un doble envío o
    // alguien que no se acuerda. Se dice con qué código quedó, en vez de dejar
    // dos registros gemelos que después hay que desempatar a mano.
    const repetida =
      e.email && sami.intencionesDe(e.email).find((p) => sami.mismoTitulo(p.titulo, valores.titulo));
    if (repetida) {
      errores.push(
        `${quien}ya dejaste esta misma propuesta y quedó con el código ${repetida.codigo}. ` +
          "Si es otra idea distinta, cámbiale el título; si querías ver en qué va, consulta ese código."
      );
    }
  });

  if (errores.length) return fallar(errores);

  if (limiteRegistro.alcanzado(req.ip)) {
    return fallar(
      ["Demasiados registros seguidos desde esta conexión. Intenta de nuevo en unos minutos."],
      429
    );
  }

  const codigo = sami.codigoLibre();
  const periodo = periodos.activo();

  // El proyecto y sus estudiantes entran juntos o no entra ninguno: un
  // proyecto sin integrantes no es nada y habría que borrarlo a mano.
  sami.enTransaccion(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO sami_proyectos (codigo, titulo, perfil, estado, periodo_id, nota)
         VALUES (?, ?, ?, 'registro', ?, ?)`
      )
      .run(
        codigo,
        valores.titulo,
        valores.perfil || null,
        periodo ? periodo.id : null,
        // El asesor con quien habló no es el director —eso lo decide el
        // comité—, así que entra como nota y no en la columna director_id.
        valores.asesor ? `Asesor con quien habló al registrarse: ${valores.asesor}` : null
      );

    const insertar = db.prepare(
      `INSERT INTO sami_estudiantes
         (proyecto_id, nombre, codigo_estudiante, documento, telefono, email, semestre_academico, orden)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    estudiantes.forEach((e, i) => {
      insertar.run(
        lastInsertRowid,
        e.nombre,
        e.codigo_estudiante,
        e.documento,
        e.telefono,
        e.email,
        e.semestre_academico,
        i
      );
    });

  });

  limiteRegistro.registrar(req.ip);

  // Un solo correo y va al ESTUDIANTE. A la dirección del programa no se le
  // avisa nada, y no es un olvido: el trámite dice que el estudiante notifica
  // su intención en persona, y un correo automático diciendo lo mismo dejaría
  // a las dos partes creyendo que el aviso ya lo dio el otro. Lo que hace el
  // correo es recordarle a dónde tiene que ir.
  //
  // Sale aparte: si falla o se demora, el registro ya está hecho y el
  // estudiante ve su código en pantalla igual.
  envios.samiAvisoIntencion(
    { codigo, titulo: valores.titulo, estudiantes, sami: SAMI },
    envios.urlBase(req)
  );

  res.redirect(`/semillero/registro/listo/${codigo}`);
});

router.get("/semillero/registro/listo/:codigo", publica, (req, res) => {
  const proyecto = sami.porCodigo(req.params.codigo);
  if (!proyecto) return res.redirect("/semillero/estado");

  res.render(
    "sami/estado",
    marco({
      activa: "estado",
      title: "Listo · Semillero SAMI",
      codigo: proyecto.codigo,
      proyecto,
      estudiantes: sami.estudiantesDe(proyecto.id),
      jurados: [],
      ultima: null,
      recienHecho: true,
      error: null,
      correoActivo: envios.aDestinatario(),
    })
  );
});

module.exports = router;
