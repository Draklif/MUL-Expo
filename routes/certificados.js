const express = require("express");
const { contenidoDe } = require("../lib/eventos");
const { porCodigo, etiquetaPuesto, qrSvg } = require("../lib/certificados");

const router = express.Router();

// Certificado público: es la página a la que apunta su propio QR.
router.get("/:codigo", (req, res) => {
  const cert = porCodigo(req.params.codigo);

  if (!cert) {
    return res.status(404).render("certificado-nulo", { codigo: req.params.codigo });
  }

  // Con trust proxy activo esto da la URL pública real (la de ngrok, por ejemplo).
  const url = `${req.protocol}://${req.get("host")}/certificado/${cert.codigo}`;

  res.render("certificado", {
    cert,
    url,
    qr: qrSvg(url, 160),
    puesto: etiquetaPuesto(cert.puesto),
    ...contenidoDe("expo"),
  });
});

module.exports = router;
