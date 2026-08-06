// =====================================================================
//  Correos automáticos: el código al registrarse, el resultado de la
//  revisión y el aviso de que ya está el certificado.
//
//  Todo esto es opcional. Sin SMTP_USER y SMTP_PASS en el .env la app se
//  comporta exactamente como antes; los avisos simplemente no salen. Y
//  ningún fallo de correo puede tumbar un registro ni una aprobación:
//  los envíos van aparte y lo peor que hacen es dejar un renglón en la
//  consola.
// =====================================================================
const nodemailer = require("nodemailer");
const { CORREO } = require("../config");
const { contenidoDe } = require("./eventos");

// ---------- Conexión ----------

function credenciales() {
  return {
    usuario: String(process.env.SMTP_USER || "").trim(),
    // Gmail muestra la contraseña de aplicación en grupos de cuatro
    // ("abcd efgh ijkl mnop"); los espacios no son parte de la clave.
    clave: String(process.env.SMTP_PASS || "").replace(/\s+/g, ""),
  };
}

function activo() {
  const { usuario, clave } = credenciales();
  return Boolean(usuario && clave);
}

let transporte = null;

// Las dos quejas de abajo se dicen una sola vez: son de configuración, no de
// cada correo, y repetirlas en cada registro solo ensucia la consola.
let quejaSinClaves = false;
let quejaLocalhost = false;

function conexion() {
  if (!transporte) {
    const { usuario, clave } = credenciales();
    transporte = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: usuario, pass: clave },
    });
  }
  return transporte;
}

/**
 * URL pública desde la que se está sirviendo la app, que es la que tienen
 * que abrir los enlaces del correo. Detrás de ngrok sale sola del propio
 * request; SITIO_URL la fija a mano cuando haga falta (por ejemplo, si el
 * docente aprueba desde localhost mientras los estudiantes entran por el
 * túnel).
 */
function urlBase(req) {
  const fijo = String(process.env.SITIO_URL || "").trim();
  if (fijo) return fijo.replace(/\/+$/, "");

  const base = `${req.protocol}://${req.get("host")}`;
  if (/localhost|127\.0\.0\.1/.test(base) && !quejaLocalhost) {
    quejaLocalhost = true;
    console.warn(
      "  ! Los enlaces de los correos apuntan a localhost. Pon SITIO_URL en el .env con la URL pública."
    );
  }
  return base;
}

// ---------- Envío ----------

async function enviar({ para, asunto, html, texto }) {
  if (!para) return false;

  if (!activo()) {
    if (!quejaSinClaves) {
      quejaSinClaves = true;
      console.warn("  ! Correo sin configurar (falta SMTP_USER/SMTP_PASS): no se envían avisos.");
    }
    return false;
  }

  const { usuario } = credenciales();

  try {
    await conexion().sendMail({
      from: `"${CORREO.remitente || "Expo Multimedia"}" <${usuario}>`,
      to: para,
      replyTo: CORREO.responder_a || undefined,
      subject: asunto,
      text: texto,
      html,
    });
    console.log(`  ✉ ${para} · ${asunto}`);
    return true;
  } catch (e) {
    console.error(`  ! No se pudo enviar a ${para}: ${e.message}`);
    return false;
  }
}

// ---------- Plantilla ----------
// HTML de correo: tablas, estilos en línea y nada de fuentes externas.
// Es lo único que se ve igual en Gmail, Outlook y el cliente del celular.

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const FUENTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function pagina({ eyebrow, cuerpo }) {
  const { evento, institucion, programa } = contenidoDe("expo");
  const pie = [institucion, programa].filter(Boolean).join(" · ");

  return `<div style="background:#f4f4f7;padding:24px 12px;font-family:${FUENTE}">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto">
    <tr><td style="background:#0c0c0f;padding:22px 28px;border-radius:14px 14px 0 0">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;color:#e3e5f5">${esc(
        evento.name || "Expo Multimedia"
      )}</div>
      <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8b8ba6;margin-top:5px">${esc(
        eyebrow
      )}</div>
    </td></tr>
    <tr><td style="background:#ffffff;padding:26px 28px;border:1px solid #e4e4ec;border-top:0;border-radius:0 0 14px 14px;color:#1c1c22;font-size:15px;line-height:1.6">
${cuerpo}
    </td></tr>
  </table>
  <p style="max-width:560px;margin:16px auto 0;text-align:center;color:#8a8a99;font-size:12px;line-height:1.5">
    ${esc(pie)}<br />Este correo se envía solo: no hace falta responderlo.
  </p>
</div>`;
}

const parrafo = (html) => `      <p style="margin:0 0 14px">${html}</p>`;

const boton = (url, texto) =>
  `      <p style="margin:22px 0 6px">
        <a href="${esc(url)}" style="display:inline-block;background:#5b9cf6;color:#0c0c0f;
           font-weight:600;font-size:15px;text-decoration:none;padding:12px 22px;border-radius:9px">${esc(
             texto
           )}</a>
      </p>`;

const codigoGrande = (codigo, rotulo) =>
  `      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0">
        <tr><td style="background:#f4f4f7;border:1px dashed #c6c6d2;border-radius:11px;padding:16px;text-align:center">
          <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#70738a">${esc(
            rotulo
          )}</div>
          <div style="font-family:'SFMono-Regular',Consolas,monospace;font-size:29px;font-weight:700;
               letter-spacing:.2em;color:#0c0c0f;margin-top:7px">${esc(codigo)}</div>
        </td></tr>
      </table>`;

// Ficha de datos: cada fila es [rótulo, valor]. Las filas sin valor se caen.
const ficha = (filas) =>
  `      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:4px 0 6px;font-size:14px">
${filas
  .filter(([, valor]) => valor)
  .map(
    ([rotulo, valor]) =>
      `        <tr>
          <td style="padding:5px 12px 5px 0;color:#70738a;white-space:nowrap;vertical-align:top">${esc(rotulo)}</td>
          <td style="padding:5px 0;color:#1c1c22;vertical-align:top">${esc(valor)}</td>
        </tr>`
  )
  .join("\n")}
      </table>`;

const nota = (html) =>
  `      <p style="margin:20px 0 0;padding-top:16px;border-top:1px solid #ececf2;color:#70738a;font-size:13px;line-height:1.55">${html}</p>`;

// ---------- Avisos ----------

/** Registro recibido: el código, para el que llenó el formulario. */
function avisoRegistro(solicitud, base) {
  const url = `${base}/registro/estado?codigo=${encodeURIComponent(solicitud.codigo)}`;
  const equipo = solicitud.integrantes.map((i) => i.nombre).join(", ");

  const html = pagina({
    eyebrow: "Registro recibido",
    cuerpo: [
      parrafo(`Hola <strong>${esc(solicitud.contacto_nombre)}</strong>, quedó registrado
        <strong>${esc(solicitud.titulo)}</strong>. Ahora falta que el docente de
        ${esc(solicitud.materia_nombre)} lo revise.`),
      codigoGrande(solicitud.codigo, "Tu código"),
      ficha([
        ["Materia", solicitud.materia_nombre],
        ["Sala", solicitud.sala_nombre],
        ["Equipo", equipo],
      ]),
      boton(url, "Consultar el estado"),
      nota(`Guarda este código: es con lo que consultas el registro y, más adelante,
        con lo que encuentras los certificados del equipo. Mientras tanto mira
        <a href="${esc(base)}/expositores" style="color:#3b6fbd">cómo se monta un stand</a>:
        eso también se evalúa.`),
    ].join("\n"),
  });

  const texto = `Hola ${solicitud.contacto_nombre}:

Quedó registrado "${solicitud.titulo}" para ${solicitud.materia_nombre}. Falta que el docente lo revise.

TU CÓDIGO: ${solicitud.codigo}

Sala: ${solicitud.sala_nombre || "por definir"}
Equipo: ${equipo}

Consulta el estado en: ${url}
Guía de montaje del stand: ${base}/expositores

Guarda el código: es con lo que consultas el registro y con lo que después encuentras los certificados del equipo.`;

  return enviar({
    para: solicitud.contacto_email,
    asunto: `Registro recibido · código ${solicitud.codigo}`,
    html,
    texto,
  });
}

/** Resultado de la revisión del docente, aprobada o rechazada. */
function avisoRevision(solicitud, base) {
  const url = `${base}/registro/estado?codigo=${encodeURIComponent(solicitud.codigo)}`;
  const aprobada = solicitud.estado === "aprobada";
  const firma = solicitud.revisor ? ` por ${solicitud.revisor}` : "";

  const cuerpo = [
    parrafo(
      aprobada
        ? `Hola <strong>${esc(solicitud.contacto_nombre)}</strong>: aprobaron${esc(firma)}
           el registro de <strong>${esc(solicitud.titulo)}</strong>. Nos vemos en la Expo.`
        : `Hola <strong>${esc(solicitud.contacto_nombre)}</strong>: el registro de
           <strong>${esc(solicitud.titulo)}</strong> no quedó aprobado.`
    ),
    ficha([
      ["Materia", solicitud.materia_nombre],
      ["Sala", aprobada ? solicitud.sala_nombre : null],
      ["Código", solicitud.codigo],
    ]),
  ];

  if (!aprobada) {
    cuerpo.push(
      parrafo(
        solicitud.nota_docente
          ? `<strong>Lo que dice el docente:</strong><br />${esc(solicitud.nota_docente)}`
          : "El docente no dejó un motivo. Háblale para saber qué ajustar y vuelve a registrar el proyecto."
      )
    );
  }

  cuerpo.push(boton(url, "Ver el registro"));
  cuerpo.push(
    aprobada
      ? nota(`Repasa <a href="${esc(base)}/expositores" style="color:#3b6fbd">cómo se monta
          un stand</a> antes del evento: el montaje hace parte de la nota.`)
      : nota("Con el mismo código puedes volver a consultar esta página cuando quieras.")
  );

  const texto = aprobada
    ? `Hola ${solicitud.contacto_nombre}:

Aprobaron${firma} el registro de "${solicitud.titulo}" (${solicitud.materia_nombre}). Nos vemos en la Expo.

Sala: ${solicitud.sala_nombre || "por definir"}
Código: ${solicitud.codigo}

Ver el registro: ${url}
Guía de montaje: ${base}/expositores`
    : `Hola ${solicitud.contacto_nombre}:

El registro de "${solicitud.titulo}" (${solicitud.materia_nombre}) no quedó aprobado.

${solicitud.nota_docente ? `Lo que dice el docente: ${solicitud.nota_docente}` : "El docente no dejó un motivo. Háblale para saber qué ajustar."}

Código: ${solicitud.codigo}
Ver el registro: ${url}`;

  return enviar({
    para: solicitud.contacto_email,
    asunto: aprobada
      ? `Aprobado: ${solicitud.titulo}`
      : `Tu registro necesita cambios: ${solicitud.titulo}`,
    html: pagina({
      eyebrow: aprobada ? "Registro aprobado" : "Registro no aprobado",
      cuerpo: cuerpo.join("\n"),
    }),
    texto,
  });
}

/**
 * Certificado listo, uno por estudiante. `cert` es la fila de la tabla más
 * su `etiqueta` (la calcula quien llama, para no cruzar los módulos).
 */
function avisoCertificado(cert, base) {
  const url = `${base}/certificado/${cert.codigo}`;
  const logro = cert.puesto ? `${cert.etiqueta.label} en ${cert.materia_nombre}` : cert.etiqueta.label;

  const html = pagina({
    eyebrow: "Certificado listo",
    cuerpo: [
      parrafo(`Hola <strong>${esc(cert.estudiante)}</strong>, ya está tu certificado de la Expo.`),
      ficha([
        ["Reconocimiento", logro],
        ["Proyecto", cert.proyecto_titulo],
        ["Materia", cert.materia_nombre],
        ["Sala", cert.sala_nombre],
      ]),
      boton(url, "Ver tu certificado"),
      nota(`Ese enlace es el certificado: se puede compartir, descargar en PDF y
        verificar con su código QR, que apunta a esta misma página. Tu código es
        <strong>${esc(cert.codigo)}</strong>.`),
    ].join("\n"),
  });

  const texto = `Hola ${cert.estudiante}:

Ya está tu certificado de la Expo.

${logro}
Proyecto: ${cert.proyecto_titulo}
Materia: ${cert.materia_nombre}

Verlo, compartirlo o descargarlo en PDF: ${url}
Código del certificado: ${cert.codigo}

El QR del certificado apunta a esa misma página: escanearlo es la verificación.`;

  return enviar({
    para: cert.email,
    asunto: cert.puesto
      ? `${cert.etiqueta.label} en la Expo Multimedia`
      : "Tu certificado de la Expo Multimedia",
    html,
    texto,
  });
}

// Red de seguridad: los avisos se disparan desde rutas que no los esperan, así
// que ninguno puede reventar hacia afuera. Con esto, un dato que falte en una
// plantilla deja un renglón en la consola y nada más —ni un registro perdido,
// ni una promesa sin atrapar, que en Node cierra el proceso—.
const protegido = (fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (e) {
    console.error(`  ! Aviso descartado (${fn.name}): ${e.message}`);
    return false;
  }
};

module.exports = {
  activo,
  urlBase,
  avisoRegistro: protegido(avisoRegistro),
  avisoRevision: protegido(avisoRevision),
  avisoCertificado: protegido(avisoCertificado),
};
