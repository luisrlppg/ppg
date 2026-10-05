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
  - `list` (siempre orden alfabético por `nombre`) 34 · `get` (detalle + componentes + variantes) 73 · `create` 122
  - `update` (registra `PriceChange`) 157 · `deactivate` 202
  - `setEjes` 209 · `setValoresPermitidos` 226 (tabla `ProductAttributeValue`) · `setComponentes` (BOM) 255 · `getPasos`/`setPasos` (wizard)
  - `variantesDeProducto` 276 · `buscarVariantes` 292 · `createVariant` 324 · `updateVariant` 341
  - `setVariantAttribute` 349 · `removeVariantAttribute` 370 · `setVariantPrice` 378 · `setPackagings` 401
  - `grid` 430 · `materializar` (crea UNA variante puntual, idempotente) 434
  - `eliminarVariante` (chequea historial; 409 con motivos) 493 · `eliminarProducto` (hard delete sin historial) 513
  - `resolveComponentVariant` (resuelve variante de componente BOM; lo usan ventas/inventario) 649 — desempate determinista: `PREFERENCIAS_RESOLUCION` (`Versión del vástago = Nuevo`) → mayor stock → menor id
- `productos.grid.ts` (111): `slugify`, tipos `GridEje`/`GridVarianteExistente`/`Grid`.
  - `ejesProducto` (atributo + valores permitidos, sin producto cartesiano) y `variantesExistentes` (`valueIds` alineados al orden de ejes).
  - `gridProducto = { ejes, existentes }`; **no** devuelve el cartesiano (antes producto 15 → 489k combos/160 MB/7.5 s).
  - Valores permitidos con `valoresPermitidosLote` (`common/valores-permitidos.ts`, batcheado, sin N+1); si no hay filas → todos los valores del atributo.
  - La generación masiva (`generar`/`combinacionesCartesianas`) fue **retirada**.

### 2.2 Ventas / desglose → `ventas/`
- `ventas.controller.ts` — rutas `/api/ventas...`
- `ventas.service.ts`, zonas:
  - `list` · `get` (cada línea incluye `imagen = variant.imagen ?? product.imagen`) · `create` · `update`
  - **`confirmar` = DESGLOSE**: calcula el desglose neto vía `planificacion.desglosar` y persiste `resumen` (`fabricar`/`comprar`) + `confirmadaAt`. **No** crea órdenes.
  - **`desglose`** (`GET /ventas/:id/desglose`): explosión neta multi-nivel en vivo (requerido / stock / faltante por variante). Devuelve `lineas` (lista plana agregada, la usa Fabricación) **y** `arbol` (árbol de nodos por línea vendida con sus componentes, para la vista plegable de la web).
  - `despacharLinea` (consume stock; **ensambles** (2+ componentes): consume sus componentes al despachar, sin stock propio; dispara monitor) · `cancelar`.
- `ventas.types.ts`: `ResumenItem`, `ResumenNeteo`, `ConfiguracionLinea` + re-export de `Desglose`/`DesgloseLinea`/`DesgloseNodo` (definidos en `fabricacion/planificacion.service.ts`).
- Acoplos: inyecta `planificacion.service` (`desglosar`/`consumirEnsamble`) y `monitor.service`.

### 2.3 Reportes de producción → `reportes/`
- `reportes.controller.ts` (127) — rutas `/api/reportes...`
- `reportes.service.ts` (414), zonas:
  - `list` 53 · `ultimo` (prefill) 104 · `get` 139 · `crear` 171 · `editar` 197 (`list`/`ultimo` excluyen reportes `interno`)
  - **`aplicar`** (mueve stock final/consumo; **ya no cierra la OF**) 222 · `cancelar` 297 · `lotes` 307 (incluye reportes internos) · `ubicar` 333
  - `stats` 394 y `exportar` 399 delegan en módulos externos (excluyen reportes `interno`)
- `reportes.constants.ts` (11): `TURNOS`, `SECCIONES`, `HORAS_TURNO`.
- `reportes.stats.ts` (72): métricas de productividad. `reportes.export.ts` (55): CSV.

### 2.4 Inventario / stock → `inventario/`
- `inventario.controller.ts` (152) — rutas `/api/inventario...` (rutas estáticas antes de `:param`)
- `inventario.service.ts` (323):
  - `ubicaciones` 15 · `crearUbicacion` 19 · `editarUbicacion` 25
  - `existencia` 38 · `existenciaDe` 75 · `movimientos` 114
  - `movimiento` (entrada/salida: upsert stock + `StockMove` + monitor) 124 · `ajuste` (cantidad absoluta + delta `motivo: ajuste`) 179 · `mover` (transferencia) 228
  - `setMinMax` (`PATCH /inventario/variantes/:vid/minmax`: mín/máx de variante desde la tabla; todos los roles) 284 · `exportarCSV` 309
- **Retirado (2026-10-02):** el ensamble BOM de inventario (`inventario.ensamble.ts` / `POST /inventario/ensamble`) se eliminó. El enum `MotivoStock.ensamble` se conserva para histórico.

### 2.5 Necesidades de fabricación → `fabricacion/`
- `fabricacion.controller.ts` · `fabricacion.service.ts`:
  - **`necesidades`** (`GET /fabricacion/necesidades`): faltantes vivos en dos listas: `porMinimo` (fabricables bajo stock objetivo; `objetivo = max>0?max:min`) y `porVentas` (explosión neta de las ventas **abiertas confirmadas** con pool compartido de stock, incluye ensambles como ítem *Armar*), más `porComprar` (no fabricables).
  - **`registrarProduccion`** (`POST /fabricacion/produccion {variantId, cantidad, locationId}`): entrada de stock (motivo `produccion`) a la ubicación elegida + monitor. Solo hojas fabricables (0–1 componente); rechaza ensambles.
  - `faltantes` (pendientes de compra agregados desde `resumen.comprar`).
- `planificacion.service.ts`: `desglosar(tx, demandas)` (explosión neta multi-nivel con pool de stock; devuelve `lineas` agregadas + `arbol` de nodos `DesgloseNodo` por raíz; la usan ventas y necesidades) y `consumirEnsamble(tx, variantId, cantidad, ref, userId)` (consume componentes de un ensamble contra pedido al despachar).
- **No hay entidad OF** (retirada 2026-10-05): la producción se registra como stock y los ensambles se consumen al despachar.

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
- **Página web retirada (2026-10-05):** `app/monitor/page.tsx` se eliminó (la vista vive ahora en
  Inventario/Fabricación). El módulo backend y los disparadores de stock siguen vigentes; el
  dashboard aún consume `GET /monitor/stock-bajo` para el conteo de bajo stock.

### 2.9 Clientes / partners → `clientes/`
- `clientes.controller.ts` (87) · `clientes.service.ts` (137): `list`/`get`/`create`/`update`/`deactivate` + `importar` (CSV).

### 2.10 Respaldos de BD → `backups/`
- `backups.controller.ts` — `@Controller("backups")` **sólo `admin`** (`JwtAuthGuard`+`RolesGuard`):
  - `GET backups` (listar) · `POST backups` (crear, body `{nombre?}`)
  - `POST backups/:nombre/restaurar` · `POST backups/subir` (multipart campo `archivo`)
  - `GET backups/:nombre/descargar` (stream) · `DELETE backups/:nombre`
- `backups.service.ts`: opera `docs/backups/` (en el stack se monta en el contenedor api); `pg_dump -Fc`
  al crear; al restaurar usa `pg_restore --clean --if-exists` (`.dump`) o recrea `public` + `psql -f`
  (`.sql`), y **luego aplica `prisma migrate deploy`** (sin pnpm) para no quedar desactualizado.
  La imagen api incluye el cliente PostgreSQL 18. Sanitiza
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

### 2.13 Costos (estándar por producto) → `costos/`
- `costos.controller.ts` — `@Controller("costos")` (`admin`/`supervisor`): `GET /costos` (lista + desglose + precio/margen),
  `GET /costos/:productId` (detalle + receta cruda), `PUT /costos/:productId` (upsert receta + materiales, `$transaction`),
  `DELETE /costos/:productId` (limpia receta).
- `costos.service.ts`: `list` · `get` · `upsert` · `remove` · `calcular` (materiales = `costoCompra` + Σ líneas;
  M.O. = horas×tarifa; máquina = horas×tarifa; molde = costo/piezas; ensamble; empaque) y `referenciaPrecio`
  (precio = `basePrice` o mínimo si es 0) para margen de **solo lectura**.
- **v1 separada del ERP:** captura manual por producto, sin historial ni merma y **sin** enlazar a los precios de
  venta todavía (ver `docs/roadmap.md`). Modelo: `ProductCost` + `ProductCostMaterial` (`docs/data-model.md`).

---

## 3. Mapa de la Web (Next.js) — `apps/web/src`

Todas las páginas son `"use client"`, usan `api()` de `@/lib/api`, tipos de `@/lib/types`
y `AppShell` (excepto tienda y login).

### 3.1 Páginas

| Página | Archivo | Líneas | Funcionalidad |
|---|---|---|---|
| Inicio (dashboard) | `app/page.tsx` | 89 | pendientes (ventas abiertas, necesidades de fabricación, pendientes de compra, bajo stock) + tarjetas de módulos |
| Lista productos | `app/productos/page.tsx` | 402 | grid/tabla + alta en modal; sin botón eliminar (el borrado vive en el detalle del producto) |
| Detalle/edición producto | `app/productos/[id]/page.tsx` | — | datos base · atributos inline · ejes · grid · variantes ("Materializar combinación") · BOM · **pasos guiados (wizard)**. Editor inline compacto; heredados solo lectura. La fila navega a la página de variante |
| Página de variante | `app/productos/[id]/variantes/[vid]/page.tsx` | 262 | `ExistenciaDe` (`GET /inventario/existencia/:vid`): nombre/precio/mín/máx/notas/publicado/crítico/activo, atributos, existencia, empaques y movimientos |
| Ventas | `app/ventas/page.tsx` | 516 | lista/detalle/confirmar/despachar/**imprimir**; en el detalle el **desglose de componentes** es **siempre visible** y se agrupa en **árbol por producto vendido**: cada línea vendida es el nodo raíz (badge *Vendido*) con toggle para plegar/desplegar sus componentes (arrancan **desplegados**), que se listan aplanados con sangría por profundidad; muestra necesita/stock/falta + estado (Fabricar/Ensamblar/Comprar); alta en modal (`Modal` + `components/ventas/nueva-venta.tsx` 370): wizard de 3 pasos (Cliente → Producto → Revisión) con stepper y acciones fijas; el paso 2 es una **lista filtrable de productos** (clic abre modal según el producto): `modal-config-variante.tsx` (wizard, productos con pasos) o `modal-seleccion-variante.tsx` (productos sin pasos: `<select>` por eje desde `GET /productos/:id/grid`, sólo valores materializados; fallback a lista plana); alta de cliente inline (`components/clientes/cliente-form-modal.tsx`). Documento de venta en PDF: `components/ventas/documento-venta.tsx` (overlay que **regenera el PDF** con `pdf().toBlob()` de `@react-pdf/renderer` al cambiar el contenido y lo muestra en un `<iframe>`; botón "Descargar PDF", toggle IVA 16%, imágenes precargadas a dataURL con fallback a iniciales) y layout en `components/ventas/documento-venta-pdf.tsx` (`DocumentoPDF`; muestra el desglose de atributos de la variante desde `valoracion` y columnas numéricas centradas) |
| Fabricación (necesidades) | `app/fabricacion/page.tsx` | 281 | **Por ventas** primero, luego **Por mínimo** (colapsable, arranca cerrado) —fabricables faltantes; ensambles como *Armar* solo lectura— + **Pendientes de compra**; botón **Ingresar producción** (`GET /inventario/ubicaciones` → `POST /fabricacion/produccion`) con paso extra para elegir ubicación |
| Inventario | `app/inventario/page.tsx` | 779 | toolbar + 3 vistas (Por ubicación / Por variante / Min Max); cantidad editable y mín/máx editables (`components/inventario/cantidad-editable.tsx`); export CSV cliente (`lib/csv.ts`) |
| Reportes de producción | `app/reportes/page.tsx` | 693 | form · bandeja · ubicar lotes; stats en `components/reportes/stats-produccion.tsx` (150) |
| Catálogos | `app/catalogos/page.tsx` | 332 | tabs categorías/empaques/atributos; atributos globales en `components/catalogos/atributos-globales.tsx` |
| Costos | `app/costos/page.tsx` | — | costo estándar por producto: tabla con desglose + editor en `Modal` (materiales por líneas, compra, M.O., máquina, molde, ensamble, empaque, notas) con resumen en vivo y margen (solo lectura). Sólo `admin`/`supervisor`; en el menú vive en la sección **Administración** |
| Clientes | `app/clientes/page.tsx` | 293 | CRUD + import CSV en modal; vista Tabla/Grid (`components/clientes/cliente-card.tsx`); form compartido en `components/clientes/cliente-form-modal.tsx` (107) |
| Ajustes | `app/ajustes/page.tsx` | — | preferencias personales (separador de miles); en el menú encabeza la sección **Ajustes** |
| Respaldos | `app/backups/page.tsx` | — | crear punto de retorno / listar / descargar / restaurar / eliminar / subir `.dump`·`.sql` (sólo admin); en el menú vive en la sección **Ajustes** |
| Storefront guiado | `app/tienda/[productId]/page.tsx` | — | público, sin AppShell; paneles por `panel`, cascada server-side, resolver+crear al confirmar |
| Login | `app/login/page.tsx` | 66 | pantalla de login |
| Shell | `components/app-shell.tsx` | — | layout auth-gated: **menú lateral** colapsable (persistido en `ppg.sidebar.collapsed`), con **secciones colapsables** de encabezado (**Administración** [admin/supervisor] → Costos; **Ajustes** → Ajustes/Respaldos; estado en `ppg.sidebar.section.<id>`, se auto-abre la sección de la ruta activa). `useAuth()` del `PreferencesProvider` global, logout |

### 3.2 Librerías compartidas (`apps/web/src/lib/`)
- `api.ts` (31) — `api<T>(path, init)`: prepende `/api`, cookies, errores → `ApiError`.
- `types.ts` (408) — **todos** los tipos de dominio; añade aquí los tipos nuevos de forma centralizada.
- `pasos-cache.ts` — cachea 30 s `getPasos` por productId; `getPasosConSeleccion` (POST) para la cascada.
- `pasos-wizard.ts` — lógica compartida del wizard (paneles por `panel`, auto-selección, resolver).
- `csv.ts` (14) — `descargarCSV(nombre, filas)` con BOM para Excel.
- `local-store.ts` (81) — preferencias de UI en `localStorage` (`ppg.*`).
- `preferences.tsx` — `PreferencesProvider` (montado en `app/layout.tsx`, raíz) que hace el `GET /auth/me` y expone `useAuth`/`usePreferences`/`useFormatCantidad` (separador de miles por usuario, persistido en BD). **Debe quedar por encima del shell y las páginas**: el contexto sólo fluye hacia abajo.
- `avatar.ts` (13) — iniciales para avatares de clientes.

### 3.3 Componentes UI compartidos (`components/ui/`)
Reutilízalos en vez de inventar clases nuevas:
- `page-header.tsx` (37) · `modal.tsx` (45) · `confirm-dialog.tsx` (39) · `segmented.tsx` (31) · `help-note.tsx` (26) · `sticky-bar.tsx` (buscador/filtros fijos).
- Estilos/tokens en `app/globals.css`. Eliminados por falta de uso: `badge.tsx`, `empty-state.tsx`.
- **Scroll + fijos:** el área de contenido (`.content` en `app-shell.tsx`) es el contenedor de scroll (`height:100dvh; overflow:auto`); el sidebar queda fijo. `StickyBar` mide su alto y setea `--sticky-head`, que usan los `th` de `.table` para pegarse justo debajo del buscador. Por eso las tarjetas que envuelven tablas **no** deben usar `overflow:hidden` ni `.table-wrap` debe scrollear (el scroll horizontal lo hace `.content`).

---

## 4. Atajo: qué archivo tocar según la tarea

| Si quieres trabajar en… | Archivo(s) principal(es) |
|---|---|
| Nuevo atributo/variante/grid de producto | `productos.service.ts` (`grid` 430, `materializar` 434) · `productos.controller.ts` · `app/productos/[id]/page.tsx` |
| Editar BOM / componentes | `productos.service.ts:255` · `app/productos/[id]/page.tsx` (Lista de materiales) |
| Desglose de componentes / necesidades de fabricación | `ventas.service.ts` (`desglose`, `confirmar`) + `fabricacion/fabricacion.service.ts` (`necesidades`, `registrarProduccion`) + `fabricacion/planificacion.service.ts` (`desglosar`) |
| Despachar línea / consumo de stock (ensambles consumen componentes) | `ventas.service.ts` (`despacharLinea`) + `planificacion.service.ts` (`consumirEnsamble`) |
| Documento de venta PDF (IVA, imagen) | `components/ventas/documento-venta.tsx` (overlay/descarga) · `components/ventas/documento-venta-pdf.tsx` (layout `@react-pdf/renderer`) · `app/ventas/page.tsx` (overlay `imprimirVenta`) · `ventas.service.get` (`imagen`) |
| Reporte de producción / aplicar | `reportes.service.ts` (`aplicar`) |
| Panel de Fabricación: mínimos, ventas y alta de producción | `fabricacion.service.ts` (`necesidades`, `registrarProduccion`) · `app/fabricacion/page.tsx` |
| Inventario: entrada/salida/ajuste/transferencia | `inventario.service.ts` (`movimiento` 126, `ajuste` 181, `mover` 230) |
| Atributos globales / heredados | `catalogos.controller.ts` + `catalogos.atributos-producto.ts` |
| Storefront guiado / wizard de configuración | `public.service.ts` (`getPasos`, `resolverConfiguracion`) · `public.controller.ts` · `app/tienda/[productId]/page.tsx` · `components/ventas/modal-config-variante.tsx` (con pasos) · `components/ventas/modal-seleccion-variante.tsx` (selector por eje con `<select>`, sin pasos) · `lib/pasos-wizard.ts` |
| Editar los pasos guiados de un producto | `productos.service.ts` (`getPasos`/`setPasos`) · `app/productos/[id]/page.tsx` (sección "Pasos guiados") |
| Productos públicos (lista de ventas) | `public.service.ts` (`productosPublicos` ~112, filtra `Product.vendible`) · `public.controller.ts` |
| Precios / catálogo público | `public.service.ts` (`catalogo` 128) · `productos.service.ts` (`setVariantPrice` 378) |
| Costo estándar por producto / desglose / margen | `apps/api/src/costos/` · `app/costos/page.tsx` (sección de menú **Administración**) |
| Alertas stock bajo / canales | `monitor.service.ts` (`afterStockChange` 104) + `monitor.notificadores.ts` (**sin página web**; bajo stock se ve en Inventario/Fabricación) |
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
apunte al archivo/zona correcta. Última revisión: 2026-10-05.*
