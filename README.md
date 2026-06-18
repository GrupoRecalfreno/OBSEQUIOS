# Control Obsequios — Vista Web (v2)

Versión HTML alineada con **`envios_obsequio_v2.py`** y la base depurada **`controlmercaderia-rtdb-normalizado.json`** (informe §§36–38).

## Qué hace

| Función | Web | Escritorio |
|---------|-----|------------|
| Ver clientes SEPARADO / POR ENVIAR con refs Odoo congeladas | ✅ | ✅ |
| No Enviados, Enviados, Cerrados, Estadísticas | ✅ | ✅ |
| Separar / Enviar / Eliminar | ❌ | ✅ |
| Confirmar cierre (Enviados → Cerrados) | ✅ + PIN | ✅ |
| Revertir cierre (Cerrados → Enviados) | ✅ + PIN | ✅ |
| **ENVIAR** (En proceso, SEPARADO-FACTURADO) | ✅ + PIN | ✅ |
| **Eliminar envío** (Enviados → En proceso) | ✅ + PIN | ✅ |
| Odoo en tiempo real | ❌ | ✅ |

## Alineación con la base depurada (§36–37)

- **`clientes/{RUC}`**: ficha canónica; **sin** `_OPERADOR_TS`, `COMPRA_ACTIVA` ni campos legacy de envío.
- **`estados_flujo/{RUC}`**: subconjunto operador + `_OPERADOR_TS` (sync liviano cada 5 min con ETag).
- **SEPARADO** siempre visible en pestaña **En proceso** (§38 ORTIZ/JUANCALVACHE).
- Escritura: `PATCH clientes/` sanitizado → `PATCH estados_flujo/` (igual que `patch_firebase` en escritorio).

## Optimización de datos

1. Primera visita: descarga `clientes` + `inventario` + merge `estados_flujo`.
2. Cada **5 min**: solo `estados_flujo` (304 ≈ 0 bytes si no cambió).
3. Inventario: cada 3 ciclos (~15 min) con ETag.
4. Caché `localStorage` v2 (sin campos internos).

## Configuración

`js/config.js`:

```javascript
EDIT_PIN: "su_pin",
SYNC_INTERVAL_MS: 5 * 60 * 1000,
```

## Archivos

```
web/js/campos.js   ← espejo de obsequios_campos.py
web/js/business.js ← reglas TOP, SEPARADO, alertas
web/js/sync.js     ← ETag, sanear escritura, estados_flujo
web/js/app.js      ← UI
```

## Probar local

```bash
cd web
python -m http.server 8080
```

## GitHub Pages

Settings → Pages → carpeta `/web` en rama `main`.

## Seguridad

Configure reglas Firebase RTDB. El PIN es barrera de uso, no sustituye reglas de seguridad.
