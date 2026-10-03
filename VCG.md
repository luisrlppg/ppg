# VCG.md — Vibe Coding Guide (PPG ERP)

Guía para que una herramienta de *vibe coding* (o un agente) modifique este proyecto
correctamente: **qué hace cada archivo, en qué parte exacta vive cada funcionalidad**,
y qué convenciones respetar al tocar código.

> Regla de oro: **antes de modificar, lee el archivo indicado en la sección que te
> corresponda y respeta los números de línea como referencia de la zona de trabajo.**
> No asumas que una funcionalidad vive donde "suena lógico": usa este mapa primero.

---

## 1. Stack y comandos

Monorepo con `pnpm` workspaces: `apps/api` (NestJS, puerto **3001**) + `apps/web`
(Next.js App Router, puerto **3000**, proxy `/api` → 3001) + `packages/db` (Prisma).

```bash
export PNPM_HOME="$HOME/.local/share/pnpm"   # pnpm instalado independiente de corepack
export PATH="$PNPM_HOME/bin:$PATH"

pnpm install                # instalar / sincronizar dependencias
pnpm dev                    # levanta api (3001) + web (3000) con hot-reload en paralelo
pnpm dev:api / dev:web      # levantar solo uno
pnpm --filter @ppg/api build
pnpm db:deploy              # APLICAR migraciones SIN interactividad (usar SIEMPRE en shell no-TTY/CI)
pnpm db:seed                # auth + catálogos + ubicaciones + clientes + atributos + productos base
pnpm db:seed:products       # BOM + ejes + passos del storefront (requiere productos ya sembrados)
pnpm db:studio              # visor de datos Prisma
```

> **¡IMPORTANTE!** `prisma migrate dev` es **interactivo** y se CONGELA en shells sin
> TTY (como el de una herramienta de coding). Para aplicar migraciones en configuraciones
> no interactivas usa **siempre** `pnpm db:deploy` (usa `migrate deploy`).

### Flujo estándar de cambio (leer antes de tocar nada)

1. Identifica la funcionalidad en la sección 3 o 4 de abajo.
2. Lee el/los archivo(s) indicados, empezando por las líneas que se te dan.
3. Respeta los patrones (Sección 6).
4. Si cambias el esquema de datos (`packages/db/prisma/schema.prisma`): crea migración
   con `pnpm --filter @ppg/db exec prisma migrate dev --name <nombre> --create-only`,
   revisa el SQL, y aplica con `pnpm db:deploy`. No edites migraciones ya aplicadas.
5. Valida con `pnpm --filter @ppg/api build` y comprobando en `http://localhost:3000`.

---

## 2. Credenciales

- Admin: `admin` / `admin123`
- BD (PostgreSQL directo, no Docker): `postgresql://ppg:ppg@localhost:5432/ppg`
- Puertos: API 3001, Web 3000, Postgres 5432

---

## 3. Mapa de la API (NestJS) — `apps/api/src`

Todos los módulos autenticados usan `JwtAuthGuard + RolesGuard` y tienen 3 roles:
`admin`, `supervisor`, `operador`. Solo `auth` (login), `catalogos` y `public` son **públicos**.

### 3.1 Productos / variantes / grid / BOM  → `productos/`
- **Controller `productos.controller.ts`** (207 líneas) — rutas `/api/productos...`
- **Service `productos.service.ts`** (**472 líneas**), secciones:
  - `list` 27‑64 · `get` (detalle + componentes + variantes) 65‑113 · `create` 114‑148
  - `update` (registra cambio de precio en `PriceChange`) 149‑193 · `deactivate` 194‑199
  - `setEjes` 201‑217 · `setComponentes` (BOM) 247‑266
  - `setValoresPermitidos` 218‑246 — restringe los **ejes**: subconjunto de valores del atributo válidos para el producto (tabla `ProductAttributeValue`). Lo consume `PUT /productos/:id/ejes/:attributeId/valores`
  - Variantes: `variantesDeProducto` 268‑283 · `buscarVariantes` 284‑315 · `createVariant` 316‑332 · `updateVariant` 333‑339 · `setVariantPrice` 340‑362 · `setPackagings` 363‑374 · `inheritPackagingsToVariant` 375‑390
  - **`grid` · `materializar`** (delegan en `productos.grid.ts`)
  - **`eliminarVariante`** (chequea historial: stock, movimientos, precios, ventas, OFs, uso como componente, reportes; 409 con motivos) ·
    **`eliminarProducto`** (hard delete si sus variantes no tienen historial y no se usa como componente; 409 con motivos). Lo consume
    `DELETE /productos/variantes/:vid` y `DELETE /productos/:id/definitivo` (`DELETE /productos/:id` sigue siendo desactivar).
  - **`resolveComponentVariant`** (resuelve variante de componente BOM; lo consumen ventas e inventario)
- **`productos.grid.ts`**: `slugify` + tipos `GridEje`, `GridVarianteExistente`, `Grid`.
  - **`ejesProducto`**: ejes (atributo + valores permitidos) en O(ejes), **sin** producto cartesiano.
  - **`variantesExistentes`**: variantes materializadas con `valueIds` alineados al orden de ejes (acotado por nº de variantes).
  - **`gridProducto` = `{ ejes, existentes }`**: ya **no** devuelve `combinaciones` (antes generaba el cartesiano completo:
    p.ej. producto 15 → 489.888 combos / 160 MB / ~7,5 s; ahora ~1,8 KB / ~25 ms).
  - **`materializar`** valida `valueIds` contra los ejes y busca/crea la variante puntual (idempotente), sin cartesiano.
  - **Nota:** la generación masiva (`generar`/`combinacionesCartesianas`) fue **retirada** (código muerto, sin uso en UI/scripts).
  - **Ejes con subconjunto de valores:** `ejesProducto` usa `valoresPermitidosLote` (`common/valores-permitidos.ts`), batcheado (sin N+1 por eje).
    Si no hay filas en `ProductAttributeValue` para el par (producto, atributo) → se asumen **todos** los valores del atributo (fallback).
    El storefront (`getPasos`) y `atributos/producto` (con `permitidos`) usan el mismo helper.
  - **Compatibilidad (solo ventas):** `getPasos` agrupa variantes **publicadas** por valor y el cliente cruza `variantId`
    entre pasos para descartar opciones. Es un flujo independiente de `productos.grid.ts`; en el alta de producto
    toda combinación de valores permitidos es válida (no hay reglas de compatibilidad).

### 3.2 Ventas / neteo / OFs  → `ventas/`
- **Controller `ventas.controller.ts`** (107 líneas) — rutas `/api/ventas...`
- **Service `ventas.service.ts`** (**497 líneas**), secciones:
  - `list` 43‑82 · `get` (con OFs asociados) 84‑156 · `create` 158‑219 · `update` 221‑274
  - **`confirmar` = NETEO + CASCADA DE OFs** 281‑402 (lo más crítico):
    - `$transaction` + `load` (carga de BOM `exacto` con caché) ~292
    - `netear` = demanda neta recursiva multi‑nivel con detección de ciclos ~319
    - **generación de OFs `fabricacion`/`ensamble` inline** (con `configuracion` + ensamble) ~343
    - persiste `resumen` (neteo) en la venta
  - `despacharLinea` (consume stock, dispara monitor) 404‑482 · `cancelar` 484‑
- **`ventas.types.ts`** (18 líneas): tipos compartidos `ResumenItem`, `ResumenNeteo`,
  `ConfiguracionLinea` (re-exportados desde `ventas.service` para no romper `fabricacion.service`).
- **Nota (2026‑09‑30):** `ventas.ofs.ts` **ya no existe**: la recursión de OFs quedó **inline en
  `confirmar`** tras corregir el doble bucle (ver §7). No busques un archivo `ventas.ofs.ts`.
- **Acoplamientos:** inyecta `productos.service` (`resolveComponentVariant`) y `monitor.service`. El tipo `ResumenItem` lo importa `fabricacion.service`.

### 3.3 Reportes de producción  → `reportes/`
- **Controller `reportes.controller.ts`** (127 líneas) — rutas `/api/reportes...`
- **Service `reportes.service.ts`** (**414 líneas**):
  - `list` 53‑103 · `ultimo` (prefill) 104‑137 · `get` 139‑169 · `crear` 171‑195 · `editar` 197‑220
  - **`aplicar`** (mueve stock final/consumo, cierra OF) 222‑295 · `cancelar` 297‑306 · `lotes` 307‑331 · `ubicar` 333‑392
  - `validar` (helpers) ~403 · `stats` 394‑397 y `exportar` 399‑402 delegan en módulos externos
- **`reportes.constants.ts`** (11 líneas): constantes `TURNOS`, `SECCIONES`, `HORAS_TURNO` + tipos `Turno`, `Seccion` (re-exportados desde `reportes.service`).
- **`reportes.stats.ts`** (72 líneas): métricas de productividad (`estadisticas`).
- **`reportes.export.ts`** (55 líneas): exportación CSV (`exportarReportes`).

### 3.4 Inventario / stock  → `inventario/`
- **Controller `inventario.controller.ts`** — rutas `/api/inventario...` (OJO: rutas estáticas antes de las `:param`)
- **Service `inventario.service.ts`**:
  - `ubicaciones` · `existencia` · `existenciaDe`
  - `movimiento` (entrada/salida: upsert stock + StockMove + monitor) · `mover` (transferencia) · **`ajuste`** (fija la cantidad absoluta y registra el delta con `motivo: ajuste`)
  - `exportarCSV`
- **Retirado (2026-10-02):** la operación de ensamble BOM de inventario (`inventario.ensamble.ts` / `POST /inventario/ensamble`) se eliminó. "Ensamble" queda solo como **tipo de OF** (2+ componentes exactos). El enum `MotivoStock.ensamble` se conserva para datos históricos.

### 3.5 Órdenes de fabricación  → `fabricacion/`
- **Controller `fabricacion.controller.ts`**; **Service `fabricacion.service.ts`**
  - `list` (filtro por estado/tipo/**origen**/search) · `get` · `iniciar` · `cancelar` · `faltantes` (pendientes de compra agregadas de ventas)
  - **`crearManual`** — alta manual de OF (exactamente N), `origen: manual`
  - **`previewReponer` / `reponer`** — reaprovisionamiento hasta `stockMin`/`stockMax` en cascada, `origen: reposicion_minimo|maximo`
- **`planificacion.service.ts`**: `planificar(tx, demandas, { netearRaiz })` (neteo recursivo contra stock + resolución de variantes de componente) y `crearOFs(tx, plan, { origen, ... })`. Lo usan `ventas.confirmar` (`netearRaiz: true`) y la fabricación manual/reposición (`false`).
- Las OFs guardan `origen` (`OrigenOF`: venta | manual | reposicion_minimo | reposicion_maximo); las de venta se ligan a `salesOrderLineId` y muestran cliente.
- Nota: el **cierre de OF a "hecha"** ocurre desde `reportes.service` (`aplicar`), no aquí.

### 3.6 Catálogos (atributos / categorías / empaques)  → `catalogos/`
- **Controller `catalogos.controller.ts` (271 líneas)** — `@Controller("catalogos")` **público, sin guards**.
- **NO tiene service**: usa `PrismaService` directo.
  - categorías CRUD 56‑89 · empaques CRUD 90‑111 · atributos listar/crear 112‑154 · editar/eliminar 155‑191
  - valores add/del 192‑227 · asignar/desasignar atributo 234‑270
  - **`atributos/producto/:id`** (propios + heredados) 228‑233 delega a `catalogos.atributos-producto.ts`
- **`catalogos.atributos-producto.ts`** (87 líneas): atributos propios + **heredados por recursión BOM** (`atributosPorProducto`).

### 3.7 Storefront público  → `public/`
- **Controller `public.controller.ts`** (53 líneas) — `@Controller("public")` **público**
  - Rutas: `GET public/productos` (productos públicos) · `GET public/productos/:id/pasos` (pasos guiados) · `POST public/orders` · `GET public/orders/:numero` · `GET public/catalog`
- **Service `public.service.ts`** (**210 líneas**):
  - `crearPedido` 31‑72 (precio recalculado en servidor, §7.7) · `consultarPedido` 73‑97 · `productosPublicos` 98‑127 (productos con ≥1 variante activa y publicada; agrupados por producto, sin precios en la UI) · `catalogo` 128‑145 (variantes publicadas)
  - **`getPasos`** 146‑ (arma pasos guiados con opciones/stock): las opciones de cada paso se resuelven desde las **variantes publicadas del producto navegado** (`productId`), **no** del `variantProductId` (los componentes pueden no tener variantes). `variantProductId` solo se conserva en la respuesta. Compartido por tienda y modal de ventas. **Batcheado sin N+1:** 1 query de valores + 1 de variantes publicadas (con `variantAttributes`+`stockLevels`) agrupadas en memoria; los valores permitidos usan `valoresPermitidosLote` (`common/valores-permitidos.ts`). En web, `lib/pasos-cache.ts` cachea el resultado 30s por productId.

### 3.8 Monitor de stock bajo + notificaciones  → `monitor/`
- **Controller `monitor.controller.ts`** (73 líneas) — rutas `/api/monitor...`
- **Service `monitor.service.ts`** (**240 líneas**):
  - getter `configs` de canales · `canalesConfigurados` · `listarBajo` 66‑98
  - **`afterStockChange`** 104‑164 (disparador post‑movimiento, notifica solo al pasar a bajo)
  - `checkAll` 165‑190 · `enviarAlerta` 192‑207 · `enviarPrueba` 208‑214 · `enviar` 215‑ (registra `NotificationEvent` y delega en `Notificadores`)
- **`monitor.notificadores.ts`** (76 líneas): clase `Notificadores` con `sendTelegram` / `sendCallMeBot` / `sendEmail` (envío a canales + configs).

### 3.9 Clientes / partners  → `clientes/`
- **Controller `clientes.controller.ts`** (79 líneas); **Service `clientes.service.ts`** (**109 líneas**):
  - `list` 9‑28 · `get` 30‑37 · `create` 39‑45 · `update` 47‑63 · `deactivate` 65‑70 · `importar` (CSV) 74‑109

### 3.10 Auth  → `auth/`
- **Controller `auth.controller.ts`** (92 líneas): `login` (firma JWT + cookie httpOnly), `logout`, `me` (JwtAuthGuard)
- **Service `auth.service.ts`** (78 líneas): `validate` (bcrypt) 28‑37 · `findById` 39‑52 · `sign` 54‑62 · `verify` 63‑69 · `toPublic` 71‑78
- **Guards:** `guards/jwt-auth.guard.ts` (cookie → `req.user`), `guards/roles.guard.ts` (`@Roles()`)
- **Decorator:** `decorators/roles.decorator.ts`

### 3.11 Soporte transversal
- `prisma/prisma.service.ts` (15 líneas) — wrapper Prisma
- `common/util.ts` (20 líneas) — helpers mezclados: `dec`, `isNumberOrStringNumber`, `toUom`, `toTipoComponente` (candidato a modularizar)
- `common/valores-permitidos.ts` (81 líneas) — `valoresPermitidosLote` (subconjunto de valores por eje, batcheado, sin N+1)
- `app.module.ts` — registra los 11 módulos

---

## 4. Mapa de la Web (Next.js) — `apps/web/src`

Todas las páginas son **`"use client"`**, usan `api()` de `@/lib/api`, tipos de
`@/lib/types`, y `AppShell` (excepto tienda). Sin Redux/react‑query: todo es `useState`
local + `fetch` manual.

### Páginas y zonas de trabajo

| Página | Archivo | Líneas | Funcionalidad |
|--------|---------|--------|---------------|
| Detalle/edición de producto | `app/productos/[id]/page.tsx` | **954** | datos base · atributos inline · ejes legacy · grid · variantes (incluye "Materializar combinación"; la fila navega a la página de variante, ya no edita nombre inline) · BOM. Editor **inline compacto**: fila colapsable por atributo con chips de valores del eje (× para quitar) y "+ Valor" que expande checkboxes + input inline. Heredados en solo lectura. Los empaques se movieron a la página de variante (se eliminó `components/productos/empaques-por-variante.tsx`) |
| Página de variante | `app/productos/[id]/variantes/[vid]/page.tsx` | **262** | carga `ExistenciaDe` (`GET /inventario/existencia/:vid`): edita nombre/precio/mín‑máx/notas/publicado/crítico/activo; atributos, existencia por ubicación, empaques (`components/productos/empaques-variante.tsx`) y movimientos. Eliminar con bloqueo explicado |
| Inicio (dashboard) | `app/page.tsx` | **89** | pendientes (ventas abiertas, OFs activas, faltantes, bajo stock) en `stat-grid` + tarjetas de módulos. Usa `PageHeader` |
| Reportes de producción | `app/reportes/page.tsx` | **718** | form 100‑240 · bandeja 241‑328 · ubicar lotes 329‑385 · UI 386‑ — stats extraídas en `components/reportes/stats-produccion.tsx` (150 líneas) |
| Ventas | `app/ventas/page.tsx` | **472** | lista/detalle/confirmar/despachar 24‑123 · UI 124‑400 · lista 401‑. Alta en `components/ventas/nueva-venta.tsx` (167) desde **grid de productos públicos** + **modal guiado** `components/ventas/modal-config-variante.tsx` (**338**). Sin búsqueda libre de variantes |
| Catálogos | `app/catalogos/page.tsx` | **332** | tabs por sección (categorías/empaques/atributos) con `HelpNote`; atributos globales extraídos en `components/catalogos/atributos-globales.tsx` (207 líneas) |
| Lista productos | `app/productos/page.tsx` | **293** | grid de productos + alta en modal. Ya **no** tiene tabs de catálogos base (se movieron a `/catalogos`) |
| Storefront guiado (6 pasos) | `app/tienda/[productId]/page.tsx` | **422** — público, sin AppShell | `buildPaneles` 30‑66 · carga 67‑94 · selección/filtrado por conjunto de variantes `opcionesDelPaso` 103‑127 · paneles 146‑156 · envío 168‑. Iconos placeholder (sin imágenes) |
| Inventario | `app/inventario/page.tsx` | **797** | toolbar de acciones 52‑117 (entrada/ajuste, transferir, ensamblar) · nueva ubicación 118‑130 · UI en **modales** + toggle de 4 vistas: **Por ubicación** (ubicación con `rowSpan` → variantes, con botón "Filtrar ubicación" que abre modal), **Por variante** (`variante · ubicación · cantidad`), **Por variante min max** (Stock/Mín/Máx) y **Por producto** (suma). Cantidad editable en las dos primeras. Export CSV en cliente según vista (`lib/csv.ts`) |
| Clientes | `app/clientes/page.tsx` | **229** | CRUD 18‑80 · import CSV 81‑. Con `PageHeader` |
| Fabricación (OFs) | `app/fabricacion/page.tsx` | **207** | listar 26‑56 · acciones iniciar/cancelar 61‑80 · detalle inline · faltantes. Leyenda de estados |
| Monitor stock | `app/monitor/page.tsx` | **156** | estado 24‑38 · acciones 39‑. Con `PageHeader` |
| Login | `app/login/page.tsx` | 66 | pantalla de login |
| Shell | `components/app-shell.tsx` | 106 | layout auth‑gated: sidebar, `GET /auth/me`, logout. El link "Productos" también marca activa `/catalogos` (`match`) |

### Librerías compartidas
- `lib/api.ts` (31 líneas) — `api<T>(path, init)`: prepende `/api`, cookies, errores → `ApiError`
- `lib/types.ts` — **370 líneas**, todos los tipos de dominio (API y tienda). Añade aquí los tipos nuevos de forma centralizada.
- `lib/pasos-cache.ts` (17 líneas) — cachea 30s el resultado de `getPasos` por productId (tienda y modal).
- `lib/csv.ts` (14 líneas) — `descargarCSV(nombre, filas)`: CSV en cliente con BOM para Excel (lo usa inventario).
- `app/globals.css` — tokens, utilidades y estilos de los componentes UI (`.modal`, `.modal-overlay`, `.page-header`, `.segmented`, `.help-note`, `.stat-grid`, `.breadcrumb`, etc.).

### Componentes UI compartidos — `components/ui/`
Creados el 2026‑09‑30 para unificar estilos (antes había modales sin estilos). Reutilízalos en
vez de inventar clases nuevas:
- `page-header.tsx` (37 líneas) — título + subtítulo + breadcrumb + acciones
- `modal.tsx` (45 líneas) — modal con overlay, cierre por Escape/click, tamaños `sm|default|lg`
- `confirm-dialog.tsx` (39 líneas) — confirmación sobre `Modal` (variante `danger`)
- `segmented.tsx` (31 líneas) — toggle/tabs segmentados
- `help-note.tsx` (8 líneas) — nota de ayuda inline
- **Eliminados** (`5428bdd`): `badge.tsx`, `empty-state.tsx` (sin uso)

---

## 5. Qué funcionalidad tocar según la tarea (atajo rápido)

| Si quieres trabajar en… | Archivo(s) principal(es) |
|---|---|
| Nuevo atributo/variante/grid de producto | `productos.service.ts` (`materializar` 396‑424, `grid` 392‑395), `productos.controller.ts`, `productos/[id]/page.tsx` (sección Variantes, "Materializar combinación") |
| Editar BOM / componentes | `productos.service.ts:247‑266`, `productos/[id]/page.tsx` (Lista de materiales) |
| Neteo de materiales / generar OFs | `ventas.service.ts:281‑402` (recursión **inline** en `confirmar`; `ventas.ofs.ts` ya no existe) |
| Despachar línea / consumo de stock | `ventas.service.ts:404‑482` |
| Reporte de producción / aplicar | `reportes.service.ts:222‑295` |
| Ensamble con BOM | `inventario.ensamble.ts` (`ensamblar`) |
| Atributos globales / heredados | `catalogos.controller.ts:112‑233` (público, sin service) |
| Storefront guiado / wizard de configuración | `public.service.ts` (`getPasos` 146‑) + `tienda/[productId]/page.tsx` + `components/ventas/modal-config-variante.tsx` (reutiliza el mismo endpoint) |
| Productos públicos (grid de ventas) | `public.service.ts` (`productosPublicos` 98‑127) + `public.controller.ts` (`GET public/productos`) |
| Precios / catálogo público | `public.service.ts` (`catalogo` 128‑145, `productosPublicos`), `productos.service.ts` (`setVariantPrice` 340‑362) |
| Alertas stock bajo / canales | `monitor.service.ts` (66‑240) + `monitor.notificadores.ts` |
| UI compartida (modales, headers, tabs) | `components/ui/` (`modal`, `page-header`, `confirm-dialog`, `segmented`, `help-note`) + `app/globals.css` |
| Login / roles / JWT | `auth/` |
| Tipos shared | `web/src/lib/types.ts` |
| Esquema de BD / migraciones | `packages/db/prisma/schema.prisma` + `pnpm db:deploy` |
| Migración Odoo → mín/máx | `scripts/odoo-migration/step9-min-max.ts` (resuelve con `variantes.csv`; `--file`, `--pendientes`, `--apply`) + `step10-materializar.ts` |
| Reconciliación inventario Odoo↔PPG | `scripts/odoo-migration/reconcile-stock.ts` (mapea con `mapeo-odoo-ppg.csv`; difiere subensamblados; compara contra BD o `--ppg <csv>`; genera `docs/odoo-inventario-diferencias.csv` + `docs/odoo-inventario-correccion.csv`; `--apply` ajusta sólo renglones `ajuste`; `--reset` borra stock y recarga el snapshot Odoo) |
| Reorg / consolidación de atributos | `scripts/reorg-atributos.ts` + `scripts/consolidar-atributos.ts` (`--dry`/`--apply`) |
| Producto PVC + forma Cepillo Pino | `scripts/finalizar-minmax.ts` |
| Cepillos: forma en vez de Medidas/Estado/grosor | `scripts/reorg-cepillos.ts` + `scripts/reorg-cepillos-grosor.ts` (`--dry`/`--apply`); reconciliación resuelve cepillos por BD (`reconcile-stock.ts`) |
| Notas internas de variante (medidas/grosor) | `ProductVariant.notas`; `scripts/seed-cepillos-notas.ts`; página de variante `app/productos/[id]/variantes/[vid]/page.tsx` |
| Crosswalk Odoo↔PPG | `scripts/odoo-migration/mapeo-odoo-ppg.csv` (por variante) + `mapping-odoo.csv` (por plantilla) |
| Palillos (separar sin/con cepillo) | `scripts/reorg-palillos.ts` (`--dry`/`--apply`) |

---

## 6. Convenciones y patrones que DEBES respetar

1. **API NestJS:** cada dominio es un módulo (`x.controller.ts`, `x.service.ts`, `x.module.ts`).
   Usa los guards existentes y `@Roles()` del decorator. No dupliques guards.
2. **Roles:** admin puede todo; supervisor hace confirmar/despachar/aplicar; operador lee y reporta.
3. **Web:** páginas `"use client"`, usa `api()` y tipos de `lib/types.ts`. No introduzcas
   Redux/Zustand/react‑query: sigue el patrón `useState` + `useEffect` + `useCallback`.
4. **No‑interactividad:** NUNCA ejecutes `prisma migrate dev` directo en shell no‑TTY.
   Usa `pnpm db:deploy` para aplicar y `--create-only` para generar.
5. **Decimal ↔ number:** usa siempre `dec()` de `common/util.ts` para convertir `Decimal` Prisma.
6. **Precios:** los cambios de precio base/variante **deben** registrarse en `PriceChange`.
7. **BOM recursivo / ciclos:** cualquier lógica que recorra `ProductComponent` recursivamente
   debe detectar ciclos (patrón ya presente en `ventas`, `inventario` y `productos.resolveComponentVariant`).
   **Duplicación a evitar:** la recursión BOM existe en 3 sitios; si la tocas, considera extraerla
   a un helper/módulo común (ver "Modularización").
8. **Monitor tras stock:** cada mutación de stock que deba alertar llama a
   `monitor.afterStockChange`. Mantén ese contrato.
9. **Comentarios opcionales:** usa comentarios `{/* */}` (web) y `// ---` (api) para marcar
   secciones grandes, igual que los archivos existentes. No añadas comentarios explicativos
   redundantes.

---

## 7. Tareas pendientes / próximos pasos (contexto)

- **Modularización** (prioridad actual del equipo): los archivos masivos a dividir son
  en web `productos/[id]/page.tsx` (**816**), `reportes/page.tsx` (718), `ventas/page.tsx` (472),
  `catalogos/page.tsx` (332), `inventario/page.tsx` (455). *(La API ya quedó modularizada: vendría revisar
  `fabricacion.service.ts` que es pequeño.)*
  *(Archivos fuente API ya divididos: `ventas.service.ts` → `ventas.types.ts`;
  `productos.service.ts` → `productos.grid.ts`; `reportes.service.ts` →
  `reportes.constants.ts` + `reportes.stats.ts` + `reportes.export.ts`;
  `catalogos.controller.ts` → `catalogos.atributos-producto.ts`;
  `monitor.service.ts` → `monitor.notificadores.ts`;
  `inventario.service.ts` → `inventario.ensamble.ts`.
  Web: `productos/[id]/page.tsx` → `components/productos/empaques-variante.tsx` (página de variante);
  `reportes/page.tsx` → `components/reportes/stats-produccion.tsx`;
  `ventas/page.tsx` → `components/ventas/nueva-venta.tsx` + `components/ventas/modal-config-variante.tsx`;
  `catalogos/page.tsx` → `components/catalogos/atributos-globales.tsx`;
  UI compartida en `components/ui/`.)*
- **Candidatos a refactor cross‑cutting:** recursión BOM (3 copias), disparo de monitor,
  helpers `common/util.ts` (mezclados).
- **UI más clara de procesos (2026‑09‑30, commits `441c9d1` + `5428bdd`):** se arreglaron los modales
  sin estilos y se crearon los componentes compartidos `components/ui/` (`PageHeader`, `Modal`,
  `ConfirmDialog`, `HelpNote`, `Segmented`) + tokens/utilidades en `app/globals.css`. `/productos`
  ya no duplica los tabs de catálogos base (se movieron a `/catalogos` con tabs por sección); el detalle
  de producto tiene breadcrumb y navegación numerada por secciones; inventario usa toolbar con modales,
  export CSV discreto y toggle de 4 vistas (por ubicación, por variante, por variante min max, por producto); el Inicio muestra dashboard de
  pendientes; se reemplazaron `confirm`/`prompt` por modales. Se eliminaron `ui/badge.tsx` y
  `ui/empty-state.tsx` por no tener uso.
- **Nueva venta (2026-08-31):** flujo rediseñado basado en **productos públicos** (grid de cards) +
  **modal guiado paso a paso** (estilo storefront) en vez de búsqueda libre de variantes. El modal y el
  storefront reusan `getPasos` (opciones = variantes **publicadas** del producto navegado) y filtran por
  **conjunto de variantes compatibles** (intersección por `variantId`), no por `valueId`. En `/productos/[id]`
  se unificaron combinaciones y variantes en una sola vista con selector "Materializar combinación" (sin
  generador masivo). **Pendiente:** imágenes de opciones (hoy placeholders/iconos) y precios (ocultos a
  propósito, los revisa el equipo).
- Probar flujo E3 completo (reportes → confirmación → ubicar): **verificado end-to-end 2026-08-31** con `scripts/seed-demo.ts`. Flujo E2 (venta → confirmación → neteo → cascada de OFs multi-nivel → despacho/consumo → `despachada`) **verificado end-to-end 2026-08-31** con `scripts/seed-demo-ventas.ts`; se corrigieron 3 bugs (DTO `configuracion` en ventas internas, OFs duplicadas por doble bucle en `confirmar` eliminando `crearOFS`/`ventas.ofs.ts`, y `await` perdido del `$transaction` en `despacharLinea` que tumbaba el proceso).

---

- **Atributos consolidados (2026‑10‑03):** se separó el catálogo global por producto
  (`Altura de X`, `Color de X`, `Tipo de X`, `Forma de X`, `Agujero de X`, `Capacidad de Botella`,
  `Tamaño de Caja de Cartón`, etc.), se fusionaron duplicados (`Tipo de Pincel` → `Tipo de Mango`,
  `Altura Mango2` → `Altura de Mango`), se normalizó a primera mayúscula y se eliminaron atributos
  muertos. Herramientas: `scripts/reorg-atributos.ts` y `scripts/consolidar-atributos.ts`.
- **Mín/máx Odoo (2026‑10‑03):** migrados con `step9-min-max.ts` + `step10-materializar.ts` +
  `finalizar-minmax.ts`; crosswalk vivo en `scripts/odoo-migration/mapeo-odoo-ppg.csv`.
  Único pendiente: `Botella 1580 (Color: transparente)`. `Tapa con Pincel` no lleva mín/máx (por regla).

*Última actualización: 2026‑10‑03 (atributos consolidados + migración de mín/máx + reconciliación de inventario Odoo↔PPG + cepillos por forma). Este mapa de líneas
es una referencia viva: al refactorizar, actualiza este documento para que la herramienta de vibe coding
siempre apunte al archivo/zona correcta.*
