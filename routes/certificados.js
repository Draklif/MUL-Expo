const express = require("express");
const { contenidoDe, porSlug, url: urlEvento } = require("../lib/eventos");
const { porCodigo, motivoDe, nombreEvento, paletaQr, qrSvg } = require("../lib/certificados");

const router = express.Router();

// Certificado público: es la página a la que apunta su propio QR. Una sola
// para los cinco eventos —la del torneo no es otra página, es la misma con
// otros nombres adentro—, porque un código es un código.
router.get("/:codigo", (req, res) => {
  const cert = porCodigo(req.params.codigo);

  if (!cert) {
    return res.status(404).render("certificado-nulo", { codigo: req.params.codigo });
  }

  // El programa y la institución son del programa y no del evento, así que
  // salen del contenido de la Expo cuando el certificado es de una salida, que
  // no está en config.EVENTOS y no tiene archivo de contenido propio.
  const evento = porSlug(cert.evento);
  const contenido = contenidoDe(evento ? cert.evento : "expo");

  // Con trust proxy activo esto da la URL pública real (la de ngrok, por ejemplo).
  const url = `${req.protocol}://${req.get("host")}/certificado/${cert.codigo}`;

  res.render("certificado", {
    cert,
    url,
    qr: qrSvg(url, 160, paletaQr(cert.evento)),
    motivo: motivoDe(cert),
    eventoNombre: nombreEvento(cert.evento),
    volver: evento ? urlEvento(evento) : "/salidas",
    programa: contenido.programa,
    institucion: contenido.institucion,
    // La fecha impresa es la del evento cuando la hay; si no, la de emisión.
    fechaEvento: evento && contenido.evento ? contenido.evento.fecha : "",
  });
});

module.exports = router;
