// =====================================================================
//  Salidas pedagógicas — el panel del docente encargado.
//
//  Aquí no se crea ninguna salida ni se edita nada de la salida: eso vive en
//  config.SALIDAS y con eso se arma sola la página pública. Lo único que hace
//  este panel es lo único que no puede hacer un archivo de configuración:
//  decir quién ya pagó.
//
//  Son dos casillas por estudiante —transporte y póliza— y una regla:
//
//    · marcarlas es afirmar que se recibió el dinero Y que se vio el
//      consentimiento firmado, porque las dos cosas pasan en el mismo
//      momento y en el mismo escritorio;
//    · cuando quedan las dos, al estudiante le sale el correo que lo deja
//      confirmado. Ese correo se manda UNA vez: avisado_at es lo que impide
//      que desmarcar y volver a marcar le llene la bandeja.
// =====================================================================
const express = require("express");
const db = require("../db/database");
const salidas = require("../lib/salidas");
const envios = require("../lib/envios");
const periodos = require("../lib/periodos");
const { requireSalidas, verificar, configurado } = require("../lib/salidas-auth");
const certificados = require("../lib/certificados");

const router = express.Router();

// Una salida no es un evento del programa, pero certifica igual. Aquí se llama
// así para que la tabla de certificados sepa de dónde salió.
const EVENTO = "salidas";

function marco(extra = {}) {
  return {
    css: "/salidas.css",
    themeColor: "#f6f2e9",
    pesos: salidas.pesos,
    title: "Panel · Salidas pedagógicas",
    ...extra,
  };
}

// ---------------------------------------------------------------------
//  Acceso
// ---------------------------------------------------------------------
router.get("/acceso", (req, res) => {
  if (req.session.docenteSalidas) return res.redirect("/salidas/panel");
  res.render(
    "salidas/acceso",
    marco({
      title: "Acceso · Salidas pedagógicas",
      error: null,
      email: "",
      configurado: configurado(),
    })
  );
});

router.post("/acceso", (req, res) => {
  const { docente, error, status } = verificar({
    email: req.body.email,
    password: req.body.password,
    ip: req.ip,
  });

  if (error) {
    return res.status(status).render(
      "salidas/acceso",
      marco({
        title: "Acceso · Salidas pedagógicas",
        error,
        email: String(req.body.email || ""),
        configurado: configurado(),
      })
    );
  }

  req.session.docenteSalidas = docente;
  res.redirect("/salidas/panel");
});

router.post("/salir", (req, res) => {
  delete req.session.docenteSalidas;
  res.redirect("/salidas");
});

// El guardia se cuelga de /panel y no del router entero a propósito: este
// router se monta en /salidas, que es también donde viven las páginas públicas.
// Un `router.use(requireSalidas)` a secas mandaría al login a cualquiera que
// escribiera mal la dirección de una salida.
router.use("/panel", requireSalidas, (req, res, next) => {
  res.locals.periodoSalidas = periodos.activo();
  next();
});

// ---------------------------------------------------------------------
//  Portada: las salidas del config
// ---------------------------------------------------------------------
router.get("/panel", (req, res) => {
  const lista = salidas.todas().map((s) => ({
    ...s,
    abierta: salidas.inscripcionAbierta(s),
    cerrada: salidas.porQueCerrada(s),
    cifras: salidas.resumen(s),
  }));

  res.render(
    "salidas/panel",
    marco({
      salidas: lista,
      periodo: periodos.activo(),
      aviso: req.query,
    })
  );
});

// ---------------------------------------------------------------------
//  Una salida: la lista de quién pagó qué
// ---------------------------------------------------------------------
router.get("/panel/:id", (req, res) => {
  const salida = salidas.porId(req.params.id);
  if (!salida) return res.redirect("/salidas/panel");

  const registros = salidas.registrosDe(salida.id);

  res.render(
    "salidas/registros",
    marco({
      title: `${salida.nombre} · Panel`,
      salida,
      abierta: salidas.inscripcionAbierta(salida),
      cerrada: salidas.porQueCerrada(salida),
      cifras: salidas.resumen(salida),
      // Los que faltan van primero: es a los que hay que perseguir, y una
      // lista ordenada por fecha de registro los deja repartidos entre los
      // que ya no necesitan nada.
      pendientes: registros.filter((r) => !r.confirmado),
      confirmados: registros.filter((r) => r.confirmado),
      certificados: certificados.deLote(EVENTO, salida.id),
      correoActivo: envios.activo(),
      aviso: req.query,
    })
  );
});

/**
 * Marcar (o desmarcar) los pagos de un estudiante.
 *
 * El formulario manda el estado completo de las dos casillas, no un "sumar
 * uno": así el docente ve lo mismo que guarda y puede corregir un clic
 * equivocado sin pedirle a nadie que borre nada de la base.
 */
router.post("/panel/registros/:id/pagos", async (req, res) => {
  const registro = salidas.registro(req.params.id);
  if (!registro) return res.redirect("/salidas/panel");

  const volver = `/salidas/panel/${registro.salida}`;
  const transporte = req.body.pago_transporte === "1" ? 1 : 0;
  const poliza = req.body.pago_poliza === "1" ? 1 : 0;
  const completo = transporte && poliza;

  db.prepare(
    `UPDATE salida_registros
        SET pago_transporte = ?,
            pago_poliza     = ?,
            -- La hora de cada pago se pone la primera vez y no se toca más;
            -- desmarcar la borra, que es lo que hace que un clic equivocado
            -- no deje una fecha mintiendo.
            transporte_at = CASE WHEN ? = 1 THEN COALESCE(transporte_at, CURRENT_TIMESTAMP) ELSE NULL END,
            poliza_at     = CASE WHEN ? = 1 THEN COALESCE(poliza_at, CURRENT_TIMESTAMP)     ELSE NULL END,
            confirmado_at = CASE WHEN ? = 1 THEN COALESCE(confirmado_at, CURRENT_TIMESTAMP) ELSE NULL END,
            cobrado_por   = ?
      WHERE id = ?`
  ).run(
    transporte,
    poliza,
    transporte,
    poliza,
    completo ? 1 : 0,
    req.session.docenteSalidas.id,
    registro.id
  );

  // El correo de confirmación, una sola vez. Si ya se mandó, desmarcar y
  // volver a marcar no lo repite: el estudiante ya sabe que va.
  //
  // Sin salida en el config no hay correo que armar —se le quitó del archivo
  // después de que alguien se registró—, pero el pago sí se guarda: el dinero
  // se recibió igual.
  const salida = salidas.porId(registro.salida);

  if (completo && !registro.avisado_at && salida) {
    const ok = await envios.salidaAvisoConfirmado(
      {
        codigo: registro.codigo,
        nombre: registro.nombre,
        email: registro.email,
        salida,
        docente: (salida && salida.docente) || {},
      },
      envios.urlBase(req)
    );

    if (ok) {
      db.prepare("UPDATE salida_registros SET avisado_at = CURRENT_TIMESTAMP WHERE id = ?").run(
        registro.id
      );
    }
    return res.redirect(`${volver}?confirmado=${ok ? 1 : 0}#r${registro.id}`);
  }

  res.redirect(`${volver}?ok=1#r${registro.id}`);
});

/**
 * Reenviar el correo de confirmación. Existe porque el correo se manda una
 * sola vez y a veces esa vez falla —Gmail rechaza, el estudiante lo borra—, y
 * la alternativa sería editar la base a mano.
 */
router.post("/panel/registros/:id/reenviar", async (req, res) => {
  const registro = salidas.registro(req.params.id);
  if (!registro) return res.redirect("/salidas/panel");

  const volver = `/salidas/panel/${registro.salida}`;
  if (!registro.confirmado) return res.redirect(`${volver}?error=sin_pagos#r${registro.id}`);

  const salida = salidas.porId(registro.salida);
  if (!salida) return res.redirect(`${volver}?reenviado=0#r${registro.id}`);

  const ok = await envios.salidaAvisoConfirmado(
    {
      codigo: registro.codigo,
      nombre: registro.nombre,
      email: registro.email,
      salida,
      docente: (salida && salida.docente) || {},
    },
    envios.urlBase(req)
  );

  if (ok) {
    db.prepare("UPDATE salida_registros SET avisado_at = CURRENT_TIMESTAMP WHERE id = ?").run(
      registro.id
    );
  }

  res.redirect(`${volver}?reenviado=${ok ? 1 : 0}#r${registro.id}`);
});

// Una nota del docente: que va en silla de adelante, que es alérgico a algo,
// que paga el viernes. Es del panel y no sale en ninguna página pública.
/**
 * Pasar lista el día de la salida.
 *
 * Un toque marca y el mismo toque otra vez desmarca. Eso no es un capricho: la
 * lista se pasa de pie, en la puerta del bus, mirando caras y no la pantalla, y
 * el dedo se equivoca. Sin la vuelta atrás, corregir un toque obligaría a
 * abrir la ficha y buscar un botón de "limpiar", que es justo lo que nadie va a
 * hacer con doce personas esperando para subir.
 *
 * Solo se le pasa lista a los confirmados: quien no pagó no sube, así que no es
 * un ausente. La vista tampoco le pinta los botones, pero esto no se fía de la
 * vista.
 */
router.post("/panel/registros/:id/asistencia", (req, res) => {
  const registro = salidas.registro(req.params.id);
  if (!registro) return res.redirect("/salidas/panel");

  const volver = `/salidas/panel/${registro.salida}#r${registro.id}`;
  if (!registro.confirmado) return res.redirect(`${volver}`);

  const pedido = req.body.asistio === "1" ? 1 : 0;
  // Tocar lo que ya estaba marcado lo devuelve a "sin pasar".
  const nuevo = registro.asistio === pedido ? null : pedido;

  db.prepare(
    `UPDATE salida_registros
        SET asistio = ?, asistencia_at = ${nuevo === null ? "NULL" : "CURRENT_TIMESTAMP"}
      WHERE id = ?`
  ).run(nuevo, registro.id);

  res.redirect(volver);
});

router.post("/panel/registros/:id/nota", (req, res) => {
  const registro = salidas.registro(req.params.id);
  if (!registro) return res.redirect("/salidas/panel");

  db.prepare("UPDATE salida_registros SET nota = ? WHERE id = ?").run(
    String(req.body.nota || "").trim().slice(0, 300) || null,
    registro.id
  );

  res.redirect(`/salidas/panel/${registro.salida}?ok=1#r${registro.id}`);
});

/**
 * Sacar a alguien de la lista: se retiró antes de pagar y su cupo tiene que
 * volver al bus.
 *
 * A quien ya pagó no se le borra el registro. Es el comprobante de que entregó
 * un dinero, y ese papel no se rompe desde una pantalla: si se retiró después
 * de pagar, se le desmarcan los pagos y queda constancia de que los tuvo.
 */
router.post("/panel/registros/:id/borrar", (req, res) => {
  const registro = salidas.registro(req.params.id);
  if (!registro) return res.redirect("/salidas/panel");

  const volver = `/salidas/panel/${registro.salida}`;
  if (registro.pago_transporte || registro.pago_poliza) {
    return res.redirect(`${volver}?error=pagado#r${registro.id}`);
  }

  db.prepare("DELETE FROM salida_registros WHERE id = ?").run(registro.id);
  res.redirect(`${volver}?borrado=1`);
});

/**
 * La lista en CSV: la que se imprime y se sube al bus.
 *
 * Es el único sitio del panel donde salen juntos el documento y el teléfono de
 * todo el mundo, y es a propósito: eso es exactamente lo que pide la
 * aseguradora y lo que hay que tener a mano si pasa algo en la carretera.
 */
router.get("/panel/:id/lista.csv", (req, res) => {
  const salida = salidas.porId(req.params.id);
  if (!salida) return res.redirect("/salidas/panel");

  // Punto y coma y BOM: es lo que hace que Excel en español abra el archivo en
  // columnas en vez de meter todo en la primera.
  const escapar = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const filas = [
    ["Nombre", "Código", "Tipo documento", "Documento", "Teléfono", "Correo", "Transporte", "Póliza", "Estado", "Asistencia", "Nota"],
    ...salidas.registrosDe(salida.id).map((r) => [
      r.nombre,
      r.codigo_estudiante,
      r.tipo_id,
      r.num_id,
      r.telefono,
      r.email,
      r.pago_transporte ? "Pagado" : "Pendiente",
      r.pago_poliza ? "Pagada" : "Pendiente",
      r.estado.label,
      r.asistencia ? r.asistencia.label : "",
      r.nota || "",
    ]),
  ];

  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="${salida.id}-lista.csv"`);
  res.send("﻿" + filas.map((f) => f.map(escapar).join(";")).join("\r\n"));
});

// ---------------------------------------------------------------------
//  Certificados de asistencia
// ---------------------------------------------------------------------

/**
 * Constancia de asistencia, y solo para quien asistió: la lista de inscritos
 * no sirve —se paga y a veces no se va—, así que lo que cuenta es la
 * asistencia que se pasó ese día. Aquí no hay premios: una salida no es una
 * competencia.
 *
 * Firma el docente encargado que está en config.SALIDAS, que es quien responde
 * por la salida, y no quien tenga la sesión abierta.
 */
router.post("/panel/:id/certificados", (req, res) => {
  const salida = salidas.porId(req.params.id);
  if (!salida) return res.redirect("/salidas/panel");

  const r = certificados.emitirDeSalida(salida.id, periodos.activo().id);

  res.redirect(
    `/salidas/panel/${salida.id}?emitidos=${r.emitidos}&actualizados=${r.actualizados}#certificados`
  );
});

// Avisar es un paso aparte de emitir, igual que el resto del sitio: emitir se
// repite sin consecuencias, un correo no se devuelve.
router.post("/panel/:id/certificados/avisos", async (req, res) => {
  const salida = salidas.porId(req.params.id);
  if (!salida) return res.redirect("/salidas/panel");

  let r = { enviados: 0, fallaron: 0 };
  try {
    r = await certificados.avisarPendientes(EVENTO, salida.id, envios.urlBase(req));
  } catch (e) {
    console.error(`  ! Avisos de certificados de la salida ${salida.id}: ${e.message}`);
  }

  // cert_avisados y no avisados a secas: la página ya usa banderas propias
  // para el correo de confirmación de pagos.
  res.redirect(
    `/salidas/panel/${salida.id}?cert_avisados=${r.enviados}&cert_fallaron=${r.fallaron}#certificados`
  );
});

module.exports = router;
