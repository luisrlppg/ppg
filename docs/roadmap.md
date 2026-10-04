# roadmap.md — Pendientes y próximos pasos

Estado y trabajo pendiente de PPG ERP. Para ubicar archivos ver `project-nav.md`.

## Pendientes activos

1. **Modularización** (prioridad actual del equipo): dividir los archivos web masivos:
   `productos/[id]/page.tsx` (954), `inventario/page.tsx` (797), `reportes/page.tsx` (718),
   `ventas/page.tsx` (469), `fabricacion/page.tsx` (431). La API ya quedó mayormente modularizada.
2. **WSL2** — completar setup de dev en Linux.
3. **Catálogo:** pendientes en [`catalog-state.md`](./catalog-state.md) (Taparrosca sin `Forma`,
   `PIN-0011`, crosswalk con SKUs inexistentes, `db:seed` desalineado vs `cat:seed`).

## Candidatos a refactor transversal

- Recursión BOM: existe en **3+ copias** (`ventas`, `inventario`, `productos.resolveComponentVariant`,
  `catalogos.atributos-producto`). Extraer a un helper/módulo común.
- Disparo de `monitor.afterStockChange`: unificar el contrato de mutaciones de stock.
- `common/util.ts`: helpers mezclados, candidato a separar.

## Trabajo reciente (contexto)

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
