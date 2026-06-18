/** Reglas de negocio — espejo de envios_obsequio_v2.py (sin Odoo en vivo). */

function normalizeTopTier(topStr) {
  return tierTop(topStr) || null;
}

function getTopGiftInfo(topStr) {
  const tier = tierTop(topStr);
  if (tier === 1) return { balon: 1, camiseta: 1, text: "Balón + camiseta" };
  if (tier === 2) return { balon: 0, camiseta: 1, text: "Solo camiseta" };
  if (tier === 3) return { balon: 1, camiseta: 0, text: "Solo balón" };
  return { balon: 0, camiseta: 0, text: "n/d" };
}

function isEstadoEnviado(estado) {
  return String(estado || "").trim().toUpperCase() === "ENVIADO";
}

function parseObsequiosEnviados(client) {
  const ob = obsequiosCanonicos(client);
  return {
    b: parseInt(ob.BALON, 10) || 0,
    c: parseInt(ob.CAMISETAS, 10) || 0,
  };
}

function textoColumnaEnviados(client) {
  const tipo = String(client.TIPO_ENVIO || "").trim();
  if (!tipo) return "ENVIADO";
  const tipoUp = tipo.toUpperCase();
  if (tipoUp === "CLIENTE" || tipoUp === "VENDEDOR") return `ENVIADO A ${tipoUp}`;
  if (tipoUp.startsWith("ENVIADO A ")) return tipo;
  return tipo;
}

/** Actividad desde refs congeladas en Firebase (§36 SEPARADO, §38 ORTIZ). */
function actividadDesdeRefsCliente(client) {
  const est = String(client?.ESTADO_ENVIO || "").toUpperCase();
  const facs = listaOdoo(client.FACTURAS_ODOO);
  const fpo = mapaOdoo(client.FACTURA_POR_ORIGEN_ODOO);
  const peds = listaOdoo(client.PEDIDOS_ODOO);
  const cots = listaOdoo(client.COTIZACIONES_ODOO);
  const tieneFactura = facs.length > 0 || Object.keys(fpo).length > 0;
  const tieneCotizacion = cots.length > 0;
  const tienePedido = peds.length > 0 || cots.length > 0;

  if (est === "SEPARADO") {
    return { hasFactura: tieneFactura, hasCotizacion: tienePedido || tieneCotizacion };
  }
  return { hasFactura: tieneFactura, hasCotizacion: tieneCotizacion || tienePedido };
}

function calculateAlertStatus(currStatus, hasFactura, hasCotizacion) {
  const est = String(currStatus || "POR ENVIAR").trim().toUpperCase();
  if (est === "FACTURADO") return "FACTURADO";
  if (est === "SEPARADO") return hasFactura ? "SEPARADO - FACTURADO" : "SEPARADO";
  if (est === "POR ENVIAR") {
    if (hasFactura) return "FACTURADO";
    if (hasCotizacion) return "POR ENVIAR";
  }
  return "POR ENVIAR";
}

function tieneRefsPedidoOFactura(client) {
  const peds = listaOdoo(client?.PEDIDOS_ODOO);
  const cots = listaOdoo(client?.COTIZACIONES_ODOO);
  const facs = listaOdoo(client?.FACTURAS_ODOO);
  const fpo = mapaOdoo(client?.FACTURA_POR_ORIGEN_ODOO);
  return (
    peds.length > 0 ||
    cots.length > 0 ||
    facs.length > 0 ||
    Object.keys(fpo).length > 0
  );
}

function shouldShowInEnProcesoTab(client) {
  const est = String(client?.ESTADO_ENVIO || "POR ENVIAR").toUpperCase();
  if (isEstadoEnviado(est) || est === "CERRADO") return false;
  if (est === "SEPARADO") return true;
  if (est === "POR ENVIAR" || est === "FACTURADO") {
    return tieneRefsPedidoOFactura(client);
  }
  return false;
}

function fechaCalendarioEcuador(isoStr) {
  if (!isoStr) return null;
  const t = String(isoStr).trim().slice(0, 10);
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
}

function hoyEcuadorDate() {
  const ec = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Guayaquil" }));
  return new Date(ec.getFullYear(), ec.getMonth(), ec.getDate());
}

function etiquetaRelativaFecha(isoStr) {
  const fecha = fechaCalendarioEcuador(isoStr);
  if (!fecha) return "";
  const hoy = hoyEcuadorDate();
  const diff = Math.round((hoy - fecha) / 86400000);
  if (diff === 0) return "hoy";
  if (diff === 1) return "ayer";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(fecha.getDate())}/${pad(fecha.getMonth() + 1)}/${fecha.getFullYear()}`;
}

/** Columna pedidos/facturas estilo app escritorio (desde refs Firebase). */
function formatPedidosFacturasEnProceso(client) {
  const pre = client?.PEDIDO_ODOO;
  if (pre && String(pre).trim() && String(pre).toLowerCase() !== "n/d") {
    return String(pre).trim();
  }

  const peds = listaOdoo(client?.PEDIDOS_ODOO);
  const cots = listaOdoo(client?.COTIZACIONES_ODOO);
  const ordenes = [...new Set([...peds, ...cots])];
  const fpo = mapaOdoo(client?.FACTURA_POR_ORIGEN_ODOO);
  const fechasPed = mapaOdoo(client?.FECHAS_PEDIDOS_ODOO);
  const fechasFac = mapaOdoo(client?.FECHAS_FACTURAS_ODOO);
  const facsSueltas = listaOdoo(client?.FACTURAS_ODOO);

  const bloques = [];

  for (const ord of ordenes) {
    const fac = fpo[ord];
    const relPed = etiquetaRelativaFecha(fechasPed[ord]);
    const izq = relPed ? `${ord} / ${relPed}` : ord;
    if (fac) {
      const relFac = etiquetaRelativaFecha(fechasFac[fac]);
      bloques.push(`${izq} --- fv ${fac}${relFac ? ` / ${relFac}` : ""}`);
    } else {
      bloques.push(`${izq} --- no facturado`);
    }
  }

  for (const fac of facsSueltas) {
    const ya = bloques.some((b) => b.includes(fac));
    if (!ya) {
      const relFac = etiquetaRelativaFecha(fechasFac[fac]);
      bloques.push(`Fac: ${fac}${relFac ? ` / ${relFac}` : ""}`);
    }
  }

  if (bloques.length) return bloques.join("\n");
  return formatPedidosFacturas(client);
}

function shouldShowInSeparadosTab(currStatus, hasFactura, hasCotizacion) {
  const est = String(currStatus || "").toUpperCase();
  if (isEstadoEnviado(est) || est === "CERRADO") return false;
  if (!ESTADOS_FLUJO_ALERTAS.has(est)) return false;
  if (est === "SEPARADO") return true;
  if (est === "FACTURADO") return hasFactura || hasCotizacion;
  if (est === "POR ENVIAR") return hasFactura || hasCotizacion;
  return false;
}

function formatPedidosFacturas(client) {
  const pre = client.PEDIDO_ODOO;
  if (pre && String(pre).trim() && String(pre).toLowerCase() !== "n/d") {
    return String(pre).trim();
  }
  const peds = listaOdoo(client.PEDIDOS_ODOO);
  const cots = listaOdoo(client.COTIZACIONES_ODOO);
  const facs = listaOdoo(client.FACTURAS_ODOO);
  const parts = [];
  if (peds.length) parts.push(`Ped: ${peds.join(", ")}`);
  if (cots.length) parts.push(`Cot: ${cots.join(", ")}`);
  if (facs.length) parts.push(`Fac: ${facs.join(", ")}`);
  return parts.length ? parts.join(" | ") : "n/d";
}

function inferEstadoBeforeSend(client) {
  const prev = String(client?.ESTADO_PREVIO_ENVIO || "").trim().toUpperCase();
  if (prev === "SEPARADO") return "SEPARADO";
  return "POR ENVIAR";
}

function buildDeliveryPayload(client, targetType = "CLIENTE") {
  const gift = getTopGiftInfo(client?.TOP);
  if (gift.balon === 0 && gift.camiseta === 0) {
    throw new Error("No se pudo determinar el obsequio según TOP del cliente");
  }
  let estadoPrevio = String(client?.ESTADO_ENVIO || "POR ENVIAR").trim().toUpperCase();
  if (estadoPrevio === "ENVIADO" || estadoPrevio === "CERRADO") estadoPrevio = "POR ENVIAR";
  if (!["POR ENVIAR", "SEPARADO", "FACTURADO"].includes(estadoPrevio)) {
    estadoPrevio = "POR ENVIAR";
  }
  const destino = String(targetType || "CLIENTE").toUpperCase() === "VENDEDOR" ? "VENDEDOR" : "CLIENTE";
  const payload = {
    ESTADO_ENVIO: "ENVIADO",
    ESTADO_PREVIO_ENVIO: estadoPrevio,
    TIPO_ENVIO: `ENVIADO A ${destino}`,
    FECHA_ENVIO: fechaEcuadorAhora(),
    OBSEQUIOS_ENVIADOS: { BALON: String(gift.balon), CAMISETAS: String(gift.camiseta) },
    PERSONAS_QUE_HAN_ENVIADO_DIRECTO: null,
    ...payloadOdooClear(),
  };
  for (const k of CAMPOS_ENVIO_LEGACY_MEZCLADOS) payload[k] = null;
  return { payload, bSend: gift.balon, cSend: gift.camiseta };
}

function buildRevertEnvioPayload(client) {
  const nuevoEstado = inferEstadoBeforeSend(client);
  const payload = {
    ESTADO_ENVIO: nuevoEstado,
    FECHA_ENVIO: "n/d",
    FECHA_CONFIRMACION: "n/d",
    TIPO_ENVIO: null,
    OBSEQUIOS_ENVIADOS: null,
    ESTADO_PREVIO_ENVIO: null,
    PERSONAS_QUE_HAN_ENVIADO_DIRECTO: null,
  };
  for (const k of CAMPOS_ENVIO_LEGACY_MEZCLADOS) payload[k] = null;
  return { payload, nuevoEstado };
}

function ensureInventoryStructure(inventario) {
  const inv = inventario || {};
  for (const key of ["BALON", "CAMISETAS"]) {
    if (!inv[key] || typeof inv[key] !== "object") {
      inv[key] = { STOCK_INICIAL: 300, STOCK_ACTUAL: 300 };
    }
  }
  return inv;
}

function fechaEcuadorAhora() {
  const ec = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Guayaquil" }));
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(ec.getDate())}/${pad(ec.getMonth() + 1)}/${ec.getFullYear()} – ${pad(ec.getHours())}:${pad(ec.getMinutes())}:${pad(ec.getSeconds())}`;
}

function operadorTs(valor) {
  const n = parseInt(valor, 10);
  return Number.isNaN(n) ? 0 : n;
}

function ahoraOperadorTs() {
  return Date.now();
}

function collectRowsForTab(tabIndex, clients) {
  const rows = [];
  const entries = Object.entries(clients || {});

  if (tabIndex === 0) {
    for (const [key, v] of entries) {
      if (!shouldShowInEnProcesoTab(v)) continue;
      const { hasFactura, hasCotizacion } = actividadDesdeRefsCliente(v);
      const curr = v.ESTADO_ENVIO || "POR ENVIAR";
      const estadoUi = calculateAlertStatus(curr, hasFactura, hasCotizacion);
      if (!ESTADOS_EN_PROCESO_UI.has(estadoUi)) continue;
      rows.push({
        key,
        ruc: v.RUC || "n/d",
        nombre: v.NOMBRE_CLIENTE || "n/d",
        top: v.TOP || "TOP 3",
        ranking: String(v.RANKING ?? "n/d"),
        obsequios: getTopGiftInfo(v.TOP).text,
        estado: estadoUi,
        extra: formatPedidosFacturasEnProceso(v),
        extraMultiline: true,
        vendedor: v.VENDEDOR || "n/d",
      });
    }
  } else if (tabIndex === 1) {
    for (const [key, v] of entries) {
      if (String(v.ESTADO_ENVIO || "").toUpperCase() !== "POR ENVIAR") continue;
      rows.push({
        key,
        ruc: v.RUC || "n/d",
        nombre: v.NOMBRE_CLIENTE || "n/d",
        top: v.TOP || "TOP 3",
        ranking: String(v.RANKING ?? "n/d"),
        obsequios: getTopGiftInfo(v.TOP).text,
        estado: "POR ENVIAR",
        extra: v.VENDEDOR || "n/d",
      });
    }
  } else if (tabIndex === 2) {
    for (const [key, v] of entries) {
      if (!isEstadoEnviado(v.ESTADO_ENVIO)) continue;
      rows.push({
        key,
        ruc: v.RUC || "n/d",
        nombre: v.NOMBRE_CLIENTE || "n/d",
        top: v.TOP || "TOP 3",
        ranking: String(v.RANKING ?? "n/d"),
        obsequios: getTopGiftInfo(v.TOP).text,
        estado: textoColumnaEnviados(v),
        extra: v.NUMERO_CELULAR || "n/d",
        fecha: v.FECHA_ENVIO || "n/d",
      });
    }
  } else if (tabIndex === 3) {
    for (const [key, v] of entries) {
      if (String(v.ESTADO_ENVIO || "").toUpperCase() !== "CERRADO") continue;
      rows.push({
        key,
        ruc: v.RUC || "n/d",
        nombre: v.NOMBRE_CLIENTE || "n/d",
        top: v.TOP || "TOP 3",
        ranking: String(v.RANKING ?? "n/d"),
        obsequios: getTopGiftInfo(v.TOP).text,
        estado: v.FECHA_ENVIO || "n/d",
        extra: v.FECHA_CONFIRMACION || "n/d",
      });
    }
  }

  rows.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
  return rows;
}

function textoSeparoOEnvio(client) {
  const partes = [];
  const nomSep = String(client?.NOMBRE_OPERARIO_SEPARACION || "").trim();
  const codSep = String(client?.CODIGO_OPERARIO_SEPARACION || "").trim();
  if (nomSep) {
    partes.push(`Separó: ${codSep ? `${codSep} - ` : ""}${nomSep}`);
  }
  const directo = personasCanonicas(client?.PERSONAS_QUE_HAN_ENVIADO_DIRECTO);
  if (directo?.nombre) {
    partes.push(`Envió: ${directo.codigo} - ${directo.nombre}`);
  } else {
    const est = String(client?.ESTADO_ENVIO || "").toUpperCase();
    const tipo = String(client?.TIPO_ENVIO || "").trim();
    if ((isEstadoEnviado(est) || est === "CERRADO") && tipo) {
      partes.push(`Envió: ${tipo}`);
    }
  }
  if (!partes.length && client?.REGISTRO_SEPARACION) {
    return String(client.REGISTRO_SEPARACION);
  }
  return partes.join(" | ");
}

function buildExportRows(clients) {
  return Object.values(clients || {}).map((v) => ({
    RUC: v.RUC || "",
    "NOMBRE CLIENTE": v.NOMBRE_CLIENTE || "",
    TOP: v.TOP || "",
    RANKING: String(v.RANKING ?? ""),
    ESTADO: v.ESTADO_ENVIO || "",
    VENDEDOR: v.VENDEDOR || "",
    "SEPARÓ / ENVIÓ": textoSeparoOEnvio(v),
  }));
}

const EXPORT_COLUMNAS = [
  "RUC",
  "NOMBRE CLIENTE",
  "TOP",
  "RANKING",
  "ESTADO",
  "VENDEDOR",
  "SEPARÓ / ENVIÓ",
];

const EXPORT_ANCHOS = [14, 36, 10, 10, 14, 16, 40];

function descargarReporteExcel(filas) {
  if (typeof XLSX === "undefined") {
    throw new Error("No se pudo cargar el generador Excel. Recargue la página.");
  }
  const hoja = XLSX.utils.json_to_sheet(filas, { header: EXPORT_COLUMNAS });
  hoja["!cols"] = EXPORT_ANCHOS.map((wch) => ({ wch }));
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Obsequios");
  XLSX.writeFile(libro, "Reporte_General_Obsequios.xlsx");
}

function computeNavCounts(clients) {
  let noEnviados = 0;
  let enviados = 0;
  let cerrados = 0;
  for (const v of Object.values(clients || {})) {
    const est = String(v.ESTADO_ENVIO || "POR ENVIAR").toUpperCase();
    if (est === "POR ENVIAR") noEnviados++;
    else if (est === "CERRADO") cerrados++;
    else if (isEstadoEnviado(est)) enviados++;
  }
  return {
    0: collectRowsForTab(0, clients).length,
    1: noEnviados,
    2: enviados,
    3: cerrados,
  };
}

function computeKpis(clients, inventario) {
  let bEnv = 0;
  let cEnv = 0;
  for (const v of Object.values(clients || {})) {
    const est = String(v.ESTADO_ENVIO || "").toUpperCase();
    if (isEstadoEnviado(est) || est === "CERRADO") {
      const { b, c } = parseObsequiosEnviados(v);
      bEnv += b;
      cEnv += c;
    }
  }
  const bIni = parseInt(inventario?.BALON?.STOCK_INICIAL, 10) || 300;
  const cIni = parseInt(inventario?.CAMISETAS?.STOCK_INICIAL, 10) || 300;
  return {
    balones: { enviados: bEnv, inicial: bIni, restante: Math.max(0, bIni - bEnv) },
    camisetas: { enviados: cEnv, inicial: cIni, restante: Math.max(0, cIni - cEnv) },
  };
}

function computeStats(clients) {
  let t1e = 0, t1f = 0, t2e = 0, t2f = 0, t3e = 0, t3f = 0;
  let cerrados = 0;
  let enviados = 0;
  let bEnv = 0;
  let cEnv = 0;
  const total = Object.keys(clients || {}).length;

  for (const v of Object.values(clients || {})) {
    const tier = tierTop(v.TOP);
    const est = String(v.ESTADO_ENVIO || "").toUpperCase();
    if (est === "CERRADO") cerrados++;
    if (isEstadoEnviado(est)) enviados++;
    const isEnv = isEstadoEnviado(est) || est === "CERRADO";
    const { b, c } = isEnv ? parseObsequiosEnviados(v) : { b: 0, c: 0 };

    if (tier === 1) {
      if (isEnv) { t1e++; bEnv += b; cEnv += c; } else t1f++;
    } else if (tier === 2) {
      if (isEnv) { t2e++; bEnv += b; cEnv += c; } else t2f++;
    } else if (tier === 3) {
      if (isEnv) { t3e++; bEnv += b; cEnv += c; } else t3f++;
    }
  }

  return {
    total,
    enviados,
    cerrados,
    pendientes: t1f + t2f + t3f,
    balones: bEnv,
    camisetas: cEnv,
    top1: { env: t1e, fal: t1f },
    top2: { env: t2e, fal: t2f },
    top3: { env: t3e, fal: t3f },
  };
}
