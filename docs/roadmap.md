# roadmap.md — Pendientes y próximos pasos

Estado y trabajo pendiente de PPG ERP. Para ubicar archivos ver `project-nav.md`.

## Pendientes activos

1. **Modularización** (prioridad actual del equipo): dividir los archivos web masivos:
   `productos/[id]/page.tsx` (954), `inventario/page.tsx` (797), `reportes/page.tsx` (718),
   `ventas/page.tsx` (472), `fabricacion/page.tsx` (431). La API ya quedó mayormente modularizada.
2. **WSL2** — completar setup de dev en Linux.

## Candidatos a refactor transversal

- Recursión BOM: existe en **3+ copias** (`ventas`, `inventario`, `productos.resolveComponentVariant`,
  `catalogos.atributos-producto`). Extraer a un helper/módulo común.
- Disparo de `monitor.afterStockChange`: unificar el contrato de mutaciones de stock.
- `common/util.ts`: helpers mezclados, candidato a separar.

## Trabajo reciente (contexto)

- **UI más clara de procesos (2026-09-30):** se crearon los componentes compartidos `components/ui/`
  (`PageHeader`, `Modal`, `ConfirmDialog`, `HelpNote`, `Segmented`) + tokens en `app/globals.css`.
  `/productos` ya no duplica tabs de catálogos (movidos a `/catalogos`); el detalle de producto tiene
  breadcrumb y navegación numerada; inventario usa toolbar con modales y toggle de 4 vistas; el Inicio
  muestra dashboard de pendientes; se reemplazaron `confirm`/`prompt` por modales. Se eliminaron
  `ui/badge.tsx` y `ui/empty-state.tsx`.
- **Nueva venta (2026-08-31):** el alta parte de un **grid de productos públicos** + **modal guiado**
  (estilo storefront) en vez de búsqueda libre. El modal y `/tienda` reusan `getPasos` (opciones =
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
