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
- **BTVPE — Tamaño de Botella (2026-10-04):** el componente **Botella** tiene el eje
  `Tamaño de Botella` (`Mini` 10mm/48mm, `Alta` 10mm/80mm, `Chica` 15mm/60mm, `Grande` 15mm/80mm),
  derivado de `Tamaño rosca` + `Altura de Botella`. Reemplaza al extinto `Capacidad de Botella`
  (mL); la capacidad fue a `notas`. Los BTVPE restrictan a `Chica,Grande` (o los 4 en Delineador/
  Tratamiento de Noche).
- **Colores:** `Color de Cepillo Silicon` (Blanco/Negro) es eje de **Cepillo Silicon**; el cepillo
  nylon usa `Color de Cerda de Cepillo` (se retiró `Color de Cepillo Nylon`). Los BTVPE usan
  `Forma de Sobretapa` (no `Forma de Taparrosca`, que sigue para otros productos).
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

- **Modelo B (vigente 2026-10-04):** cada paso saca sus opciones de las **variantes activas del
  componente** (`variantProductId`), no del producto navegado. Al elegir una opción se eligen las
  variantes de un componente y sus ejes compartidos filtran los pasos siguientes (cascada).
- **`panel`** agrupa pasos que se muestran juntos (ej. característica + color). Reemplaza la
  detección por texto (`isQtyStep` se retiró). El paso explícito de cantidad vive en *Revisar*.
- `getPasos(productId, seleccion)` acepta la selección para filtrar por compatibilidad (ej. rosca).
  `resolverConfiguracion` une la selección + ejes derivados y materializa/reutiliza la variante
  vendible. La agrupación se calcula por `panel`; los pasos sin `attributeId` no se emiten.
- **Taparrosca con Pincel** aún usa el patrón antiguo (pasos 1-3 → Vástago, paso 4 → Pincel,
  pasos 5-6 → Taparrosca); migrar a panel es opcional.
- Los **5 BTVPE** (Rimel Silicon/Nylon, Delineador, Tratamiento de Noche, Lip Gloss) usan Modelo B:
  primer paso = `Tamaño de Botella` (componente Botella), que deriva `Tamaño rosca` y altura.
- **Regla BTVPE:** la altura del vástago ≤ altura de la botella + 2mm (hardcoded para SKU `BTVPE-*`
  en `public.service.ts`). El wizard muestra **un paso por sub-pregunta** (`panel` único) y **resalta**
  la primera opción sin seleccionarla (la elige el usuario).

## Reglas de negocio relevantes

En [`../REQUIREMENTS.md`](../REQUIREMENTS.md) §5: una variante para todo, variante real vs perezosa
(combo), sobrantes ensamblados, marco de decisión producto vs variante, empaques/precio por dimensión,
BOM `exacto` vs `consumible`, unidades de medida y ubicaciones. **El registro de ensamble con BOM en
inventario fue retirado (2026-10-02)**; ver §5.4.
