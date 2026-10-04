# catalog-state.md — Estado del catálogo

Qué está **vigente hoy** en el catálogo y qué falta. Para *cómo* cambiarlo ver
[`catalog-ops.md`](./catalog-ops.md); para las entidades y tablas, [`data-model.md`](./data-model.md).

## Decisiones vigentes (reorgs ya aplicados)

- **Taparrosca (2026-10-04):** `Altura de Taparrosca` se fusionó dentro de `Forma de
  Taparrosca` (el número es la forma; `Bala`/`Rebeca` conservan nombre; su altura va a
  `notas`). Se eliminó la variante errónea `TPR-0016`. El color del ensamble usa
  `Color de Taparrosca`. `Altura de Taparrosca` y `Color de Tapa con Pincel` se conservan
  porque los usa "Tapa con Pincel". Ops: `scripts/catalog/ops/taparrosca-wizard.yaml`.
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
| `Forma de Taparrosca` | Normal, Bala, Hexagonal, Triangular, Rebeca, Yadis |
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
