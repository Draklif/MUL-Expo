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
const { CORREO, PATROCINIOS } = require("../config");
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

// `responder_a` es para los pocos avisos que NO van dirigidos a quien llenó el
// formulario: el de patrocinios llega al organizador, y ahí "Responder" tiene
// que escribirle a la marca y no a la cuenta que manda los correos.
async function enviar({ para, asunto, html, texto, remitente, responder_a }) {
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
      replyTo: responder_a || CORREO.responder_a || undefined,
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

// Una lista numerada. Va con <ol> y no con una tabla como la ficha porque aquí
// el orden importa: son las normas, y "la primera" tiene que poder citarse.
const lista = (titulo, puntos) =>
  `      <p style="margin:22px 0 8px;font-weight:600">${esc(titulo)}</p>
      <ol style="margin:0;padding-left:20px;color:#3a3a46;font-size:14px;line-height:1.6">
${puntos.map((p) => `        <li style="margin-bottom:7px">${esc(p)}</li>`).join("\n")}
      </ol>`;

// Lo que hay que leer aunque se lea el correo en diagonal.
const alerta = (puntos) =>
  `      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:22px 0">
        <tr><td style="background:#fdf5e6;border-left:4px solid #d08a1e;border-radius:0 8px 8px 0;padding:14px 16px;color:#4a3b1c;font-size:14px;line-height:1.55">
${puntos.map((p) => `          <div style="margin-bottom:8px">${esc(p)}</div>`).join("\n")}
        </td></tr>
      </table>`;

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
 * Certificado listo, uno por persona. Sirve para los cinco eventos: `cert` es
 * la fila de la tabla —que ya trae los nombres congelados— más el
 * `evento_nombre` y el `motivo`, que los resuelve quien llama para no cruzar
 * los módulos.
 *
 * La ficha se arma con las columnas genéricas y no con las de la muestra:
 * "Proyecto / Materia / Sala" solo significa algo en la Expo, y ficha() ya se
 * salta las filas sin valor, así que el certificado de una salida —que no
 * tiene compañeros ni sala— sale bien sin un caso aparte.
 */
function avisoCertificado(cert, base) {
  const url = `${base}/certificado/${cert.codigo}`;
  const evento = cert.evento_nombre || "el programa";
  const premiado = Boolean(cert.premio || cert.puesto);
  const logro = premiado ? `${cert.premio_label} en ${evento}` : cert.premio_label;

  const html = pagina({
    eyebrow: "Certificado listo",
    cuerpo: [
      parrafo(
        `Hola <strong>${esc(cert.persona)}</strong>, ya está tu certificado de ${esc(evento)}.`
      ),
      ficha([
        ["Reconocimiento", logro],
        ["Por", cert.titulo],
        ["Dónde", [cert.contexto, cert.detalle].filter(Boolean).join(" · ")],
      ]),
      boton(url, "Ver tu certificado"),
      nota(`Ese enlace es el certificado: se puede compartir, descargar en PDF y
        verificar con su código QR, que apunta a esta misma página. Tu código es
        <strong>${esc(cert.codigo)}</strong>.`),
    ].join("\n"),
  });

  const donde = [cert.contexto, cert.detalle].filter(Boolean).join(" · ");

  const texto = `Hola ${cert.persona}:

Ya está tu certificado de ${evento}.

${logro}
Por: ${cert.titulo}${donde ? `\n${donde}` : ""}

Verlo, compartirlo o descargarlo en PDF: ${url}
Código del certificado: ${cert.codigo}

El QR del certificado apunta a esa misma página: escanearlo es la verificación.`;

  return enviar({
    para: cert.email,
    asunto: premiado ? `${cert.premio_label} en ${evento}` : `Tu certificado de ${evento}`,
    html,
    texto,
  });
}

/**
 * Una marca dejó una propuesta de patrocinio. Este correo es el único sitio
 * donde esa propuesta aparece delante de un ser humano: no hay panel donde
 * revisarlas, y por eso va con la ficha completa y con Responder apuntando a
 * la marca. La fila en la base es la constancia; esto es el aviso.
 */
function expoPatrocinioAviso(p, base) {
  const html = pagina({
    eyebrow: "Propuesta de patrocinio",
    cuerpo: [
      parrafo(`<strong>${esc(p.marca)}</strong> quiere acompañar la Expo.`),
      ficha([
        ["Marca", p.marca],
        ["Ofrece", p.tipo],
        ["Contacto", p.contacto_nombre],
        ["Correo", p.contacto_email],
        ["Teléfono", p.telefono],
        ["Sitio", p.sitio],
      ]),
      p.mensaje ? parrafo(`<em>${esc(p.mensaje)}</em>`) : "",
      nota(`Responder a este correo le escribe directamente a
        ${esc(p.contacto_nombre)}. Si el patrocinio se cierra, la marca sale en la
        página agregándola a <strong>data/expo.json</strong> con su logo en
        <strong>public/images</strong>: llenar el formulario no publica a nadie.`),
    ]
      .filter(Boolean)
      .join("\n"),
  });

  const texto = `${p.marca} quiere acompañar la Expo.

Ofrece: ${p.tipo}
Contacto: ${p.contacto_nombre}
Correo: ${p.contacto_email}${p.telefono ? `\nTeléfono: ${p.telefono}` : ""}${p.sitio ? `\nSitio: ${p.sitio}` : ""}
${p.mensaje ? `\n${p.mensaje}\n` : ""}
Para publicarla: agregar la marca en data/expo.json con su logo en public/images.
Llenar el formulario no publica a nadie.`;

  return enviar({
    para: PATROCINIOS.avisar_a,
    asunto: `Patrocinio: ${p.marca}`,
    html,
    texto,
    responder_a: p.contacto_email,
  });
}

/** Acuse para la marca. Sin código y sin página de estado: no hay nada que consultar. */
function expoPatrocinioAcuse(p) {
  const html = pagina({
    eyebrow: "Propuesta recibida",
    cuerpo: [
      parrafo(`Hola <strong>${esc(p.contacto_nombre)}</strong>, recibimos la propuesta
        de <strong>${esc(p.marca)}</strong> para acompañar la Expo Multimedia.`),
      ficha([
        ["Marca", p.marca],
        ["Ofrece", p.tipo],
      ]),
      nota(`Te escribimos a este mismo correo para acordar los detalles —entre ellos
        el logo, que nos lo puedes mandar respondiendo aquí—. No hay nada más que
        hacer de tu lado por ahora.`),
    ].join("\n"),
  });

  const texto = `Hola ${p.contacto_nombre}:

Recibimos la propuesta de ${p.marca} para acompañar la Expo Multimedia.

Ofrece: ${p.tipo}

Te escribimos a este mismo correo para acordar los detalles, entre ellos el logo (nos lo puedes mandar respondiendo aquí). No hay nada más que hacer de tu lado por ahora.`;

  return enviar({
    para: p.contacto_email,
    asunto: "Recibimos tu propuesta para la Expo Multimedia",
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

/**
 * Inscripción recibida. Sirve para las tres modalidades, y lo primero que dice
 * es justo la que eligió: quien entra en solitario y quien entra buscando
 * equipo llenan el mismo formulario, y confundir un correo con el otro deja a
 * alguien esperando compañeros que nunca le van a llegar.
 */
function jamAvisoInscripcion({ codigo, nombre, email, equipo, modo, integrantes, cuando }, base) {
  const url = `${base}/jam/inscripcion/estado?codigo=${encodeURIComponent(codigo)}`;
  const busca = modo === "buscando";
  const solitario = modo === "solitario";

  const apertura = busca
    ? `Hola <strong>${esc(nombre)}</strong>, quedaste inscrito en la
       <strong>Jam de Altura</strong>. Todavía no tienes equipo: te vamos a
       armar uno con los demás que están buscando.`
    : solitario
      ? `Hola <strong>${esc(nombre)}</strong>, quedaste inscrito en la
         <strong>Jam de Altura</strong> <strong>en solitario</strong>: vas a
         hacer tu juego por tu cuenta. Ahora falta que la organización lo
         revise.`
      : `Hola <strong>${esc(nombre)}</strong>, quedó inscrito
         <strong>${esc(equipo)}</strong> en la <strong>Jam de Altura</strong>.
         Ahora falta que la organización lo revise.`;

  const cuerpo = [
    parrafo(apertura),
    codigoGrande(codigo, busca ? "Tu código" : "Su código"),
    ficha([
      [solitario ? "Apareces como" : "Equipo", busca ? null : equipo],
      ["Integrantes", busca || solitario ? null : (integrantes || []).join(", ")],
      [
        "Modalidad",
        busca ? "Individual, buscando equipo" : solitario ? "En solitario" : "Equipo completo",
      ],
      ["Arranque", cuando],
    ]),
    parrafo(
      `El tema se revela cuando empiece la jam, no antes: sale en la página junto
       con el reloj de las 48 horas.`
    ),
    boton(url, "Consultar el estado", VERDE_JAM),
    nota(
      busca
        ? `Guarda el código: con él consultas en qué vas. Cuando tengas equipo te
           avisamos con el código nuevo, que es el que sirve para entregar.`
        : `Guarda el código: con él se consulta la inscripción y, cuando llegue el
           momento, es con lo que se entrega el juego.`
    ),
  ];

  const texto = `Hola ${nombre}:

${
  busca
    ? "Quedaste inscrito en la Jam de Altura. Todavía no tienes equipo: te armamos uno con los demás que están buscando."
    : solitario
      ? `Quedaste inscrito en la Jam de Altura EN SOLITARIO: vas a hacer tu juego por tu cuenta, y apareces como "${equipo}". Falta que la organización lo revise.`
      : `Quedó inscrito "${equipo}" en la Jam de Altura. Falta que la organización lo revise.`
}

${busca ? "TU CÓDIGO" : "SU CÓDIGO"}: ${codigo}
${cuando ? `\nArranque: ${cuando}` : ""}

El tema se revela cuando empiece la jam, en la página del evento.

Consulta el estado en: ${url}

${
  busca
    ? "Guarda el código: con él consultas en qué vas. Cuando tengas equipo te avisamos con el código nuevo, que es el que sirve para entregar."
    : "Guarda el código: con él se consulta la inscripción y con él se entrega el juego."
}`;

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
function jamAvisoEquipoArmado({ nombre, email, equipo, codigo, companeros, equipoId, solitario }, base) {
  const url = `${base}/jam/equipo/${equipoId}`;
  const lista = (companeros || []).join(", ");

  // Quien queda en solitario recibe otro correo. Decirle "te armamos equipo" a
  // alguien que se va a quedar solo es la clase de mensaje que hace que se
  // presente el sábado esperando compañeros que no existen.
  const html = pagina({
    eyebrow: solitario ? "Quedas en solitario" : "Ya tienes equipo",
    marca: MARCA_JAM,
    tipografia: "pixel",
    cuerpo: [
      parrafo(
        solitario
          ? `Hola <strong>${esc(nombre)}</strong>, no se alcanzó a juntar un equipo
             para ti en la <strong>Jam de Altura</strong>, así que quedas
             <strong>en solitario</strong>: participas igual y entregas tu propio
             juego. Apareces como <strong>${esc(equipo)}</strong>.`
          : `Hola <strong>${esc(nombre)}</strong>, te armamos equipo para la
             <strong>Jam de Altura</strong>: quedaste en <strong>${esc(equipo)}</strong>.`
      ),
      ficha([
        [solitario ? "Apareces como" : "Equipo", equipo],
        ["Con quiénes", solitario ? null : lista],
        ["Modalidad", solitario ? "En solitario" : null],
      ]),
      codigo ? codigoGrande(codigo, solitario ? "Tu código" : "Código del equipo") : "",
      boton(url, solitario ? "Ver tu ficha" : "Ver el equipo", VERDE_JAM),
      nota(
        solitario
          ? `Cuarenta y ocho horas alcanzan para un juego pequeño: apunta a algo
             que puedas terminar solo y déjale tiempo al final para subirlo.`
          : `Escríbanse antes de que arranque: 48 horas se van rápido y la primera
             hora se pierde entera si nadie sabe quién hace qué.`
      ),
    ]
      .filter(Boolean)
      .join("\n"),
  });

  const texto = solitario
    ? `Hola ${nombre}:

No se alcanzó a juntar un equipo para ti en la Jam de Altura, así que quedas EN SOLITARIO: participas igual y entregas tu propio juego. Apareces como "${equipo}".
${codigo ? `\nTu código: ${codigo}` : ""}

Ver tu ficha: ${url}

Cuarenta y ocho horas alcanzan para un juego pequeño: apunta a algo que puedas terminar solo.`
    : `Hola ${nombre}:

Te armamos equipo para la Jam de Altura: quedaste en "${equipo}".

Con quiénes: ${lista}
${codigo ? `Código del equipo: ${codigo}` : ""}

Ver el equipo: ${url}

Escríbanse antes de que arranque: 48 horas se van rápido.`;

  return enviar({
    para: email,
    remitente: MARCA_JAM,
    asunto: solitario ? `Quedas en solitario en la Jam` : `Ya tienes equipo: ${equipo}`,
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

// ---------- Avisos del Multimedia Music Fest ----------
// Dos correos y los dos sirven para las dos puertas: al festival se entra como
// grupo o como producción, pero lo que se recibe es lo mismo —un código y,
// después, un veredicto—. Lo que cambia es una línea, y para eso está `que`.

const MARCA_MUSIC = "Multimedia Music Fest";
const MAGENTA_MUSIC = "#ff2d78";

/** Inscripción recibida: el código, para quien llenó el formulario. */
function musicAvisoInscripcion({ codigo, nombre, email, que, titulo, detalle }, base) {
  const url = `${base}/music/inscripcion/estado?codigo=${encodeURIComponent(codigo)}`;
  const esGrupo = que === "acto";

  const html = pagina({
    marca: MARCA_MUSIC,
    tipografia: "esports",
    eyebrow: "Inscripción recibida",
    cuerpo: [
      parrafo(
        esGrupo
          ? `Hola <strong>${esc(nombre)}</strong>, quedó inscrito
             <strong>${esc(titulo)}</strong> para el Multimedia Music Fest. Ahora la
             organización arma el cartel y te avisamos por aquí mismo.`
          : `Hola <strong>${esc(nombre)}</strong>, quedaste inscrito en el equipo de
             producción del Multimedia Music Fest. Ahora la organización arma los
             turnos y te avisamos por aquí mismo.`
      ),
      codigoGrande(codigo, "Tu código"),
      ficha([
        [esGrupo ? "Grupo" : "Área", esGrupo ? titulo : detalle],
        [esGrupo ? "Tipo" : "Rol", esGrupo ? detalle : "Equipo de producción"],
      ]),
      boton(url, "Consultar el estado", MAGENTA_MUSIC),
      nota(`Guarda el código: es con lo que consultas en qué va tu inscripción.
        Inscribirse no es quedar dentro —el cartel y el equipo los cierra la
        organización—, y en los dos casos te escribimos.`),
    ].join("\n"),
  });

  const texto = `Hola ${nombre}:

${
  esGrupo
    ? `Quedó inscrito "${titulo}" (${detalle}) para el Multimedia Music Fest.`
    : `Quedaste inscrito en el equipo de producción del Multimedia Music Fest, en ${detalle}.`
}

TU CÓDIGO: ${codigo}

Consulta el estado en: ${url}

Inscribirse no es quedar dentro: la organización cierra el cartel y el equipo, y te escribimos en los dos casos.`;

  return enviar({
    para: email,
    remitente: MARCA_MUSIC,
    asunto: `Inscripción recibida · código ${codigo}`,
    html,
    texto,
  });
}

/** El veredicto de la organización: dentro o fuera. */
function musicAvisoRevision({ codigo, nombre, email, titulo, que, estado, nota_docente }, base) {
  const url = `${base}/music/inscripcion/estado?codigo=${encodeURIComponent(codigo)}`;
  const dentro = estado === "confirmado";
  const esGrupo = que === "acto";

  const cuerpo = [
    parrafo(
      dentro
        ? esGrupo
          ? `Hola <strong>${esc(nombre)}</strong>: <strong>${esc(titulo)}</strong> está en el
             cartel del <strong>Multimedia Music Fest</strong>. Nos vemos en la prueba de sonido.`
          : `Hola <strong>${esc(nombre)}</strong>: estás en el equipo de producción del
             <strong>Multimedia Music Fest</strong>, en <strong>${esc(titulo)}</strong>.`
        : `Hola <strong>${esc(nombre)}</strong>: esta vez no quedaste en el
           <strong>Multimedia Music Fest</strong>.`
    ),
    ficha([
      [esGrupo ? "Grupo" : "Área", titulo],
      ["Código", codigo],
    ]),
  ];

  if (!dentro) {
    cuerpo.push(
      parrafo(
        nota_docente
          ? `<strong>Lo que dice la organización:</strong><br />${esc(nota_docente)}`
          : "La organización no dejó un motivo. Escríbeles si quieres saber qué ajustar para la próxima."
      )
    );
  } else {
    cuerpo.push(
      nota(
        esGrupo
          ? `La prueba de sonido no se negocia: el grupo que no pasa por ella no toca.
             Te escribimos con la hora en cuanto se cierre el cartel.`
          : `El compromiso es la tarde entera: montaje, show y desmontaje. Te
             escribimos con la hora de llamado en cuanto se cierre el cartel.`
      )
    );
  }

  cuerpo.push(boton(url, "Ver la inscripción", MAGENTA_MUSIC));

  const texto = `Hola ${nombre}:

${
  dentro
    ? esGrupo
      ? `"${titulo}" está en el cartel del Multimedia Music Fest.`
      : `Estás en el equipo de producción del Multimedia Music Fest, en ${titulo}.`
    : `Esta vez no quedaste en el Multimedia Music Fest.`
}
${!dentro && nota_docente ? `\nLo que dice la organización: ${nota_docente}\n` : ""}
Código: ${codigo}
Ver la inscripción: ${url}`;

  return enviar({
    para: email,
    remitente: MARCA_MUSIC,
    asunto: dentro
      ? `Estás en el Multimedia Music Fest`
      : `Sobre tu inscripción al Multimedia Music Fest`,
    html: pagina({
      marca: MARCA_MUSIC,
      tipografia: "esports",
      eyebrow: dentro ? "Estás dentro" : "No quedaste esta vez",
      cuerpo: cuerpo.join("\n"),
    }),
    texto,
  });
}

// ---------- Avisos de las salidas pedagógicas ----------
// Una salida no es un evento del programa: no hay equipos, ni bracket, ni
// reloj. Hay un bus que sale a una hora, un consentimiento que hay que hacer
// firmar y dos pagos. Los correos dicen eso y en ese orden.
//
// Misma plantilla, marca propia y la serif de la casa: esto es lo más parecido
// a una comunicación institucional que manda el sitio, y tiene que leerse así.

const MARCA_SALIDAS = "Salidas Pedagógicas";
const AMBAR = "#e8a33d";

// Las dos fechas, en una línea cada una. Se arma aquí porque los dos correos
// la usan igual y porque una salida que vuelve al día siguiente tiene que
// decirlo de otra forma.
function cuandoSalida(s) {
  return [
    ["Destino", s.lugar],
    ["Salida", s.sale ? `${s.sale.dia}, ${s.sale.hora}` : null],
    ["Regreso", s.vuelve ? `${s.mismo_dia ? "" : s.vuelve.dia + ", "}${s.vuelve.hora}` : null],
    ["Punto de encuentro", s.punto],
  ];
}

/**
 * Registro recibido. Es el correo que más trabajo hace del sitio: le dice al
 * estudiante lo único que le falta —el consentimiento firmado y el pago— y a
 * quién buscar para hacerlo. Sin esos datos el registro no sirve de nada.
 */
function salidaAvisoRegistro({ codigo, nombre, email, salida, docente, costos }, base) {
  const url = `${base}/salidas/estado?codigo=${encodeURIComponent(codigo)}`;
  const consentimiento = salida.consentimiento ? `${base}${salida.consentimiento}` : null;

  const cuerpo = [
    parrafo(`Hola <strong>${esc(nombre)}</strong>, quedaste registrado para
      <strong>${esc(salida.nombre)}</strong>. Todavía no estás confirmado:
      faltan dos pasos y los dos son presenciales.`),
    codigoGrande(codigo, "Tu código"),
    ficha(cuandoSalida(salida)),
    parrafo(`<strong>1. Descarga el consentimiento y hazlo firmar</strong><br />
      Lo firman tus padres o acudientes. Sin ese papel firmado no se te puede
      recibir el pago, y sin pago no hay cupo.`),
  ];

  if (consentimiento) {
    cuerpo.push(boton(consentimiento, "Descargar el consentimiento", AMBAR));
  }

  cuerpo.push(
    parrafo(`<strong>2. Lleva el consentimiento firmado y paga</strong><br />
      Se paga el transporte y la póliza, en persona, con el docente encargado.
      Ahí mismo se revisa la firma.`),
    ficha([
      ["Docente encargado", docente.nombre],
      ["Correo", docente.email],
      ["Teléfono", docente.telefono],
      ["Dónde y cuándo", docente.donde],
      ["Transporte", costos.transporte],
      ["Póliza", costos.poliza],
      ["Total", costos.total],
    ]),
    alerta(salida.advertencias),
    lista("Normas durante la salida", salida.normas),
    boton(url, "Consultar tu registro", AMBAR),
    nota(`Guarda este código: con él consultas si ya te quedaron marcados los
      pagos. Cuando estén los dos te llega otro correo y quedas confirmado.`)
  );

  const texto = `Hola ${nombre}:

Quedaste registrado para ${salida.nombre}. Todavía NO estás confirmado.

TU CÓDIGO: ${codigo}

Destino: ${salida.lugar}
${salida.sale ? `Salida: ${salida.sale.dia}, ${salida.sale.hora}` : ""}
${salida.vuelve ? `Regreso: ${salida.mismo_dia ? "" : salida.vuelve.dia + ", "}${salida.vuelve.hora}` : ""}
${salida.punto ? `Punto de encuentro: ${salida.punto}` : ""}

FALTAN DOS PASOS:

1. Descargar el consentimiento y hacerlo firmar de tus padres o acudientes.
${consentimiento ? `   ${consentimiento}` : ""}

2. Llevarlo firmado y pagar el transporte y la póliza con el docente encargado:
   ${docente.nombre} · ${docente.email}${docente.telefono ? ` · ${docente.telefono}` : ""}
${docente.donde ? `   ${docente.donde}` : ""}
${costos.transporte ? `   Transporte: ${costos.transporte}` : ""}${costos.poliza ? `\n   Póliza: ${costos.poliza}` : ""}${costos.total ? `\n   Total: ${costos.total}` : ""}

${salida.advertencias.map((a) => `! ${a}`).join("\n")}

NORMAS DURANTE LA SALIDA
${salida.normas.map((n, i) => `${i + 1}. ${n}`).join("\n")}

Consulta tu registro en: ${url}`;

  return enviar({
    para: email,
    remitente: MARCA_SALIDAS,
    asunto: `Registro recibido · ${salida.nombre} · código ${codigo}`,
    html: pagina({
      eyebrow: "Registro recibido",
      marca: MARCA_SALIDAS,
      cuerpo: cuerpo.join("\n"),
    }),
    texto,
  });
}

/**
 * Los dos pagos quedaron marcados: el estudiante va en el bus. Es el correo
 * que se guarda, así que repite las normas y las dos advertencias —para eso
 * están— y no solo el "listo".
 */
function salidaAvisoConfirmado({ codigo, nombre, email, salida, docente }, base) {
  const url = `${base}/salidas/estado?codigo=${encodeURIComponent(codigo)}`;

  const cuerpo = [
    parrafo(`Hola <strong>${esc(nombre)}</strong>: quedaron registrados tus pagos
      del transporte y de la póliza. <strong>Estás confirmado</strong> para
      ${esc(salida.nombre)}.`),
    ficha([...cuandoSalida(salida), ["Tu código", codigo]]),
    parrafo(`Llega al punto de encuentro <strong>quince minutos antes</strong>.
      El bus sale a la hora que dice arriba y no espera.`),
    alerta(salida.advertencias),
    lista("Normas durante la salida", salida.normas),
    parrafo(`Cualquier cosa antes o durante la salida, con
      <strong>${esc(docente.nombre)}</strong>${docente.telefono ? ` (${esc(docente.telefono)})` : ""}.`),
    boton(url, "Ver tu registro", AMBAR),
    nota("Evita sanciones y disfruta la salida."),
  ];

  const texto = `Hola ${nombre}:

Quedaron registrados tus pagos del transporte y de la póliza. ESTÁS CONFIRMADO para ${salida.nombre}.

Destino: ${salida.lugar}
${salida.sale ? `Salida: ${salida.sale.dia}, ${salida.sale.hora}` : ""}
${salida.vuelve ? `Regreso: ${salida.mismo_dia ? "" : salida.vuelve.dia + ", "}${salida.vuelve.hora}` : ""}
${salida.punto ? `Punto de encuentro: ${salida.punto}` : ""}
Tu código: ${codigo}

Llega al punto de encuentro quince minutos antes. El bus no espera.

${salida.advertencias.map((a) => `! ${a}`).join("\n")}

NORMAS DURANTE LA SALIDA
${salida.normas.map((n, i) => `${i + 1}. ${n}`).join("\n")}

Cualquier cosa, con ${docente.nombre}${docente.telefono ? ` (${docente.telefono})` : ""}.

Ver tu registro: ${url}

Evita sanciones y disfruta la salida.`;

  return enviar({
    para: email,
    remitente: MARCA_SALIDAS,
    asunto: `Confirmado para ${salida.nombre}`,
    html: pagina({
      eyebrow: "Estás confirmado",
      marca: MARCA_SALIDAS,
      cuerpo: cuerpo.join("\n"),
    }),
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
// ---------- Avisos del semillero SAMI ----------
// El semillero no es un evento: no hay fecha, ni cupo, ni cuenta regresiva.
// Hay un trámite de cuatro pasos que se hace EN PERSONA y que puede tomar
// semanas, y un proyecto que dura tres semestres.
//
// Son DOS correos y los dos van al estudiante. A la dirección del programa no
// se le manda nada, y no es un olvido: el paso 1 del trámite es que el
// estudiante vaya a notificar su intención en persona. Un correo automático
// diciendo lo mismo dejaría a las dos partes creyendo que el aviso ya lo dio
// el otro, que es la peor forma de perder a alguien en un trámite.
//
// Por eso el primer correo no dice "listo": dice a dónde hay que ir.

const MARCA_SAMI = "Semillero SAMI";
const AZUL_SAMI = "#8fa8ff";

// Los cuatro pasos del trámite, numerados, tal como están en config. Son el
// mapa entero: sin ellos el correo entrega un código y no dice qué sigue.
const pasosSami = (s) => s.pasos.map((p) => `${p.titulo}. ${p.texto}`);

// A dónde hay que ir. Se arma aparte porque es lo más importante del correo y
// se repite en el cuerpo y en la versión de texto plano.
const dondeIr = (d) => [
  ["Con quién", [d.nombre, d.cargo].filter(Boolean).join(" · ")],
  ["Dónde", d.donde],
  ["Correo", d.email],
];

/**
 * Intención registrada.
 *
 * Lo que este correo tiene que lograr es UNA cosa: que el estudiante vaya a la
 * dirección del programa. El código es lo de menos —lo puede volver a pedir—,
 * así que el "a dónde ir" va antes que él y no al final en letra chica.
 */
function samiAvisoIntencion({ codigo, titulo, estudiantes, sami }, base) {
  const url = `${base}/semillero/estado?codigo=${encodeURIComponent(codigo)}`;
  const formato = sami.formato ? `${base}${sami.formato}` : null;
  const quien = estudiantes[0] || {};
  const otros = estudiantes.slice(1).map((e) => e.nombre).filter(Boolean);
  const d = sami.direccion;

  const cuerpo = [
    parrafo(`Hola <strong>${esc(quien.nombre)}</strong>: tus datos quedaron en el registro
      del Semillero de Investigación SAMI. Con eso adelantaste papeleo, pero
      <strong>el trámite todavía no ha empezado</strong>.`),
    alerta([
      "Lo primero que tienes que hacer es ir a la dirección del programa y notificar en persona que quieres pertenecer al semillero.",
    ]),
    ficha(dondeIr(d)),
    parrafo(`<strong>Y después</strong><br />
      Los cuatro pasos se hacen fuera de esta página. Tu vinculación al semillero
      queda formalizada con el docente que te asesore la propuesta.`),
    lista("El trámite", pasosSami(sami)),
  ];

  if (formato) {
    cuerpo.push(boton(formato, "Descargar la guía G-01-SEM", AZUL_SAMI));
  }

  cuerpo.push(
    codigoGrande(codigo, "Tu código"),
    ficha([
      ["Proyecto", titulo],
      ["Estudiantes", [quien.nombre, ...otros].filter(Boolean).join(" · ")],
      ["Duración", `${sami.semestres} semestres`],
    ]),
    boton(url, "Consultar en qué va tu proyecto", AZUL_SAMI),
    nota(`Guarda el código: con él consultas quién quedó de director, en qué
      estado va tu proyecto y qué te comprometiste a entregar en la última reunión.`)
  );

  const texto = `Hola ${quien.nombre}:

Tus datos quedaron en el registro del Semillero SAMI.
Con eso adelantaste papeleo, pero EL TRÁMITE TODAVÍA NO HA EMPEZADO.

LO PRIMERO: ve a la dirección del programa y notifica en persona que quieres
pertenecer al semillero.

  ${[d.nombre, d.cargo].filter(Boolean).join(" · ")}
  ${d.donde || ""}
  ${d.email || ""}

Los cuatro pasos se hacen fuera de esta página. Tu vinculación al semillero
queda formalizada con el docente que te asesore la propuesta.

EL TRÁMITE
${pasosSami(sami).map((p, i) => `${i + 1}. ${p}`).join("\n")}
${formato ? `\nGuía G-01-SEM: ${formato}` : ""}

TU CÓDIGO: ${codigo}
Proyecto: ${titulo}
Duración: ${sami.semestres} semestres

Consulta en qué va tu proyecto: ${url}`;

  return enviar({
    para: estudiantes.map((e) => e.email).filter(Boolean).join(", "),
    remitente: MARCA_SAMI,
    asunto: `Semillero SAMI · lo que sigue · código ${codigo}`,
    html: pagina({ eyebrow: "Quedaste en el registro", marca: MARCA_SAMI, cuerpo: cuerpo.join("\n") }),
    texto,
  });
}

/**
 * La propuesta quedó aprobada y ya hay director. Es el correo que cierra la
 * vinculación y abre los tres semestres, así que dice las dos cosas: quién lo
 * va a dirigir y qué se espera de él a partir de ahora.
 */
function samiAvisoAprobada({ codigo, titulo, director, codirector, estudiantes, sami }, base) {
  const url = `${base}/semillero/estado?codigo=${encodeURIComponent(codigo)}`;

  const cuerpo = [
    parrafo(`Buenas noticias: <strong>tu propuesta quedó aprobada</strong> y ya tienes
      director. Desde aquí empiezan tus ${esc(String(sami.semestres))} semestres en el
      semillero.`),
    ficha([
      ["Proyecto", titulo],
      ["Código", codigo],
      ["Director", director],
      ["Codirector", codirector],
    ]),
    parrafo(`<strong>Qué sigue</strong><br />
      Tu director te va a convocar a reuniones de seguimiento para revisar avances y
      dejar compromisos. Al final de cada semestre recibes una nota.`),
    lista(
      "Las tres etapas",
      sami.etapas.map((e) => `${e.titulo}. ${e.texto}`)
    ),
    boton(url, "Ver tu proyecto", AZUL_SAMI),
    nota(`Ponte en contacto con tu director esta misma semana: el primer semestre
      se va rápido y el anteproyecto tiene fecha.`),
  ];

  const texto = `Tu propuesta quedó aprobada.

Proyecto: ${titulo}
Código: ${codigo}
Director: ${director}
${codirector ? `Codirector: ${codirector}` : ""}

Desde aquí empiezan tus ${sami.semestres} semestres en el semillero. Tu director
te convocará a reuniones de seguimiento y al final de cada semestre recibes una nota.

LAS TRES ETAPAS
${sami.etapas.map((e, i) => `${i + 1}. ${e.titulo}. ${e.texto}`).join("\n")}

Ver tu proyecto: ${url}`;

  return enviar({
    para: estudiantes.map((e) => e.email).filter(Boolean).join(", "),
    remitente: MARCA_SAMI,
    asunto: `Propuesta aprobada · Semillero SAMI · ${titulo}`,
    html: pagina({ eyebrow: "Propuesta aprobada", marca: MARCA_SAMI, cuerpo: cuerpo.join("\n") }),
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
  expoPatrocinioAviso: protegido(expoPatrocinioAviso),
  expoPatrocinioAcuse: protegido(expoPatrocinioAcuse),
  vcAvisoInscripcion: protegido(vcAvisoInscripcion),
  vcAvisoRevision: protegido(vcAvisoRevision),
  vcAvisoAsignado: protegido(vcAvisoAsignado),
  jamAvisoInscripcion: protegido(jamAvisoInscripcion),
  jamAvisoRevision: protegido(jamAvisoRevision),
  jamAvisoEquipoArmado: protegido(jamAvisoEquipoArmado),
  jamAvisoTema: protegido(jamAvisoTema),
  musicAvisoInscripcion: protegido(musicAvisoInscripcion),
  musicAvisoRevision: protegido(musicAvisoRevision),
  salidaAvisoRegistro: protegido(salidaAvisoRegistro),
  salidaAvisoConfirmado: protegido(salidaAvisoConfirmado),
  inkAvisoInscripcion: protegido(inkAvisoInscripcion),
  inkAvisoRevision: protegido(inkAvisoRevision),
  inkAvisoEnlace: protegido(inkAvisoEnlace),
  inkAvisoPremio: protegido(inkAvisoPremio),
  samiAvisoIntencion: protegido(samiAvisoIntencion),
  samiAvisoAprobada: protegido(samiAvisoAprobada),
};
