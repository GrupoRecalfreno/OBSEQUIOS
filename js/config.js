/**
 * Configuración app web — alineada con envios_obsequio_v2 + base depurada (§36–37).
 */
const CONFIG = {
  FIREBASE_URL: "https://controlmercaderia-default-rtdb.firebaseio.com",
  FIREBASE_ESTADOS_FLUJO_NODE: "estados_flujo",

  /** Sync liviano cada 5 min (estados_flujo ETag + inventario reducido). */
  SYNC_INTERVAL_MS: 5 * 60 * 1000,

  /** Inventario: cada N syncs livianos (~15 min con intervalo 5 min). */
  INVENTARIO_SYNC_CADA_N: 3,

  FIREBASE_PUBLISH_RETRIES: 3,
  FIREBASE_PUBLISH_RETRY_DELAY_MS: 1500,

  /** PIN operador (confirmar / revertir cierre). Cambiar antes de publicar. */
  EDIT_PIN: "recalfreno2026",

  LS_CLIENTES: "obsequios_web_clientes_v2",
  LS_INVENTARIO: "obsequios_web_inventario_v2",
  LS_ETAGS: "obsequios_web_etags_v2",
};
