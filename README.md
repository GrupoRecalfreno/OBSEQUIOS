# Control Obsequios — Vista Web (v2)

Versión HTML alineada con **`envios_obsequio_v2.py`** y la base depurada (informe §§36–41).

## Qué hace

| Función | Web | Escritorio |
|---------|-----|------------|
| Ver clientes SEPARADO / POR ENVIAR con refs Odoo congeladas | ✅ | ✅ |
| Columna pedidos/facturas unificada (`S123 / ayer --- no facturado`) | ✅ | ✅ |
| Saneamiento refs corruptas (`sanearClienteRefsOdoo`, §41) | ✅ | ✅ |
| No Enviados, Enviados, Cerrados, Estadísticas | ✅ | ✅ |
| Separar obsequio | ❌ | ✅ |
| Confirmar cierre (Enviados → Cerrados) | ✅ + código operador | ✅ |
| Revertir cierre (Cerrados → Enviados) | ✅ + código operador | ✅ |
| **ENVIAR** (En proceso, SEPARADO-FACTURADO) | ✅ + código operador | ✅ |
| **Eliminar envío** (Enviados → En proceso) | ✅ + código operador | ✅ |
| Odoo en tiempo real | ❌ | ✅ |

## Códigos de operador (acciones sensibles)

Las acciones de envío, confirmación y eliminación piden el **código personal** del operador (no PIN genérico). Configurados en `js/config.js` → `OPERATION_OPERADORES`.

## Alineación lectura Odoo (§38–41)

- **`sanearClienteRefsOdoo`**: normaliza refs tipo `"S123060 | S123059"` al cargar Firebase.
- **`getClientOdooActivity`**: actividad desde órdenes activas (caducidad 2 días hábiles; SEPARADO sin caducidad).
- **`formatColumnaPedidosFacturasUnificada`**: misma columna que la app de escritorio.
- **`shouldShowInEnProcesoTab`**: SEPARADO siempre visible; POR ENVIAR/FACTURADO solo con actividad Odoo vigente.

## Sync Firebase (§37)

- **`clientes/{RUC}`**: ficha canónica; sin `_OPERADOR_TS` ni campos legacy.
- **`estados_flujo/{RUC}`**: subconjunto operador + `_OPERADOR_TS` (sync liviano cada 5 min con ETag).
- Escritura: `PATCH clientes/` sanitizado → `PATCH estados_flujo/`.

## Archivos

```
web/js/campos.js     ← espejo de obsequios_campos.py (saneamiento refs)
web/js/odoo-read.js  ← lectura refs congeladas (grupos, fechas, caducidad)
web/js/business.js   ← reglas TOP, alertas, export Excel
web/js/sync.js       ← ETag, sanear escritura, estados_flujo
web/js/app.js        ← UI
```

## Probar local

```bash
cd web
python -m http.server 8080
```

## GitHub Pages

Repo: `GrupoRecalfreno/OBSEQUIOS` → `https://gruporecalfreno.github.io/OBSEQUIOS/`

Subir: `index.html`, `css/styles.css`, `js/*.js` (incluido `odoo-read.js`).

## Seguridad

Configure reglas Firebase RTDB. Los códigos operador son barrera de uso, no sustituyen reglas de seguridad.
