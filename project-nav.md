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
infra/        # Dockerfiles (perfil full) + entrypoint de la API
.github/      # Workflows de CI (publish.yml: build+push de imágenes a GHCR)
```

- **Roles/guards:** `admin`, `operador`. La app está **protegida por defecto**: `JwtAuthGuard` + `RolesGuard`
  son guards globales (`APP_GUARD` en `auth/auth.module.ts`); sólo lo marcado `@Public()` (login/logout,
  `health` y `/public/*`) queda sin sesión.
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
  - `variantesDeProducto` 276 · `buscarVariantes` 292 · `createVariant` 324 · `updateVariant` 341 (acepta `costoCompra` por variante)
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
  - `setLineaPrecio` (`PATCH /ventas/:id/lineas/:lineaId/precio`): edita el precio pactado de una línea
    (venta `abierta`); **no** toca catálogo ni registra `PriceChange` (el precio es de la venta).
  - **`confirmar` = DESGLOSE**: calcula el desglose neto vía `planificacion.desglosar` y persiste `resumen` (`fabricar`/`comprar`) + `confirmadaAt`. **No** crea órdenes.
  - **`desglose`** (`GET /ventas/:id/desglose`): explosión neta multi-nivel en vivo **sobre lo pendiente** (`cantidad - qtyDelivered`) con requerido / stock / faltante por variante (las líneas ya `entregado` aportan 0 y se conservan como raíz). Devuelve `lineas` (lista plana agregada, la usa Fabricación) **y** `arbol` (árbol de nodos por línea vendida con sus componentes, para la vista plegable de la web).
  - `despacharLinea` (consume stock; **ensambles** (2+ componentes): consume sus componentes al despachar, sin stock propio; dispara monitor) · `cancelar`.
- `ventas.types.ts`: `ResumenItem`, `ResumenNeteo`, `ConfiguracionLinea` + re-export de `Desglose`/`DesgloseLinea`/`DesgloseNodo` (definidos en `fabricacion/planificacion.service.ts`).
- Acoplos: inyecta `planificacion.service` (`desglosar`/`consumirEnsamble`) y `monitor.service`.

### 2.3 Reportes de producción → `reportes/`
- `reportes.controller.ts` (127) — rutas `/api/reportes...`
- `reportes.service.ts`, zonas:
  - `cepillosNylon` (datos del wizard: producto `CNI` + `grid` de ejes/variantes) · `ensartado` (datos del Paso 2: producto `PIN` cruzado con `VAST` por atributos compartidos → `ejes` del Mango reordenados Ceja→Tamaño rosca→Altura→Agujero, `mangos` con `valueIds` alineados (solo los que resuelven pincel), `colores` y `combinaciones` mango+color→pincel; alimenta el wizard por pasos) · `list` · `ultimo` (prefill) · `get` · `crear` · `editar` (`list`/`ultimo` excluyen reportes `interno`) · **`registrarProduccionInterna`** (reporte interno **aplicado** + stock a "Recibo de Producción"; lo usa Fabricación)
  - **Líneas `informativo`** (secciones `ensamble`/`pegado`/`perforado`): producto **texto libre** (`productoTexto`) + `ok`, **sin** `variantId`; no tocan inventario, solo alimentan `stats` (`porSeccion` + `totalInformativo`).
  - **`aplicar`** (mueve stock final/consumo; **ya no cierra la OF**) · `cancelar` · `lotes` (bandeja: líneas `final` de reportes **`pendiente`** y `aplicado` —con `estadoReporte`—, con `origen`, `productoId`, `valoracion` y `reporteId`) · **`ubicar`** (al ubicar una línea de un reporte **`pendiente`**, primero lo **aplica** —finales a Recibo y consumos— y luego mueve del Recibo al compartimento: *ubicar = aplicar*) · `porUbicar` (conteo por origen para el globo del sidebar; incluye pendientes y aplicados)
  - `stats` y `exportar` delegan en módulos externos (excluyen reportes `interno`)
  - Rutas estáticas: `GET /reportes/cepillos-nylon`, `GET /reportes/ensartado` y `GET /reportes/por-ubicar` (roles `admin`/`operador`; antes de `:id`)
- `reportes.constants.ts` (11): `TURNOS`, `SECCIONES`, `HORAS_TURNO`.
- `reportes.stats.ts` (72): métricas de productividad. `reportes.export.ts` (55): CSV.

### 2.4 Inventario / stock → `inventario/`
- `inventario.controller.ts` (158) — rutas `/api/inventario...` (rutas estáticas antes de `:param`)
- `inventario.service.ts` (349):
  - `crearUbicacion` 19 · `editarUbicacion` 27 · `eliminarUbicacion` 39 (bloquea `tipo != almacen` o con existencias)
  - `existencia` 64 · `existenciaDe` · `movimientos`
  - `movimiento` (entrada/salida: upsert stock + `StockMove` + monitor) 150 · `ajuste` (cantidad absoluta + delta `motivo: ajuste`) 205 · `mover` (transferencia) 254
  - `setMinMax` (`PATCH /inventario/variantes/:vid/minmax`: mín/máx de variante desde la tabla; todos los roles) 310 · `exportarCSV` 335
- Ubicaciones: `GET/POST/PATCH/DELETE /inventario/ubicaciones` (alta/edición sólo `nombre`; **sin `tipo` en la UI**, default `almacen`; borrado sólo `admin` y sin existencias).
- **Retirado (2026-10-02):** el ensamble BOM de inventario (`inventario.ensamble.ts` / `POST /inventario/ensamble`) se eliminó. El enum `MotivoStock.ensamble` se conserva para histórico.

### 2.5 Necesidades de fabricación → `fabricacion/`
- `fabricacion.controller.ts` · `fabricacion.service.ts`:
  - **`necesidades`** (`GET /fabricacion/necesidades`): faltantes vivos en dos listas: `porMinimo` (fabricables bajo stock mínimo; `stockActual < stockMin`) y `porVentas` (explosión neta **sobre lo pendiente** de las ventas **abiertas confirmadas** con pool compartido de stock, incluye ensambles como ítem *Armar*), más `porComprar` (no fabricables). Cada `NecesidadItem` incluye `productoId` + `valoracion` (atributos de la variante) y `prioridad` para el buscador/filtro y el orden del panel.
  - **`setPrioridad`** (`PATCH /fabricacion/variantes/:variantId/prioridad {prioridad}`): fija la prioridad manual (`alta`/`media`/`baja`) de la variante. **Solo `admin`**.
  - **`registrarProduccion`** (`POST /fabricacion/produccion {variantId, cantidad}`): solo hojas fabricables (0–1 componente); rechaza ensambles. Delega en `reportes.registrarProduccionInterna` → reporte interno aplicado + stock a **"Recibo de Producción"**, pendiente de ubicar en `/bandeja`.
  - `faltantes` (pendientes de compra agregados desde `resumen.comprar`).
- `fabricacion.module.ts` inyecta `ReportesService` (`ReportesModule` exporta el provider).
- `planificacion.service.ts`: `desglosar(tx, demandas)` (explosión neta multi-nivel con pool de stock; devuelve `lineas` agregadas + `arbol` de nodos `DesgloseNodo` por raíz; la usan ventas y necesidades) y `consumirEnsamble(tx, variantId, cantidad, ref, userId)` (consume componentes de un ensamble contra pedido al despachar).
- **No hay entidad OF** (retirada 2026-10-05): la producción se registra como stock+reporte interno y los ensambles se consumen al despachar.

### 2.6 Catálogos (atributos / categorías / empaques) → `catalogos/`
- `catalogos.controller.ts` (296) — `@Controller("catalogos")` (`JwtAuthGuard`+`RolesGuard`): **lectura** para
  cualquier sesión, **escrituras sólo `admin`**. Usa `PrismaService` directo (sin service).
  - categorías CRUD · empaques CRUD · atributos listar/crear · editar/eliminar · valores add/del · asignar/desasignar
  - `atributos/producto/:id` (propios + heredados) delega en `catalogos.atributos-producto.ts`
- `catalogos.atributos-producto.ts` (87): atributos propios + **heredados por recursión BOM** (`atributosPorProducto`).

### 2.7 Storefront público → `public/`
- `public.controller.ts` (53) — `@Controller("public")` **`@Public()`** (sin sesión)
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
  Inventario/Fabricación). El módulo backend y los disparadores de stock siguen vigentes como
  backend de notificaciones; el dashboard ya no consume `GET /monitor/stock-bajo`.

### 2.9 Clientes / partners → `clientes/`
- `clientes.controller.ts` (87) · `clientes.service.ts` (137): `list`/`get`/`create`/`update`/`deactivate` + `importar` (CSV).

### 2.10 Respaldos de BD → `backups/`
- `backups.controller.ts` — `@Controller("backups")` **sólo `admin`** (`JwtAuthGuard`+`RolesGuard`):
  - `GET backups` (listar) · `POST backups` (crear, body `{nombre?}`)
  - `POST backups/:nombre/restaurar` · `POST backups/subir` (multipart campo `archivo`)
  - `GET backups/:nombre/descargar` (stream) · `DELETE backups/:nombre`
- `backups.service.ts`: opera `docs/backups/` (en el stack se monta en el contenedor api); `pg_dump -Fc`
  al crear; al restaurar recrea el schema `public` (`DROP SCHEMA ... CASCADE`) y aplica el respaldo en
  **una sola transacción** (`pg_restore --file -` o `psql -f` → `psql --single-transaction`), tanto
  `.dump` como `.sql`; revierte completo si algo falla y propaga el stderr. **Luego aplica
  `prisma migrate deploy`** (sin pnpm) para no quedar desactualizado.
  La imagen api incluye el cliente PostgreSQL 18. Sanitiza
  nombres (evita path traversal) y usa la URL sin `?schema=public`.
- `backups.module.ts` importa `AuthModule`.
- CLI equivalente (mismo directorio): `ppg backup|restore` / `pnpm db:backup|db:restore`.

### 2.11 Auth → `auth/`
  - `auth.controller.ts`: `login` (JWT + cookie httpOnly), `logout`, `me`, `PATCH preferences` (separador de miles).
  - `auth.service.ts`: `validate` (bcrypt) · `findById` · `setSeparadorMiles` · `sign` · `verify` · `toPublic`.
- Guards `guards/jwt-auth.guard.ts` (cookie → `req.user`; respeta `@Public()`) y `guards/roles.guard.ts` (`@Roles()`);
  decorators `decorators/roles.decorator.ts` y `decorators/public.decorator.ts`. Ambos guards se registran como
  **globales** (`APP_GUARD` en `auth.module.ts`): todo exige sesión salvo lo marcado `@Public()`.

### 2.12 Soporte transversal
- `prisma/prisma.service.ts` (15) — wrapper Prisma.
- `common/util.ts` (20) — `dec`, `isNumberOrStringNumber`, `toUom`, `toTipoComponente` (candidato a modularizar).
- `common/valores-permitidos.ts` (81) — `valoresPermitidosLote` (subconjunto de valores por eje, sin N+1).

### 2.13 Costos (fórmula por producto) → `costos/`
- `costos.controller.ts` — `@Controller("costos")` (sólo `admin`): `GET /costos` (lista + total + precio/margen),
  `GET /costos/:productId` (detalle: `valores` resueltos + `formula` + `componentes` del BOM + `variantes`),
  `POST /costos/:productId/preview` (evalúa `{formula, valores}` **sin guardar**; la usa el editor en vivo),
  `PUT /costos/:productId` (upsert `formula` + `valores` + `precioBase`, `$transaction`),
  `DELETE /costos/:productId` (limpia configuración).
- `costos.service.ts`: `list` · `get` · `preview` · `upsert` · `remove`; normaliza valores (clave válida/única),
  valida la fórmula (claves definidas + sintaxis) y registra `precioBase` en `PriceChange`.
- `costos.formula.ts`: parser propio de expresiones (`+ - * / ( )`, funciones `min max round sum abs`);
  **nunca `eval`**.
- `costos.calc.ts` (`CostosCalc`): resuelve el costo a partir de `valores` + `formula`. Fuentes: `manual`,
  `bom` (Σ cantidad × costo de componentes; filtro por tipo/componente + merma), `variante`
  (`ProductVariant.costoCompra`) y `formula` (sub-expresión). Recursión BOM con **detección de ciclos** y
  profundidad máxima; cachea por producto dentro de una corrida.
- Modelo: `ProductCost` (`formula`, `notas`) + `ProductCostValor` (`clave`, `etiqueta`, `fuente`, `valor`,
  `opciones`, `orden`). El **costo es calculado** (no editable); el `precioBase` se edita aquí (manual o
  despejado de un margen) → `PriceChange`. Ver `docs/data-model.md`.
- UI: `/costos` (lista) → `/costos/[productId]` (editor: tabla de valores, fórmula con chips de claves,
  preview en vivo, precio/margen). Sólo `admin`; en el menú vive en la sección **Administración**.

### 2.14 Usuarios / cuentas → `usuarios/`
- `usuarios.controller.ts` — `@Controller("usuarios")` (`admin`):
  - `GET /usuarios` (lista sin `passwordHash`) · `POST /usuarios` (`username`, `nombre`, `password`, `role`)
  - `PATCH /usuarios/:id` (`nombre`, `role`, `active`) · `PATCH /usuarios/:id/password` (reset)
  - `DELETE /usuarios/:id` (borrado **duro**): exige `superPassword` = `SUPER_ADMIN_PASSWORD` del entorno; no permite auto-borrado ni eliminar el último `admin`.
- `usuarios.service.ts`: hash con `bcryptjs` (10 rondas); valida rol contra `ROLES` de `@ppg/shared`;
  impide que un admin se desactive o se quite su propio rol.

### 2.15 Inventario histórico → `inventario-historico/`
- `inventario-historico.controller.ts` — `@Controller("inventario-historico")`:
  - `GET /inventario-historico` (filtros `q`, `tipo`, `atributoNombre`, `atributoValor`) · `GET /:id`
  - `POST` · `PATCH /:id` · `DELETE /:id` · `POST /importar` (CSV) — **escritura sólo `admin`**; lectura todos.
- `inventario-historico.service.ts`: CRUD + parser CSV (RFC4180, comas/`"`) + infiere `familiaProductoId` por prefijo de SKU.
  **Aislado**: sin relación con `ProductVariant`/`StockLevel`, no entra a inventario vivo/mín-máx/fabricación/reportes.
  Carga inicial en `docs/inventario-historico-inicial.csv` (61 filas: 10 descontinuados + 51 subensambles Odoo).

---

## 3. Mapa de la Web (Next.js) — `apps/web/src`

Todas las páginas son `"use client"`, usan `api()` de `@/lib/api`, tipos de `@/lib/types`
y `AppShell` (excepto tienda y login).

### 3.1 Páginas

| Página | Archivo | Líneas | Funcionalidad |
|---|---|---|---|
| Inicio (dashboard) | `app/page.tsx` | 89 | pendientes (ventas abiertas, necesidades de fabricación, pendientes de compra) + tarjetas de módulos |
| Lista productos | `app/productos/page.tsx` | 402 | grid/tabla + alta en modal; sin botón eliminar (el borrado vive en el detalle del producto) |
| Detalle/edición producto | `app/productos/[id]/page.tsx` (shell) · `components/productos/detalle/seccion-{datos,atributos,bom,pasos,variantes}.tsx` | — | datos base · atributos inline · ejes · grid · variantes ("Materializar combinación") · BOM · **pasos guiados (wizard)**. Editor inline compacto; heredados solo lectura. La fila navega a la página de variante |
| Página de variante | `app/productos/[id]/variantes/[vid]/page.tsx` | 262 | `ExistenciaDe` (`GET /inventario/existencia/:vid`): nombre/precio/mín/máx/notas/publicado/crítico/activo, atributos, existencia, empaques y movimientos |
| Ventas | `app/ventas/page.tsx` | 516 | lista/detalle/confirmar/despachar/**imprimir**; en el detalle el **desglose de componentes** es **siempre visible** y se agrupa en **árbol por producto vendido**: cada línea vendida es el nodo raíz (badge *Vendido*) con toggle para plegar/desplegar sus componentes (arrancan **desplegados**), que se listan aplanados con sangría por profundidad; muestra necesita/stock/falta + estado (Fabricar/Ensamblar/Comprar) calculado **sobre lo pendiente**, y si la línea está `entregado` la raíz se marca **Entregado** sin cantidades (`—`); alta en modal (`Modal` + `components/ventas/nueva-venta.tsx` 370): wizard de 3 pasos (Cliente → Producto → Revisión) con stepper y acciones fijas; el paso 2 es una **lista filtrable de productos** (clic abre modal según el producto): `modal-config-variante.tsx` (wizard, productos con pasos) o `modal-seleccion-variante.tsx` (productos sin pasos: `<select>` por eje desde `GET /productos/:id/grid`, sólo valores materializados; fallback a lista plana); alta de cliente inline (`components/clientes/cliente-form-modal.tsx`). Documento de venta en PDF: `components/ventas/documento-venta.tsx` (overlay que **regenera el PDF** con `pdf().toBlob()` de `@react-pdf/renderer` al cambiar el contenido y lo muestra en un `<iframe>`; botón "Descargar PDF", toggle IVA 16%, imágenes precargadas a dataURL con fallback a iniciales) y layout en `components/ventas/documento-venta-pdf.tsx` (`DocumentoPDF`; muestra el desglose de atributos de la variante desde `valoracion` y columnas numéricas centradas). Cada línea tiene un botón **Etiqueta** (overlay `components/ventas/modal-etiqueta.tsx` + layout `components/ventas/etiqueta-pdf.tsx`) que genera el PDF de embarque de **200×102.1 mm** con datos del cliente/producto (tomados de la venta) y cantidad/pesos editables. El **precio unitario** de cada línea es editable al crear (paso Revisión) y desde el detalle de una venta **abierta** (celda `PrecioEditable` → `PATCH /ventas/:id/lineas/:lineaId/precio`); ese precio es de la venta, no del catálogo |
| Fabricación (necesidades) | `app/fabricacion/page.tsx` | — | **Por ventas** primero, luego **Por mínimo** (colapsable, arranca cerrado) —fabricables faltantes; ensambles como *Armar* solo lectura— + **Pendientes de compra**; la celda **Producto / Variante** muestra la **valoración de atributos** de la variante (chips `.attr-list`, igual que Inventario) bajo el producto; **buscador de producto + filtro por atributos** compartido con Inventario (`useFiltroAtributos` + `BuscadorAtributos`), aplicado a las tres listas; columna **Prioridad** (badge Alta/Media/Baja, editable inline solo `admin` vía `PATCH /fabricacion/variantes/:id/prioridad`) y **selector de orden** Prioridad/Cantidad/Producto; botón **Ingresar producción** (modal: cantidad → `POST /fabricacion/produccion`); el stock entra a "Recibo de Producción" y queda **pendiente de ubicar** en `/bandeja` |
| Bandeja | `app/bandeja/page.tsx` | — | **Bandeja de ubicación** (antes `/ubicaciones`): todo lo producido (por **reporte de turno** —pendiente o ya aplicado— y por **Fabricación**) listo para asignar compartimento. Filas **compactas y clicables**: al hacer clic se abre un **modal** para capturar **cantidad** y **compartimento** (input con lista filtrable por nombre); `GET /reportes/lotes`, dos secciones por `origen`, filtro de atributos compartido, `POST /reportes/lotes/:id/ubicar`; muestra **quién lo registró** (`usuario`) y marca **Por aplicar** los reportes pendientes. **Ubicar un reporte pendiente lo aplica** (finales a Recibo + consumos) y mueve del Recibo al compartimento. |
| Inventario | `app/inventario/page.tsx` | 602 | toolbar + 3 vistas (Por ubicación / Por variante / Min Max); cantidad editable y mín/máx editables (`components/inventario/cantidad-editable.tsx`); export CSV cliente (`lib/csv.ts`); botón **Ubicaciones** (sólo `admin`) → `components/inventario/ubicaciones-modal.tsx` (crear/editar nombre/eliminar sin existencias) |
| Almacén histórico | `app/inventario-historico/page.tsx` | — | existencias de **descontinuados** y **subensambles**, aisladas del inventario vivo. Tabla **Nombre** (atributos bajo el nombre) / **Cantidad** / **Ubicación** + buscador + filtro `tipo` (Todos/Descontinuado/Subensamble) + filtro por familia/atributos (`BuscadorAtributos`) + import/export CSV. Alta/edición en `components/inventario-historico/item-form-modal.tsx` (atributos por filas; **asistente**: al elegir familia carga sus ejes `propios` vía `GET /catalogos/atributos/producto/:id` con valores sugeridos —texto libre + `datalist`— y reemplaza las filas; sin familia, captura manual). La **eliminación** se hace desde el modal de edición (`btn danger` → `ConfirmDialog`). Escritura sólo `admin`; entrada **Alm. histórico** en el menú junto a Inventario |
| Reportes de producción | `app/reportes/page.tsx` | — | dos pestañas: **Reportes** y **Estadísticas** (admin). Dentro de **Reportes**, segmented **Capturar / Historial**. **Capturar**: setup (Matutino/Vespertino, fecha, personas, "Comenzar") → **Paso 1** cepillos de Nylon (máquina → forma → color → cantidad, repetible) → **Paso 2 Ensartado** (mango por pasos Ceja→Tamaño rosca→Altura→Agujero + color de cerda, repetible; agrega `final` del pincel + `consumo` del mango) → **Paso 3 Otras secciones** (`ensamble`/`pegado`/`perforado`: producto texto libre + cantidad, repetible; líneas `informativo`, solo estadística). Al **Finalizar** el reporte queda **pendiente** (no toca stock) y se ubica desde `/bandeja`. **Historial**: `GET /reportes` con filtros (fecha/turno/estado/buscar), detalle en modal y acciones por estado — `pendiente` **Editar** (reabre el wizard y hace `PATCH /reportes/:id`) / **Cancelar**; `aplicado`/`cancelado` solo lectura. Stats en `components/reportes/stats-produccion.tsx`; historial en `components/reportes/historial-reportes.tsx`; la captura por pasos en `components/reportes/captura-reporte.tsx` + `components/reportes/captura/paso-{setup,cepillos,ensartado,informativas}.tsx` (constantes/tipos en `captura/comun.ts`). La **bandeja de aceptación** vive ahora fusionada con **ubicar** en `/bandeja`. |
| Catálogos | `app/catalogos/page.tsx` | 332 | tabs categorías/empaques/atributos; atributos globales en `components/catalogos/atributos-globales.tsx` |
| Costos | `app/costos/page.tsx` (lista) · `app/costos/[productId]/page.tsx` (editor) | — | cada producto define su cálculo: **valores/factores** (fuente Manual / BOM / Costo de variante / Sub-fórmula) + una **fórmula**. Editor por producto con preview en vivo del desglose y del costo; el **costo es calculado** y el **precio base** es editable (a mano o por margen) y se registra en el historial de precios. Sólo `admin` (guardia en la página); en el menú vive en la sección **Administración** |
| Usuarios | `app/usuarios/page.tsx` | 421 | CRUD de cuentas (sólo `admin`): alta (usuario/nombre/contraseña/rol), edición de nombre/rol/activo, cambio de contraseña y activar/desactivar. No permite auto-desactivarse ni quitarse el rol admin. **Eliminar** (duro) pide el `SUPER_ADMIN_PASSWORD` |
| Clientes | `app/clientes/page.tsx` | — | CRUD + import CSV en modal; vista Tabla/Grid (`components/clientes/cliente-card.tsx`); **fila/tarjeta clicable abre el modal de edición** (Enter/Espacio con teclado) y la **eliminación se hace desde el modal** (`btn danger` → `ConfirmDialog` con fallback a desactivar). Form compartido en `components/clientes/cliente-form-modal.tsx` (prop opcional `onEliminar`) |
| Ajustes | `app/ajustes/page.tsx` | — | preferencias personales (separador de miles); en el menú encabeza la sección **Ajustes** |
| Respaldos | `app/backups/page.tsx` | — | crear punto de retorno / listar / descargar / restaurar / eliminar / subir `.dump`·`.sql` (sólo admin); en el menú vive en la sección **Ajustes** |
| Storefront guiado | `app/tienda/[productId]/page.tsx` | — | público, sin AppShell; paneles por `panel`, cascada server-side, resolver+crear al confirmar |
| Login | `app/login/page.tsx` | 66 | pantalla de login |
| Shell | `components/app-shell.tsx` | — | layout auth-gated: **menú lateral** colapsable (persistido en `ppg.sidebar.collapsed`), con **secciones colapsables** de encabezado (**Administración** [admin] → Usuarios/Costos; **Ajustes** → Ajustes/Respaldos [admin]; estado en `ppg.sidebar.section.<id>`, se auto-abre la sección de la ruta activa). La entrada **Bandeja** (`/bandeja`) muestra un **globo contador** (`GET /reportes/por-ubicar`, refresco por `pathname`/`POR_UBICAR_EVENT`/30 s). `useAuth()` del `PreferencesProvider` global, logout |

### 3.2 Librerías compartidas (`apps/web/src/lib/`)
- `api.ts` (31) — `api<T>(path, init)`: prepende `/api`, cookies, errores → `ApiError`.
- `types.ts` (408) — **todos** los tipos de dominio; añade aquí los tipos nuevos de forma centralizada.
- `pasos-cache.ts` — cachea 30 s `getPasos` por productId; `getPasosConSeleccion` (POST) para la cascada.
- `pasos-wizard.ts` — lógica compartida del wizard (paneles por `panel`, auto-selección, resolver).
- `filtro-atributos.ts` — hook `useFiltroAtributos(items)` (buscador de producto + filtro por atributos presentes, compartido por Inventario, Fabricación y Bandeja); tipo `ItemFiltrable`/`FiltroAtributos`.
- `por-ubicar.ts` — evento global `POR_UBICAR_EVENT` + `refrescarPorUbicar()` para refrescar el **globo contador** del sidebar cuando cambia la bandeja de ubicación.
- `csv.ts` (14) — `descargarCSV(nombre, filas)` con BOM para Excel.
- `local-store.ts` (81) — preferencias de UI en `localStorage` (`ppg.*`).
- `preferences.tsx` — `PreferencesProvider` (montado en `app/layout.tsx`, raíz) que hace el `GET /auth/me` y expone `useAuth`/`usePreferences`/`useFormatCantidad` (separador de miles por usuario, persistido en BD). **Debe quedar por encima del shell y las páginas**: el contexto sólo fluye hacia abajo.
- `avatar.ts` (13) — iniciales para avatares de clientes.
- `imagenes.ts` — `useImagenesLineas(lineas)` (URLs de líneas → `dataURL`; usado por el documento de venta y la etiqueta), `useImagenEstatica(src)` y `imagenADataUrl`.

### 3.3 Componentes UI compartidos (`components/ui/`)
Reutilízalos en vez de inventar clases nuevas:
- `page-header.tsx` (37) · `modal.tsx` (45) · `confirm-dialog.tsx` (39) · `segmented.tsx` (31) · `help-note.tsx` (26) · `sticky-bar.tsx` (buscador/filtros fijos) · `buscador-atributos.tsx` (`BuscadorAtributos` + `FiltroAtributosModal`, compartido Inventario/Fabricación).
- Estilos/tokens en `app/globals.css`. Eliminados por falta de uso: `badge.tsx`, `empty-state.tsx`.
- **Scroll + fijos:** el área de contenido (`.content` en `app-shell.tsx`) es el contenedor de scroll (`height:100dvh; overflow:auto`); el sidebar queda fijo. `StickyBar` mide su alto y setea `--sticky-head`, que usan los `th` de `.table` para pegarse justo debajo del buscador. Por eso las tarjetas que envuelven tablas **no** deben usar `overflow:hidden` ni `.table-wrap` debe scrollear (el scroll horizontal lo hace `.content`).

---

## 4. Atajo: qué archivo tocar según la tarea

| Si quieres trabajar en… | Archivo(s) principal(es) |
|---|---|
| Nuevo atributo/variante/grid de producto | `productos.service.ts` (`grid` 430, `materializar` 434) · `productos.controller.ts` · `app/productos/[id]/page.tsx` · `components/productos/detalle/seccion-atributos.tsx` / `seccion-variantes.tsx` |
| Editar BOM / componentes | `productos.service.ts:255` · `app/productos/[id]/page.tsx` · `components/productos/detalle/seccion-bom.tsx` |
| Desglose de componentes / necesidades de fabricación | `ventas.service.ts` (`desglose`, `confirmar`) + `fabricacion/fabricacion.service.ts` (`necesidades`, `registrarProduccion`) + `fabricacion/planificacion.service.ts` (`desglosar`) |
| Despachar línea / consumo de stock (ensambles consumen componentes) | `ventas.service.ts` (`despacharLinea`) + `planificacion.service.ts` (`consumirEnsamble`) |
| Documento de venta PDF (IVA, imagen) | `components/ventas/documento-venta.tsx` (overlay/descarga) · `components/ventas/documento-venta-pdf.tsx` (layout `@react-pdf/renderer`) · `app/ventas/page.tsx` (overlay `imprimirVenta`) · `ventas.service.get` (`imagen`) |
| Etiqueta de embarque (por línea de venta) | `components/ventas/modal-etiqueta.tsx` (form cantidad/pesos + preview/descarga) · `components/ventas/etiqueta-pdf.tsx` (200×102.1 mm) · `lib/imagenes.ts` · `app/ventas/page.tsx` (botón `Etiqueta`) · `public/etiqueta-fragil.png` |
| Reporte de producción / wizard (cepillos, ensartado, secciones informativas) / historial y edición | `reportes.service.ts` (`aplicar`, `aplicarEnTx`, `cepillosNylon`, `ensartado`) · `app/reportes/page.tsx` · `components/reportes/captura-reporte.tsx` · `components/reportes/captura/` · `components/reportes/historial-reportes.tsx` |
| Bandeja de ubicación (fila clic → modal con cantidad + compartimento buscable; origen + usuario; reporte pendiente se aplica al ubicar) | `reportes.service.ts` (`lotes`, `ubicar`, `aplicarEnTx`, `porUbicar`, `registrarProduccionInterna`) · `app/bandeja/page.tsx` (`ModalUbicarLote`) · `components/app-shell.tsx` (globo contador) |
| Panel de Fabricación: mínimos, ventas, prioridad y alta de producción | `fabricacion.service.ts` (`necesidades`, `setPrioridad`, `registrarProduccion`) · `fabricacion.controller.ts` · `app/fabricacion/page.tsx` |
| Buscador de producto + filtro por atributos (Inventario, Fabricación, Bandeja y Alm. histórico) | `lib/filtro-atributos.ts` (`useFiltroAtributos`) · `components/ui/buscador-atributos.tsx` · `app/inventario/page.tsx` · `app/fabricacion/page.tsx` · `app/bandeja/page.tsx` · `app/inventario-historico/page.tsx` |
| Inventario: entrada/salida/ajuste/transferencia | `inventario.service.ts` (`movimiento` 150, `ajuste` 205, `mover` 254) |
| Inventario: ubicaciones (crear/editar/eliminar) | `inventario.service.ts` (`crearUbicacion`/`editarUbicacion`/`eliminarUbicacion`) · `components/inventario/ubicaciones-modal.tsx` · `app/inventario/page.tsx` |
| Almacén histórico (descontinuados/subensambles, aislado) | `apps/api/src/inventario-historico/` · `app/inventario-historico/page.tsx` · `components/inventario-historico/item-form-modal.tsx` · `docs/inventario-historico-inicial.csv` |
| Atributos globales / heredados | `catalogos.controller.ts` + `catalogos.atributos-producto.ts` |
| Storefront guiado / wizard de configuración | `public.service.ts` (`getPasos`, `resolverConfiguracion`) · `public.controller.ts` · `app/tienda/[productId]/page.tsx` · `components/ventas/modal-config-variante.tsx` (con pasos) · `components/ventas/modal-seleccion-variante.tsx` (selector por eje con `<select>`, sin pasos) · `lib/pasos-wizard.ts` |
| Editar los pasos guiados de un producto | `productos.service.ts` (`getPasos`/`setPasos`) · `app/productos/[id]/page.tsx` · `components/productos/detalle/seccion-pasos.tsx` |
| Productos públicos (lista de ventas) | `public.service.ts` (`productosPublicos` ~112, filtra `Product.vendible`) · `public.controller.ts` |
| Precios / catálogo público | `public.service.ts` (`catalogo` 128) · `productos.service.ts` (`setVariantPrice` 378) |
| Costo por producto: fórmula/valores, BOM, precio base y utilidad | `apps/api/src/costos/` (`costos.formula.ts`, `costos.calc.ts`) · `app/costos/page.tsx` + `app/costos/[productId]/page.tsx` (sección de menú **Administración**) |
| Precio pactado por línea de venta | `ventas.service.ts` (`setLineaPrecio`) · `ventas.controller.ts` · `components/ventas/precio-editable.tsx` · `app/ventas/page.tsx` · `components/ventas/nueva-venta.tsx` |
| Alertas stock bajo / canales | `monitor.service.ts` (`afterStockChange` 104) + `monitor.notificadores.ts` (**sin página web**; bajo stock se ve en Inventario/Fabricación) |
| Alta/edición de cliente (reusada en ventas) | `components/clientes/cliente-form-modal.tsx` |
| UI compartida (modales, headers, tabs) | `components/ui/` + `app/globals.css` |
| Respaldos de la BD (punto de retorno) | `apps/api/src/backups/` · `app/backups/page.tsx` (UI) · `scripts/ppg.sh` (`backup`/`restore`) |
| Despliegue a producción (stack full) | `scripts/deploy.sh` · `docker-compose.yml` · `.env.production.example` · `.github/workflows/publish.yml` (build+push GHCR) · runbook `docs/development.md` (§ Despliegue a producción) |
| Login / roles / JWT / guards globales | `apps/api/src/auth/` (`decorators/public.decorator.ts`, `guards/`) |
| Cuentas de usuario (CRUD admin + borrado duro con `SUPER_ADMIN_PASSWORD`) | `apps/api/src/usuarios/` · `app/usuarios/page.tsx` |
| Tipos shared | `apps/web/src/lib/types.ts` |
| Esquema de BD / migraciones | `packages/db/prisma/schema.prisma` + `pnpm db:deploy` (ver `docs/development.md`) |
| Catálogo (cambiar ops/seed · estado · toolkit) | `docs/catalog-ops.md` + `docs/catalog-state.md` + `scripts/catalog/` |
| Datos / migración y reconciliación Odoo | `docs/scripts.md` |

---

*Mapa de líneas vivo: al refactorizar, actualiza este documento para que el agente siempre
apunte al archivo/zona correcta. Última revisión: 2026-10-07.*
