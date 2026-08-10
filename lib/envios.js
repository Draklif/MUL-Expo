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

// Freno de mano para probar con datos inventados.
//
// Los correos de prueba van a direcciones @uniboyaca.edu.co que no existen, y
// cada una rebota a la cuenta que envía: unas cuantas pruebas se convierten en
// una bandeja llena de "no such user". Con CORREOS=off en el .env la app se
// comporta como si no hubiera SMTP configurado —los avisos no salen y nada
// más cambia—, y quitando esa línea vuelve a mandar.
function apagados() {
  const v = String(process.env.CORREOS || "").trim().toLowerCase();
  return v === "off" || v === "0" || v === "no";
}

function activo() {
  if (apagados()) return false;
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

async function enviar({ para, asunto, html, texto, remitente }) {
  if (!para) return false;

  if (!activo()) {
    if (!quejaSinClaves) {
      quejaSinClaves = true;
      console.warn(
        apagados()
          ? "  · Correos apagados (CORREOS=off en el .env): los avisos no salen."
          : "  ! Correo sin configurar (falta SMTP_USER/SMTP_PASS): no se envían avisos."
      );
    }
    return false;
  }

  const { usuario } = credenciales();

  try {
    await conexion().sendMail({
      from: `"${remitente || CORREO.remitente || "Expo Multimedia"}" <${usuario}>`,
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

/**
 * `marca` y `tipografia` existen para que el torneo pueda mandar sus propios
 * correos sin una segunda plantilla: Virtual Champions se anuncia con su
 * nombre y en mayúsculas, la Expo sigue con el suyo en serif. Todo lo demás
 * —el armazón de tablas, el pie, los colores del cuerpo— es igual para los
 * dos, que es justamente lo que no vale la pena duplicar.
 */
function pagina({ eyebrow, cuerpo, marca, tipografia }) {
  const { evento, institucion, programa } = contenidoDe("expo");
  const pie = [institucion, programa].filter(Boolean).join(" · ");
  // La de "pixel" es monoespaciada y no una fuente de píxeles de verdad: en un
  // correo no hay forma de garantizar una tipografía que el cliente no tenga,
  // y una monoespaciada en mayúsculas es lo más cerca que se llega con lo que
  // ya está instalado en todas partes.
  const titulo =
    tipografia === "esports"
      ? `font-family:${FUENTE};font-size:18px;font-weight:700;letter-spacing:.09em;text-transform:uppercase`
      : tipografia === "pixel"
        ? "font-family:'SFMono-Regular',Consolas,monospace;font-size:17px;font-weight:700;letter-spacing:.12em;text-transform:uppercase"
        : tipografia === "tinta"
          ? "font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;font-style:italic;letter-spacing:-.01em"
          : "font-family:Georgia,'Times New Roman',serif;font-size:20px";

  return `<div style="background:#f4f4f7;padding:24px 12px;font-family:${FUENTE}">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto">
    <tr><td style="background:#0c0c0f;padding:22px 28px;border-radius:14px 14px 0 0">
      <div style="${titulo};color:#e3e5f5">${esc(
        marca || evento.name || "Expo Multimedia"
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

const boton = (url, texto, color = "#5b9cf6") =>
  `      <p style="margin:22px 0 6px">
        <a href="${esc(url)}" style="display:inline-block;background:${esc(color)};color:#0c0c0f;
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

// ---------- Avisos de Virtual Champions ----------
// El torneo tiene sus propios correos porque no habla de materias ni de salas
// sino de equipos, juegos y partidas. Reusan la misma plantilla con otra marca.

const MARCA_VC = "Virtual Champions";

/** Inscripción recibida. Sirve para un equipo entero y para quien se apuntó solo. */
function vcAvisoInscripcion({ codigo, nombre, email, equipo, juego, solo, faltan }, base) {
  const url = `${base}/vc/inscripcion/estado?codigo=${encodeURIComponent(codigo)}`;

  const cuerpo = [
    parrafo(
      solo
        ? `Hola <strong>${esc(nombre)}</strong>, quedaste inscrito en
           <strong>${esc(juego)}</strong>. Todavía no tienes equipo: te vamos a asignar
           uno en cuanto se junten los jugadores que faltan.`
        : `Hola <strong>${esc(nombre)}</strong>, quedó inscrito
           <strong>${esc(equipo)}</strong> en <strong>${esc(juego)}</strong>.
           Ahora falta que la organización lo revise.`
    ),
    codigoGrande(codigo, "Tu código"),
    ficha([
      ["Juego", juego],
      ["Equipo", solo ? null : equipo],
      ["Modalidad", solo ? "Inscripción individual" : "Equipo completo"],
    ]),
  ];

  if (solo && faltan > 0) {
    cuerpo.push(
      parrafo(
        `Faltan <strong>${esc(faltan)}</strong> jugadores más para completar un equipo.
         Apenas se llene te avisamos por acá con quiénes te tocó.`
      )
    );
  }

  cuerpo.push(boton(url, "Consultar el estado", "#ff4655"));
  cuerpo.push(
    nota(`Guarda este código: es con lo que consultas tu inscripción, y con lo que
      después ves tus partidas y tu llave en el bracket.`)
  );

  const texto = `Hola ${nombre}:

${
  solo
    ? `Quedaste inscrito en ${juego}. Todavía no tienes equipo: te asignamos uno en cuanto se junten los jugadores que faltan.${faltan > 0 ? `\nFaltan ${faltan} jugadores más.` : ""}`
    : `Quedó inscrito "${equipo}" en ${juego}. Falta que la organización lo revise.`
}

TU CÓDIGO: ${codigo}

Consulta el estado en: ${url}

Guarda el código: con él consultas tu inscripción y después ves tus partidas.`;

  return enviar({
    para: email,
    remitente: MARCA_VC,
    asunto: `Inscripción recibida · código ${codigo}`,
    html: pagina({
      eyebrow: "Inscripción recibida",
      marca: MARCA_VC,
      tipografia: "esports",
      cuerpo: cuerpo.join("\n"),
    }),
    texto,
  });
}

/** Resultado de la revisión: el equipo entra al torneo o no. */
function vcAvisoRevision({ codigo, nombre, email, equipo, juego, estado, nota_docente }, base) {
  const url = `${base}/vc/inscripcion/estado?codigo=${encodeURIComponent(codigo)}`;
  const aprobado = estado === "aprobado";

  const cuerpo = [
    parrafo(
      aprobado
        ? `Hola <strong>${esc(nombre)}</strong>: <strong>${esc(equipo)}</strong> quedó dentro
           del torneo de <strong>${esc(juego)}</strong>. Atento al bracket, que ahí salen
           tus partidas con día y hora.`
        : `Hola <strong>${esc(nombre)}</strong>: la inscripción de
           <strong>${esc(equipo)}</strong> no quedó aprobada.`
    ),
    ficha([
      ["Juego", juego],
      ["Equipo", equipo],
      ["Código", codigo],
    ]),
  ];

  if (!aprobado) {
    cuerpo.push(
      parrafo(
        nota_docente
          ? `<strong>Lo que dice la organización:</strong><br />${esc(nota_docente)}`
          : "La organización no dejó un motivo. Escríbeles para saber qué ajustar y vuelvan a inscribirse."
      )
    );
  }

  cuerpo.push(boton(url, aprobado ? "Ver el torneo" : "Ver la inscripción", "#ff4655"));

  const texto = `Hola ${nombre}:

${
  aprobado
    ? `"${equipo}" quedó dentro del torneo de ${juego}. En el bracket salen tus partidas con día y hora.`
    : `La inscripción de "${equipo}" (${juego}) no quedó aprobada.\n\n${nota_docente ? `Lo que dice la organización: ${nota_docente}` : "No dejaron un motivo. Escríbeles para saber qué ajustar."}`
}

Código: ${codigo}
Ver: ${url}`;

  return enviar({
    para: email,
    remitente: MARCA_VC,
    asunto: aprobado ? `${equipo} está dentro · ${juego}` : `Su inscripción necesita cambios · ${equipo}`,
    html: pagina({
      eyebrow: aprobado ? "Inscripción aprobada" : "Inscripción no aprobada",
      marca: MARCA_VC,
      tipografia: "esports",
      cuerpo: cuerpo.join("\n"),
    }),
    texto,
  });
}

/** A quien se inscribió solo y ya tiene equipo: con quiénes le tocó. */
function vcAvisoAsignado({ nombre, email, equipo, juego, companeros, equipoId }, base) {
  const url = `${base}/vc/equipo/${equipoId}`;
  const lista = (companeros || []).join(", ");

  const html = pagina({
    eyebrow: "Ya tienes equipo",
    marca: MARCA_VC,
    tipografia: "esports",
    cuerpo: [
      parrafo(`Hola <strong>${esc(nombre)}</strong>, te asignamos a
        <strong>${esc(equipo)}</strong> para el torneo de <strong>${esc(juego)}</strong>.`),
      ficha([
        ["Juego", juego],
        ["Equipo", equipo],
        ["Compañeros", lista],
      ]),
      boton(url, "Ver el equipo", "#ff4655"),
      nota("En esa página está el roster completo y las partidas del equipo con día y hora."),
    ].join("\n"),
  });

  const texto = `Hola ${nombre}:

Te asignamos a "${equipo}" para el torneo de ${juego}.

Compañeros: ${lista}

Ver el equipo y sus partidas: ${url}`;

  return enviar({
    para: email,
    remitente: MARCA_VC,
    asunto: `Ya tienes equipo: ${equipo}`,
    html,
    texto,
  });
}

// ---------- Avisos de la Jam de Altura ----------
// La jam habla de equipos, de un tema y de un reloj que corre. Misma plantilla,
// otra marca y el verde de la casa en los botones.

const MARCA_JAM = "Jam de Altura";
const VERDE_JAM = "#7cf74a";

/** Inscripción recibida. Sirve para un equipo entero y para quien se apuntó solo. */
function jamAvisoInscripcion({ codigo, nombre, email, equipo, solo, integrantes, cuando }, base) {
  const url = `${base}/jam/inscripcion/estado?codigo=${encodeURIComponent(codigo)}`;

  const cuerpo = [
    parrafo(
      solo
        ? `Hola <strong>${esc(nombre)}</strong>, quedaste inscrito en la
           <strong>Jam de Altura</strong>. Todavía no tienes equipo: te vamos a
           armar uno con los demás que se inscribieron solos.`
        : `Hola <strong>${esc(nombre)}</strong>, quedó inscrito
           <strong>${esc(equipo)}</strong> en la <strong>Jam de Altura</strong>.
           Ahora falta que la organización lo revise.`
    ),
    codigoGrande(codigo, "Su código"),
    ficha([
      ["Equipo", solo ? null : equipo],
      ["Integrantes", solo ? null : (integrantes || []).join(", ")],
      ["Modalidad", solo ? "Inscripción individual" : "Equipo completo"],
      ["Arranque", cuando],
    ]),
    parrafo(
      `El tema se revela cuando empiece la jam, no antes: sale en la página junto
       con el reloj de las 48 horas.`
    ),
    boton(url, "Consultar el estado", VERDE_JAM),
    nota(`Guarda el código: con él se consulta la inscripción y, cuando llegue el
      momento, es con lo que se entrega el juego.`),
  ];

  const texto = `Hola ${nombre}:

${
  solo
    ? "Quedaste inscrito en la Jam de Altura. Todavía no tienes equipo: te armamos uno con los demás que se inscribieron solos."
    : `Quedó inscrito "${equipo}" en la Jam de Altura. Falta que la organización lo revise.`
}

SU CÓDIGO: ${codigo}
${cuando ? `\nArranque: ${cuando}` : ""}

El tema se revela cuando empiece la jam, en la página del evento.

Consulta el estado en: ${url}

Guarda el código: con él se consulta la inscripción y con él se entrega el juego.`;

  return enviar({
    para: email,
    remitente: MARCA_JAM,
    asunto: `Inscripción recibida · código ${codigo}`,
    html: pagina({
      eyebrow: "Inscripción recibida",
      marca: MARCA_JAM,
      tipografia: "pixel",
      cuerpo: cuerpo.join("\n"),
    }),
    texto,
  });
}

/** Resultado de la revisión: el equipo entra a la jam o no. */
function jamAvisoRevision({ codigo, nombre, email, equipo, estado, nota_docente }, base) {
  const url = `${base}/jam/inscripcion/estado?codigo=${encodeURIComponent(codigo)}`;
  const aprobado = estado === "aprobado";

  const cuerpo = [
    parrafo(
      aprobado
        ? `Hola <strong>${esc(nombre)}</strong>: <strong>${esc(equipo)}</strong> está dentro
           de la <strong>Jam de Altura</strong>. Nos vemos cuando arranque el reloj.`
        : `Hola <strong>${esc(nombre)}</strong>: la inscripción de
           <strong>${esc(equipo)}</strong> no quedó admitida.`
    ),
    ficha([
      ["Equipo", equipo],
      ["Código", codigo],
    ]),
  ];

  if (!aprobado) {
    cuerpo.push(
      parrafo(
        nota_docente
          ? `<strong>Lo que dice la organización:</strong><br />${esc(nota_docente)}`
          : "La organización no dejó un motivo. Escríbeles para saber qué ajustar y vuelvan a inscribirse."
      )
    );
  }

  cuerpo.push(boton(url, aprobado ? "Ver la jam" : "Ver la inscripción", VERDE_JAM));

  const texto = `Hola ${nombre}:

${
  aprobado
    ? `"${equipo}" está dentro de la Jam de Altura. Nos vemos cuando arranque el reloj.`
    : `La inscripción de "${equipo}" no quedó admitida.\n\n${nota_docente ? `Lo que dice la organización: ${nota_docente}` : "No dejaron un motivo. Escríbeles para saber qué ajustar."}`
}

Código: ${codigo}
Ver: ${url}`;

  return enviar({
    para: email,
    remitente: MARCA_JAM,
    asunto: aprobado ? `${equipo} está dentro · Jam de Altura` : `Su inscripción necesita cambios · ${equipo}`,
    html: pagina({
      eyebrow: aprobado ? "Inscripción admitida" : "Inscripción no admitida",
      marca: MARCA_JAM,
      tipografia: "pixel",
      cuerpo: cuerpo.join("\n"),
    }),
    texto,
  });
}

/** A quien se inscribió solo y ya tiene equipo: con quiénes le tocó. */
function jamAvisoEquipoArmado({ nombre, email, equipo, codigo, companeros, equipoId }, base) {
  const url = `${base}/jam/equipo/${equipoId}`;
  const lista = (companeros || []).join(", ");

  const html = pagina({
    eyebrow: "Ya tienes equipo",
    marca: MARCA_JAM,
    tipografia: "pixel",
    cuerpo: [
      parrafo(`Hola <strong>${esc(nombre)}</strong>, te armamos equipo para la
        <strong>Jam de Altura</strong>: quedaste en <strong>${esc(equipo)}</strong>.`),
      ficha([
        ["Equipo", equipo],
        ["Con quiénes", lista],
      ]),
      codigo ? codigoGrande(codigo, "Código del equipo") : "",
      boton(url, "Ver el equipo", VERDE_JAM),
      nota(`Escríbanse antes de que arranque: 48 horas se van rápido y la primera
        hora se pierde entera si nadie sabe quién hace qué.`),
    ]
      .filter(Boolean)
      .join("\n"),
  });

  const texto = `Hola ${nombre}:

Te armamos equipo para la Jam de Altura: quedaste en "${equipo}".

Con quiénes: ${lista}
${codigo ? `Código del equipo: ${codigo}` : ""}

Ver el equipo: ${url}

Escríbanse antes de que arranque: 48 horas se van rápido.`;

  return enviar({
    para: email,
    remitente: MARCA_JAM,
    asunto: `Ya tienes equipo: ${equipo}`,
    html,
    texto,
  });
}

/** El tema, cuando la organización lo revela. Va a cada inscrito. */
function jamAvisoTema({ nombre, email, tema, cierre }, base) {
  const url = `${base}/jam-de-altura`;

  const html = pagina({
    eyebrow: "Arrancó la jam",
    marca: MARCA_JAM,
    tipografia: "pixel",
    cuerpo: [
      parrafo(`Hola <strong>${esc(nombre)}</strong>: el tema de esta edición ya está.`),
      codigoGrande(tema, "El tema"),
      ficha([["Se entrega hasta", cierre]]),
      boton(url, "Ir a la jam", VERDE_JAM),
      nota(`El reloj de la página va contando lo que queda. El juego se entrega
        desde ahí, con el código del equipo.`),
    ].join("\n"),
  });

  const texto = `Hola ${nombre}:

El tema de esta edición de la Jam de Altura es:

${tema}
${cierre ? `\nSe entrega hasta: ${cierre}` : ""}

El reloj y la entrega están en: ${url}`;

  return enviar({
    para: email,
    remitente: MARCA_JAM,
    asunto: `El tema es: ${tema}`,
    html,
    texto,
  });
}

// ---------- Avisos de INKreible ----------
// El reto de dibujo no habla de equipos sino de personas, y su correo más
// importante no es el de "quedaste inscrito" sino el de "aquí subes": el
// enlace de la carpeta y el nombre que tiene que llevar cada archivo. Sin eso
// nadie puede participar, así que va grande y va en los dos correos donde
// puede caber.

const MARCA_INK = "INKreible";
const ROJO_INK = "#d1442f";

// El bloque de instrucciones de subida. Es el mismo en el correo de admisión y
// en el del enlace, y es lo único que un participante necesita tener a mano
// durante las cuatro semanas.
function bloqueDrive({ drive, ejemplo, dias }) {
  const partes = [];

  if (drive) {
    partes.push(boton(drive, "Abrir la carpeta para subir", ROJO_INK));
  }

  partes.push(
    parrafo(
      `Cada dibujo se sube con este nombre exacto: <strong>tu código</strong>, el
       <strong>día</strong> en dos cifras y <strong>DIG</strong> o
       <strong>ANA</strong> según con qué lo hayas hecho.`
    )
  );

  if (ejemplo) {
    partes.push(
      `      <p style="margin:0 0 14px;font-family:'SFMono-Regular',Consolas,monospace;
         background:#f4f4f7;border:1px dashed #c6c6d2;border-radius:9px;padding:12px 14px;
         font-size:15px;color:#1c1c22;text-align:center">${esc(ejemplo)}</p>`
    );
  }

  partes.push(
    nota(`Son ${esc(dias)} dibujos, uno por día, y se suben por semana. El archivo tiene que
      quedar compartido con "cualquiera con el enlace": si no, no se ve en la
      galería y no lo puede mirar el jurado.`)
  );

  return partes.join("\n");
}

/** Inscripción recibida: el código y qué sigue. */
function inkAvisoInscripcion({ codigo, nombre, email, tecnica, cuando }, base) {
  const url = `${base}/ink/inscripcion/estado?codigo=${encodeURIComponent(codigo)}`;

  const html = pagina({
    eyebrow: "Inscripción recibida",
    marca: MARCA_INK,
    tipografia: "tinta",
    cuerpo: [
      parrafo(`Hola <strong>${esc(nombre)}</strong>, quedaste inscrito en
        <strong>INKreible</strong>. Falta que la organización revise la
        inscripción; cuando lo haga te llega por acá el enlace de la carpeta
        donde se suben los dibujos.`),
      codigoGrande(codigo, "Tu código"),
      ficha([
        ["Con qué vas a dibujar", tecnica],
        ["Arranca", cuando],
      ]),
      boton(url, "Consultar el estado", ROJO_INK),
      nota(`Guarda el código: con él consultas tu inscripción, ves qué días te faltan
        y —lo más importante— es la primera parte del nombre de cada archivo que
        subas.`),
    ].join("\n"),
  });

  const texto = `Hola ${nombre}:

Quedaste inscrito en INKreible. Falta que la organización revise la inscripción; cuando lo haga te llega el enlace de la carpeta donde se suben los dibujos.

TU CÓDIGO: ${codigo}
${cuando ? `\nArranca: ${cuando}` : ""}

Consulta el estado en: ${url}

Guarda el código: con él consultas tu inscripción y con él se nombra cada archivo que subes.`;

  return enviar({
    para: email,
    remitente: MARCA_INK,
    asunto: `Inscripción recibida · código ${codigo}`,
    html,
    texto,
  });
}

/**
 * Resultado de la revisión. Cuando entra, este es EL correo del reto: lleva
 * el enlace de la carpeta y la nomenclatura, que es todo lo que hace falta
 * para empezar a subir.
 */
function inkAvisoRevision(
  { codigo, nombre, email, estado, nota_docente, drive, ejemplo, dias, cuando },
  base
) {
  const url = `${base}/ink/inscripcion/estado?codigo=${encodeURIComponent(codigo)}`;
  const admitido = estado === "aprobado";

  const cuerpo = [
    parrafo(
      admitido
        ? `Hola <strong>${esc(nombre)}</strong>: estás dentro de <strong>INKreible</strong>.
           ${esc(dias)} días, ${esc(dias)} palabras, ${esc(dias)} dibujos.`
        : `Hola <strong>${esc(nombre)}</strong>: tu inscripción a INKreible no quedó admitida.`
    ),
    ficha([
      ["Tu código", codigo],
      ["Arranca", admitido ? cuando : null],
    ]),
  ];

  if (admitido) {
    cuerpo.push(bloqueDrive({ drive, ejemplo, dias }));
    if (!drive) {
      cuerpo.push(
        parrafo(
          `La carpeta todavía se está preparando: apenas esté, te llega por este
           mismo correo.`
        )
      );
    }
    cuerpo.push(boton(url, "Ver mis días", ROJO_INK));
  } else {
    cuerpo.push(
      parrafo(
        nota_docente
          ? `<strong>Lo que dice la organización:</strong><br />${esc(nota_docente)}`
          : "La organización no dejó un motivo. Escríbeles para saber qué ajustar y vuelve a inscribirte."
      )
    );
    cuerpo.push(boton(url, "Ver la inscripción", ROJO_INK));
  }

  const texto = admitido
    ? `Hola ${nombre}:

Estás dentro de INKreible. ${dias} días, ${dias} palabras, ${dias} dibujos.

TU CÓDIGO: ${codigo}
${cuando ? `Arranca: ${cuando}\n` : ""}${drive ? `\nCarpeta para subir: ${drive}` : "\nLa carpeta todavía se está preparando: apenas esté, te llega por correo."}

Cada archivo se llama así: tu código, el día en dos cifras y DIG o ANA.
${ejemplo ? `Ejemplo: ${ejemplo}` : ""}

El archivo tiene que quedar compartido con "cualquiera con el enlace".

Tus días y lo que llevas: ${url}`
    : `Hola ${nombre}:

Tu inscripción a INKreible no quedó admitida.

${nota_docente ? `Lo que dice la organización: ${nota_docente}` : "No dejaron un motivo. Escríbeles para saber qué ajustar."}

Código: ${codigo}
Ver: ${url}`;

  return enviar({
    para: email,
    remitente: MARCA_INK,
    asunto: admitido ? `Estás dentro de INKreible · código ${codigo}` : "Tu inscripción a INKreible necesita cambios",
    html: pagina({
      eyebrow: admitido ? "Estás dentro" : "Inscripción no admitida",
      marca: MARCA_INK,
      tipografia: "tinta",
      cuerpo: cuerpo.join("\n"),
    }),
    texto,
  });
}

/**
 * El enlace de la carpeta, a quien ya está admitido. Existe aparte del correo
 * de admisión porque el orden real suele ser el contrario: primero se admite a
 * la gente y después alguien arma la carpeta del semestre.
 */
function inkAvisoEnlace({ nombre, email, codigo, drive, ejemplo, dias }, base) {
  const url = `${base}/ink/inscripcion/estado?codigo=${encodeURIComponent(codigo)}`;

  const html = pagina({
    eyebrow: "Dónde se suben los dibujos",
    marca: MARCA_INK,
    tipografia: "tinta",
    cuerpo: [
      parrafo(`Hola <strong>${esc(nombre)}</strong>, esta es la carpeta de
        <strong>INKreible</strong>: ahí van tus ${esc(dias)} dibujos.`),
      codigoGrande(codigo, "Tu código"),
      bloqueDrive({ drive, ejemplo, dias }),
      boton(url, "Ver mis días", ROJO_INK),
    ].join("\n"),
  });

  const texto = `Hola ${nombre}:

Esta es la carpeta donde se suben los dibujos de INKreible:
${drive}

TU CÓDIGO: ${codigo}

Cada archivo se llama así: tu código, el día en dos cifras y DIG o ANA.
${ejemplo ? `Ejemplo: ${ejemplo}` : ""}

El archivo tiene que quedar compartido con "cualquiera con el enlace".

Tus días y lo que llevas: ${url}`;

  return enviar({
    para: email,
    remitente: MARCA_INK,
    asunto: "Dónde subir tus dibujos · INKreible",
    html,
    texto,
  });
}

/** El podio, a quien ganó algo. Va cuando se publican los resultados. */
function inkAvisoPremio({ nombre, email, reconocimientos }, base) {
  const url = `${base}/ink/resultados`;
  const lista = (reconocimientos || []).join(", ");

  const html = pagina({
    eyebrow: "Resultados de INKreible",
    marca: MARCA_INK,
    tipografia: "tinta",
    cuerpo: [
      parrafo(`Hola <strong>${esc(nombre)}</strong>: tu trabajo quedó en el podio de
        <strong>INKreible</strong>.`),
      ficha([["Reconocimiento", lista]]),
      boton(url, "Ver el podio", ROJO_INK),
      nota("Los resultados y la galería completa ya están publicados en la página del reto."),
    ].join("\n"),
  });

  const texto = `Hola ${nombre}:

Tu trabajo quedó en el podio de INKreible.

${lista}

Los resultados y la galería completa: ${url}`;

  return enviar({
    para: email,
    remitente: MARCA_INK,
    asunto: `Quedaste en el podio de INKreible`,
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
  apagados,
  urlBase,
  avisoRegistro: protegido(avisoRegistro),
  avisoRevision: protegido(avisoRevision),
  avisoCertificado: protegido(avisoCertificado),
  vcAvisoInscripcion: protegido(vcAvisoInscripcion),
  vcAvisoRevision: protegido(vcAvisoRevision),
  vcAvisoAsignado: protegido(vcAvisoAsignado),
  jamAvisoInscripcion: protegido(jamAvisoInscripcion),
  jamAvisoRevision: protegido(jamAvisoRevision),
  jamAvisoEquipoArmado: protegido(jamAvisoEquipoArmado),
  jamAvisoTema: protegido(jamAvisoTema),
  inkAvisoInscripcion: protegido(inkAvisoInscripcion),
  inkAvisoRevision: protegido(inkAvisoRevision),
  inkAvisoEnlace: protegido(inkAvisoEnlace),
  inkAvisoPremio: protegido(inkAvisoPremio),
};
