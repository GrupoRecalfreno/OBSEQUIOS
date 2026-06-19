/**
 * Lectura de refs Odoo congeladas — espejo web de envios_obsequio_v2.py (§38–41).
 * Sin Odoo en vivo; solo datos guardados en Firebase.
 */

function grupoOdooVacio() {
  return {
    pedidos: [],
    cotizaciones: [],
    facturas: [],
    fechas_pedidos: {},
    fechas_cotizaciones: {},
    fechas_facturas: {},
    factura_por_origen: {},
  };
}

function esEstadoCongelaRefsOdoo(client) {
  const est = String(client?.ESTADO_ENVIO || "").toUpperCase();
  return est === "SEPARADO" || isEstadoEnviado(est) || est === "CERRADO";
}

function odooListsFromClient(client) {
  let ped = listaOdoo(client?.PEDIDOS_ODOO);
  let cot = listaOdoo(client?.COTIZACIONES_ODOO);
  let fac = listaOdoo(client?.FACTURAS_ODOO);
  if (!ped.length && !cot.length) {
    const legacy = groupFromPedidoOdooString(client?.PEDIDO_ODOO);
    ped = legacy.pedidos;
    cot = legacy.cotizaciones;
    if (!fac.length) fac = legacy.facturas;
  }
  return { ped, cot, fac };
}

function fechasMapFromClient(client, campo) {
  return sanearMapaFechasOdoo(client?.[campo]);
}

function facturaPorOrigenFromClient(client) {
  const raw = client?.FACTURA_POR_ORIGEN_ODOO;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const nums = extraerNumerosOdoo(k);
    const val = String(v ?? "").trim();
    if (nums.length && val) out[nums[0]] = val;
  }
  return out;
}

function numerosFacturaEnGrupo(group, client) {
  const facs = new Set();
  for (const f of group?.facturas || []) {
    const s = String(f).trim();
    if (s) facs.add(s);
  }
  const fpo = { ...(group?.factura_por_origen || {}), ...facturaPorOrigenFromClient(client) };
  for (const v of Object.values(fpo)) {
    const s = String(v).trim();
    if (s) facs.add(s);
  }
  return facs;
}

function fechasFacturasParaCliente(client, group) {
  const stored = sanearMapaFechasOdoo(client?.FECHAS_FACTURAS_ODOO);
  const live = group?.fechas_facturas || {};
  const facsPermitidas = numerosFacturaEnGrupo(group, client);
  const merged = {};
  for (const mp of [stored, live]) {
    if (!mp || typeof mp !== "object") continue;
    for (const [k, v] of Object.entries(mp)) {
      if (!v) continue;
      const key = String(k).trim();
      if (facsPermitidas.size && !facsPermitidas.has(key)) continue;
      merged[key] = String(v).trim().slice(0, 10);
    }
  }
  return merged;
}

function recuperarListasRefsDesdeFechas(client, group) {
  const g = { ...grupoOdooVacio(), ...(group || {}) };
  let ped = [...(g.pedidos || [])];
  let cot = [...(g.cotizaciones || [])];
  let fac = [...(g.facturas || [])];
  const fpo = { ...(g.factura_por_origen || {}) };
  if (!ped.length && !cot.length) {
    const fechasPed = fechasMapFromClient(client, "FECHAS_PEDIDOS_ODOO");
    const fechasCot = fechasMapFromClient(client, "FECHAS_COTIZACIONES_ODOO");
    if (Object.keys(fechasPed).length) {
      ped = Object.keys(fechasPed);
      g.fechas_pedidos = { ...fechasPed };
    }
    if (Object.keys(fechasCot).length) {
      cot = Object.keys(fechasCot);
      g.fechas_cotizaciones = { ...fechasCot };
    }
  }
  if (!fac.length && Object.keys(fpo).length) {
    fac = unicosNumerosOdoo(Object.values(fpo));
  }
  g.pedidos = ped;
  g.cotizaciones = cot;
  g.facturas = fac;
  g.factura_por_origen = fpo;
  return g;
}

function grupoOperativoBruto(client) {
  const { ped, cot, fac } = odooListsFromClient(client);
  const g = {
    pedidos: [...ped],
    cotizaciones: [...cot],
    facturas: [...fac],
    fechas_pedidos: fechasMapFromClient(client, "FECHAS_PEDIDOS_ODOO"),
    fechas_cotizaciones: fechasMapFromClient(client, "FECHAS_COTIZACIONES_ODOO"),
    fechas_facturas: fechasFacturasParaCliente(client, {
      facturas: fac,
      factura_por_origen: facturaPorOrigenFromClient(client),
    }),
    factura_por_origen: facturaPorOrigenFromClient(client),
  };
  return recuperarListasRefsDesdeFechas(client, g);
}

function groupFromPedidoOdooString(pedidoStr) {
  const text = String(pedidoStr || "");
  let ped = [];
  let cot = [];
  let fac = [];
  if (text.includes("Ped:")) {
    const pedPart = text.split("Cot:")[0].split("Fac:")[0].replace("Ped:", "").trim();
    if (pedPart && pedPart !== "n/d") ped = extraerNumerosOdoo(pedPart);
  }
  if (text.includes("Cot:")) {
    let cotPart = text.split("Fac:")[0];
    if (cotPart.includes("Ped:")) cotPart = cotPart.split("Ped:")[1];
    cotPart = cotPart.replace("Cot:", "").trim();
    if (cotPart && cotPart !== "n/d") cot = extraerNumerosOdoo(cotPart);
  }
  if (text.includes("Fac:")) {
    const facPart = text.split("Fac:")[1].trim();
    if (facPart && facPart !== "n/d") {
      fac = facPart.split(",").map((x) => x.trim()).filter((x) => x && !/^S/i.test(x));
      if (!fac.length) {
        fac = facPart.split(",").map((x) => x.trim()).filter(Boolean);
      }
    }
  }
  return { pedidos: ped, cotizaciones: cot, facturas: fac };
}

function grupoDesdeOrdenesActivas(client, group) {
  const est = String(client?.ESTADO_ENVIO || "").toUpperCase();
  const g = group || grupoOdooVacio();
  const fpo = { ...(g.factura_por_origen || {}), ...facturaPorOrigenFromClient(client) };
  const fechasFac = fechasFacturasParaCliente(client, g);

  const ped = [];
  const cot = [];
  const facs = [];
  const fechasPed = {};
  const fechasCot = {};
  const fechasPedSrc = { ...(g.fechas_pedidos || {}), ...fechasMapFromClient(client, "FECHAS_PEDIDOS_ODOO") };
  const fechasCotSrc = { ...(g.fechas_cotizaciones || {}), ...fechasMapFromClient(client, "FECHAS_COTIZACIONES_ODOO") };
  const numsVistos = new Set();

  const docs = documentosParaOrdenes(client, g);
  for (const doc of docs) {
    for (const n of extraerNumerosOdoo(doc.num)) {
      if (!n || numsVistos.has(n)) continue;
      numsVistos.add(n);
      if (doc.tipo === "COTIZACION") {
        cot.push(n);
        if (fechasCotSrc[n]) fechasCot[n] = fechasCotSrc[n];
      } else {
        ped.push(n);
        if (fechasPedSrc[n]) fechasPed[n] = fechasPedSrc[n];
      }
      const fv = fpo[n];
      if (fv) facs.push(String(fv).trim());
    }
  }

  const facsU = unicosNumerosOdoo(facs);
  const fpoOk = {};
  for (const [k, v] of Object.entries(fpo)) {
    if (numsVistos.has(k) && v) fpoOk[k] = String(v).trim();
  }

  if (!ped.length && !cot.length && !facsU.length && est === "SEPARADO") {
    return g;
  }

  return {
    pedidos: ped,
    cotizaciones: cot,
    facturas: facsU,
    fechas_pedidos: fechasPed,
    fechas_cotizaciones: fechasCot,
    fechas_facturas: fechasFacturasParaCliente(client, {
      facturas: facsU,
      factura_por_origen: fpoOk,
      fechas_facturas: fechasFac,
    }),
    factura_por_origen: fpoOk,
  };
}

function mergedDocGroupForClient(client) {
  const bruto = grupoOperativoBruto(client);
  const filtrado = grupoDesdeOrdenesActivas(client, bruto);
  if (filtrado.pedidos?.length || filtrado.cotizaciones?.length || filtrado.facturas?.length) {
    return filtrado;
  }
  const legacy = groupFromPedidoOdooString(client?.PEDIDO_ODOO);
  if (legacy.pedidos.length || legacy.cotizaciones.length || legacy.facturas.length) {
    return legacy;
  }
  return grupoOdooVacio();
}

function fechaCreacionDocDesdeMapas(num, tipo, client, group) {
  const candidatos = extraerNumerosOdoo(num);
  if (!candidatos.length) candidatos.push(String(num).trim());
  const fechasLiveCot = { ...(group?.fechas_cotizaciones || {}) };
  const fechasLivePed = { ...(group?.fechas_pedidos || {}) };
  const fbCot = fechasMapFromClient(client, "FECHAS_COTIZACIONES_ODOO");
  const fbPed = fechasMapFromClient(client, "FECHAS_PEDIDOS_ODOO");

  for (const candidato of candidatos) {
    let raw = null;
    if (tipo === "COTIZACION") {
      raw = fechasLiveCot[candidato] || fbCot[candidato];
    } else {
      raw = fechasLivePed[candidato] || fbPed[candidato] || fechasLiveCot[candidato] || fbCot[candidato];
    }
    if (raw) return String(raw).trim().slice(0, 10);
  }
  return null;
}

function fechaCalendarioDoc(doc, client, group) {
  const iso = fechaCreacionDocDesdeMapas(doc.num, doc.tipo, client, group);
  return fechaCalendarioEcuador(iso);
}

function documentosParaOrdenes(client, group) {
  const g = group || grupoOdooVacio();
  const docs = [];
  const vistos = new Set();
  for (const num of g.cotizaciones || []) {
    for (const n of extraerNumerosOdoo(num)) {
      if (!n || vistos.has(n)) continue;
      vistos.add(n);
      docs.push({ num: n, tipo: "COTIZACION" });
    }
  }
  for (const num of g.pedidos || []) {
    for (const n of extraerNumerosOdoo(num)) {
      if (!n || vistos.has(n)) continue;
      vistos.add(n);
      docs.push({ num: n, tipo: "PEDIDO" });
    }
  }
  docs.sort((a, b) => {
    const fa = fechaCalendarioEcuador(fechaCreacionDocDesdeMapas(a.num, a.tipo, client, g));
    const fb = fechaCalendarioEcuador(fechaCreacionDocDesdeMapas(b.num, b.tipo, client, g));
    if (!fa && !fb) return 0;
    if (!fa) return 1;
    if (!fb) return -1;
    return fa - fb;
  });
  return docs;
}

function agruparOrdenesCliente(client, group) {
  const docs = documentosParaOrdenes(client, group);
  if (!docs.length) return [];
  const ordenes = [];
  let actual = [docs[0]];
  let diaActual = fechaCalendarioDoc(docs[0], client, group);
  for (let i = 1; i < docs.length; i++) {
    const doc = docs[i];
    const diaDoc = fechaCalendarioDoc(doc, client, group);
    if (diaActual == null || diaDoc == null || diaDoc.getTime() !== diaActual.getTime()) {
      ordenes.push(actual);
      actual = [doc];
      diaActual = diaDoc;
    } else {
      actual.push(doc);
    }
  }
  if (actual.length) ordenes.push(actual);
  return ordenes;
}

function diasHabilesTranscurridos(fechaInicio, fechaFin) {
  if (!fechaInicio) return 0;
  const fin = fechaFin || hoyEcuadorDate();
  let dias = 0;
  const cursor = new Date(fechaInicio);
  while (cursor < fin) {
    cursor.setDate(cursor.getDate() + 1);
    const wd = cursor.getDay();
    if (wd >= 1 && wd <= 5) dias++;
  }
  return dias;
}

function caducidadOrdenAlcanzada(fechaReferencia, fechaFin) {
  return diasHabilesTranscurridos(fechaReferencia, fechaFin) >= 2;
}

function mapaFacturasPorOrigen(client, group) {
  const fpo = { ...(group?.factura_por_origen || {}), ...facturaPorOrigenFromClient(client) };
  const fechasFac = fechasFacturasParaCliente(client, group);
  return { fpo, fechasFac };
}

function ordenTieneFactura(orden, fpo) {
  return orden.some((d) => fpo[d.num]);
}

function fechaReferenciaCaducidadOrden(orden, fpo, fechasFac, client, group) {
  if (ordenTieneFactura(orden, fpo)) {
    const fechas = [];
    for (const doc of orden) {
      const fac = fpo[doc.num];
      if (fac) {
        const f = fechaCalendarioEcuador(fechasFac[fac]);
        if (f) fechas.push(f);
      }
    }
    if (fechas.length) return fechas.reduce((a, b) => (a < b ? a : b));
  }
  const fechasCreacion = [];
  for (const doc of orden) {
    const f = fechaCalendarioDoc(doc, client, group);
    if (f) fechasCreacion.push(f);
  }
  if (!fechasCreacion.length) return null;
  return fechasCreacion.reduce((a, b) => (a < b ? a : b));
}

function ordenEstaCaducada(orden, client, group, fpo, fechasFac) {
  const est = String(client?.ESTADO_ENVIO || "").toUpperCase();
  if (est === "SEPARADO") return false;
  const fechaRef = fechaReferenciaCaducidadOrden(orden, fpo, fechasFac, client, group);
  if (!fechaRef) return false;
  return caducidadOrdenAlcanzada(fechaRef);
}

function ordenesActivasCliente(client, group) {
  const { fpo, fechasFac } = mapaFacturasPorOrigen(client, group);
  const ordenes = agruparOrdenesCliente(client, group);
  const activas = ordenes.filter(
    (o) => !ordenEstaCaducada(o, client, group, fpo, fechasFac)
  );
  return { activas, fpo, fechasFac };
}

function actividadOrdensCliente(client, group) {
  const est = String(client?.ESTADO_ENVIO || "").toUpperCase();
  if (est === "SEPARADO") {
    const g = grupoDesdeOrdenesActivas(client, group || grupoOperativoBruto(client));
    let tieneFactura = Boolean(g.facturas?.length);
    if (!tieneFactura && g.factura_por_origen && Object.keys(g.factura_por_origen).length) {
      tieneFactura = true;
    }
    const tienePedido = Boolean(g.pedidos?.length || g.cotizaciones?.length);
    return { hasFactura: tieneFactura, hasCotizacion: tienePedido };
  }
  const { activas, fpo } = ordenesActivasCliente(client, group);
  if (!activas.length) return { hasFactura: false, hasCotizacion: false };
  const tieneFactura = activas.some((o) => ordenTieneFactura(o, fpo));
  return { hasFactura: tieneFactura, hasCotizacion: true };
}

function getClientOdooActivity(client) {
  const group = mergedDocGroupForClient(client);
  const { hasFactura, hasCotizacion } = actividadOrdensCliente(client, group);
  return { hasFactura, hasCotizacion, group };
}

function formatearFechaUi(valorFecha, ref) {
  const fecha = fechaCalendarioEcuador(valorFecha);
  if (!fecha) return "—";
  const hoy = ref || hoyEcuadorDate();
  if (fecha.getTime() === hoy.getTime()) return "hoy";
  const ayer = new Date(hoy);
  ayer.setDate(ayer.getDate() - 1);
  if (fecha.getTime() === ayer.getTime()) return "ayer";
  if (hoy.getDay() === 1 && fecha.getDay() === 5) return "viernes";
  const diaTxt = DIAS_ES[fecha.getDay()];
  if (fecha.getFullYear() === hoy.getFullYear() && fecha.getMonth() === hoy.getMonth()) {
    return `${diaTxt} ${String(fecha.getDate()).padStart(2, "0")}`;
  }
  return `${diaTxt} ${String(fecha.getDate()).padStart(2, "0")} de ${MESES_ES[fecha.getMonth()]}`;
}

function lineaUnificadaDocumento(doc, client, group, fpo, fechasFac, ref) {
  const nums = extraerNumerosOdoo(doc.num);
  let lookup = nums[0] || String(doc.num).trim();
  let fechaPedDate = fechaCalendarioDoc(doc, client, group);
  if (!fechaPedDate) {
    for (const candidato of nums) {
      const iso = fechaCreacionDocDesdeMapas(candidato, doc.tipo, client, group);
      if (iso) {
        fechaPedDate = fechaCalendarioEcuador(iso);
        lookup = candidato;
        break;
      }
    }
  }
  let fac = fpo[lookup] || fpo[doc.num];
  for (const candidato of nums) {
    if (fpo[candidato]) {
      fac = fpo[candidato];
      lookup = candidato;
      break;
    }
  }
  const facKey = fac ? String(fac).trim() : null;
  let fechaFacDate = facKey ? fechaCalendarioEcuador(fechasFac[facKey]) : null;
  if (fechaPedDate && fechaFacDate && fechaPedDate > fechaFacDate) {
    fechaPedDate = fechaFacDate;
  }
  const fechaPed = formatearFechaUi(
    fechaPedDate ? fechaPedDate.toISOString().slice(0, 10) : null,
    ref
  );
  if (facKey) {
    const fechaFac = formatearFechaUi(fechasFac[facKey], ref);
    return `${lookup} / ${fechaPed} --- fv ${facKey} / ${fechaFac}`;
  }
  return `${lookup} / ${fechaPed} --- no facturado`;
}

function formatColumnaPedidosFacturasUnificada(client) {
  const ref = hoyEcuadorDate();
  const est = String(client?.ESTADO_ENVIO || "").toUpperCase();
  let group = mergedDocGroupForClient(client);
  if (est === "SEPARADO" && !(group.cotizaciones?.length || group.pedidos?.length)) {
    group = grupoOperativoBruto(client);
  }
  let { activas, fpo, fechasFac } = ordenesActivasCliente(client, group);
  if (!activas.length && est === "SEPARADO") {
    const bruto = grupoOperativoBruto(client);
    if (bruto.cotizaciones?.length || bruto.pedidos?.length) {
      ({ activas, fpo, fechasFac } = ordenesActivasCliente(client, bruto));
      group = bruto;
    }
  }
  if (!activas.length) return "n/d";
  const bloques = activas.map((orden) =>
    orden
      .map((doc) => lineaUnificadaDocumento(doc, client, group, fpo, fechasFac, ref))
      .join("\n")
  );
  return bloques.join("\n\n");
}
