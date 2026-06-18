/**
 * Espejo de obsequios_campos.py — formato canónico clientes + estados_flujo.
 * Tras normalización (§36–37): _OPERADOR_TS solo en estados_flujo, no en clientes/.
 */

const CAMPO_OPERADOR_TS = "_OPERADOR_TS";
const CAMPO_PERSONAS_ENVIO_DIRECTO = "PERSONAS_QUE_HAN_ENVIADO_DIRECTO";

const ODOO_REF_KEYS = [
  "PEDIDO_ODOO", "PEDIDOS_ODOO", "COTIZACIONES_ODOO", "FACTURAS_ODOO",
  "FECHAS_FACTURAS_ODOO", "FECHAS_PEDIDOS_ODOO", "FECHAS_COTIZACIONES_ODOO",
  "FACTURA_POR_ORIGEN_ODOO",
];

const CAMPOS_REGISTRO_SEPARACION = [
  "CODIGO_OPERARIO_SEPARACION",
  "NOMBRE_OPERARIO_SEPARACION",
  "FECHA_SEPARACION",
  "REGISTRO_SEPARACION",
  "ESTADO_ANTES_SEPARACION",
];

const CAMPOS_ENVIO_LEGACY_MEZCLADOS = [
  "REGISTRO_ENVIO",
  "CODIGO_OPERARIO_ENVIO",
  "NOMBRE_OPERARIO_ENVIO",
];

const CAMPOS_SYNC_OPERADOR = [
  "ESTADO_ENVIO",
  "FECHA_ENVIO",
  "FECHA_CONFIRMACION",
  ...CAMPOS_REGISTRO_SEPARACION,
  ...CAMPOS_ENVIO_LEGACY_MEZCLADOS,
  CAMPO_PERSONAS_ENVIO_DIRECTO,
  "TIPO_ENVIO",
  "OBSEQUIOS_ENVIADOS",
  "ESTADO_PREVIO_ENVIO",
];

const CAMPOS_SYNC_RESET_ODOO = ODOO_REF_KEYS;

const CAMPOS_NO_PERSISTIR_EN_CLIENTES = [
  "COMPRA_ACTIVA",
  CAMPO_OPERADOR_TS,
  ...CAMPOS_ENVIO_LEGACY_MEZCLADOS,
];

const ESTADOS_FLUJO_ALERTAS = new Set(["POR ENVIAR", "FACTURADO", "SEPARADO"]);

const TOP_REGALOS = {
  1: { BALON: "1", CAMISETAS: "1" },
  2: { BALON: "0", CAMISETAS: "1" },
  3: { BALON: "1", CAMISETAS: "0" },
};

function tierTop(topStr) {
  const t = String(topStr || "").toUpperCase();
  if (t.includes("TOP 1") || t === "TOP1" || t === "1") return 1;
  if (t.includes("TOP 2") || t === "TOP2" || t === "2") return 2;
  if (t.includes("TOP 3") || t === "TOP3" || t === "3") return 3;
  return 0;
}

function obsequiosCanonicos(client) {
  const ob = client?.OBSEQUIOS_ENVIADOS;
  if (ob && typeof ob === "object") {
    const b = parseInt(ob.BALON, 10);
    const c = parseInt(ob.CAMISETAS, 10);
    if (!Number.isNaN(b) && !Number.isNaN(c) && (b || c)) {
      return { BALON: String(b), CAMISETAS: String(c) };
    }
  }
  const tier = tierTop(client?.TOP);
  return { ...(TOP_REGALOS[tier] || { BALON: "0", CAMISETAS: "0" }) };
}

function personasCanonicas(valor) {
  if (!valor) return null;
  const items = Array.isArray(valor) ? valor : [valor];
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (!item || typeof item !== "object") continue;
    const codigo = String(item.codigo || "").trim().toUpperCase();
    const nombre = String(item.nombre || "").trim();
    if (!codigo || !nombre) continue;
    let destino = String(item.destino || "CLIENTE").trim().toUpperCase();
    if (destino !== "CLIENTE" && destino !== "VENDEDOR") destino = "CLIENTE";
    return {
      codigo,
      nombre,
      fecha: String(item.fecha || "").trim(),
      destino,
    };
  }
  return null;
}

function listaOdoo(valor) {
  if (!valor) return [];
  if (Array.isArray(valor)) {
    return valor
      .map((x) => String(x).trim())
      .filter((x) => x && x.toLowerCase() !== "n/d");
  }
  const s = String(valor).trim();
  return s && s.toLowerCase() !== "n/d" ? [s] : [];
}

function mapaOdoo(valor) {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return {};
  const out = {};
  for (const [k, v] of Object.entries(valor)) {
    const key = String(k).trim();
    const val = String(v ?? "").trim();
    if (key && val && val.toLowerCase() !== "n/d" && val.toLowerCase() !== "none") {
      out[key] = val;
    }
  }
  return out;
}

function esEstadoTerminal(est) {
  const e = String(est || "").trim().toUpperCase();
  return e === "ENVIADO" || e === "CERRADO";
}

function payloadOdooClear() {
  return Object.fromEntries(ODOO_REF_KEYS.map((k) => [k, null]));
}

function sanearPayloadEscrituraClientes(payload, cliente) {
  if (!payload || typeof payload !== "object") return payload;
  const out = { ...payload };
  for (const k of CAMPOS_NO_PERSISTIR_EN_CLIENTES) delete out[k];
  if (CAMPO_PERSONAS_ENVIO_DIRECTO in out) {
    out[CAMPO_PERSONAS_ENVIO_DIRECTO] = personasCanonicas(out[CAMPO_PERSONAS_ENVIO_DIRECTO]);
  }
  const est = String(
    out.ESTADO_ENVIO || cliente?.ESTADO_ENVIO || "POR ENVIAR"
  ).toUpperCase();
  if (esEstadoTerminal(est) && ODOO_REF_KEYS.some((k) => k in out)) {
    Object.assign(out, payloadOdooClear());
  }
  return out;
}

function clienteParaCache(client) {
  if (!client || typeof client !== "object") return {};
  const out = JSON.parse(JSON.stringify(client));
  for (const k of CAMPOS_NO_PERSISTIR_EN_CLIENTES) delete out[k];
  if (CAMPO_PERSONAS_ENVIO_DIRECTO in out) {
    out[CAMPO_PERSONAS_ENVIO_DIRECTO] = personasCanonicas(out[CAMPO_PERSONAS_ENVIO_DIRECTO]);
  }
  return out;
}

function clientesParaCache(clientes) {
  if (!clientes || typeof clientes !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(clientes)) {
    if (v && typeof v === "object") out[k] = clienteParaCache(v);
  }
  return out;
}

function limpiarClienteDescargado(client) {
  if (!client || typeof client !== "object") return client;
  const out = { ...client };
  delete out.COMPRA_ACTIVA;
  delete out[CAMPO_OPERADOR_TS];
  for (const k of CAMPOS_ENVIO_LEGACY_MEZCLADOS) delete out[k];
  return out;
}

function normalizarValorSync(valor) {
  if (valor == null) return null;
  if (typeof valor === "object" && !Array.isArray(valor)) {
    const out = {};
    for (const [k, v] of Object.entries(valor).sort(([a], [b]) => String(a).localeCompare(String(b)))) {
      const nv = normalizarValorSync(v);
      if (nv != null && String(nv).trim().toLowerCase() !== "n/d") out[k] = nv;
    }
    return Object.keys(out).length ? out : null;
  }
  if (Array.isArray(valor)) {
    const items = [...new Set(
      valor.map((x) => String(x).trim()).filter((x) => x && x.toLowerCase() !== "n/d")
    )].sort();
    return items.length ? items : null;
  }
  const texto = String(valor).trim();
  return texto && texto.toLowerCase() !== "n/d" ? texto : null;
}

function snapshotOperadorDesdeCliente(client, overlay = {}, incluirResetOdoo = false) {
  const campos = [...CAMPOS_SYNC_OPERADOR];
  if (incluirResetOdoo) campos.push(...CAMPOS_SYNC_RESET_ODOO);
  const snap = {};
  for (const k of campos) {
    if (k in overlay) snap[k] = overlay[k];
    else if (client && k in client) snap[k] = client[k];
  }
  if (CAMPO_PERSONAS_ENVIO_DIRECTO in snap) {
    snap[CAMPO_PERSONAS_ENVIO_DIRECTO] = personasCanonicas(snap[CAMPO_PERSONAS_ENVIO_DIRECTO]);
  }
  const ts = overlay[CAMPO_OPERADOR_TS] ?? client?.[CAMPO_OPERADOR_TS];
  if (ts != null) snap[CAMPO_OPERADOR_TS] = ts;
  return snap;
}
