/** Controlador UI — vista web de obsequios. */



const HEADERS = {

  0: ["RUC", "Nombre", "Top", "Ranking", "Obsequios", "Estado", "Pedidos / Facturas"],

  1: ["RUC", "Nombre", "Top", "Ranking", "Obsequios", "Estado", "Vendedor"],

  2: ["RUC", "Nombre", "Top", "Ranking", "Obsequios", "Estado", "Celular", "Fecha envío"],

  3: ["RUC", "Nombre", "Top", "Ranking", "Obsequios", "Fecha envío", "Fecha confirmación"],

};



const sync = new FirebaseSync();

let currentTab = 0;

let selectedKey = null;

let selectedRowStatus = null;



const $ = (sel) => document.querySelector(sel);



function showToast(msg, type = "") {

  const el = $("#toast");

  el.textContent = msg;

  el.className = `toast show ${type}`;

  setTimeout(() => el.classList.remove("show"), 4000);

}



function solicitarOperador() {
  const codigo = prompt(
    "Se requiere su código personal para realizar esta acción.\n\nEjemplo: A123"
  );
  if (codigo === null) return null;
  const key = String(codigo).trim().toUpperCase();
  const nombre = OPERATION_OPERADORES[key];
  if (!nombre) {
    alert(MSG_CODIGO_INVALIDO);
    return null;
  }
  return { codigo: key, nombre };
}



function escHtml(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function estadoBadgeClass(estado) {
  const e = String(estado || "").toUpperCase();
  if (e === "POR ENVIAR") return "estado-por-enviar";
  if (e === "FACTURADO") return "estado-facturado";
  if (e === "SEPARADO - FACTURADO") return "estado-sep-fac";
  if (e === "SEPARADO") return "estado-separado";
  return "";
}

function topBadgeClass(top) {

  const t = normalizeTopTier(top);

  if (t === 1) return "t1";

  if (t === 2) return "t2";

  if (t === 3) return "t3";

  return "";

}



function renderKpis() {

  const k = computeKpis(sync.clients, sync.inventario);

  $("#kpi-balon").textContent = `${k.balones.enviados} / ${k.balones.inicial}`;

  $("#kpi-balon-sub").textContent = `Restante: ${k.balones.restante}`;

  $("#kpi-camiseta").textContent = `${k.camisetas.enviados} / ${k.camisetas.inicial}`;

  $("#kpi-camiseta-sub").textContent = `Restante: ${k.camisetas.restante}`;

}



function renderNavCounts() {

  const c = computeNavCounts(sync.clients);

  for (let i = 0; i <= 3; i++) {

    const el = document.getElementById(`count-${i}`);

    if (el) el.textContent = c[i];

  }

}



function renderTable() {

  const search = $("#search").value.trim().toLowerCase();

  let rows = collectRowsForTab(currentTab, sync.clients);

  if (search) {

    rows = rows.filter(

      (r) =>

        String(r.nombre).toLowerCase().includes(search) ||

        String(r.ruc).toLowerCase().includes(search)

    );

  }



  const thead = $("#table-head");

  const tbody = $("#table-body");

  const headers = HEADERS[currentTab] || [];



  thead.innerHTML = `<tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>`;



  if (!rows.length) {

    tbody.innerHTML = `<tr><td colspan="${headers.length}" class="empty-msg">Sin registros en esta vista</td></tr>`;

    selectedKey = null;

    selectedRowStatus = null;

    updateActionButtons();

    return;

  }



  tbody.innerHTML = rows

    .map((r) => {

      const topCls = topBadgeClass(r.top);

      let cells = "";

      if (currentTab === 0) {
        const estCls = estadoBadgeClass(r.estado);
        const extraCls = r.extraMultiline ? " cell-multiline" : "";
        cells = `<td>${escHtml(r.ruc)}</td><td>${escHtml(r.nombre)}</td><td><span class="top-badge ${topCls}">${escHtml(r.top)}</span></td><td>${escHtml(r.ranking)}</td><td>${escHtml(r.obsequios)}</td><td><span class="estado-badge ${estCls}">${escHtml(r.estado)}</span></td><td class="${extraCls.trim()}">${escHtml(r.extra)}</td>`;
      } else if (currentTab === 1) {

        cells = `<td>${r.ruc}</td><td>${r.nombre}</td><td><span class="top-badge ${topCls}">${r.top}</span></td><td>${r.ranking}</td><td>${r.obsequios}</td><td>${r.estado}</td><td>${r.extra}</td>`;

      } else if (currentTab === 2) {

        cells = `<td>${r.ruc}</td><td>${r.nombre}</td><td><span class="top-badge ${topCls}">${r.top}</span></td><td>${r.ranking}</td><td>${r.obsequios}</td><td>${r.estado}</td><td>${r.extra}</td><td>${r.fecha || "n/d"}</td>`;

      } else if (currentTab === 3) {

        cells = `<td>${r.ruc}</td><td>${r.nombre}</td><td><span class="top-badge ${topCls}">${r.top}</span></td><td>${r.ranking}</td><td>${r.obsequios}</td><td>${r.estado}</td><td>${r.extra}</td>`;

      }

      const sel = r.key === selectedKey ? "selected" : "";

      return `<tr data-key="${r.key}" data-estado="${r.estado || ""}" class="${sel}">${cells}</tr>`;

    })

    .join("");



  tbody.querySelectorAll("tr[data-key]").forEach((tr) => {

    tr.addEventListener("click", () => {

      selectedKey = tr.dataset.key;

      selectedRowStatus = tr.dataset.estado || null;

      tbody.querySelectorAll("tr").forEach((x) => x.classList.remove("selected"));

      tr.classList.add("selected");

      updateActionButtons();

    });

  });



  if (selectedKey && !rows.some((r) => r.key === selectedKey)) {

    selectedKey = null;

    selectedRowStatus = null;

  }

  updateActionButtons();

}



function renderStats() {

  const s = computeStats(sync.clients);

  const pctEnv = s.total ? Math.round((s.enviados / s.total) * 100) : 0;

  const pctCer = s.total ? Math.round((s.cerrados / s.total) * 100) : 0;



  $("#stats-panel").innerHTML = `

    <div class="progress-wrap">

      <div class="progress-head"><span>Avance clientes enviados</span><span>${s.enviados} / ${s.total}</span></div>

      <div class="progress-bar"><div class="progress-fill" style="width:${pctEnv}%"></div></div>

    </div>

    <div class="progress-wrap">

      <div class="progress-head"><span>Avance entregas cerradas</span><span>${s.cerrados} / ${s.total}</span></div>

      <div class="progress-bar"><div class="progress-fill" style="width:${pctCer}%"></div></div>

    </div>

    <div class="stats-grid">

      <div class="stat-card"><h3>⚽ Balones entregados</h3><div class="big">${s.balones} unds</div></div>

      <div class="stat-card"><h3>👕 Camisetas entregadas</h3><div class="big">${s.camisetas} unds</div></div>

      <div class="stat-card"><h3>TOP 1 · Enviados / Faltan</h3><div class="big">${s.top1.env} / ${s.top1.fal}</div></div>

      <div class="stat-card"><h3>TOP 2 · Enviados / Faltan</h3><div class="big">${s.top2.env} / ${s.top2.fal}</div></div>

      <div class="stat-card"><h3>TOP 3 · Enviados / Faltan</h3><div class="big">${s.top3.env} / ${s.top3.fal}</div></div>

      <div class="stat-card"><h3>Clientes pendientes</h3><div class="big">${s.pendientes}</div></div>

    </div>

  `;

}



function updateActionButtons() {

  const btnEnviar = $("#btn-enviar");

  const btnConfirm = $("#btn-confirm");

  const btnDelete = $("#btn-delete");

  const btnRevert = $("#btn-revert");



  btnEnviar.style.display = currentTab === 0 ? "" : "none";

  btnConfirm.style.display = currentTab === 2 ? "" : "none";

  btnDelete.style.display = currentTab === 2 ? "" : "none";

  btnRevert.style.display = currentTab === 3 ? "" : "none";



  btnEnviar.disabled = !(

    currentTab === 0 &&

    selectedKey &&

    selectedRowStatus === "SEPARADO - FACTURADO"

  );

  btnConfirm.disabled = !(currentTab === 2 && selectedKey);

  btnDelete.disabled = !(currentTab === 2 && selectedKey);

  btnRevert.disabled = !(currentTab === 3 && selectedKey);

}



function switchTab(index) {

  currentTab = index;

  selectedKey = null;

  selectedRowStatus = null;

  document.querySelectorAll(".nav-item").forEach((btn) => {

    btn.classList.toggle("active", parseInt(btn.dataset.tab, 10) === index);

  });



  const isStats = index === 4;

  $("#table-section").style.display = isStats ? "none" : "";

  $("#stats-panel").classList.toggle("visible", isStats);

  $("#search").parentElement.style.display = isStats ? "none" : "";



  renderNavCounts();

  if (isStats) renderStats();

  else renderTable();

  updateActionButtons();

}



function renderAll() {

  renderKpis();

  renderNavCounts();

  $("#status-bar").textContent = sync.getStatusText();

  if (currentTab === 4) renderStats();

  else renderTable();

}



function exportarExcel() {
  const filas = buildExportRows(sync.clients);
  if (!filas.length) {
    showToast("No hay datos para exportar.", "err");
    return;
  }
  try {
    descargarReporteExcel(filas);
    showToast(`Excel exportado (${filas.length} clientes): Reporte_General_Obsequios.xlsx`, "ok");
  } catch (e) {
    showToast(`Error al exportar: ${e.message}`, "err");
  }
}



async function registrarEnvio() {

  if (!selectedKey || selectedRowStatus !== "SEPARADO - FACTURADO") return;

  const op = solicitarOperador();

  if (!op) return;



  const client = sync.clients[selectedKey];

  if (!client) return;



  const nombre = client.NOMBRE_CLIENTE || selectedKey;

  const obsequios = getTopGiftInfo(client.TOP).text;

  if (

    !confirm(

      `${op.nombre}, ¿registrar envío a CLIENTE para:\n${nombre}\n\nObsequio: ${obsequios}\n\nSe descontará del inventario?`

    )

  ) {

    return;

  }



  try {

    $("#btn-enviar").disabled = true;

    await sync.registrarEnvio(selectedKey, "CLIENTE");

    showToast(`Gracias ${op.nombre}. Envío registrado: ENVIADO A CLIENTE`, "ok");

    switchTab(2);

  } catch (e) {

    showToast(`Error: ${e.message}`, "err");

  } finally {

    updateActionButtons();

  }

}



async function eliminarEnvio() {

  if (!selectedKey) return;

  const op = solicitarOperador();

  if (!op) return;



  const client = sync.clients[selectedKey];

  if (!client || !isEstadoEnviado(client.ESTADO_ENVIO)) return;



  const nombre = client.NOMBRE_CLIENTE || selectedKey;

  const nuevoEstado = inferEstadoBeforeSend(client);

  const destino = nuevoEstado === "SEPARADO" ? "En proceso" : "No Enviados";



  if (

    !confirm(

      `${op.nombre}, ¿eliminar el envío de:\n${nombre}\n\nVolverá a ${destino} y se restaurará el inventario?`

    )

  ) {

    return;

  }



  try {

    $("#btn-delete").disabled = true;

    const estado = await sync.revertirEnvio(selectedKey);

    showToast(`${op.nombre}: ${nombre} revertido a ${destino}`, "ok");

    switchTab(estado === "SEPARADO" ? 0 : 1);

  } catch (e) {

    showToast(`Error: ${e.message}`, "err");

  } finally {

    updateActionButtons();

  }

}



async function confirmarCierre() {

  if (!selectedKey) return;

  const op = solicitarOperador();

  if (!op) return;



  const client = sync.clients[selectedKey];

  if (!client || !isEstadoEnviado(client.ESTADO_ENVIO)) return;



  const nombre = client.NOMBRE_CLIENTE || selectedKey;

  if (

    !confirm(

      `${op.nombre}, ¿confirmar que ${nombre} recibió el obsequio?\nPasará a Cerrados (sin descontar inventario).`

    )

  ) {

    return;

  }



  const payload = {

    ESTADO_ENVIO: "CERRADO",

    FECHA_CONFIRMACION: fechaEcuadorAhora(),

  };



  try {

    $("#btn-confirm").disabled = true;

    await sync.patchCliente(selectedKey, payload);

    showToast(`Gracias ${op.nombre}. Entrega confirmada y cerrada.`, "ok");

    switchTab(3);

  } catch (e) {

    showToast(`Error: ${e.message}`, "err");

  } finally {

    updateActionButtons();

  }

}



async function revertirCierre() {

  if (!selectedKey) return;

  const op = solicitarOperador();

  if (!op) return;



  const client = sync.clients[selectedKey];

  if (!client || String(client.ESTADO_ENVIO).toUpperCase() !== "CERRADO") return;



  const nombre = client.NOMBRE_CLIENTE || selectedKey;

  if (

    !confirm(`${op.nombre}, ¿eliminar el cierre de ${nombre}?\nVolverá a Enviados.`)

  ) {

    return;

  }



  const payload = {

    ESTADO_ENVIO: "ENVIADO",

    FECHA_CONFIRMACION: "n/d",

  };



  try {

    $("#btn-revert").disabled = true;

    await sync.patchCliente(selectedKey, payload);

    showToast(`${op.nombre}: ${nombre} revertido a Enviados`, "ok");

    switchTab(2);

  } catch (e) {

    showToast(`Error: ${e.message}`, "err");

  } finally {

    updateActionButtons();

  }

}



function init() {

  document.querySelectorAll(".nav-item").forEach((btn) => {

    btn.addEventListener("click", () => switchTab(parseInt(btn.dataset.tab, 10)));

  });



  $("#search").addEventListener("input", () => renderTable());



  $("#btn-enviar").addEventListener("click", registrarEnvio);

  $("#btn-confirm").addEventListener("click", confirmarCierre);

  $("#btn-delete").addEventListener("click", eliminarEnvio);

  $("#btn-revert").addEventListener("click", revertirCierre);

  $("#btn-export").addEventListener("click", exportarExcel);



  $("#btn-refresh").addEventListener("click", async () => {

    $("#btn-refresh").disabled = true;

    $("#status-bar").textContent = "Descargando datos completos…";

    try {

      const r = await sync.actualizarManual();

      showToast(`Actualizado (${sync._formatBytes(r.bytes)})`, "ok");

    } catch (e) {

      showToast(`Error al actualizar: ${e.message}`, "err");

    } finally {

      $("#btn-refresh").disabled = false;

      renderAll();

    }

  });



  sync.onChange(renderAll);

  sync.iniciar().then(() => renderAll()).catch((e) => {

    showToast(`Error de conexión: ${e.message}`, "err");

    renderAll();

  });

}



document.addEventListener("DOMContentLoaded", init);


