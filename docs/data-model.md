# data-model.md — Modelo de datos PPG

Resumen del modelo **específico de PPG**. La especificación formal de tablas está en
[`../REQUIREMENTS.md`](../REQUIREMENTS.md) §4 (Modelo de datos v1) y el esquema real en
`packages/db/prisma/schema.prisma`.

## Gestión del catálogo

El catálogo se cambia con **ops declarativas** y se reproduce con el **seed**:
[`catalog-ops.md`](./catalog-ops.md) (cómo) y [`catalog-state.md`](./catalog-state.md) (estado y pendientes).

## Entidades clave

- **`Attribute` es global** (sin `productId`).
- **`ProductAttributeLine`** asigna atributos a productos (N:N).
- Los **ejes pueden restringirse** con `ProductAttributeValue`: subconjunto de valores del atributo
  válidos para el producto. Si no hay filas para el par (producto, atributo) → se asumen **todos** los
  valores del atributo (fallback implementado por `common/valores-permitidos.ts`).
- Atributos **propios vs heredados** (de componentes del BOM).
- **`ProductVariant.notas`** — texto libre **interno** por variante (p. ej. medidas del cepillo).
  No es eje ni se expone en la tienda.
- **`ProductPasso`** — pasos del storefront (ver abajo).
- **`ProductComponent`** — BOM; componentes `exacto` vs `consumible`.

## Productos base

IDs/SKU reales (la BD manda; verifícalos con `pnpm cat:snapshot`):

- **Mango** (id 1, `VAST`) — mango; componente de las líneas con mango.
- **Cerda** (id 2, `CERD`) — uom `kg`, consumible.
- **Pincel** (id 3, `PIN`) — pincel (ejes `Ceja`, `Altura de Mango`, `Agujero de Mango`,
  `Tamaño rosca`, `Color de Cerda de Pincel`); hereda `Ceja`/`Agujero` de Mango.
- **Taparrosca** (id 4, `TPR`) — tapa (ejes `Altura/Color/Forma de Taparrosca` + `Tamaño rosca`).
- **Taparrosca con Pincel** (id 5, `TP`) — ensamble: Pincel + Taparrosca.
- **Vastago** (id 7, `VST`) — vástago; sin BOM.
- **Sobretapa** (id 8, `STP`) · **Escurridor** (id 9, `ESC`) · **Cepillo Silicon** (id 10, `CSI`) ·
  **Cepillo Nylon** (id 11, `CNI`).
- **PVC** (id 86, `PVC`) — uom `kg`.
- **Palillos** (reorg `scripts/reorg-palillos.ts`):
  - **Palillo Sin Cepillo** (id 42, `P0014`) — componente; eje `Color de Palillo`.
  - **Palillo Citologico Sin Cepillo** (`P0032`) — componente; eje `Color de Palillo Citologico` (sólo `Blanco`).
  - **Palillo con Cepillo** (`P0033`) — ensamble final; BOM `Palillo Sin Cepillo` + `Cepillo Nylon` (exacto);
    ejes `Color de Palillo` + `Color de Cerda de Cepillo` + `Forma de cepillo nylon`.
  - **Palillo Citologico con Cepillo** (`P0034`) — ensamble final; BOM `Palillo Citologico Sin Cepillo` + `Cepillo Nylon`;
    ejes `Color de Palillo Citologico` + `Color de Cerda de Cepillo` + `Forma de cepillo nylon`.
- **BTVPE** (envases cosméticos) — plan en [`plan-btvpe.md`](./plan-btvpe.md).

## Atributos (consolidados 2026-10-03)

Globales, asignados por producto. **Convención "un atributo por producto"**
(`<Propiedad> de <Producto>`):

`Altura de Mango`, `Altura de Vastago`, `Altura de Taparrosca`, `Altura de Botella`,
`Altura de Escurridor`, `Altura de Sobretapa`, `Color de Botella`, `Color de Vastago`,
`Color de Sobretapa`, `Color de Escurridor`, `Color de Taparrosca`, `Color de Tapon`,
`Color de Tapa con Pincel`, `Color de Palillo`, `Color de Cepillo Nylon`,
`Color de Cepillo Silicon`, `Color de Cerda de Pincel`, `Color de Cerda de Cepillo`,
`Color de PVC`, `Tipo de Vastago`, `Tipo de Botella`,
`Tipo de Tapa con Pincel`, `Tipo de Sobretapa`, `Tipo de Punta`, `Forma de Taparrosca`,
`Forma de Sobretapa`, `Forma de cepillo nylon`, `Forma de cepillo silicon`,
`Agujero de Escurridor`, `Agujero de Mango`, `Tamaño de Caja de Cartón`, `Capacidad de Botella`.

**Compartidos legítimos:** `Tamaño rosca`, `Ceja`, `Punta`, `Grosor cerda`, `Medida pincel`,
`Logo`, `Versión del vástago`, `Densidad`.

- Estilo de valores: **primera letra mayúscula**, sin duplicados dentro del mismo atributo.
- **PVC** (uom kg) usa `Color de PVC` (`Violeta`, `Transparente`).

### Cepillos

- **Cepillo Nylon** se identifica por `Forma de cepillo nylon` + `Color de Cerda de Cepillo`.
  El **grosor de cerda va como nota interna** de la variante (`grosor: N"`; y para los Recto,
  `medida · grosor: 5"`). El grosor se codifica además en la forma: 5" default, 5.75" → forma
  `… Prosa`, 4" → `Bala Barradas`/`Pino Barradas`, 3" → `Citologico`.
- **Cepillo Silicon** por `Forma de cepillo silicon` (sin `Estado`).
- Las medidas del "Cepillo Recto" se volvieron formas (`Recto Chico/XG/Grande/Mediano/Mini`) y las
  muestras prosa `Bala Prosa`/`Balita Prosa`/`Pino Prosa`.
- Herramientas: `scripts/reorg-cepillos.ts` + `scripts/reorg-cepillos-grosor.ts`
  (quita el eje `Grosor cerda`).

## Pasos del storefront (`ProductPasso`)

- **6 pasos** para Taparrosca con Pincel (pasos 1-3 → Vástago, paso 4 → Pincel, pasos 5-6 → Taparrosca).
- Aunque `variantProductId` apunta a los componentes, `getPasos` arma las opciones de cada paso
  desde las **variantes publicadas del producto navegado** (`productId`), porque los componentes
  (Vástago/Pincel) no siempre tienen variantes reconvertidas por atributo. `variantProductId` sólo
  se conserva por compatibilidad en la respuesta.

## Reglas de negocio relevantes

En [`../REQUIREMENTS.md`](../REQUIREMENTS.md) §5: una variante para todo, variante real vs perezosa
(combo), sobrantes ensamblados, marco de decisión producto vs variante, empaques/precio por dimensión,
BOM `exacto` vs `consumible`, unidades de medida y ubicaciones. **El registro de ensamble con BOM en
inventario fue retirado (2026-10-02)**; ver §5.4.
