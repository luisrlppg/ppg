# roadmap.md — Pendientes y próximos pasos

Estado y trabajo pendiente de PPG ERP. Para ubicar archivos ver `project-nav.md`.

## Pendientes activos

1. **Modularización** (prioridad actual del equipo): dividir los archivos web masivos. Ya extraídos
   `reportes/page.tsx` (1003→100) a `components/reportes/` y `productos/[id]/page.tsx` (1148→183) a
   `components/productos/detalle/`. Quedan: `inventario/page.tsx` (602), `ventas/page.tsx` (579),
   `fabricacion/page.tsx` (364). La API ya quedó mayormente modularizada.
2. **WSL2** — completar setup de dev en Linux.
3. **Catálogo:** pendientes en [`catalog-state.md`](./catalog-state.md) (`PIN-0011`, decidir si se
   limpian del crosswalk los 4 SKUs `VST` eliminados por `reorg-vastago.ts` —ver
   [`odoo-pendientes.csv`](./odoo-pendientes.csv)).
4. **Órdenes de compra (OC):** no existe entidad persistente. Hoy lo "comprable" va al listado
   `resumen.comprar` / Pendientes de compra (sin documento). Falta un módulo `PurchaseOrder`
   (modelo + API + UI) que consuma `Product.comprable`. Fase siguiente tras E3.
5. **Costos — pendientes:** el costo ya es **configurable por producto** (valores + fórmula, BOM
   automático con merma por valor, y `PriceChange` para el precio base). Falta: (a) precio por
   variante (hoy `ProductVariant.costoCompra` solo como fuente), (b) **historial/versionado de
   costo**, (c) catálogo de tarifas reutilizables (M.O./máquina/moldes), (d) valuación de inventario
   con el costo estándar y (e) costo real de compra/OC. Ver §8.7 de `REQUIREMENTS.md`.
6. **Reporte de consumo de materia prima (futuro):** capturar los consumibles de uso diario
   (cerda, resina, PVC, pigmento…) como un reporte con sus variantes y cantidades, para descontar
   stock y llevar estadística. Hoy **no existe** (el consumo de ensartado se maneja manual); se
   decidió posponerlo (2026-10-07). Ver [`plan-btvpe.md`](./plan-btvpe.md).

## Candidatos a refactor transversal

- Recursión BOM: existe en **3+ copias** (`ventas`, `inventario`, `productos.resolveComponentVariant`,
  `catalogos.atributos-producto`). Extraer a un helper/módulo común.
- Disparo de `monitor.afterStockChange`: unificar el contrato de mutaciones de stock.
- `common/util.ts`: helpers mezclados, candidato a separar.

## Trabajo reciente (contexto)

> **Ventana rodante:** al añadir un hito arriba, mueve el más antiguo a `git log`. Este log no crece
> indefinidamente. Detalle de cambios previos: `git log --oneline`.

- **Gestión de ubicaciones + borrado de usuarios (2026-10-07):** en **Inventario**, botón
  **Ubicaciones** (sólo `admin`) → `components/inventario/ubicaciones-modal.tsx`: crear, renombrar y
  eliminar (sólo si no tiene existencias). Se retiró el selector de `tipo` de la UI (las nuevas son
  `almacen`); nuevo `DELETE /inventario/ubicaciones/:id`. En **Usuarios**, borrado **duro**
  (`DELETE /usuarios/:id`) autorizado con `SUPER_ADMIN_PASSWORD` del entorno; no permite auto-borrado
  ni eliminar el último `admin`.

- **Presupuesto de docs/código + modularización web (2026-10-07):** se fijaron reglas en
  `AGENTS.md`/`conventions.md`: docs de área **≤150 líneas** (tomos de referencia por sección),
  código guía **≤400** (revisar >600) y `docs/catalog-snapshot.*` marcado como **generado** (no
  leer completo). Se modularizaron las dos páginas web más grandes: `reportes/page.tsx` (1003→100) a
  `components/reportes/captura-reporte.tsx` + `components/reportes/captura/paso-*.tsx`, y
  `productos/[id]/page.tsx` (1148→183) a `components/productos/detalle/seccion-*.tsx`. Sin cambios de
  comportamiento; verificado con `tsc --noEmit` y `next build`.

- **Costos por fórmula configurable (2026-10-07):** cada producto define sus **valores/factores**
  (`ProductCostValor`) y una **fórmula**; fuentes `manual`/`bom`/`variante`/`formula`. Nuevos
  `costos.formula.ts` (parser propio sin `eval`), `costos.calc.ts` (BOM recursivo con ciclos/caché) y
  `POST /costos/:productId/preview`. UI `/costos` + `/costos/[productId]`. Migraciones
  `20261007140000_product_cost_valores` y `20261007150000_product_cost_drop_legacy`. El precio base
  sigue editable aquí (`PriceChange`).

- **Precio desde costos y en la venta (2026-10-07):** `PUT /costos/:productId` edita el **precio
  base** (a mano o por margen); en ventas el **precio unitario** por línea es editable al crear
  (`components/ventas/nueva-venta.tsx`) y en venta **abierta** (`PATCH /ventas/:id/lineas/:lineaId/precio`,
  `ventas.service.setLineaPrecio`, `components/ventas/precio-editable.tsx`). Ese precio es de la venta,
  **no** toca catálogo ni `PriceChange`. Sin migración.

- **Despliegue dev → producción automatizado (2026-10-07):** `scripts/deploy.sh`
  (`update`/`status`/`logs`/`backup`/`restore`/`down`; alias `pnpm deploy:*`) hace `git pull` +
  `build` + `up` + `migrate status` y exporta `GIT_SHA`/`BUILD_TIME`. Compose endurecido
  (`POSTGRES_*`, healthcheck `/api/health`, `docs/backups` en postgres), `.env.production.example`,
  restore con respaldo previo + verificación de migraciones; `db:seed` quedó **auth-only**.
  **Build en caché:** los Dockerfiles copian solo los manifiestos antes de `pnpm install`
  (`--frozen-lockfile --ignore-scripts`) y usan BuildKit cache mounts (store de pnpm + `.next/cache`);
  un `update` que solo cambia código no reinstala dependencias ni recompila todo.

- **Pigmentos en inventario (2026-10-07):** producto `Pigmento` (`PIG`, **comprable**, `uom kg`) con
  4 ejes; 39 pastas de color cargadas en `PIG1/PIG2/PIG3` como `PIG-<color>` (**40** variantes) vía
  `scripts/catalog/ops/pigmentos*.yaml`. Nuevo **costo de compra por variante**
  (`ProductVariant.costoCompra`, migración `20261007130000_variant_costo_compra`).

- **Inventario histórico aislado (2026-10-07):** tablas `InventarioHistorico`(+`...Atributo`) para
  descontinuados/subensambles sin tocar el inventario vivo; módulo `apps/api/src/inventario-historico/`
  y página `/inventario-historico`; carga `docs/inventario-historico-inicial.csv` (61 filas).
  Migración `20261007120000_inventario_historico`.

- **Ensartado por pasos (2026-10-06):** el Paso 2 de `/reportes` elige el mango **paso a paso**
  (Ceja→Tamaño rosca→Altura→Agujero) con auto-salto y solo combinaciones que resuelven pincel;
  `reportes.service.ensartado` devuelve `ejes`/`mangos`.

- **Etiqueta de embarque por línea de venta (2026-10-06):** PDF con `@react-pdf/renderer`
  (`components/ventas/modal-etiqueta.tsx` + `etiqueta-pdf.tsx`, 200×102.1 mm); `lib/imagenes.ts`.

- **Paso 2 "Ensartado" en el reporte (2026-10-06):** `GET /reportes/ensartado` cruza Pincel y Mango y
  devuelve `mangos`/`colores`/`combinaciones`; cada pincel agrega línea `final` + `consumo` del mango.

- **Bandeja de aceptación retirada + ubicación unificada (2026-10-06):** la aceptación se fusionó con
  **ubicar** en `/bandeja`; `fabricacion.registrarProduccion` delega en `reportes.registrarProduccionInterna`
  (reporte interno aplicado) y todo lo producido queda en "Recibo de Producción".

- **Captura del reporte diario por pasos (2026-10-06):** setup Matutino/Vespertino + wizard Nylon
  (máquina→forma→color→cantidad); `GET /reportes/cepillos-nylon`; horas derivadas del turno (sin prefill).

- **Desglose de venta en árbol plegable (2026-10-06):** `GET /ventas/:id/desglose` agrega `arbol`
  (`DesgloseNodo`, `planificacion.desglosar`); UI en `app/ventas/page.tsx`.

- **Hitos anteriores (2026-10-05 y previos):** prioridad manual de fabricación; desglose según lo
  pendiente y retiro de "Pendientes de compra" de la venta; wizard de Taparrosca paso a paso;
  roles `admin`/`operador` + módulo `usuarios/` + app protegida (`@Public()`, guards globales);
  menú por secciones y retiro de la página Monitor (backend intacto); fabricación sin OF
  (`ManufacturingOrder` retirada) con `necesidades`/`produccion`; desglose de componentes en ventas;
  restore aplica migraciones; cierre de OFs desde Fabricación; resolución determinista de BOM
  (`PREFERENCIAS_RESOLUCION`); Costos v1 (superado por el motor de fórmula); nota de venta en PDF real;
  selector de variantes por atributos; buscador/encabezados fijos y productos alfabético; mín/máx
  editable; flags fabricable/comprable; vendible en Ventas y retiro de `published`; alta de venta en
  modal; wizard de ventas Modelo B; toolkit de catálogo + seed declarativo (`cat:*`); reorgs de
  catálogo; UI compartida `components/ui/`; atributos consolidados; ensamble de inventario retirado;
  pendientes Odoo consolidados (`odoo-pendientes.csv`).

## Verificaciones end-to-end

- **E3 (reportes → confirmación → ubicar):** verificado 2026-08-31 con `scripts/seed-demo.ts`.
- **E2 (venta → confirmación → desglose multi-nivel → despacho/consumo → `despachada`):**
  verificado 2026-08-31 con `scripts/seed-demo-ventas.ts`. Durante la verificación se corrigieron 3 bugs:
  1. El DTO de ventas internas no aceptaba `configuracion` (`whitelist: true` la descartaba).
  2. Doble bucle en `confirmar` generaba cada OF dos veces; se eliminó el bucle redundante y `ventas.ofs.ts`.
  3. `despacharLinea` no hacía `await` del `$transaction`, tumbando el proceso; ahora devuelve 400 limpio.
