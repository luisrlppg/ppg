# Plan Taparrosca — wizard desde componentes (Modelo B)

> Estado: **consolidado** (2026-10-04). Ops: `scripts/catalog/ops/taparrosca-con-pincel-ensamble.yaml`.
> El plan original está en el historial de git; esta versión refleja el resultado final.

## 1. Contexto

Hubo **dos** productos parecidos:

- **Taparrosca con Pincel** (`TP`, id 5) — prototipo nativo PPG: ensamble con BOM
  `Taparrosca + Pincel` y wizard Modelo B, pero **sin variantes reales ni stock**.
- **Tapa con Pincel** (`P0019`, id 49) — **importado de Odoo** (`ln`): 19 variantes
  materializadas con stock real (209k u) y esquema de atributos plano (sin BOM ni wizard).

**Decisión:** quedarse con **una sola fila**, la de Odoo (por su stock e historial),
**renombrada a `Taparrosca con Pincel`**, y llevarle el BOM + wizard. Se eliminó el prototipo
nativo `TP` (sin historial). No se migró stock: se remapearon los ejes sobre la propia `P0019`.

## 2. Remapeo de ejes (P0019)

| Eje legado (Odoo) | Eje final |
|---|---|
| `Tipo de Tapa con Pincel` + `Altura de Taparrosca` | `Forma de Taparrosca` |
| `Color de Tapa con Pincel` | `Color de Taparrosca` |
| `Medida pincel` (`24`,`33`,`35`,`35 plano`) | `Altura de Mango` (`24mm`,`33mm`,`35mm`) |

Reglas:
- `Normal + altura` → el número (`30mm`, `38mm`, `44mm`, `25mm`); `Hexagonal`/`Yadis`/`Rebeca`/`Gg`
  conservan su nombre.
- `35 plano` → `Altura de Mango = 35mm` **y** `Agujero de Mango = Plano`; el resto `Normal`.
- `Gris` se agregó a `Color de Taparrosca`; `Gg` se agregó a `Forma de Taparrosca`.
- Se agregaron 4 variantes de **Taparrosca** para cubrir las 19 combinaciones:
  `15mm/25mm/Gris`, `13mm/Gg/{Negro,Blanco}`, `13mm/Rebeca/Rosa ultra`.

Ejes finales del ensamble: `Tamaño rosca`, `Forma de Taparrosca`, `Color de Taparrosca`,
`Altura de Mango`, `Agujero de Mango`, `Color de Cerda de Pincel`.

Se **borraron** los atributos legado `Altura de Taparrosca`, `Color de Tapa con Pincel`,
`Tipo de Tapa con Pincel` y `Medida pincel`.

## 3. Pasos del wizard (un `panel` por paso)

1. "Selecciona la rosca" → `Tamaño rosca` (componente **Taparrosca**)
2. "Selecciona la tapa" → `Forma de Taparrosca` (Taparrosca)
3. "Selecciona el color de la taparrosca" → `Color de Taparrosca` (Taparrosca)
4. "Selecciona una altura de mango" → `Altura de Mango` (**Pincel**)
5. "Selecciona el agujero" → `Agujero de Mango` (**Pincel**)
6. "Selecciona el color de cerda" → `Color de Cerda de Pincel` (**Pincel**)

## 4. Resolución de componentes

`resolveComponentVariant` casa por **intersección** de ejes: el componente puede tener ejes
extra que no vienen del ensamble (p. ej. **`Ceja`** en Pincel, que se hereda de Mango). Si hay varios
candidatos, desempata de forma determinista (`PREFERENCIAS_RESOLUCION` → mayor stock → menor id;
ver `conventions.md` §6), ya no devuelve `null` por ambigüedad. Verificado: las **19/19** variantes de
P0019 resuelven su Taparrosca y Pincel.

## 5. Verificación

- Ops idempotentes (segunda corrida: 0 cambios efectivos).
- `cat:seed` (dry-run) sobre la BD consolidada: 0 cambios; el seed ya no contiene `TP` ni los
  atributos legado.
- Las 19 variantes de P0019 resuelven Taparrosca + Pincel por el BOM.
