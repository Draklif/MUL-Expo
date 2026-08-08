// =====================================================================
//  Salidas pedagógicas — el dominio.
//
//  Dos ideas mandan aquí:
//
//  1. La SALIDA no está en la base. Vive entera en config.SALIDAS: a dónde se
//     va, cuándo, para qué, cuánto cuesta y quién cobra. La base solo guarda
//     quién se apuntó. Así no hay dos verdades que puedan contradecirse, y
//     montar la salida del semestre siguiente es escribir un objeto en el
//     config —ni un botón, ni una pantalla de "crear salida"—.
//
//  2. El ESTADO de un estudiante no se guarda, se cuenta. Que esté registrado,
//     a medio pagar o confirmado sale de las dos casillas de pago; no hay un
//     campo "estado" que alguien pueda dejar diciendo una cosa mientras las
//     casillas dicen otra.
//
//  Lo que no se automatiza a propósito: el consentimiento firmado. Se revisa
//  en persona cuando el estudiante va a pagar, así que no tiene casilla propia
//  —confirmar el pago del transporte ES haber visto el papel firmado—. Una
//  casilla aparte solo serviría para marcarla sin haberlo visto.
// =====================================================================
const db = require("../db/database");
const { SALIDAS } = require("../config");
const { generarCodigo, limpiarEmail, emailValido } = require("./registro");
const { momento, instante } = require("./fechas");

const TIPOS_ID = SALIDAS.tipos_id;
const NORMAS = SALIDAS.normas;
const ADVERTENCIAS = SALIDAS.advertencias;

/**
 * En qué va un estudiante. Son tres momentos y se leen de las dos casillas de
 * pago, en este orden:
 *
 *   registrado — llenó el formulario. Le falta todo: el consentimiento firmado
 *                y los dos pagos.
 *   parcial    — pagó una de las dos cosas. Es un estado real y frecuente: se
 *                paga el transporte un día y la póliza otro.
 *   confirmado — pagó las dos. Tiene el cupo y va en el bus.
 */
const ESTADOS = {
  registrado: { clave: "registrado", label: "Falta pagar", cls: "pend" },
  parcial: { clave: "parcial", label: "Pago incompleto", cls: "alerta" },
  confirmado: { clave: "confirmado", label: "Confirmado", cls: "ok" },
};

// ---------------------------------------------------------------------
//  Las salidas (todas salen de config)
// ---------------------------------------------------------------------
function todas() {
  return SALIDAS.salidas.map(conFechas);
}

function porId(id) {
  const salida = SALIDAS.salidas.find((s) => s.id === String(id || "").trim());
  return salida ? conFechas(salida) : null;
}

/**
 * La salida más próxima que todavía recibe gente. Es a donde manda /salidas
 * cuando hay una sola cosa que mirar; con varias abiertas se muestra la lista.
 */
function proxima() {
  const abiertas = todas()
    .filter(inscripcionAbierta)
    .sort((a, b) => (a.cuando_ms || Infinity) - (b.cuando_ms || Infinity));
  return abiertas[0] || null;
}

// Las fechas del config, ya partidas para la vista. Se hace aquí y una sola vez
// porque salida y regreso se imprimen en cuatro páginas y en dos correos.
function conFechas(salida) {
  const sale = momento(salida.salida);
  const vuelve = momento(salida.regreso);

  return {
    ...salida,
    sale,
    vuelve,
    cuando_ms: instante(salida.salida),
    // El mismo día casi siempre. Si vuelve otro día hay que decirlo, porque
    // eso cambia lo que alguien mete en el morral.
    mismo_dia: Boolean(sale && vuelve && sale.fecha === vuelve.fecha),
    normas: salida.normas || NORMAS,
    advertencias: salida.advertencias || ADVERTENCIAS,
    total: total(salida),
  };
}

// Lo que le cuesta al estudiante, sumado. null si falta alguno de los dos: es
// mejor no decir nada que decir un total que no es el que le van a cobrar.
function total(salida) {
  const t = Number(salida.costos && salida.costos.transporte) || 0;
  const p = Number(salida.costos && salida.costos.poliza) || 0;
  return t && p ? t + p : null;
}

/**
 * Si la salida está recibiendo registros. Tres candados:
 *
 *   1. su propia bandera en config;
 *   2. que el bus no haya salido ya —una fecha pasada cierra sola, así nadie
 *      tiene que acordarse de bajar la bandera el lunes siguiente—;
 *   3. que quede cupo en el bus.
 */
function inscripcionAbierta(salida) {
  if (!salida || !salida.inscripciones) return false;
  if (salida.cuando_ms !== null && salida.cuando_ms < Date.now()) return false;
  if (!salida.cupo) return true;
  return contar(salida.id) < salida.cupo;
}

// Por qué está cerrada, para poder decirlo en vez de dejar un botón muerto.
function porQueCerrada(salida) {
  if (!salida) return null;
  if (salida.cuando_ms !== null && salida.cuando_ms < Date.now()) return "pasada";
  if (!salida.inscripciones) return "cerradas";
  if (salida.cupo && contar(salida.id) >= salida.cupo) return "lleno";
  return null;
}

// ---------------------------------------------------------------------
//  Registros
// ---------------------------------------------------------------------
function conEstado(reg) {
  if (!reg) return null;
  const estado =
    reg.pago_transporte && reg.pago_poliza
      ? ESTADOS.confirmado
      : reg.pago_transporte || reg.pago_poliza
        ? ESTADOS.parcial
        : ESTADOS.registrado;

  return {
    ...reg,
    estado,
    confirmado: estado.clave === "confirmado",
    salida_info: porId(reg.salida),
  };
}

function registro(id) {
  return conEstado(db.prepare("SELECT * FROM salida_registros WHERE id = ?").get(Number(id)));
}

function porCodigo(codigo) {
  const limpio = String(codigo || "").trim().toUpperCase();
  if (!limpio) return null;
  return conEstado(db.prepare("SELECT * FROM salida_registros WHERE codigo = ?").get(limpio));
}

function porCorreo(salidaId, email) {
  return conEstado(
    db
      .prepare("SELECT * FROM salida_registros WHERE salida = ? AND email = ? COLLATE NOCASE")
      .get(String(salidaId), limpiarEmail(email))
  );
}

function registrosDe(salidaId) {
  return db
    .prepare("SELECT * FROM salida_registros WHERE salida = ? ORDER BY created_at")
    .all(String(salidaId))
    .map(conEstado);
}

// Cuenta a todos los registrados, hayan pagado o no: el cupo se aparta al
// inscribirse, porque si no el bus se llena de gente que nunca pagó.
function contar(salidaId) {
  return db
    .prepare("SELECT COUNT(*) AS n FROM salida_registros WHERE salida = ?")
    .get(String(salidaId)).n;
}

/**
 * Las cifras del panel. El recaudo va aparte por concepto porque así se cuadra
 * la caja: el docente entrega dos cuentas distintas, la del bus y la de la
 * aseguradora, y sumarlas en un solo número no le sirve a ninguna de las dos.
 */
function resumen(salida) {
  const fila = db
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(pago_transporte), 0) AS transporte,
              COALESCE(SUM(pago_poliza), 0)     AS poliza,
              COALESCE(SUM(pago_transporte = 1 AND pago_poliza = 1), 0) AS confirmados
         FROM salida_registros WHERE salida = ?`
    )
    .get(String(salida.id));

  const costos = salida.costos || {};
  return {
    ...fila,
    faltan: fila.total - fila.confirmados,
    cupo: salida.cupo || null,
    recaudo_transporte: fila.transporte * (Number(costos.transporte) || 0),
    recaudo_poliza: fila.poliza * (Number(costos.poliza) || 0),
  };
}

// Código único de verdad: se reintenta por si dos personas caen en el mismo.
function codigoLibre() {
  const usado = db.prepare("SELECT 1 FROM salida_registros WHERE codigo = ?");
  let codigo = generarCodigo();
  for (let i = 0; i < 5 && usado.get(codigo); i++) codigo = generarCodigo();
  return codigo;
}

// ---------------------------------------------------------------------
//  Lo que llega del formulario
// ---------------------------------------------------------------------
const tipoValido = (v) => {
  const limpio = String(v || "").trim();
  return TIPOS_ID.includes(limpio) ? limpio : null;
};

// El número de documento y el código estudiantil son números con los que nadie
// hace cuentas: se guardan como texto y se les quita todo lo que no sea dígito
// o guion, que es lo que se cuela al copiarlos de un carné.
const soloDigitos = (v, max = 20) =>
  String(v || "").replace(/[^\d-]/g, "").slice(0, max);

// El teléfono sí admite espacios y el +: se marca, no se suma.
const limpiarTelefono = (v) =>
  String(v || "").replace(/[^\d+\s()-]/g, "").replace(/\s+/g, " ").trim().slice(0, 25);

// Diez dígitos colombianos, con o sin indicativo. Se pide de verdad porque es
// el único canal para avisarle a alguien que el bus ya arrancó.
const telefonoValido = (v) => (String(v || "").match(/\d/g) || []).length >= 7;

// ---------------------------------------------------------------------
//  Formato
// ---------------------------------------------------------------------
// "$ 55.000". Con puntos de miles, que es como se leen los pesos aquí.
function pesos(n) {
  const v = Number(n);
  if (!v) return null;
  return `$ ${v.toLocaleString("es-CO")}`;
}

module.exports = {
  TIPOS_ID,
  NORMAS,
  ADVERTENCIAS,
  ESTADOS,
  todas,
  porId,
  proxima,
  total,
  inscripcionAbierta,
  porQueCerrada,
  registro,
  porCodigo,
  porCorreo,
  registrosDe,
  contar,
  resumen,
  codigoLibre,
  tipoValido,
  soloDigitos,
  limpiarTelefono,
  telefonoValido,
  pesos,
  momento,
  limpiarEmail,
  emailValido,
};
