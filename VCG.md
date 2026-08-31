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
- **Controller `productos.controller.ts`** — rutas `/api/productos...`
- **Service `productos.service.ts`** (~438 líneas), secciones:
  - `list` ~50‑86 · `get` (detalle + componentes + variantes) ~88‑135 · `create` ~137‑170
  - `update` (registra cambio de precio en `PriceChange`) ~172‑215 · `deactivate`
  - `setEjes` (atributos del grid) · `setComponentes` (BOM)
  - `createVariant` · `updateVariant` · `setVariantPrice`
  - `materializar` (crea variante de un combo) · `generar`
  - **`resolveComponentVariant`** (resuelve variante de componente BOM; lo consumen ventas e inventario)
- **`productos.grid.ts`** (nuevo): lógica del **grid cartesiano** (`gridProducto`, `slugify`) +
  tipos `Grid`, `MaterializableCombo`. A él delegan `grid`/`materializar`/`generar`; los tipos se re-exportan desde `productos.service`.

### 3.2 Ventas / neteo / OFs  → `ventas/`
- **Controller `ventas.controller.ts`** — rutas `/api/ventas...`
- **Service `ventas.service.ts`** (~525 líneas), secciones:
  - `list` 59‑97 · `get` (con OFs asociados) 100‑171 · `create` 174‑234 · `update` 237‑289
  - **`confirmar` = NETEO + CASCADA DE OFs** 291‑~400 (lo más crítico):
    - transacción + carga de BOM `exacto` con caché
    - demanda neta recursiva multi‑nivel + detección de ciclos
    - generación de OFs `fabricacion`/`ensamble`
    - persiste `resumen` + dispara `crearOFS`
  - `despacharLinea` (consume stock, dispara monitor) · `cancelar`
  - método delegador `crearOFS` (llama a la función externa)
- **`ventas.ofs.ts`** (nuevo, ~129 líneas): **lógica recursiva de OFs** (`crearOFS`),
  con detección de ciclos, para configuraciones del storefront. Recibe un contexto
  `{ tx, resolveComponentVariant }`.
- **`ventas.types.ts`** (nuevo): tipos compartidos `ResumenItem`, `ResumenNeteo`,
  `ConfiguracionLinea` (re-exportados desde `ventas.service` para no romper `fabricacion.service`).
- **Acoplamientos:** inyecta `productos.service` (`resolveComponentVariant`) y `monitor.service`. El tipo `ResumenItem` lo importa `fabricacion.service`.

### 3.3 Reportes de producción  → `reportes/`
- **Controller `reportes.controller.ts`** — rutas `/api/reportes...`
- **Service `reportes.service.ts`** (~414 líneas):
  - `list` · `ultimo` (prefill) · `get` · `crear` · `editar`
  - **`aplicar`** (mueve stock final/consumo, cierra OF) · `cancelar` · `lotes` · `ubicar`
  - `validar` (helper) · `stats` y `exportar` delegan a módulos externos
- **`reportes.constants.ts`** (nuevo): constantes `TURNOS`, `SECCIONES`, `HORAS_TURNO` + tipos `Turno`, `Seccion` (re-exportados desde `reportes.service`).
- **`reportes.stats.ts`** (nuevo): métricas de productividad (`estadisticas`).
- **`reportes.export.ts`** (nuevo): exportación CSV (`exportarReportes`).

### 3.4 Inventario / stock / ensamble BOM  → `inventario/`
- **Controller `inventario.controller.ts`** — rutas `/api/inventario...` (OJO: rutas estáticas antes de las `:param`)
- **Service `inventario.service.ts`** (~246 líneas):
  - ubicaciones 16‑37 · `existencia` 40‑72 · `existenciaDe` 74‑102 · `movimientos` 104‑111
  - `movimiento` (upsert stock + StockMove + monitor) 114‑161 · `mover` (transferencia) 164‑211
  - **`ensamble`** — delegador a `ensamblar` (en `inventario.ensamble.ts`)
  - `exportarCSV`
- **`inventario.ensamble.ts`** (nuevo, 181 líneas): función `ensamblar` (BOM recursivo multi‑nivel) — `expandir` recursivo, detecta ciclos, resuelve hojas con `resolveComponentVariant`, consume hojas + suma terminado, notifica por monitor.

### 3.5 Órdenes de fabricación  → `fabricacion/`
- **Controller `fabricacion.controller.ts`** ; **Service `fabricacion.service.ts`** (pequeño, 125 líneas)
  - `list` 11‑49 · `get` 51‑74 · `iniciar` 76‑86 · `cancelar` 88‑95 · `faltantes` (pendientes de compra agregadas) 99‑124
- Nota: el **cierre de OF a "hecha"** ocurre desde `reportes.service` (`aplicar`), no aquí.

### 3.6 Catálogos (atributos / categorías / empaques)  → `catalogos/`
- **Controller `catalogos.controller.ts` (314 líneas)** — `@Controller("catalogos")` **público, sin guards**.
- **NO tiene service**: usa `PrismaService` directo.
  - categorías CRUD · empaques CRUD · atributos listar/crear · editar · eliminar
  - valores add/del · asignar/desasignar atributo
  - **`atributos/producto/:id`** (propios + heredados) delega a `catalogos.atributos-producto.ts`
- **`catalogos.atributos-producto.ts`** (nuevo): atributos propios + **heredados por recursión BOM** (`atributosPorProducto`).

### 3.7 Storefront público  → `public/`
- **Controller `public.controller.ts`** — `@Controller("public")` **público**
- **Service `public.service.ts`** (170 líneas):
  - `crearPedido` (precio recalculado en servidor, §7.7) 30‑69 · `consultarPedido` 72‑94 · `catalogo` 97‑113
  - **`getPasos`** (arma pasos guiados con opciones/stock) 115‑169

### 3.8 Monitor de stock bajo + notificaciones  → `monitor/`
- **Controller `monitor.controller.ts`** — rutas `/api/monitor...`
- **Service `monitor.service.ts`** (~240 líneas):
  - getter `configs` de canales · `canalesConfigurados` · `listarBajo`
  - **`afterStockChange`** (disparador post‑movimiento, notifica solo al pasar a bajo)
  - `checkAll` · `enviarAlerta` · `enviar` (registra `NotificationEvent` y delega en `Notificadores`)
- **`monitor.notificadores.ts`** (nuevo): clase `Notificadores` con `sendTelegram` / `sendCallMeBot` / `sendEmail` (envío a canales + configs).

### 3.9 Clientes / partners  → `clientes/`
- **Controller `clientes.controller.ts`** ; **Service `clientes.service.ts`** (110 líneas):
  - `list` 9‑28 · `get` 30‑37 · `create` 39‑45 · `update` 47‑63 · `deactivate` 65‑70 · `importar` (CSV) 74‑109

### 3.10 Auth  → `auth/`
- **Controller `auth.controller.ts`**: `login` (firma JWT + cookie httpOnly), `logout`, `me` (JwtAuthGuard)
- **Service `auth.service.ts`**: `validate` (bcrypt) 28‑37 · `findById` 39‑52 · `sign` 54‑61 · `verify` 63‑69 · `toPublic` 71‑78
- **Guards:** `guards/jwt-auth.guard.ts` (cookie → `req.user`), `guards/roles.guard.ts` (`@Roles()`)
- **Decorator:** `decorators/roles.decorator.ts`

### 3.11 Soporte transversal
- `prisma/prisma.service.ts` — wrapper Prisma
- `common/util.ts` — helpers mezclados: `dec`, `isNumberOrStringNumber`, `toUom`, `toTipoComponente` (candidato a modularizar)
- `app.module.ts` — registra los 11 módulos

---

## 4. Mapa de la Web (Next.js) — `apps/web/src`

Todas las páginas son **`"use client"`**, usan `api()` de `@/lib/api`, tipos de
`@/lib/types`, y `AppShell` (excepto tienda). Sin Redux/react‑query: todo es `useState`
local + `fetch` manual.

### Páginas y zonas de trabajo

| Página | Archivo | Líneas | Funcionalidad |
|--------|---------|--------|---------------|
| Detalle/edición de producto | `app/productos/[id]/page.tsx` | **814** (antes 937) | datos base · atributos · ejes · combinaciones/grid · variantes · BOM — empaques extraídos en `components/productos/empaques-por-variante.tsx` (153 líneas) |
| Reportes de producción | `app/reportes/page.tsx` | **714** (antes 852) | form · bandeja · ubicar lotes — stats extraídas en `components/reportes/stats-produccion.tsx` (150 líneas) |
| Ventas | `app/ventas/page.tsx` | **359** (antes 508) | lista · detalle+confirmar+despachar — alta extraída en `components/ventas/nueva-venta.tsx` (169 líneas) |
| Catálogos | `app/catalogos/page.tsx` | **234** (antes 439) | categorías · empaques — atributos globales extraídos en `components/catalogos/atributos-globales.tsx` (212 líneas) |
| Lista productos | `app/productos/page.tsx` | **400** (tabs productos/catálogos) | alta 59‑117/276‑397 · catálogos base 119‑186/203‑274 |
| Storefront guiado (6 pasos) | `app/tienda/[productId]/page.tsx` | **328** — público, sin AppShell | carga 42‑61 · selección/cascada (`opcionesDelPaso`) 66‑115 · envío de pedido 117‑148 · UI pasos 192‑298 |
| Inventario | `app/inventario/page.tsx` | **301** | acciones (ajustar/mover/ensamblar) 44‑98/113‑230 · movimientos 232‑246 · existencias 249‑298 |
| Clientes | `app/clientes/page.tsx` | **226** | CRUD 38‑101/129‑222 · import CSV |
| Fabricación (OFs) | `app/fabricacion/page.tsx` | **183** | listar 10‑55 · acciones iniciar/cancelar 57‑84 · detalle inline 95‑129 · faltantes 167‑179 |
| Monitor stock | `app/monitor/page.tsx` | **157** | estado 15‑36 · acciones 38‑51 · UI 63‑154 |
| Login | `app/login/page.tsx` | 66 | pantalla de login |
| Shell | `components/app-shell.tsx` | 105 | layout auth‑gated: sidebar, `GET /auth/me`, logout |

### Librerías compartidas
- `lib/api.ts` — `api<T>(path, init)`: prepende `/api`, cookies, errores → `ApiError`
- `lib/types.ts` — **353 líneas**, todos los tipos de dominio (API y tienda). Añade aquí los tipos nuevos de forma centralizada.

---

## 5. Qué funcionalidad tocar según la tarea (atajo rápido)

| Si quieres trabajar en… | Archivo(s) principal(es) |
|---|---|
| Nuevo atributo/variante/grid de producto | `productos.service.ts:381‑471`, `productos.controller.ts`, `productos/[id]/page.tsx:198‑216` |
| Editar BOM / componentes | `productos.service.ts:236‑254`, `productos/[id]/page.tsx:267‑297` |
| Neteo de materiales / generar OFs | `ventas.service.ts:291‑420` (+ `crearOFS` 518‑623) |
| Despachar línea / consumo de stock | `ventas.service.ts:422‑500` |
| Reporte de producción / aplicar | `reportes.service.ts:224‑296` |
| Ensamble con BOM | `inventario.ensamble.ts` (`ensamblar`) |
| Atributos globales / heredados | `catalogos.controller.ts:224‑278` (público, sin service) |
| Storefront guiado | `public.service.ts:115‑169` + `tienda/[productId]/page.tsx` |
| Precios / catálogo público | `public.service.ts:97‑113`, `productos.service.ts:329‑350` |
| Alertas stock bajo / canales | `monitor.service.ts` (94‑292) |
| Login / roles / JWT | `auth/` |
| Tipos shared | `web/src/lib/types.ts` |
| Esquema de BD / migraciones | `packages/db/prisma/schema.prisma` + `pnpm db:deploy` |

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
  en web `productos/[id]/page.tsx` (814), `reportes/page.tsx` (714), `ventas/page.tsx` (359),
  `catalogos/page.tsx` (234). *(La API ya quedó modularizada: vendría revisar
  `fabricacion.service.ts` que es pequeño.)*
  *(Archivos fuente API ya divididos: `ventas.service.ts` → `ventas.ofs.ts` + `ventas.types.ts`;
  `productos.service.ts` → `productos.grid.ts`; `reportes.service.ts` →
  `reportes.constants.ts` + `reportes.stats.ts` + `reportes.export.ts`;
  `catalogos.controller.ts` → `catalogos.atributos-producto.ts`;
  `monitor.service.ts` → `monitor.notificadores.ts`;
  `inventario.service.ts` → `inventario.ensamble.ts`.
  Web: `productos/[id]/page.tsx` → `components/productos/empaques-por-variante.tsx`;
  `reportes/page.tsx` → `components/reportes/stats-produccion.tsx`;
  `ventas/page.tsx` → `components/ventas/nueva-venta.tsx`;
  `catalogos/page.tsx` → `components/catalogos/atributos-globales.tsx`.)*
- **Candidatos a refactor cross‑cutting:** recursión BOM (3 copias), disparo de monitor,
  helpers `common/util.ts` (mezclados).
- Probar flujo E3 completo (reportes → confirmación → ubicar): **verificado end-to-end 2026-08-31** con `scripts/seed-demo.ts`. Flujo E2 (venta → confirmación → neteo → cascada de OFs multi-nivel → despacho/consumo → `despachada`) **verificado end-to-end 2026-08-31** con `scripts/seed-demo-ventas.ts`; se corrigieron 3 bugs (DTO `configuracion` en ventas internas, OFs duplicadas por doble bucle en `confirmar` eliminando `crearOFS`/`ventas.ofs.ts`, y `await` perdido del `$transaction` en `despacharLinea` que tumbaba el proceso).

---

*Última actualización: 2026‑08‑31. Este mapa de líneas es una referencia viva: al refactorizar,
actualiza este documento para que la herramienta de vibe coding siempre apunte al archivo/zona correcta.*
