// =====================================================================
//  Patrocinios de la Expo — la puerta para las marcas.
//
//  Una página y un formulario. Es el registro de expositores en pequeño y
//  con dos diferencias que importan:
//
//    · quien llena esto viene de AFUERA. No se le pide correo institucional,
//      porque un estudio de videojuegos no tiene uno. Se valida el formato y
//      nada más;
//    · llenarlo NO publica a nadie. La lista de marcas que sale en la página
//      se cura a mano en data/expo.json, junto con el logo. Aquí solo queda
//      quién tocó la puerta.
//
//  Tampoco se le pide el logo: el repo no recibe archivos por ninguna ruta
//  pública, y un logotipo se acuerda hablando —formato, versión, tamaño—, no
//  subiendo el primer PNG que había en el escritorio.
// =====================================================================
const express = require("express");
const db = require("../db/database");
const envios = require("../lib/envios");
const periodos = require("../lib/periodos");
const { PATROCINIOS } = require("../config");
const { limpiarNombre } = require("../lib/listas");
const { normalizar, formatoValido } = require("../lib/correos");
const { crearLimite } = require("../lib/limite");

const router = express.Router();

const MAX_MARCA = 80;
const MAX_MENSAJE = 600;

// Más apretado que el de estudiantes: aquí no hay salones enteros llenando el
// formulario a la vez desde el mismo wifi. Y como en el resto del sitio, solo
// cuentan las propuestas que SÍ entraron.
const limitePropuesta = crearLimite({ ventanaMs: 10 * 60 * 1000, maximo: 10 });

const VACIO = {
  marca: "",
  sitio: "",
  tipo: "",
  mensaje: "",
  contacto_nombre: "",
  contacto_email: "",
  telefono: "",
};

function vistaFormulario(extra = {}) {
  return {
    title: "Patrocinar la Expo",
    tipos: PATROCINIOS.tipos,
    abierto: Boolean(PATROCINIOS.abierto),
    errores: [],
    valores: VACIO,
    ...extra,
  };
}

router.get("/patrocinios", (req, res) => {
  res.render("patrocinios", vistaFormulario());
});

router.post("/patrocinios", (req, res) => {
  const valores = {
    marca: limpiarNombre(req.body.marca).slice(0, MAX_MARCA),
    sitio: String(req.body.sitio || "").trim().slice(0, 200),
    tipo: PATROCINIOS.tipos.includes(String(req.body.tipo || "").trim())
      ? String(req.body.tipo).trim()
      : "",
    mensaje: String(req.body.mensaje || "").trim().slice(0, MAX_MENSAJE),
    contacto_nombre: limpiarNombre(req.body.contacto_nombre).slice(0, 120),
    contacto_email: normalizar(req.body.contacto_email),
    telefono: String(req.body.telefono || "")
      .replace(/[^\d+\s()-]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 25),
  };

  const fallar = (errores, status = 400) =>
    res.status(status).render("patrocinios", vistaFormulario({ errores, valores }));

  const errores = [];

  if (!PATROCINIOS.abierto) {
    errores.push("Por ahora no estamos recibiendo propuestas de patrocinio.");
  }

  if (!valores.marca) errores.push("Escribe el nombre de la marca o empresa.");
  if (!valores.tipo) errores.push("Elige de qué manera te gustaría acompañar la Expo.");
  if (!valores.contacto_nombre) errores.push("Escribe el nombre de quien podemos contactar.");
  // A propósito NO se pide correo institucional: la marca viene de afuera.
  if (!formatoValido(valores.contacto_email)) {
    errores.push("Escribe un correo válido al que podamos responderte.");
  }

  // Mismo criterio que en el registro de expositores: se avisa con nombre
  // propio antes que dejar entrar dos veces la misma propuesta. La identidad
  // es el correo y el semestre: la misma marca puede volver el año que viene.
  const periodo = periodos.activo();
  if (formatoValido(valores.contacto_email)) {
    const previa = periodo
      ? db
          .prepare("SELECT 1 FROM patrocinios WHERE contacto_email = ? AND periodo_id = ?")
          .get(valores.contacto_email, periodo.id)
      : db.prepare("SELECT 1 FROM patrocinios WHERE contacto_email = ?").get(valores.contacto_email);

    if (previa) {
      errores.push(
        "Ya recibimos una propuesta desde ese correo para esta Expo. Estamos con ella: " +
          "si quieres agregar algo, respóndenos el correo que te llegó."
      );
    }
  }

  if (errores.length) return fallar(errores);

  if (limitePropuesta.alcanzado(req.ip)) {
    return fallar(
      ["Demasiadas propuestas seguidas desde esta conexión. Intenta de nuevo en unos minutos."],
      429
    );
  }

  db.prepare(
    `INSERT INTO patrocinios
       (periodo_id, marca, sitio, tipo, mensaje, contacto_nombre, contacto_email, telefono)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    periodo ? periodo.id : null,
    valores.marca,
    valores.sitio || null,
    valores.tipo,
    valores.mensaje || null,
    valores.contacto_nombre,
    valores.contacto_email,
    valores.telefono || null
  );

  limitePropuesta.registrar(req.ip);

  // Los dos correos salen aparte: si el SMTP falla o está apagado, la propuesta
  // ya quedó guardada y quien la mandó ve la página de gracias igual. El primero
  // es la bandeja de entrada de esto —no hay panel—; el segundo, el acuse.
  envios.expoPatrocinioAviso(valores, envios.urlBase(req));
  envios.expoPatrocinioAcuse(valores);

  res.redirect("/patrocinios/listo");
});

router.get("/patrocinios/listo", (req, res) => {
  res.render("patrocinios-listo", { title: "Propuesta enviada" });
});

module.exports = router;
