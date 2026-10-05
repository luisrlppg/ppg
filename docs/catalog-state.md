# catalog-state.md — Estado del catálogo

Qué está **vigente hoy** en el catálogo y qué falta. Para *cómo* cambiarlo ver
[`catalog-ops.md`](./catalog-ops.md); para las entidades y tablas, [`data-model.md`](./data-model.md).

## Decisiones vigentes (reorgs ya aplicados)

- **Vendible (2026-10-04):** el selector de Ventas usa `Product.vendible` (no `ProductVariant.published`,
  retirado). Están marcados los 6 con pasos: TP, BTVPE-D/LG/N/S/TN. Se exporta a `catalog.yaml`
  (`product.define` con `vendible: true`).
- **Taparrosca (2026-10-04):** `Altura de Taparrosca` se fusionó dentro de `Forma de
  Taparrosca` (el número es la forma; `Bala`/`Rebeca`/`Gg` conservan nombre; su altura va a
  `notas`). Se eliminó la variante errónea `TPR-0016`. Ops: `scripts/catalog/ops/taparrosca-wizard.yaml`.
- **Taparrosca con Pincel consolidado (2026-10-04):** hay **un solo** producto. Se conservó la fila
  de Odoo (`P0019`, 19 variantes con stock), renombrada a **`Taparrosca con Pincel`**, y se retiró el
  prototipo nativo `TP` (id 5). Se remapearon sus ejes legado
  (`Tipo de Tapa con Pincel`+`Altura de Taparrosca`→`Forma de Taparrosca`,
  `Color de Tapa con Pincel`→`Color de Taparrosca`, `Medida pincel`→`Altura de Mango`) y se agregó
  el BOM + wizard. Se **borraron** `Altura de Taparrosca`, `Color de Tapa con Pincel`,
  `Tipo de Tapa con Pincel` y `Medida pincel`. `Gg` y `Gris` se agregaron a `Forma de Taparrosca`
  y `Color de Taparrosca`. Ops: `scripts/catalog/ops/taparrosca-con-pincel-ensamble.yaml`.
  Ver [`plan-taparrosca.md`](./plan-taparrosca.md).
- **BTVPE (2026-10-04):** eje `Tamaño de Botella` en Botella (`Mini`/`Alta`/`Chica`/`Grande`);
  se retiró `Capacidad de Botella` (mL → `notas`); `Color de Cepillo Silicon` (Blanco/Negro) eje de
  Cepillo Silicon; nylon usa `Color de Cerda de Cepillo` (se retiró `Color de Cepillo Nylon`);
  BTVPE usan `Forma de Sobretapa`. Wizard en **Modelo B** (ops `scripts/catalog/ops/btvpe-reconciliacion.yaml`).
- **Vastago:** sin `Agujero de Vastago` (lo sustituye `Punta`). `Tipo de Vastago` = `Normal`, `Mod-prosa`.
- **`Tipo de Mango` eliminado:** `Pelikan` pasó a `Ceja`; `Normal`/`Plano` se tradujeron a
  `Agujero de Mango`. `Ceja` = `Delgada`, `Gruesa`, `Pelikan`.
- **Taparrosca:** `Tipo de Taparrosca` se fusionó en `Forma de Taparrosca` (gana Forma);
  `Mini yadis` → `Yadis`.
- **Pincel** hereda `Ceja` y `Agujero de Mango` de **Mango** por `(Tamaño rosca, Altura de Mango)`.
- Histórico de los reorgs: `docs/scripts.md` (§ reorganizaciones one-off).

## Valores canónicos (atributos tocados)

| Atributo | Valores |
|---|---|
| `Forma de Taparrosca` | Normal, Bala, Hexagonal, Triangular, Rebeca, Yadis, Gg |
| `Tipo de Vastago` | Normal, Mod-prosa |
| `Ceja` | Delgada, Gruesa, Pelikan |

## Pendientes

- **Taparrosca:** 12 variantes sin `Forma de Taparrosca` (captura manual).
- **Pincel `PIN-0011`** (15/28): sin Mango equivalente → `Ceja`/`Agujero de Mango` pendientes.
- **Crosswalk** `mapeo-odoo-ppg.csv`: 4 SKUs inexistentes (`VST-0014`, `VST-0021`, `VST-0022`,
  `VST-0023`) → `cat:odoo-diff` los reporta; limpiar el crosswalk.
- **`pnpm db:seed` desalineado:** usa nombres viejos (`Altura vastago`, `Forma tapa`…).
  `cat:seed` es el seed bueno del catálogo; decidir si se alinea `seed.ts` o se retira de ahí la
  parte de atributos/productos para no duplicar.

## Capturar cambios manuales

Si editas valores de variantes en la UI, quedan en la BD pero **no** en el repo. Para no perderlos
al recrear la base, corre **`pnpm cat:export-seed`** y commitea `scripts/catalog/seed/catalog.yaml`.

*Última actualización: 2026-10-04.*
