// =====================================================================
//  Salidas pedagógicas — el sitio público.
//
//  Tres páginas y ya: la salida, el formulario y la consulta del código. No
//  hay landing con secciones ni galería que mirar, porque esto no es un evento
//  al que se venga a ver algo: es un trámite con una fecha. La página está
//  ordenada para que quien llegue sepa, en este orden, a dónde se va, qué le
//  cuesta, qué tiene que firmar y a quién le paga.
//
//  Lo que se edita vive en config.SALIDAS; lo que confirma el docente, en el
//  panel (/salidas/panel), que es otro archivo.
// =====================================================================
const express = require("express");
const db = require("../db/database");
const salidas = require("../lib/salidas");
const envios = require("../lib/envios");
const periodos = require("../lib/periodos");
const { limpiarNombre } = require("../lib/listas");
const { DOMINIO } = require("../lib/correos");
const { crearLimite } = require("../lib/limite");

const router = express.Router();

// Mismo freno que el resto de formularios públicos: solo cuentan los registros
// que SÍ entraron, para que un salón entero apuntándose desde el mismo wifi no
// se tope con esto y un bot mandando cientos sí.
const limiteRegistro = crearLimite({ ventanaMs: 10 * 60 * 1000, maximo: 30 });

// ---------------------------------------------------------------------
//  El marco común de todas las páginas
// ---------------------------------------------------------------------
function marco(extra = {}) {
  return {
    slug: "salidas",
    programa: "Ingeniería en Multimedia",
    institucion: "Universidad de Boyacá",
    pesos: salidas.pesos,
    css: "/salidas.css",
    themeColor: "#f6f2e9",
    title: "Salidas pedagógicas",
    activa: "",
    ...extra,
  };
}

// Todo lo que una página necesita saber de UNA salida.
function marcoSalida(salida, extra = {}) {
  return marco({
    salida,
    abierta: salidas.inscripcionAbierta(salida),
    cerrada: salidas.porQueCerrada(salida),
    inscritos: salidas.contar(salida.id),
    title: `${salida.nombre} · Salida pedagógica`,
    ...extra,
  });
}

// ---------------------------------------------------------------------
//  Portada: la salida que viene
// ---------------------------------------------------------------------
// Con una sola salida abierta no hay nada que elegir, así que /salidas es
// directamente su página. El listado solo aparece cuando de verdad hay más de
// una cosa que mirar.
router.get("/salidas", (req, res) => {
  const todas = salidas.todas();
  const abiertas = todas.filter(salidas.inscripcionAbierta);

  if (abiertas.length === 1 && todas.length === 1) {
    return res.redirect(`/salidas/${abiertas[0].id}`);
  }

  res.render(
    "salidas/listado",
    marco({
      activa: "salidas",
      abiertas,
      cerradas: todas.filter((s) => !salidas.inscripcionAbierta(s)),
      porQue: salidas.porQueCerrada,
    })
  );
});

// ---------------------------------------------------------------------
//  Consulta del código
// ---------------------------------------------------------------------
// Va ANTES de /salidas/:id: si no, "estado" se leería como el id de una salida
// y la consulta no existiría.
router.get("/salidas/estado", (req, res) => {
  const codigo = String(req.query.codigo || "").trim().toUpperCase();
  const registro = codigo ? salidas.porCodigo(codigo) : null;

  res.render(
    "salidas/estado",
    marco({
      activa: "estado",
      title: "Tu registro · Salidas pedagógicas",
      codigo,
      registro,
      // La cabecera y la boleta se arman con la salida, y aquí la salida sale
      // del registro que se consultó: sin código todavía no hay ninguna.
      salida: registro ? registro.salida_info : null,
      recienHecho: false,
      correoActivo: envios.activo(),
      error: codigo && !registro ? "No encontramos ningún registro con ese código." : null,
    })
  );
});

// ---------------------------------------------------------------------
//  Una salida
// ---------------------------------------------------------------------
// El next() del final es lo que deja convivir esta dirección con /salidas/panel
// y /salidas/acceso: un id que no está en config no es una salida, así que la
// petición sigue de largo hasta el router del panel.
router.get("/salidas/:id", (req, res, next) => {
  const salida = salidas.porId(req.params.id);
  if (!salida) return next();

  res.render("salidas/salida", marcoSalida(salida, { activa: "salida" }));
});

// ---------------------------------------------------------------------
//  Registro
// ---------------------------------------------------------------------
const VACIO = { nombre: "", codigo_estudiante: "", tipo_id: "", num_id: "", telefono: "", email: "" };

function vistaRegistro(salida, extra = {}) {
  return marcoSalida(salida, {
    activa: "registro",
    title: `Registro · ${salida.nombre}`,
    tipos: salidas.TIPOS_ID,
    errores: [],
    valores: VACIO,
    ...extra,
  });
}

router.get("/salidas/:id/registro", (req, res, next) => {
  const salida = salidas.porId(req.params.id);
  if (!salida) return next();

  res.render("salidas/registro", vistaRegistro(salida));
});

router.post("/salidas/:id/registro", (req, res, next) => {
  const salida = salidas.porId(req.params.id);
  if (!salida) return next();

  const valores = {
    nombre: limpiarNombre(req.body.nombre).slice(0, 120),
    codigo_estudiante: salidas.soloDigitos(req.body.codigo_estudiante, 20),
    tipo_id: salidas.tipoValido(req.body.tipo_id),
    num_id: salidas.soloDigitos(req.body.num_id, 20),
    telefono: salidas.limpiarTelefono(req.body.telefono),
    email: salidas.limpiarEmail(req.body.email),
  };

  const fallar = (errores, status = 400) =>
    res.status(status).render(
      "salidas/registro",
      vistaRegistro(salida, { errores, valores: { ...valores, tipo_id: valores.tipo_id || "" } })
    );

  const errores = [];

  if (!salidas.inscripcionAbierta(salida)) {
    const porQue = salidas.porQueCerrada(salida);
    errores.push(
      porQue === "lleno"
        ? "Se llenó el cupo de esta salida."
        : porQue === "pasada"
          ? "Esta salida ya pasó."
          : "Los registros de esta salida están cerrados."
    );
  }

  if (!valores.nombre) errores.push("Escribe tu nombre completo.");
  if (!valores.codigo_estudiante) errores.push("Escribe tu código estudiantil.");
  if (!valores.tipo_id) errores.push("Elige el tipo de documento.");
  if (!valores.num_id) errores.push("Escribe el número del documento.");
  if (!salidas.telefonoValido(valores.telefono)) {
    errores.push("Escribe un número de teléfono al que se te pueda llamar el día de la salida.");
  }
  if (!salidas.emailValido(valores.email)) {
    errores.push(`Tu correo tiene que ser el institucional @${DOMINIO}.`);
  }

  // Una persona, un cupo. Se avisa aquí con nombre propio en vez de dejar
  // reventar el UNIQUE de la base.
  if (valores.email && salidas.porCorreo(salida.id, valores.email)) {
    errores.push(
      "Ya hay un registro con ese correo para esta salida. Consulta su estado con el código " +
        "que te llegó, o habla con el docente encargado si lo perdiste."
    );
  }

  if (errores.length) return fallar(errores);

  if (limiteRegistro.alcanzado(req.ip)) {
    return fallar(
      ["Demasiados registros seguidos desde esta conexión. Intenta de nuevo en unos minutos."],
      429
    );
  }

  const codigo = salidas.codigoLibre();
  const periodo = periodos.activo();

  db.prepare(
    `INSERT INTO salida_registros
       (salida, periodo_id, codigo, nombre, codigo_estudiante, tipo_id, num_id, telefono, email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    salida.id,
    periodo ? periodo.id : null,
    codigo,
    valores.nombre,
    valores.codigo_estudiante,
    valores.tipo_id,
    valores.num_id,
    valores.telefono,
    valores.email
  );

  limiteRegistro.registrar(req.ip);

  // El correo sale aparte: si falla o se demora, el registro ya está hecho y el
  // estudiante ve su código en pantalla igual.
  envios.salidaAvisoRegistro(
    {
      codigo,
      nombre: valores.nombre,
      email: valores.email,
      salida,
      docente: salida.docente || {},
      costos: {
        transporte: salidas.pesos(salida.costos && salida.costos.transporte),
        poliza: salidas.pesos(salida.costos && salida.costos.poliza),
        total: salidas.pesos(salida.total),
      },
    },
    envios.urlBase(req)
  );

  res.redirect(`/salidas/${salida.id}/registro/listo/${codigo}`);
});

router.get("/salidas/:id/registro/listo/:codigo", (req, res, next) => {
  const salida = salidas.porId(req.params.id);
  if (!salida) return next();

  const registro = salidas.porCodigo(req.params.codigo);
  if (!registro) return res.redirect("/salidas/estado");

  res.render(
    "salidas/estado",
    marco({
      activa: "estado",
      title: `Listo · ${salida.nombre}`,
      codigo: registro.codigo,
      registro,
      salida,
      recienHecho: true,
      error: null,
      correoActivo: envios.activo(),
    })
  );
});

module.exports = router;
