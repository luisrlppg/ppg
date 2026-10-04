# project-nav.md — Mapa de navegación del proyecto PPG ERP

Dónde vive cada funcionalidad y por dónde empezar a leer. Este archivo es el **mapa de
archivos**; para comandos ver `docs/development.md`, para reglas de código `docs/conventions.md`,
para el modelo de datos `docs/data-model.md` y para scripts `docs/scripts.md`.

> Regla de oro: **antes de modificar, ubica la funcionalidad en este mapa y lee la zona
> indicada.** No asumas que algo vive donde "suena lógico": los nombres de línea son una
> referencia viva; al refactorizar, actualízalos.

---

## 1. Estructura del proyecto

Monorepo `pnpm` workspaces en `/home/luisrlp/Documents/projects/plasticosplasa/ppg` (WSL2/Linux):

```
apps/
  api/        # NestJS API (puerto 3001) — dueña de la BD vía Prisma
  web/        # Next.js App Router (puerto 3000, proxy /api → :3001)
packages/
  db/         # Prisma schema + migraciones + seed (@ppg/db)
  shared/     # Tipos/constantes compartidos (@ppg/shared; incluye `formatCantidad`)
scripts/      # Scripts de utilidad, migración Odoo y toolkit de catálogo
docs/         # Documentación (este mapa vive en la raíz)
infra/        # Dockerfiles + Caddyfile (perfil full)
```

- **Roles/guards:** `admin`, `supervisor`, `operador`. Sólo `auth` (login), `catalogos` y `public` son públicos.
- La web es una sola app; no hay Redux/react-query: `useState` + `useEffect` + `useCallback` + `fetch` vía `lib/api.ts`.

---

## 2. Mapa de la API (NestJS) — `apps/api/src`

Cada dominio es un módulo `x.controller.ts` + `x.service.ts` + `x.module.ts`.
Registrados en `app.module.ts`.

### 2.1 Productos / variantes / grid / BOM → `productos/`
- `productos.controller.ts` (235) — rutas `/api/productos...`
- `productos.service.ts` (593), zonas:
  - `list` 34 · `get` (detalle + componentes + variantes) 73 · `create` 122
  - `update` (registra `PriceChange`) 157 · `deactivate` 202
  - `setEjes` 209 · `setValoresPermitidos` 226 (tabla `ProductAttributeValue`) · `setComponentes` (BOM) 255 · `getPasos`/`setPasos` (wizard)
  - `variantesDeProducto` 276 · `buscarVariantes` 292 · `createVariant` 324 · `updateVariant` 341
  - `setVariantAttribute` 349 · `removeVariantAttribute` 370 · `setVariantPrice` 378 · `setPackagings` 401
  - `grid` 430 · `materializar` (crea UNA variante puntual, idempotente) 434
  - `eliminarVariante` (chequea historial; 409 con motivos) 493 · `eliminarProducto` (hard delete sin historial) 513
  - `resolveComponentVariant` (resuelve variante de componente BOM; lo usan ventas/inventario) 563
- `productos.grid.ts` (111): `slugify`, tipos `GridEje`/`GridVarianteExistente`/`Grid`.
  - `ejesProducto` (atributo + valores permitidos, sin producto cartesiano) y `variantesExistentes` (`valueIds` alineados al orden de ejes).
  - `gridProducto = { ejes, existentes }`; **no** devuelve el cartesiano (antes producto 15 → 489k combos/160 MB/7.5 s).
  - Valores permitidos con `valoresPermitidosLote` (`common/valores-permitidos.ts`, batcheado, sin N+1); si no hay filas → todos los valores del atributo.
  - La generación masiva (`generar`/`combinacionesCartesianas`) fue **retirada**.

### 2.2 Ventas / neteo / OFs → `ventas/`
- `ventas.controller.ts` (107) — rutas `/api/ventas...`
- `ventas.service.ts` (402), zonas:
  - `list` 28 · `get` (con OFs asociados) 69 · `create` 143 · `update` 206
  - **`confirmar` = NETEO + CASCADA DE OFs** 266 (lo más crítico): `$transaction` + carga BOM `exacto` con caché → `netear` recursivo multi-nivel con detección de ciclos → genera OFs `fabricacion`/`ensamble` **inline** (con `configuracion`) → persiste `resumen` en la venta.
  - `despacharLinea` (consume stock, dispara monitor) 309 · `cancelar` 389
- `ventas.types.ts` (18): `ResumenItem`, `ResumenNeteo`, `ConfiguracionLinea` (re-exportados desde `ventas.service`).
- **`ventas.ofs.ts` ya no existe**: la recursión quedó inline en `confirmar` (se corrigió un doble bucle).
- Acoplos: inyecta `productos.service` (`resolveComponentVariant`) y `monitor.service`.

### 2.3 Reportes de producción → `reportes/`
- `reportes.controller.ts` (127) — rutas `/api/reportes...`
- `reportes.service.ts` (414), zonas:
  - `list` 53 · `ultimo` (prefill) 104 · `get` 139 · `crear` 171 · `editar` 197
  - **`aplicar`** (mueve stock final/consumo, cierra la OF) 222 · `cancelar` 297 · `lotes` 307 · `ubicar` 333
  - `stats` 394 y `exportar` 399 delegan en módulos externos
- `reportes.constants.ts` (11): `TURNOS`, `SECCIONES`, `HORAS_TURNO`.
- `reportes.stats.ts` (72): métricas de productividad. `reportes.export.ts` (55): CSV.

### 2.4 Inventario / stock → `inventario/`
- `inventario.controller.ts` (141) — rutas `/api/inventario...` (rutas estáticas antes de `:param`)
- `inventario.service.ts` (294):
  - `ubicaciones` 15 · `crearUbicacion` 19 · `editarUbicacion` 25
  - `existencia` 38 · `existenciaDe` 76 · `movimientos` 116
  - `movimiento` (entrada/salida: upsert stock + `StockMove` + monitor) 126 · `ajuste` (cantidad absoluta + delta `motivo: ajuste`) 181 · `mover` (transferencia) 230 · `exportarCSV` 280
- **Retirado (2026-10-02):** el ensamble BOM de inventario (`inventario.ensamble.ts` / `POST /inventario/ensamble`) se eliminó. "Ensamble" queda sólo como **tipo de OF**; el enum `MotivoStock.ensamble` se conserva para histórico.

### 2.5 Órdenes de fabricación → `fabricacion/`
- `fabricacion.controller.ts` (74) · `fabricacion.service.ts` (217):
  - `list` (estado/tipo/**origen**/search) 17 · `get` 62 · `iniciar` 90 · `cancelar` 102
  - `crearManual` (alta manual OF, exactamente N, `origen: manual`) 113
  - `previewReponer` (no escribe) 161 · `reponer` (cascada hasta mín/máx) 175 · `faltantes` 192
- `planificacion.service.ts` (201): `planificar(tx, demandas, { netearRaiz })` 84 y `crearOFs(tx, plan, { origen })` 136. Lo usan `ventas.confirmar` (`netearRaiz: true`) y fabricación manual/reposición (`false`).
- OFs guardan `origen` (`venta | manual | reposicion_minimo | reposicion_maximo`); las de venta se ligan a `salesOrderLineId`.
- **Cierre a "hecha"** ocurre desde `reportes.service.aplicar`, no aquí.

### 2.6 Catálogos (atributos / categorías / empaques) → `catalogos/`
- `catalogos.controller.ts` (296) — `@Controller("catalogos")` **público, sin guards**, usa `PrismaService` directo (sin service).
  - categorías CRUD · empaques CRUD · atributos listar/crear · editar/eliminar · valores add/del · asignar/desasignar
  - `atributos/producto/:id` (propios + heredados) delega en `catalogos.atributos-producto.ts`
- `catalogos.atributos-producto.ts` (87): atributos propios + **heredados por recursión BOM** (`atributosPorProducto`).

### 2.7 Storefront público → `public/`
- `public.controller.ts` (53) — `@Controller("public")` **público**
  - `GET public/productos` · `GET public/productos/:id/pasos` · `POST public/orders` · `GET public/orders/:numero` · `GET public/catalog`
- `public.service.ts`:
  - `crearPedido` (precio recalculado en servidor) · `consultarPedido`
  - `productosPublicos` (productos `vendible: true` + sus variantes activas; `tienePasos` decide wizard vs selección directa) · `catalogo`
  - **`getPasos(productId, seleccion?)`**: Modelo B — opciones de las **variantes activas del componente** (`variantProductId`), filtradas por valores permitidos y por compatibilidad con la selección (cascada, ej. rosca). Devuelve `panel`.
  - **`resolverConfiguracion(productId, seleccion, {crear})`**: une la selección + ejes derivados y materializa/reutiliza la variante vendible.
- `public.controller.ts`: `GET/POST public/productos/:id/pasos` · `POST public/productos/:id/resolver`.
  Compartido por tienda y modal; en web `lib/pasos-wizard.ts` (paneles/cascada) y `lib/pasos-cache.ts` (TTL 30 s).

### 2.8 Monitor de stock bajo + notificaciones → `monitor/`
- `monitor.controller.ts` (73) · `monitor.service.ts` (240): `listarBajo` 66 · **`afterStockChange`** (dispara sólo al pasar a bajo) 104 · `checkAll` 165 · `enviarAlerta` 192 · `enviarPrueba` 208.
- `monitor.notificadores.ts` (76): `sendTelegram` / `sendCallMeBot` / `sendEmail`.

### 2.9 Clientes / partners → `clientes/`
- `clientes.controller.ts` (87) · `clientes.service.ts` (137): `list`/`get`/`create`/`update`/`deactivate` + `importar` (CSV).

### 2.10 Respaldos de BD → `backups/`
- `backups.controller.ts` — `@Controller("backups")` **sólo `admin`** (`JwtAuthGuard`+`RolesGuard`):
  - `GET backups` (listar) · `POST backups` (crear, body `{nombre?}`)
  - `POST backups/:nombre/restaurar` · `POST backups/subir` (multipart campo `archivo`)
  - `GET backups/:nombre/descargar` (stream) · `DELETE backups/:nombre`
- `backups.service.ts`: opera `docs/backups/`; `pg_dump -Fc` al crear; al restaurar usa
  `pg_restore --clean --if-exists` (`.dump`) o recrea `public` + `psql -f` (`.sql`). Sanitiza
  nombres (evita path traversal) y usa la URL sin `?schema=public`.
- `backups.module.ts` importa `AuthModule`.
- CLI equivalente (mismo directorio): `ppg backup|restore` / `pnpm db:backup|db:restore`.

### 2.11 Auth → `auth/`
  - `auth.controller.ts`: `login` (JWT + cookie httpOnly), `logout`, `me`, `PATCH preferences` (separador de miles).
  - `auth.service.ts`: `validate` (bcrypt) · `findById` · `setSeparadorMiles` · `sign` · `verify` · `toPublic`.
- Guards `guards/jwt-auth.guard.ts` (cookie → `req.user`) y `guards/roles.guard.ts` (`@Roles()`); decorator `decorators/roles.decorator.ts`.

### 2.12 Soporte transversal
- `prisma/prisma.service.ts` (15) — wrapper Prisma.
- `common/util.ts` (20) — `dec`, `isNumberOrStringNumber`, `toUom`, `toTipoComponente` (candidato a modularizar).
- `common/valores-permitidos.ts` (81) — `valoresPermitidosLote` (subconjunto de valores por eje, sin N+1).

---

## 3. Mapa de la Web (Next.js) — `apps/web/src`

Todas las páginas son `"use client"`, usan `api()` de `@/lib/api`, tipos de `@/lib/types`
y `AppShell` (excepto tienda y login).

### 3.1 Páginas

| Página | Archivo | Líneas | Funcionalidad |
|---|---|---|---|
| Inicio (dashboard) | `app/page.tsx` | 89 | pendientes (ventas abiertas, OFs activas, faltantes, bajo stock) + tarjetas de módulos |
| Lista productos | `app/productos/page.tsx` | 395 | grid/tabla + alta en modal; eliminar con fallback a desactivar |
| Detalle/edición producto | `app/productos/[id]/page.tsx` | — | datos base · atributos inline · ejes · grid · variantes ("Materializar combinación") · BOM · **pasos guiados (wizard)**. Editor inline compacto; heredados solo lectura. La fila navega a la página de variante |
| Página de variante | `app/productos/[id]/variantes/[vid]/page.tsx` | 262 | `ExistenciaDe` (`GET /inventario/existencia/:vid`): nombre/precio/mín/máx/notas/publicado/crítico/activo, atributos, existencia, empaques y movimientos |
| Ventas | `app/ventas/page.tsx` | 469 | lista/detalle/confirmar/despachar; alta en modal (`Modal` + `components/ventas/nueva-venta.tsx` 322): wizard de 3 pasos (Cliente → Producto → Revisión) con stepper y acciones fijas, alta de cliente inline (`components/clientes/cliente-form-modal.tsx`) + `modal-config-variante.tsx` (338) |
| Fabricación (OFs) | `app/fabricacion/page.tsx` | 431 | listar/acciones/detalle; **+ Nueva OF** y **Reponer** (mín/máx con preview) |
| Inventario | `app/inventario/page.tsx` | 797 | toolbar + 4 vistas (Por ubicación / Por variante / Por variante min max / Por producto); cantidad editable (`components/inventario/cantidad-editable.tsx`); export CSV cliente (`lib/csv.ts`) |
| Reportes de producción | `app/reportes/page.tsx` | 718 | form · bandeja · ubicar lotes; stats en `components/reportes/stats-produccion.tsx` (150) |
| Catálogos | `app/catalogos/page.tsx` | 332 | tabs categorías/empaques/atributos; atributos globales en `components/catalogos/atributos-globales.tsx` |
| Clientes | `app/clientes/page.tsx` | 293 | CRUD + import CSV en modal; vista Tabla/Grid (`components/clientes/cliente-card.tsx`); form compartido en `components/clientes/cliente-form-modal.tsx` (107) |
| Monitor stock | `app/monitor/page.tsx` | 156 | estado + acciones |
| Ajustes | `app/ajustes/page.tsx` | — | preferencias personales (separador de miles) |
| Respaldos | `app/backups/page.tsx` | — | crear punto de retorno / listar / descargar / restaurar / eliminar / subir `.dump`·`.sql` (sólo admin) |
| Storefront guiado | `app/tienda/[productId]/page.tsx` | — | público, sin AppShell; paneles por `panel`, cascada server-side, resolver+crear al confirmar |
| Login | `app/login/page.tsx` | 66 | pantalla de login |
| Shell | `components/app-shell.tsx` | 105 | layout auth-gated: sidebar, `GET /auth/me`, logout |

### 3.2 Librerías compartidas (`apps/web/src/lib/`)
- `api.ts` (31) — `api<T>(path, init)`: prepende `/api`, cookies, errores → `ApiError`.
- `types.ts` (408) — **todos** los tipos de dominio; añade aquí los tipos nuevos de forma centralizada.
- `pasos-cache.ts` — cachea 30 s `getPasos` por productId; `getPasosConSeleccion` (POST) para la cascada.
- `pasos-wizard.ts` — lógica compartida del wizard (paneles por `panel`, auto-selección, resolver).
- `csv.ts` (14) — `descargarCSV(nombre, filas)` con BOM para Excel.
- `local-store.ts` (81) — preferencias de UI en `localStorage` (`ppg.*`).
- `preferences.tsx` — `PreferencesProvider` + `usePreferences`/`useFormatCantidad` (separador de miles por usuario, persistido en BD).
- `avatar.ts` (13) — iniciales para avatares de clientes.

### 3.3 Componentes UI compartidos (`components/ui/`)
Reutilízalos en vez de inventar clases nuevas:
- `page-header.tsx` (37) · `modal.tsx` (45) · `confirm-dialog.tsx` (39) · `segmented.tsx` (31) · `help-note.tsx` (26).
- Estilos/tokens en `app/globals.css`. Eliminados por falta de uso: `badge.tsx`, `empty-state.tsx`.

---

## 4. Atajo: qué archivo tocar según la tarea

| Si quieres trabajar en… | Archivo(s) principal(es) |
|---|---|
| Nuevo atributo/variante/grid de producto | `productos.service.ts` (`grid` 430, `materializar` 434) · `productos.controller.ts` · `app/productos/[id]/page.tsx` |
| Editar BOM / componentes | `productos.service.ts:255` · `app/productos/[id]/page.tsx` (Lista de materiales) |
| Neteo de materiales / generar OFs | `ventas.service.ts:266` (`confirmar`, recursión inline) + `fabricacion/planificacion.service.ts` |
| Despachar línea / consumo de stock | `ventas.service.ts:309` |
| Reporte de producción / aplicar | `reportes.service.ts:222` |
| Alta manual de OF / reponer mín-máx | `fabricacion.service.ts:113` y `:175` |
| Inventario: entrada/salida/ajuste/transferencia | `inventario.service.ts` (`movimiento` 126, `ajuste` 181, `mover` 230) |
| Atributos globales / heredados | `catalogos.controller.ts` + `catalogos.atributos-producto.ts` |
| Storefront guiado / wizard de configuración | `public.service.ts` (`getPasos`, `resolverConfiguracion`) · `public.controller.ts` · `app/tienda/[productId]/page.tsx` · `components/ventas/modal-config-variante.tsx` · `lib/pasos-wizard.ts` |
| Editar los pasos guiados de un producto | `productos.service.ts` (`getPasos`/`setPasos`) · `app/productos/[id]/page.tsx` (sección "Pasos guiados") |
| Productos públicos (grid de ventas) | `public.service.ts` (`productosPublicos` ~98, filtra `Product.vendible`) · `public.controller.ts` |
| Precios / catálogo público | `public.service.ts` (`catalogo` 128) · `productos.service.ts` (`setVariantPrice` 378) |
| Alertas stock bajo / canales | `monitor.service.ts` (`afterStockChange` 104) + `monitor.notificadores.ts` |
| Alta/edición de cliente (reusada en ventas) | `components/clientes/cliente-form-modal.tsx` |
| UI compartida (modales, headers, tabs) | `components/ui/` + `app/globals.css` |
| Respaldos de la BD (punto de retorno) | `apps/api/src/backups/` · `app/backups/page.tsx` (UI) · `scripts/ppg.sh` (`backup`/`restore`) |
| Login / roles / JWT | `apps/api/src/auth/` |
| Tipos shared | `apps/web/src/lib/types.ts` |
| Esquema de BD / migraciones | `packages/db/prisma/schema.prisma` + `pnpm db:deploy` (ver `docs/development.md`) |
| Catálogo (cambiar ops/seed · estado · toolkit) | `docs/catalog-ops.md` + `docs/catalog-state.md` + `scripts/catalog/` |
| Datos / migración y reconciliación Odoo | `docs/scripts.md` |

---

*Mapa de líneas vivo: al refactorizar, actualiza este documento para que el agente siempre
apunte al archivo/zona correcta. Última revisión: 2026-10-04.*
