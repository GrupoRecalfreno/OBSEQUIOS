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

function unicosNumerosOdoo(nums) {
  const out = [];
  const seen = new Set();
  for (const n of nums) {
    const s = String(n).trim();
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

function extraerNumerosOdoo(valor) {
  if (valor == null) return [];
  if (Array.isArray(valor)) {
    const out = [];
    for (const item of valor) out.push(...extraerNumerosOdoo(item));
    return unicosNumerosOdoo(out);
  }
  if (typeof valor === "object") {
    const out = [];
    for (const [k, v] of Object.entries(valor)) {
      out.push(...extraerNumerosOdoo(k));
      out.push(...extraerNumerosOdoo(v));
    }
    return unicosNumerosOdoo(out);
  }
  const s = String(valor).trim();
  if (!s || s.toLowerCase() === "n/d") return [];
  const found = s.match(/S\d+/gi);
  if (found && found.length) return unicosNumerosOdoo(found.map((x) => x.toUpperCase()));
  return [s];
}

function listaOdoo(valor) {
  return extraerNumerosOdoo(valor);
}

function formatGroupedDocsText(ped, cot, fac) {
  const parts = [];
  const peds = unicosNumerosOdoo([...(ped || []), ...(cot || [])]);
  if (peds.length) parts.push(`Ped: ${peds.join(", ")}`);
  if (cot && cot.length) parts.push(`Cot: ${cot.join(", ")}`);
  if (fac && fac.length) parts.push(`Fac: ${fac.join(", ")}`);
  return parts.length ? parts.join(" | ") : "n/d";
}

function sanearClienteRefsOdoo(client) {
  if (!client || typeof client !== "object") return client;
  const out = JSON.parse(JSON.stringify(client));
  let ped = listaOdoo(out.PEDIDOS_ODOO);
  let cot = listaOdoo(out.COTIZACIONES_ODOO);
  let fac = listaOdoo(out.FACTURAS_ODOO);
  const fechasCot = sanearMapaFechasOdoo(out.FECHAS_COTIZACIONES_ODOO);
  const fechasPed = sanearMapaFechasOdoo(out.FECHAS_PEDIDOS_ODOO);
  const fpoRaw = mapaOdoo(out.FACTURA_POR_ORIGEN_ODOO);
  const fpo = {};
  for (const [k, v] of Object.entries(fpoRaw)) {
    const nums = extraerNumerosOdoo(k);
    if (nums.length && v) fpo[nums[0]] = v;
  }
  for (const n of Object.keys(fechasCot)) {
    if (!cot.includes(n)) cot.push(n);
  }
  for (const n of Object.keys(fechasPed)) {
    if (!ped.includes(n)) ped.push(n);
  }
  ped = unicosNumerosOdoo(ped);
  cot = unicosNumerosOdoo(cot);
  const facsFpo = unicosNumerosOdoo(Object.values(fpo));
  fac = unicosNumerosOdoo([...fac, ...facsFpo]);
  let fechasFac = sanearMapaFechasOdoo(out.FECHAS_FACTURAS_ODOO);
  const facsPermitidas = new Set(fac);
  if (facsPermitidas.size) {
    fechasFac = Object.fromEntries(
      Object.entries(fechasFac).filter(([k]) => facsPermitidas.has(k))
    );
  } else {
    fechasFac = {};
  }
  if (ped.length) out.PEDIDOS_ODOO = ped;
  else delete out.PEDIDOS_ODOO;
  if (cot.length) out.COTIZACIONES_ODOO = cot;
  else delete out.COTIZACIONES_ODOO;
  if (fac.length) out.FACTURAS_ODOO = fac;
  else delete out.FACTURAS_ODOO;
  if (Object.keys(fechasCot).length) out.FECHAS_COTIZACIONES_ODOO = fechasCot;
  if (Object.keys(fechasPed).length) out.FECHAS_PEDIDOS_ODOO = fechasPed;
  if (Object.keys(fechasFac).length) out.FECHAS_FACTURAS_ODOO = fechasFac;
  else if (Object.keys(sanearMapaFechasOdoo(out.FECHAS_FACTURAS_ODOO)).length > Math.max(fac.length * 2, 5)) {
    delete out.FECHAS_FACTURAS_ODOO;
  }
  if (Object.keys(fpo).length) out.FACTURA_POR_ORIGEN_ODOO = fpo;
  if (ped.length || cot.length || fac.length) {
    out.PEDIDO_ODOO = formatGroupedDocsText(ped, cot, fac);
  }
  delete out.COMPRA_ACTIVA;
  return out;
}

function sanearMapaFechasOdoo(valor) {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return {};
  const out = {};
  for (const [k, v] of Object.entries(valor)) {
    const val = String(v ?? "").trim().slice(0, 10);
    if (!val || val.toLowerCase() === "n/d") continue;
    for (const n of extraerNumerosOdoo(k)) out[n] = val;
  }
  return out;
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

function prepararClienteParaLectura(client) {
  if (!client || typeof client !== "object") return client;
  const limpio = sanearClienteRefsOdoo(JSON.parse(JSON.stringify(client)));
  delete limpio[CAMPO_OPERADOR_TS];
  for (const k of CAMPOS_ENVIO_LEGACY_MEZCLADOS) delete limpio[k];
  return limpio;
}

function prepararClientesParaLectura(clientes) {
  if (!clientes || typeof clientes !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(clientes)) {
    if (v && typeof v === "object") out[k] = prepararClienteParaLectura(v);
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
  return sanearClienteRefsOdoo(client);
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
