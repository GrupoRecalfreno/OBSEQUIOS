/**
 * Sync Firebase — post-normalización (§37):
 * - clientes/: sin _OPERADOR_TS ni campos legacy
 * - estados_flujo/: CAMPOS_SYNC_OPERADOR + _OPERADOR_TS
 * - Sync liviano cada 5 min con ETag
 */

class FirebaseSync {
  constructor() {
    this.clients = {};
    this.inventario = {
      BALON: { STOCK_INICIAL: 300, STOCK_ACTUAL: 300 },
      CAMISETAS: { STOCK_INICIAL: 300, STOCK_ACTUAL: 300 },
    };
    this._etags = this._loadEtags();
    this._inventarioTick = 0;
    this._timer = null;
    this._onChange = null;
    this._lastSyncLabel = "—";
    this._bytesDownloaded = 0;
  }

  onChange(fn) {
    this._onChange = fn;
  }

  _notify() {
    if (this._onChange) this._onChange();
  }

  _loadEtags() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG.LS_ETAGS) || "{}");
    } catch {
      return {};
    }
  }

  _saveEtags() {
    localStorage.setItem(CONFIG.LS_ETAGS, JSON.stringify(this._etags));
  }

  _loadCache() {
    try {
      const c = localStorage.getItem(CONFIG.LS_CLIENTES);
      const i = localStorage.getItem(CONFIG.LS_INVENTARIO);
      if (c) this.clients = prepararClientesParaLectura(JSON.parse(c));
      if (i) this.inventario = JSON.parse(i);
      return Boolean(c);
    } catch {
      return false;
    }
  }

  _saveCache() {
    localStorage.setItem(CONFIG.LS_CLIENTES, JSON.stringify(clientesParaCache(this.clients)));
    localStorage.setItem(CONFIG.LS_INVENTARIO, JSON.stringify(this.inventario));
  }

  _normalizarClientesDescargados(raw) {
    return prepararClientesParaLectura(raw);
  }

  async _fetchJson(path, cacheKey) {
    const url = `${CONFIG.FIREBASE_URL}/${path}.json`;
    const headers = { "X-Firebase-ETag": "true" };
    const key = cacheKey || path;
    const cached = this._etags[key];
    if (cached?.etag) headers["If-None-Match"] = cached.etag;

    const res = await fetch(url, { headers });
    if (res.status === 304 && cached?.data !== undefined) {
      return { data: cached.data, downloaded: false, bytes: 0 };
    }
    if (res.status === 200) {
      const text = await res.text();
      const bytes = new Blob([text]).size;
      let data = null;
      try {
        data = text && text !== "null" ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
      const etag = res.headers.get("ETag") || res.headers.get("etag");
      if (etag) {
        this._etags[key] = { etag, data };
        this._saveEtags();
      }
      return { data, downloaded: true, bytes };
    }
    if (cached?.data !== undefined) {
      return { data: cached.data, downloaded: false, bytes: 0 };
    }
    return { data: null, downloaded: false, bytes: 0 };
  }

  _fusionarSnapshotEnCliente(client, snap, incluirResetOdoo = false) {
    const campos = [...CAMPOS_SYNC_OPERADOR];
    if (incluirResetOdoo) campos.push(...CAMPOS_SYNC_RESET_ODOO);
    for (const k of campos) {
      if (!(k in snap)) continue;
      const v = snap[k];
      if (v === null || v === undefined) delete client[k];
      else client[k] = JSON.parse(JSON.stringify(v));
    }
    if (CAMPO_OPERADOR_TS in snap) {
      client[CAMPO_OPERADOR_TS] = snap[CAMPO_OPERADOR_TS];
    }
  }

  _fusionarEstadosFlujo(remotoEstados) {
    if (!remotoEstados || typeof remotoEstados !== "object") return false;
    let hubo = false;
    for (const [fbKey, snap] of Object.entries(remotoEstados)) {
      if (!snap || typeof snap !== "object" || !this.clients[fbKey]) continue;

      const remotoOperador = {};
      for (const [k, v] of Object.entries(snap)) {
        if (k === CAMPO_OPERADOR_TS) continue;
        if (CAMPOS_SYNC_OPERADOR.includes(k) || (CAMPOS_SYNC_RESET_ODOO.includes(k) && v === null)) {
          remotoOperador[k] = v;
        }
      }
      if (!Object.keys(remotoOperador).length && !(CAMPO_OPERADOR_TS in snap)) continue;

      const remotoTs = operadorTs(snap[CAMPO_OPERADOR_TS]);
      const localTs = operadorTs(this.clients[fbKey][CAMPO_OPERADOR_TS]);
      if (remotoTs < localTs) continue;

      const incluirReset = CAMPOS_SYNC_RESET_ODOO.some(
        (k) => k in remotoOperador && remotoOperador[k] === null
      );
      this._fusionarSnapshotEnCliente(this.clients[fbKey], remotoOperador, incluirReset);
      if (remotoTs) this.clients[fbKey][CAMPO_OPERADOR_TS] = remotoTs;
      this.clients[fbKey] = prepararClienteParaLectura(this.clients[fbKey]);
      hubo = true;
    }
    return hubo;
  }

  async descargaCompleta() {
    let bytes = 0;
    const [cliRes, invRes, estRes] = await Promise.all([
      this._fetchJson("clientes", "clientes"),
      this._fetchJson("inventario_obsequios", "inventario_obsequios"),
      this._fetchJson(CONFIG.FIREBASE_ESTADOS_FLUJO_NODE, CONFIG.FIREBASE_ESTADOS_FLUJO_NODE),
    ]);
    bytes += cliRes.bytes + invRes.bytes + estRes.bytes;

    if (cliRes.data && typeof cliRes.data === "object") {
      this.clients = this._normalizarClientesDescargados(cliRes.data);
    }
    if (invRes.data && typeof invRes.data === "object") {
      this.inventario = invRes.data;
    }
    if (estRes.data && typeof estRes.data === "object") {
      this._fusionarEstadosFlujo(estRes.data);
    }

    this._saveCache();
    this._bytesDownloaded += bytes;
    this._lastSyncLabel = new Date().toLocaleTimeString("es-EC");
    this._notify();
    return { full: true, bytes };
  }

  async syncLiviano() {
    let bytes = 0;
    const estRes = await this._fetchJson(
      CONFIG.FIREBASE_ESTADOS_FLUJO_NODE,
      CONFIG.FIREBASE_ESTADOS_FLUJO_NODE
    );
    bytes += estRes.bytes;
    if (estRes.downloaded && estRes.data) {
      this._fusionarEstadosFlujo(estRes.data);
    }

    this._inventarioTick++;
    if (this._inventarioTick % CONFIG.INVENTARIO_SYNC_CADA_N === 0) {
      const invRes = await this._fetchJson("inventario_obsequios", "inventario_obsequios");
      bytes += invRes.bytes;
      if (invRes.data && typeof invRes.data === "object") {
        this.inventario = invRes.data;
      }
    }

    this._saveCache();
    this._bytesDownloaded += bytes;
    this._lastSyncLabel = new Date().toLocaleTimeString("es-EC");
    this._notify();
    return { full: false, bytes };
  }

  async iniciar() {
    const tieneCache = this._loadCache();
    this._notify();
    if (!tieneCache) {
      await this.descargaCompleta();
    } else {
      await this.syncLiviano();
    }
    this._timer = setInterval(() => this.syncLiviano(), CONFIG.SYNC_INTERVAL_MS);
  }

  detener() {
    if (this._timer) clearInterval(this._timer);
  }

  async actualizarManual() {
    return this.descargaCompleta();
  }

  async _publicarEstadosFlujo(fbKey, cliente, overlay, ts, incluirResetOdoo = false) {
    const snap = snapshotOperadorDesdeCliente(cliente, overlay, incluirResetOdoo);
    snap[CAMPO_OPERADOR_TS] = ts;
    const url = `${CONFIG.FIREBASE_URL}/${CONFIG.FIREBASE_ESTADOS_FLUJO_NODE}/${encodeURIComponent(fbKey)}.json`;

    for (let i = 0; i < CONFIG.FIREBASE_PUBLISH_RETRIES; i++) {
      try {
        const res = await fetch(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(snap),
        });
        if (res.ok) {
          delete this._etags[CONFIG.FIREBASE_ESTADOS_FLUJO_NODE];
          this._saveEtags();
          return true;
        }
      } catch {
        /* retry */
      }
      if (i < CONFIG.FIREBASE_PUBLISH_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, CONFIG.FIREBASE_PUBLISH_RETRY_DELAY_MS * (i + 1)));
      }
    }
    return false;
  }

  /**
   * Escritura canónica (igual que patch_firebase en escritorio):
   * PATCH clientes/ (sanitizado) → PATCH estados_flujo/ (+ _OPERADOR_TS)
   */
  async patchCliente(fbKey, payload, options = {}) {
    const cliente = this.clients[fbKey];
    if (!cliente) throw new Error("Cliente no encontrado");

    const ts = ahoraOperadorTs();
    for (const [k, v] of Object.entries(payload || {})) {
      if (v === null || v === undefined) delete cliente[k];
      else if (typeof v === "object") cliente[k] = JSON.parse(JSON.stringify(v));
      else cliente[k] = v;
    }
    cliente[CAMPO_OPERADOR_TS] = ts;

    const payloadCliente = sanearPayloadEscrituraClientes({ ...payload }, cliente);
    const esResetOdoo =
      options.incluirResetOdoo ||
      CAMPOS_SYNC_RESET_ODOO.some((k) => k in (payload || {}) && payload[k] === null);

    const resCli = await fetch(
      `${CONFIG.FIREBASE_URL}/clientes/${encodeURIComponent(fbKey)}.json`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadCliente),
      }
    );
    if (!resCli.ok) {
      throw new Error(`Firebase clientes PATCH falló (${resCli.status})`);
    }

    const overlay = { ...payloadCliente, [CAMPO_OPERADOR_TS]: ts };
    const okFlujo = await this._publicarEstadosFlujo(
      fbKey, cliente, overlay, ts, esResetOdoo
    );
    if (!okFlujo) {
      throw new Error("No se pudo publicar estados_flujo (reintente)");
    }

    delete this._etags.clientes;
    this._saveCache();
    this._notify();
    return true;
  }

  async patchInventario(inventario) {
    ensureInventoryStructure(inventario);
    const res = await fetch(`${CONFIG.FIREBASE_URL}/inventario_obsequios.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inventario),
    });
    if (!res.ok) throw new Error(`Firebase inventario PATCH falló (${res.status})`);
    this.inventario = inventario;
    delete this._etags.inventario_obsequios;
    this._saveCache();
    this._notify();
    return true;
  }

  /** Registrar envío (Alertas SEPARADO-FACTURADO → ENVIADO). Descuenta inventario. */
  async registrarEnvio(fbKey, targetType = "CLIENTE") {
    const cliente = this.clients[fbKey];
    if (!cliente) throw new Error("Cliente no encontrado");
    if (String(cliente.ESTADO_ENVIO || "").toUpperCase() !== "SEPARADO") {
      throw new Error("Solo se puede enviar desde estado SEPARADO");
    }

    const { payload, bSend, cSend } = buildDeliveryPayload(cliente, targetType);
    ensureInventoryStructure(this.inventario);

    const stockB = parseInt(this.inventario.BALON.STOCK_ACTUAL, 10) || 0;
    const stockC = parseInt(this.inventario.CAMISETAS.STOCK_ACTUAL, 10) || 0;
    if (stockB < bSend || stockC < cSend) {
      throw new Error("Material insuficiente en bodega matriz");
    }

    const backupClient = JSON.parse(JSON.stringify(cliente));
    const backupInv = JSON.parse(JSON.stringify(this.inventario));

    this.inventario.BALON.STOCK_ACTUAL = stockB - bSend;
    this.inventario.CAMISETAS.STOCK_ACTUAL = stockC - cSend;

    try {
      await this.patchCliente(fbKey, payload, { incluirResetOdoo: true });
      await this.patchInventario(this.inventario);
    } catch (e) {
      this.clients[fbKey] = backupClient;
      this.inventario = backupInv;
      throw e;
    }
    return true;
  }

  /** Eliminar envío (Enviados → En proceso o No Enviados). Restaura inventario. */
  async revertirEnvio(fbKey) {
    const cliente = this.clients[fbKey];
    if (!cliente || !isEstadoEnviado(cliente.ESTADO_ENVIO)) {
      throw new Error("Cliente no está en estado ENVIADO");
    }

    const { b, c } = parseObsequiosEnviados(cliente);
    const { payload, nuevoEstado } = buildRevertEnvioPayload(cliente);

    ensureInventoryStructure(this.inventario);
    const backupClient = JSON.parse(JSON.stringify(cliente));
    const backupInv = JSON.parse(JSON.stringify(this.inventario));

    this.inventario.BALON.STOCK_ACTUAL =
      (parseInt(this.inventario.BALON.STOCK_ACTUAL, 10) || 0) + b;
    this.inventario.CAMISETAS.STOCK_ACTUAL =
      (parseInt(this.inventario.CAMISETAS.STOCK_ACTUAL, 10) || 0) + c;

    try {
      await this.patchCliente(fbKey, payload);
      await this.patchInventario(this.inventario);
    } catch (e) {
      this.clients[fbKey] = backupClient;
      this.inventario = backupInv;
      throw e;
    }
    return nuevoEstado;
  }

  getStatusText() {
    const min = CONFIG.SYNC_INTERVAL_MS / 60000;
    return `Última sync: ${this._lastSyncLabel} · cada ${min} min · ${this._formatBytes(this._bytesDownloaded)} en sesión · base depurada v2`;
  }

  _formatBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  }
}
