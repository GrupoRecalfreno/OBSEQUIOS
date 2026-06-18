/**
 * Configuración app web — alineada con envios_obsequio_v2 + base depurada (§36–37).
 */
const CONFIG = {
  FIREBASE_URL: "https://controlmercaderia-default-rtdb.firebaseio.com",
  FIREBASE_ESTADOS_FLUJO_NODE: "estados_flujo",

  SYNC_INTERVAL_MS: 5 * 60 * 1000,
  INVENTARIO_SYNC_CADA_N: 3,
  FIREBASE_PUBLISH_RETRIES: 3,
  FIREBASE_PUBLISH_RETRY_DELAY_MS: 1500,

  LS_CLIENTES: "obsequios_web_clientes_v2",
  LS_INVENTARIO: "obsequios_web_inventario_v2",
  LS_ETAGS: "obsequios_web_etags_v2",
};

/** Solo estos códigos pueden ejecutar acciones (ENVIAR, confirmar, eliminar, revertir). */
const OPERATION_OPERADORES = {
  M961: "Naomi",
  S551: "Edison",
  V455: "Jefferson",
  M521: "Mishelle",
  C999: "Jhoselin",
};

/** Estados visibles en pestaña En proceso (solo lectura; acciones solo con código). */
const ESTADOS_EN_PROCESO_UI = new Set([
  "POR ENVIAR",
  "FACTURADO",
  "SEPARADO",
  "SEPARADO - FACTURADO",
]);

/** Mensaje disuasorio si ingresan código no autorizado (no borra nada). */
const MSG_CODIGO_INVALIDO =
  "CODIGO DE BORRADO GENERAL ACTIVADO\n\nTODOS LOS REGISTROS Y DATOS GUARDADOS SE HAN BORRADO";
