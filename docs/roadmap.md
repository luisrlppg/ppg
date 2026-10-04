# roadmap.md — Pendientes y próximos pasos

Estado y trabajo pendiente de PPG ERP. Para ubicar archivos ver `project-nav.md`.

## Pendientes activos

1. **Modularización** (prioridad actual del equipo): dividir los archivos web masivos:
   `productos/[id]/page.tsx` (954), `inventario/page.tsx` (779), `reportes/page.tsx` (718),
   `ventas/page.tsx` (469), `fabricacion/page.tsx` (431). La API ya quedó mayormente modularizada.
2. **WSL2** — completar setup de dev en Linux.
3. **Catálogo:** pendientes en [`catalog-state.md`](./catalog-state.md) (Taparrosca sin `Forma`,
   `PIN-0011`, crosswalk con SKUs inexistentes, `db:seed` desalineado vs `cat:seed`).
4. **Órdenes de compra (OC):** no existe entidad persistente. Hoy lo "comprable" va al listado
   `resumen.comprar` / Pendientes de compra (sin documento). Falta un módulo `PurchaseOrder`
   (modelo + API + UI) que consuma `Product.comprable`. Fase siguiente tras E3.
5. **Seed de catálogo y flags de suministro:** `Product.fabricable`/`comprable` se editan en la UI
   pero `scripts/catalog/` (engine + `catalog.yaml`) aún **no** los declara → al re-seedear quedan en
   `false`. Pendiente extender las ops de catálogo.

## Candidatos a refactor transversal

- Recursión BOM: existe en **3+ copias** (`ventas`, `inventario`, `productos.resolveComponentVariant`,
  `catalogos.atributos-producto`). Extraer a un helper/módulo común.
- Disparo de `monitor.afterStockChange`: unificar el contrato de mutaciones de stock.
- `common/util.ts`: helpers mezclados, candidato a separar.

## Trabajo reciente (contexto)

- **Buscador/encabezados fijos y productos alfabético (2026-10-04):** el área de contenido
  (`.content`) pasó a ser el contenedor de scroll (`100dvh; overflow:auto`; sidebar fijo) y el
  `thead` de `.table` se pega debajo de un `StickyBar` (mide su alto en `--sticky-head`). Aplicado
  en productos, clientes, ventas e inventario; se quitó `overflow:hidden` de las tarjetas con tablas
  y `.table-wrap` dejó de scrollear (el horizontal lo hace `.content`). Además, `GET /productos`
  ahora ordena **siempre alfabético por `nombre`** (antes por `updatedAt`, que reordenaba al editar).
- **Eliminar producto solo desde el detalle (2026-10-04):** se quitó el botón "Eliminar" de la
  lista de productos (tabla y tarjetas) para reducir el riesgo de borrados accidentales; el alta
  sigue igual. El borrado (con fallback a desactivar) queda únicamente en la ficha del producto
  (`productos/[id]`).
- **Paso 2 de nueva venta como lista (2026-10-04):** el selector de producto dejó de ser un grid
  de tarjetas y ahora es una **lista filtrable** por nombre/SKU. Al hacer clic: producto con pasos
  abre `modal-config-variante.tsx` (wizard); sin pasos con varias variantes abre el nuevo
  `components/ventas/modal-seleccion-variante.tsx` (selección simple + cantidad); con una sola
  variante se agrega directo; sin variantes la fila queda deshabilitada. Se eliminó el `<select>`
  de variante por tarjeta (`varianteSel`).
- **Inventario sin vista "Por producto" (2026-10-04):** se eliminó la vista y su export
  (`inventario-por-producto.csv`); el resumen por producto (variantes/stock) ya se ve en la tabla
  de `/productos`. Inventario queda con 3 vistas: Por ubicación / Por variante / Min Max.
- **Mín/máx editable en inventario (2026-10-04):** la vista **Min Max** de `/inventario` (antes
  "Por variante min max") ahora edita inline las celdas Mín/Máx con `CantidadEditable` (props
  nuevas `title`/`min`); guarda vía `PATCH /inventario/variantes/:vid/minmax`, disponible para
  **todos** los roles. El endpoint es dedicado para no ampliar `PATCH /productos/variantes/:vid`
  (admin/supervisor), que además permite nombre/activo/notas. No dispara el monitor: el estado se
  recalcula en el siguiente movimiento/consulta (paridad con `productos.updateVariant`).
- **Flags de suministro fabricable/comprable (2026-10-04):** `Product` ganó `fabricable` y
  `comprable` (migración `20261004160000_product_fabricable_comprable`, backfill desde el BOM:
  fabricable = tiene componentes exactos; comprable = no). El **neteo** (`planificacion.service`)
  ahora decide fabricar/compra por estos flags en vez de por la sola presencia de BOM: un fabricable
  sin componentes genera OF sin líneas; "ambos" prioriza fabricar. Las guardas de `fabricacion`
  (alta manual y reposición) exigen `fabricable`. UI: checkboxes en ficha y lista de productos, y en
  el alta. Sin OC persistente todavía (ver pendiente 4).
- **Impresión de venta + IVA (2026-10-04):** en `/ventas` se agregó el componente
  `components/ventas/documento-venta.tsx` (overlay + `window.print()`), con encabezado de empresa
  (solo "Plásticos Plasa"), nº de orden (`SalesOrder.numero`), fecha, **nº de cliente** (= `Partner.id`),
  datos del cliente, desglose por línea con **imagen** (`variant.imagen ?? product.imagen`), precio,
  cantidad y subtotal, y **toggle de IVA 16%** (precios netos; el documento inicia sin IVA). Se lanza
  desde el botón "Imprimir" del detalle y automáticamente al crear una venta. La API `ventas.get`
  ahora devuelve `imagen` por línea. Sin migración. Pendiente E5: cotización/facturación formal.
- **Vendible en Ventas + retiro de `published` (2026-10-04):** el selector del modal de Ventas
  ahora lista solo productos con `Product.vendible = true` (`public.service.productosPublicos`);
  se marca con el checkbox "Vendible en Ventas" en el detalle y en la lista de productos. Se
  eliminó `ProductVariant.published` (columna, checkboxes y usos en catálogo/seed); el modal vende
  los productos sin pasos eligiendo una variante activa directo, y mantiene el wizard para los que
  tienen `ProductPasso`. Migración backfillea `vendible=true` en los 6 productos con pasos.
- **Wizard de Taparrosca (2026-10-04):** "Taparrosca con Pincel" pasó a Modelo B. Se fusionó
  `Altura de Taparrosca` dentro de `Forma de Taparrosca` (el número es la forma; `Bala`/`Rebeca`
  conservan nombre, altura a `notas`); se eliminó la variante errónea `TPR-0016`; el color del
  ensamble usa `Color de Taparrosca`. Pasos: rosca → tapa → color → altura de mango → agujero →
  color de cerda (bloque aplicador desde **Pincel**). Ops `scripts/catalog/ops/taparrosca-wizard.yaml`.
  Ver [`plan-taparrosca.md`](./plan-taparrosca.md). Pendiente: verificar en runtime el color de cerda.
- **Alta de venta en modal con wizard (2026-10-04):** la vista "Nueva venta" (`/ventas`) ahora abre un
  `Modal` con wizard de 3 pasos (Cliente → Producto → Revisión) y stepper; el stepper y las acciones
  quedan fijos y solo la lista hace scroll interno. Permite **crear el cliente sin salir** desde
  `components/clientes/cliente-form-modal.tsx` (compartido con `/clientes`); el cliente es opcional
  ("Sin asignar"). Se dejaron de pedir **fecha de entrega** y **notas** en la UI (siguen como campos
  opcionales del dominio). Ver [§7.2](../REQUIREMENTS.md).
- **Wizard de ventas — Modelo B (2026-10-04):** los pasos guiados (`ProductPasso`) pasaron a tomar
  las opciones de las **variantes activas del componente** (`variantProductId`), no del producto
  vendido. Se agregó `panel` (agrupa pasos; reemplaza el regex de color), `getPasos(id, seleccion)`
  con cascada server-side y `resolverConfiguracion` (materializa/reutiliza la variante vendible;
  tienda crea, venta interna pregunta). Nuevos endpoints `GET/POST public/productos/:id/pasos` y
  `POST public/productos/:id/resolver`; editor de pasos en `/productos/[id]` (`GET/PUT
  /productos/:id/pasos`); lógica compartida en `lib/pasos-wizard.ts`. Aplicado a los 5 BTVPE
  (botella primero + `Tamaño de Botella`, colores por componente, `Forma de Sobretapa`). Ops en
  `scripts/catalog/ops/btvpe-reconciliacion.yaml`. Ver [`plan-btvpe.md`](./plan-btvpe.md).
- **Toolkit de catálogo + seed declarativo (2026-10-04):** `scripts/catalog/` con
  `snapshot`/`apply`/`odoo-diff`/`export-seed`; alias `cat:snapshot|apply|odoo-diff|export-seed|seed|stock`.
  El catálogo se define con ops YAML idempotentes y se reproduce con el seed versionado
  (`scripts/catalog/seed/`). Verificado: reconstruye la BD actual con 0 cambios y un schema vacío con
  los mismos conteos. Ver [`catalog-ops.md`](./catalog-ops.md) y [`catalog-state.md`](./catalog-state.md).
- **Reorgs de catálogo (2026-10-03/04):** Vastago (quita `Agujero de Vastago`, `Tipo de Vastago` =
  Normal/Mod-prosa); `Tipo de Mango` → `Ceja`+`Agujero de Mango` (Pincel sincronizado desde Mango);
  Taparrosca `Tipo de Taparrosca` → `Forma de Taparrosca` y `Mini yadis` → `Yadis`.
- **UI más clara de procesos (2026-09-30):** se crearon los componentes compartidos `components/ui/`
  (`PageHeader`, `Modal`, `ConfirmDialog`, `HelpNote`, `Segmented`) + tokens en `app/globals.css`.
  `/productos` ya no duplica tabs de catálogos (movidos a `/catalogos`); el detalle de producto tiene
  breadcrumb y navegación numerada; inventario usa toolbar con modales y toggle de 4 vistas; el Inicio
  muestra dashboard de pendientes; se reemplazaron `confirm`/`prompt` por modales. Se eliminaron
  `ui/badge.tsx` y `ui/empty-state.tsx`.
- **Nueva venta (2026-08-31, reorganizada 2026-10-04):** el alta parte de un **grid de productos
  públicos** + **modal guiado** (estilo storefront) en vez de búsqueda libre; hoy precedido por el
  paso de cliente (ver entrada de alta en modal más arriba). El modal y `/tienda` reusan `getPasos` (opciones =
  variantes publicadas del producto navegado) y filtran por conjunto de variantes compatibles (intersección
  por `variantId`). En `/productos/[id]` se unificaron combinaciones y variantes con "Materializar
  combinación" (sin generador masivo). **Pendiente:** imágenes de opciones (hoy placeholders) y precios
  (ocultos a propósito, los revisa el equipo).
- **Atributos consolidados (2026-10-03):** catálogo global separado por producto (`<Propiedad> de <Producto>`),
  merges de duplicados, normalización a primera mayúscula y borrado de muertos. Ver `data-model.md`.
- **Mín/máx Odoo (2026-10-03):** migrados con `step9-min-max.ts` + `step10-materializar.ts` +
  `finalizar-minmax.ts`; crosswalk en `mapeo-odoo-ppg.csv`. Único pendiente:
  `Botella 1580 (Color: transparente)`. `Tapa con Pincel` no lleva mín/máx (por regla).
- **Ensamble de inventario retirado (2026-10-02):** `inventario.ensamble.ts` / `POST /inventario/ensamble`
  eliminado; "Ensamble" queda sólo como tipo de OF. El enum `MotivoStock.ensamble` se conserva para histórico.

## Verificaciones end-to-end

- **E3 (reportes → confirmación → ubicar):** verificado 2026-08-31 con `scripts/seed-demo.ts`.
- **E2 (venta → confirmación → neteo → cascada de OFs multi-nivel → despacho/consumo → `despachada`):**
  verificado 2026-08-31 con `scripts/seed-demo-ventas.ts`. Durante la verificación se corrigieron 3 bugs:
  1. El DTO de ventas internas no aceptaba `configuracion` (`whitelist: true` la descartaba).
  2. Doble bucle en `confirmar` generaba cada OF dos veces; se eliminó el bucle redundante y `ventas.ofs.ts`.
  3. `despacharLinea` no hacía `await` del `$transaction`, tumbando el proceso; ahora devuelve 400 limpio.
