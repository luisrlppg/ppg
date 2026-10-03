# PPG ERP - Agente Context

## Situación actual
- Monorepo: NestJS (API) + Next.js (web) + Prisma (PostgreSQL)
- Entrega actual: E3 (producción/reportes con selección guiada de 6 pasos)
- Stack: pnpm, Docker Desktop (Windows), acceso a archivos via /mnt/d/

## Estructura del proyecto
```
/home/luisrlp/Documents/projects/plasticosplasa/ppg/  (WSL2/Linux)
apps/
  api/        # NestJS API (puerto 3001)
  web/        # Next.js (puerto 3000, proxy /api → :3001)
packages/
  db/         # Prisma schema + seed
scripts/      # Scripts de utilidad
```

## Modelo de datos

### Productos
- **Vástago** (ID 1) — producto base, sin BOM
- **Cerda** (ID 2) — uom=kg, consumible
- **Pincel** (ID 3) — ensamble: Vástago + Cerda
- **Taparrosca con Pincel** (ID 4) — ensamble: Pincel + Vástago
- **Palillos** (reorg `scripts/reorg-palillos.ts`):
  - **Palillo Sin Cepillo** (id 42, `P0014`) — componente; eje `Color de Palillo`.
  - **Palillo Citologico Sin Cepillo** (`P0032`) — componente; eje `Color de Palillo Citologico` (solo `Blanco`).
  - **Palillo con Cepillo** (`P0033`) — ensamble final; BOM `Palillo Sin Cepillo` + `Cepillo Nylon` (exacto);
    ejes `Color de Palillo` + `Color de Cerda de Cepillo` + `Forma de cepillo nylon`.
  - **Palillo Citologico con Cepillo** (`P0034`) — ensamble final; BOM `Palillo Citologico Sin Cepillo` + `Cepillo Nylon`;
    ejes `Color de Palillo Citologico` + `Color de Cerda de Cepillo` + `Forma de cepillo nylon`.

### Atributos (globales)
- `Attribute` es global (sin productId)
- `ProductAttributeLine` asigna atributos a productos (N:N)
- Atributos propios vs heredados (de componentes del BOM)
- **`ProductVariant.notas`** — texto libre **interno** por variante (p.ej. medidas del cepillo). No es eje ni se expone en la tienda.

### Atributos (consolidados 2026-10-03)
- Globales, asignados por producto (`ProductAttributeLine`); los ejes pueden restringirse con
  `ProductAttributeValue` (si no hay filas → se asumen **todos** los valores del atributo).
- **Un atributo por producto** (convención `<Propiedad> de <Producto>`): `Altura de Mango`,
  `Altura de Vastago`, `Altura de Taparrosca`, `Altura de Botella`, `Altura de Escurridor`,
  `Altura de Sobretapa`, `Color de Botella`, `Color de Vastago`, `Color de Sobretapa`,
  `Color de Escurridor`, `Color de Taparrosca`, `Color de Tapon`, `Color de Tapa con Pincel`,
  `Color de Palillo`, `Color de Cepillo Nylon`, `Color de Cepillo Silicon`, `Color de Cerda de Pincel`,
  `Color de Cerda de Cepillo`, `Color de PVC`, `Tipo de Mango`, `Tipo de Vastago`, `Tipo de Botella`,
  `Tipo de Taparrosca`, `Tipo de Tapa con Pincel`, `Tipo de Sobretapa`, `Tipo de Punta`,
  `Forma de Taparrosca`, `Forma de Sobretapa`, `Forma de cepillo nylon`, `Forma de cepillo silicon`,
  `Agujero de Vastago`, `Agujero de Escurridor`, `Agujero de Mango`, `Tamaño de Caja de Cartón`,
  `Capacidad de Botella`.
- Compartidos legítimos: `Tamaño rosca`, `Ceja`, `Punta`, `Grosor cerda`,
  `Medida pincel`, `Logo`, `Versión del vástago`, `Densidad`.
- Estilo de valores: **primera letra mayúscula**, sin duplicados dentro del mismo atributo.
- El producto **PVC** (uom kg) se creó con `Color de PVC` (`Violeta`, `Transparente`).
- **Cepillos:** Cepillo Nylon se identifica por `Forma de cepillo nylon` + `Color de Cerda de Cepillo`
  (el **grosor de cerda va como nota interna** `grosor: N"`, y las medidas de los Recto
  `medida · grosor: 5"`); el grosor se codifica en la forma: 5" default, 5.75" → forma `… Prosa`,
  4" → `Bala Barradas`/`Pino Barradas`, 3" → `Citologico`. Cepillo Silicon por `Forma de cepillo silicon`
  (sin `Estado`). Las medidas del "Cepillo Recto" se volvieron formas
  (`Recto Chico/XG/Grande/Mediano/Mini`) y las muestras prosa `Bala Prosa`/`Balita Prosa`/`Pino Prosa`.
  (reorg `scripts/reorg-cepillos.ts` original + `scripts/reorg-cepillos-grosor.ts` que quitó el eje `Grosor cerda`).

### Pasos del storefront (ProductPasso)
6 pasos para Taparrosca con Pincel (pasos 1-3 → Vástago, paso 4 → Pincel, pasos 5-6 → Taparrosca).
**Nota (2026-08-31):** aunque el `variantProductId` apunta a los componentes, `getPasos` arma las opciones
de cada paso desde las **variantes publicadas del producto navegado** (producto 4), porque los componentes
(Vástago/Pincel) no siempre tienen variantes reconvertidas por atributo. `variantProductId` solo se conserva
por compatibilidad en la respuesta.

## API endpoints relevantes
- `GET /api/productos` — lista de productos
- `GET /api/productos/:id` — detalle con componentes
- `GET /api/productos/:id/grid` — **resumen ligero** `{ ejes, existentes }` (ya no devuelve el cartesiano; el front calcula la combinación elegida)
- `GET /api/catalogos/atributos` — todos los atributos globales
- `GET /api/catalogos/atributos/producto/:id` — propios + heredados
- `POST /catalogos/atributos` — crear atributo global
- `POST /catalogos/atributos/:id/asignar/:productoId` — asignar
- `DELETE /catalogos/atributos/:id/desasignar/:productoId` — desasignar
- `PUT /productos/:id/ejes` — asignar atributos al producto
- `POST /productos/:id/materializar` — crear UNA variante puntual (idempotente)
- `DELETE /productos/variantes/:vid` — eliminar una variante **sin historial** (si tiene stock/ventas/OFs/reportes/usos como componente → 409 con motivo)
- `DELETE /productos/:id/definitivo` — hard delete de producto sin historial; `DELETE /productos/:id` es **desactivar** (soft)
- `POST /api/clientes/importar` — importa CSV (nombre,telefono,direccion,email,empresa); empresa es la 5ª columna opcional; dedupe por nombre+empresa; devuelve `{ creados, omitidos }`
- `DELETE /api/clientes/:id/definitivo` — hard delete de cliente **sin ventas** (si tiene → 409 con motivo); `DELETE /api/clientes/:id` es **desactivar** (soft)
- `POST /api/inventario/ajuste` — fija la cantidad absoluta de (variante, ubicación) y registra un `StockMove` con el delta y `motivo: ajuste`
- `POST /api/fabricacion` — alta **manual** de OF (`{ variantId, cantidad, notas? }`); netea los componentes en cascada y crea la OF (exactamente N). La operación de ensamble de inventario fue **retirada**
- `GET /api/fabricacion/reponer/preview?objetivo=minimo|maximo` — cuántas OFs se crearían (no escribe) · `POST /api/fabricacion/reponer` — crea las OFs en cascada hasta el mínimo o máximo
- Las OFs tienen `origen`: `venta` | `manual` | `reposicion_minimo` | `reposicion_maximo` (tipo = 1 componente → `fabricacion`, 2+ → `ensamble`)
- `GET /public/productos` — productos con ≥1 variante activa y publicada (grid de Nueva venta)
- `GET /public/productos/:id/pasos` — pasos guiados con opciones (variantes publicadas del producto navegado)
- `GET /public/catalog` — variantes publicadas con precios/empaques

## UI pages
- `/` — Inicio: dashboard de pendientes (ventas abiertas, OFs activas, faltantes, bajo stock) + tarjetas de módulos
- `/productos` — lista de productos admin (alta en modal; sin tabs de catálogos base). Alterna vista **Tabla/Grid** (`Segmented`; preferencia en `localStorage` `ppg.productos.vista`, `lib/local-store.ts`); el grid usa `components/productos/producto-card.tsx` (imagen o placeholder). Acción **Eliminar** por fila/tarjeta: intenta hard delete y, si hay historial (409), ofrece **Desactivar**
- `/productos/[id]` — editar producto (atributos inline, BOM, variantes). Combinaciones y variantes unificadas: selector "Materializar combinación" para crear UNA variante puntual (sin generador masivo). Eliminar producto (header) y eliminar variante (columna Acciones), ambos con fallback a desactivar/bloqueo explicado. Clic en una **fila de variante** abre la página de variante. La selección de valores por atributo se guarda en `localStorage` (`ppg.producto.<id>.sel`, `lib/local-store.ts`) y se restaura al recargar. Los empaques ya **no** se editan aquí: se configuran dentro de la página de variante
- `/productos/[id]/variantes/[vid]` — **página de variante** (`ExistenciaDe` = `GET /inventario/existencia/:vid`): edita nombre, precio (`PATCH .../precio` → `PriceChange`), mín/máx, notas (interno), publicado/crítico/activo; muestra atributos, existencia por ubicación, empaques editables (`components/productos/empaques-variante.tsx`) y últimos movimientos. Eliminar variante con fallback a bloqueo explicado
- `/clientes` — alta/edición en **modal**, importación CSV en **modal**, y vista **Tabla/Grid** (`Segmented`; preferencia en `localStorage` `ppg.clientes.vista`). El grid usa `components/clientes/cliente-card.tsx` (avatar de iniciales). Acción **Eliminar** por fila/tarjeta: intenta hard delete y, si hay ventas (409), ofrece **Desactivar**
- `/catalogos` — atributos globales, categorías, empaques (tabs por sección; `components/catalogos/atributos-globales.tsx`)
- `/tienda/[productId]` — storefront público con pasos guiados
- `/ventas` — alta desde **grid de productos públicos** + modal guiado de configuración; lista, confirmación con neteo y OFs
- `/fabricacion` — OFs con **origen** (venta · cliente, manual, reposición mín/máx) y filtro por origen. Acciones: **+ Nueva OF** (modal con búsqueda de variante) y **Reponer** (selector mín/máx con preview y confirmación). Detalle con líneas de componentes, Iniciar/Cancelar.
- `/inventario` — existencia con toggle **Por ubicación / Por variante / Por variante min max / Por producto**. "Por producto" suma el stock de todas las variantes (misma uom). "Por ubicación" agrupa por ubicación (una fila de ubicación con `rowSpan` y las variantes con stock listadas debajo) e incluye un botón **Filtrar ubicación** que abre un modal con todas las ubicaciones para ver solo una. "Por variante" es una lista `variante · ubicación · cantidad` (una fila por ubicación con stock > 0, agrupada por variante). "Por variante min max" muestra Stock/Mín/Máx por variante. En las vistas "Por ubicación" y "Por variante" la cantidad es editable (ajuste inline, `components/inventario/cantidad-editable.tsx`: Enter/blur confirman, Esc cancela). **Exportar CSV** se genera en el cliente según la vista activa (`lib/csv.ts`), respetando filtros. Botones **Entrada**, **Salida**, **Transferir** (modal adaptativo). (Apertura y Ensamble retirados; los enums del backend los conservan sin uso.)
- **UI compartida (`apps/web/src/components/ui/`)** — `PageHeader`, `Modal`, `ConfirmDialog`, `HelpNote`, `Segmented` (+ tokens/utilidades en `app/globals.css`). Úsalos en vez de inventar clases nuevas

## Scripts útiles
- `scripts/reset-variants.ts` — limpia variantes, limpia atributos/valores
- `scripts/seed-products.ts` — configura estructura BOM + ProductAttributeLine + ProductPasso
- `scripts/seed-demo.ts` — siembra variantes reales + stock + OF de demostración para probar el flujo E3 (reportes/producción); idempotente
- `scripts/seed-demo-ventas.ts` — siembra variantes únicas + combo taparrosca SIN stock para probar el flujo ventas → confirmación → neteo → cascada de OFs (E2); idempotente
- `scripts/odoo-migration/step8-clientes.ts` — migra `scripts/odoo-data/contacts.csv` a Clientes (`Partner`): separa `Persona, Empresa`, omite direcciones hijas, descarta el email de prueba, limpia teléfonos y normaliza a Título; idempotente por nombre+empresa. `--dry` no escribe y genera `scripts/odoo-migration/clientes-revision.csv`
- `scripts/odoo-migration/step9-min-max.ts` — aplica `stockMin/stockMax` desde `min-max.csv` (resuelve por `familiaOdoo`+atributos con `variantes.csv`). Soporta `--file`, `--apply`, `--factor` (máx implícito si Máx=0) y `--pendientes`; en `--pendientes` descuenta lo resuelto (`min-max-resueltos.csv`) y lo omitido (`min-max-omitidos.csv`).
- `scripts/odoo-migration/step10-materializar.ts` — materializa variantes faltantes desde `materializar-faltantes.csv` (clona `baseSku` + `overrides`), crea valores y fija min/máx. `--dry`/`--apply`.
- `scripts/reorg-atributos.ts` — split/rename de atributos por producto desde `atributos-mapping.csv` (re-apunta variantes, ejes, permitidos y pasos). `--dry`/`--apply`.
- `scripts/consolidar-atributos.ts` — consolidación one-off: splits, merges, repunts, renombres, borrado de muertos y normalización de valores (primera mayúscula + colisiones). `--dry`/`--apply`.
- `scripts/finalizar-minmax.ts` — crea el producto PVC y asigna la forma a los Pino del Cepillo Nylon. `--dry`/`--apply`.
- `scripts/reorg-cepillos.ts` — one-off: Cepillo Nylon pasa a identificarse por `Forma de cepillo nylon` + `Grosor cerda` + `Color de Cerda de Cepillo` (elimina `Estado` y `Medidas`; sólo estado Nuevo) y Cepillo Silicon por `Forma de cepillo silicon` (sin `Estado`). Convierte las medidas del "Cepillo Recto" en formas (`Recto Chico/XG/Grande/Mediano/Mini`) y las muestras prosa en `Bala Prosa`/`Balita Prosa`/`Pino Prosa`. Borra los atributos `Medidas` y `Estado` del catálogo. `--dry`/`--apply`.
- `scripts/reorg-cepillos-grosor.ts` — one-off: quita el eje `Grosor cerda` del Cepillo Nylon y mueve el grosor a `notas` (`grosor: N"`); codifica el grosor en la forma (5.75"→`… Prosa`, 4"→`Bala Barradas`/`Pino Barradas`); borra valores de Forma huérfanos. Ejes finales: Forma + Color (todas las formas, incluidas las `… Prosa`, llevan color; por defecto Negro). `--dry`/`--apply`.
- `scripts/seed-cepillos-notas.ts` — carga las medidas/grosor de los cepillos como nota interna de la variante (`ProductVariant.notas`). Idempotente. `--dry`/`--apply`.
- `scripts/reorg-palillos.ts` — one-off: separa el producto `Palillo`: renombra id 42 → `Palillo Sin Cepillo` (eje `Color de Palillo`), crea `Palillo Citologico Sin Cepillo` (`P0032`, eje `Color de Palillo Citologico` solo `Blanco`), `Palillo con Cepillo` (`P0033`, ejes color/cerda/forma) y `Palillo Citologico con Cepillo` (`P0034`, eje `Color de Palillo Citologico`); renumera variantes y define los BOM (palillo + `Cepillo Nylon`, exacto). Idempotente. `--dry`/`--apply`.
- `scripts/odoo-migration/reconcile-stock.ts` — reconcilia `docs/odoo_inv.csv` (Odoo) contra la existencia de PPG (**BD `StockLevel` por defecto**; `--ppg <csv>` usa un export): mapea Odoo→SKU con `mapeo-odoo-ppg.csv`, deja **subensamblados pendientes** (SVC/SVP/VC/VP/SV/Gloss/Tapa con Vástago Sin Rosca) y excluye pigmentos/oficina. Genera `docs/odoo-inventario-diferencias.csv` y `docs/odoo-inventario-correccion.csv`. `--apply` fija `StockLevel` (motivo `ajuste`, ref "reconciliación Odoo") sólo en los renglones `ajuste`; **`--reset`** borra todo el stock (`StockMove` + `StockLevel`) y recarga sólo el snapshot de Odoo actual (qty > 0; negativas omitidas). Destructivo: respaldar con `pg_dump` antes.
- `scripts/odoo-migration/mapeo-odoo-ppg.csv` — crosswalk vivo **por variante**: `sku, producto, uom, familiaOdoo, atributos, stockMin, stockMax, origen(odoo|nuevo)`.
- `scripts/ppg.sh` — único gestor de servidores (alias `ppg` en `~/.bashrc`): `ppg start|stop|restart|reload|status|logs|db`. `start` hace bootstrap completo (Postgres + deps + migraciones) y arranca api+web con hot-reload en background; `reload` aplica migraciones y reinicia; `db <native|docker|auto|stop>` elige el motor de Postgres (persistido como `PPG_DB_MODE` en `.env`). **No siembra.**

## Pendiente
1. **Modularización** — separar código en módulos (Catálogos, Manufactura, etc.)
2. **WSL2** — setup completo de dev en Linux

> **Ventas → OFs recursivas (E2): verificado end-to-end (2026-08-31).** Al confirmar una venta se netea (fabricar vs comprar), se generan OFs únicas en cascada multi-nivel (combo → pincel → vástago) con sus líneas de componentes y la `configuracion` en la OF de ensamble, y el despacho consume stock hasta `despachada`. Durante la verificación se corrigieron 3 bugs:
> - DTO de ventas internas no aceptaba `configuracion` (el service sí la leía, pero `whitelist: true` la descartaba).
> - Doble bucle en `confirmar` generaba cada OF dos veces (neteo + `crearOFS`); se eliminó el bucle redundante y el archivo `ventas.ofs.ts`.
> - `despacharLinea` no hacía `await` del `$transaction`, lo que tumbaba el proceso (unhandled rejection) al lanzar errores de stock; ahora devuelve 400 limpio.

> **Nueva venta (2026-08-31):** el alta de venta ya no usa búsqueda libre de variantes; ahora parte de un
> **grid de productos públicos** (`GET /public/productos`) y cada producto se configura por un **modal guiado
> de pasos** (estilo storefront). El modal y `/tienda` reusan `getPasos` (opciones = variantes **publicadas**
> del producto navegado, filtradas por conjunto de variantes compatibles). En `/productos/[id]` se unificaron
> combinaciones y variantes en una sola vista con el selector "Materializar combinación". Pendiente:
> **imágenes** de opciones (hoy placeholders) y **precios** (ocultos a propósito, los revisa el equipo).

> **UI más clara de procesos (2026-09-30).** Se arreglaron los modales sin estilos y se crearon los
> componentes compartidos `components/ui/` (`PageHeader`, `Modal`, `ConfirmDialog`, `HelpNote`,
> `Segmented`) + tokens/utilidades en `app/globals.css`. `/productos` ya no duplica los tabs de
> catálogos base (se movieron a `/catalogos` con tabs por sección); el detalle de producto tiene
> breadcrumb y navegación numerada; inventario usa toolbar con modales, export CSV discreto y toggle
> de matriz por ubicación/variante; el Inicio muestra dashboard de pendientes; se reemplazaron
> `confirm`/`prompt` por modales. Se eliminó `ventas.ofs.ts` (la recursión de OFs quedó inline en
> `confirmar`, ver VCG §3.2).

## Credenciales
- Admin: `admin` / `admin123`
- PostgreSQL: `postgresql://ppg:ppg@localhost:5432/ppg` (native o Docker, mismo puerto; elige motor con `ppg db <native|docker>`)
- Docker Desktop (Windows) accesible via `host.docker.internal`
