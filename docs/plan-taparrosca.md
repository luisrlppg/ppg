# Plan Taparrosca — wizard desde componentes (Modelo B)

> Estado: **aplicado** (2026-10-04). Ops: `scripts/catalog/ops/taparrosca-wizard.yaml`.

## 1. Contexto

"Taparrosca con Pincel" (`TP`) es el ensamble vendible de **Taparrosca** + **Pincel**.
Antes el wizard usaba `Mango`/`Pincel` y el atributo `Color de Tapa con Pincel`; se
re-alineó al Modelo B (opciones desde las variantes activas del **componente**).

## 2. Fusión Forma/Altura de tapa (DECISIÓN CLAVE)

La **altura de taparrosca** se fusionó dentro de **`Forma de Taparrosca`**: el valor
de la forma pasa a ser el número de altura (con sufijo `mm`), o el nombre cuando no hay
altura. Se elimina `Altura de Taparrosca` como eje de Taparrosca (su valor queda en
`ProductVariant.notas`).

Mapeo (rosca → formas):

| Rosca | Formas |
|---|---|
| 10mm | `18mm`, `37mm` |
| 13mm | `23mm`, `30mm`, `44mm`, `Bala`, `Rebeca`, `Triangular`, `Yadis` |
| 15mm | `25mm`, `26mm`, `38mm`, `Hexagonal`, `Rebeca`, `Yadis` |
| 18mm | `38mm` |

Reglas:
- `Normal + altura` → el número (`18mm`, `30mm`, …). Nunca queda "Normal".
- `Bala` conserva **`Bala`**; su altura (`35mm`) va a **notas**.
- `Yadis 30mm` (13) y `Yadis 38mm` (15) → **`Yadis`**; `Triangular 44mm` → **`Triangular`**;
  `Hexagonal 38mm` → **`Hexagonal`**.
- `Rebeca` (sin altura) → **`Rebeca`**.
- Se **eliminó** la variante errónea `TPR-0016` (13mm Yadis 38mm).

Todas las variantes guardan `notas: "Altura original: NNmm"`.

## 3. Atributos conservados por otro producto

`Altura de Taparrosca` y `Color de Tapa con Pincel` **no se borran**: los usa el producto
**"Tapa con Pincel"**. En "Taparrosca"/"Taparrosca con Pincel" solo se retiran como ejes/
pasos. El color del ensamble se migró a **`Color de Taparrosca`**.

## 4. Pasos del wizard (un `panel` por paso)

1. "Selecciona la rosca" → `Tamaño rosca` (componente **Taparrosca**)
2. "Selecciona la tapa" → `Forma de Taparrosca` (Taparrosca)
3. "Selecciona el color de la taparrosca" → `Color de Taparrosca` (Taparrosca)
4. "Selecciona una altura de mango" → `Altura de Mango` (**Pincel**)
5. "Selecciona el agujero" → `Agujero de Mango` (**Pincel**)
6. "Selecciona el color de cerda" → `Color de Cerda de Pincel` (**Pincel**)

> **Bloque aplicador (pasos 4-6) todo desde Pincel.** Mango y Pincel no comparten
> todo el set de `(rosca, altura, agujero)`; al elegir altura/agujero desde Pincel, el
> paso de color de cerda no queda vacío. La cascada funciona por ejes compartidos.

## 5. Pendiente de verificación runtime

La cascada final (rosca→tapa→color→altura→agujero→**cerda**) quedó **por confirmar en
runtime** (el color de cerda no debe salir vacío). Verificación sugerida: `getPasos`
con selección acumulada, o manual en tienda/modal.
