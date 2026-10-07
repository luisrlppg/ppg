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
- **`ProductVariant.costoCompra`** — costo de adquisición **por variante** (`Decimal?`), para
  comprables con costo distinto por presentación (hoy **pigmentos** por color/código). Es
  independiente de `ProductCost` (que es por producto); se captura en `/costos` (sólo `admin`).
  El seed lo preserva (`variant.define.costoCompra`).
- **`ProductVariant.prioridad`** — prioridad **manual** de fabricación por variante (`Prioridad`:
  `alta`/`media`/`baja`, default `baja`). Es global (aplica a por mínimo y por ventas) y la edita
  solo `admin` inline en `/fabricacion` (`PATCH /fabricacion/variantes/:id/prioridad`). No la
  gestiona el catálogo salvo para preservarla en el seed (`variant.define.prioridad`).
- **`Product.vendible`** — el producto aparece en el selector del **modal de Ventas** con sus
  variantes activas; se marca con el checkbox "Vendible en Ventas" (detalle y lista de productos).
  Sustituye al retirado `ProductVariant.published`.
- **`Product.fabricable` / `Product.comprable`** — flags independientes (ambos pueden ser `true`) que
  definen cómo entra el producto al **desglose** al confirmar una venta y al panel de necesidades:
  - `fabricable` → se produce (`POST /fabricacion/produccion`); puede o no tener BOM exacto.
  - `comprable` → se adquiere por compra (aparece en "Pendientes de compra" / `resumen.comprar`).
  - Si es ambos, el desglose **prioriza fabricar**. Si no es ninguno, cae a compra (respaldo).
  - Se editan con los checkboxes de la ficha y la lista de productos. El seed de catálogo todavía
    **no** declara estos flags (ver `roadmap.md`).
- **`ProductPasso`** — pasos del storefront (ver abajo).
- **`ProductComponent`** — BOM; componentes `exacto` vs `consumible`.
- **`ProductCost` / `ProductCostMaterial`** — costo estándar por producto (v1, captura manual; ver §Costos).
- **`User.separadorMiles`** — preferencia personal de formato de cantidades (`"coma"` default o
  `"espacio"`); la edita cada usuario en **Ajustes** (`PATCH /auth/preferences`).

## Productos base

IDs/SKU reales (la BD manda; verifícalos con `pnpm cat:snapshot`):

- **Mango** (id 1, `VAST`) — mango; componente de las líneas con mango.
- **Cerda** (id 2, `CERD`) — uom `kg`, consumible.
- **Pincel** (id 3, `PIN`) — pincel (ejes `Ceja`, `Altura de Mango`, `Agujero de Mango`,
  `Tamaño rosca`, `Color de Cerda de Pincel`); hereda `Ceja`/`Agujero` de Mango.
- **Taparrosca** (id 4, `TPR`) — tapa (ejes `Forma de Taparrosca` + `Color de Taparrosca` + `Tamaño rosca`).
- **Taparrosca con Pincel** (id 49, `P0019`) — ensamble: Taparrosca + Pincel. **Consolidado 2026-10-04**:
  es la fila que vino de Odoo (`Tapa con Pincel`, 19 variantes con stock); se le remapearon los ejes
  al modelo de componentes y se le agregó el BOM/wizard. Se retiró el prototipo nativo (`TP`, id 5).
- **Vastago** (id 7, `VST`) — vástago; sin BOM.
- **Sobretapa** (id 8, `STP`) · **Escurridor** (id 9, `ESC`) · **Cepillo Silicon** (id 10, `CSI`) ·
  **Cepillo Nylon** (id 11, `CNI`).
- **PVC** (id 86, `PVC`) — uom `kg`.
- **Pigmento** (`PIG`, 2026-10-07) — materia prima **comprable** (`uom kg`, `fabricable=false`,
  `vendible=false`); 4 ejes: `Resina de Pigmento` (`PP/PE`, `PVC`), `Tipo de Pigmento`
  (`Polvo`, `Masterbatch`), `Color de Pigmento` y `Fabricante de Pigmento`. **40** variantes:
  `pp 1992` (de Odoo, `Resina`+`Color`) y **39 pastas de color** con stock en `PIG1/PIG2/PIG3`
  (`Tipo`/`Fabricante` pendientes de captura). Costo de compra **por variante**. Ops:
  `scripts/catalog/ops/pigmentos.yaml` + `pigmentos-pastas.yaml`.
- **BTVPE — Tamaño de Botella (2026-10-04):** el componente **Botella** tiene el eje
  `Tamaño de Botella` (`Mini` 10mm/48mm, `Alta` 10mm/80mm, `Chica` 15mm/60mm, `Grande` 15mm/80mm),
  derivado de `Tamaño rosca` + `Altura de Botella`. Reemplaza al extinto `Capacidad de Botella`
  (mL); la capacidad fue a `notas`. Los BTVPE restrictan a `Chica,Grande` (o los 4 en Delineador/
  Tratamiento de Noche).
- **Colores:** `Color de Cepillo Silicon` (Blanco/Negro) es eje de **Cepillo Silicon**; el cepillo
  nylon usa `Color de Cerda de Cepillo` (se retiró `Color de Cepillo Nylon`). Los BTVPE usan
  `Forma de Sobretapa` (no `Forma de Taparrosca`, que sigue para otros productos).
- **Taparrosca (2026-10-04):** `Altura de Taparrosca` se fusionó en `Forma de Taparrosca` (el
  valor es el número de altura, p. ej. `38mm`, o el nombre `Bala`/`Rebeca`/`Gg`); la altura original
  queda en `notas`. El ensamble **Taparrosca con Pincel** usa `Color de Taparrosca` para el color
  y toma `Altura de Mango`/`Agujero de Mango`/`Color de Cerda de Pincel` del componente **Pincel**.
  Consolidación: se borraron `Altura de Taparrosca`, `Color de Tapa con Pincel`, `Tipo de Tapa con
  Pincel` y `Medida pincel`; se agregaron los valores `Gg` (`Forma de Taparrosca`) y `Gris`
  (`Color de Taparrosca`). Ver [`plan-taparrosca.md`](./plan-taparrosca.md).
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

`Altura de Mango`, `Altura de Vastago`, `Altura de Botella`,
`Altura de Escurridor`, `Altura de Sobretapa`, `Color de Botella`, `Color de Vastago`,
`Color de Sobretapa`, `Color de Escurridor`, `Color de Taparrosca`, `Color de Tapon`,
`Color de Palillo`, `Color de Cepillo Nylon`,
`Color de Cepillo Silicon`, `Color de Cerda de Pincel`, `Color de Cerda de Cepillo`,
`Color de PVC`, `Color de Pigmento`, `Fabricante de Pigmento`, `Resina de Pigmento`,
`Tipo de Pigmento`, `Tipo de Vastago`, `Tipo de Botella`,
`Tipo de Sobretapa`, `Tipo de Punta`, `Forma de Taparrosca`,
`Forma de Sobretapa`, `Forma de cepillo nylon`, `Forma de cepillo silicon`,
`Agujero de Escurridor`, `Agujero de Mango`, `Tamaño de Caja de Cartón`, `Capacidad de Botella`.

**Compartidos legítimos:** `Tamaño rosca`, `Ceja`, `Punta`, `Grosor cerda`,
`Logo`, `Versión del vástago`, `Densidad`.

> **Retirados en la consolidación 2026-10-04:** `Altura de Taparrosca`, `Color de Tapa con Pincel`,
> `Tipo de Tapa con Pincel` y `Medida pincel` (sólo los usaba el producto Odoo `P0019`).

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

## Costos (v1)

Costo **estándar por producto** (no por variante), capturado a mano. Arranca **separado** del
precio de venta; el margen que muestra es solo referencia. **Excepción:** los comprables con
costo distinto por presentación (pigmentos) usan `ProductVariant.costoCompra`; `/costos` los
edita en una tabla "Costo de compra por variante".

- **`ProductCost`** (1:1 con `Product`): `costoCompra` (comprables), `horasManoObra` +
  `tarifaManoObra`, `horasMaquina` + `tarifaMaquina`, `costoMolde` + `piezasMolde` (amortización
  por pieza), `costoEnsamble`, `costoEmpaque`, `notas`, `updatedById`, timestamps.
- **`ProductCostMaterial`** (hijos): `nombre`, `cantidad`, `costoUnitario`, `orden`. Materiales
  **100% manuales** (no se recorre el BOM en v1).
- **Cálculo:** `materiales = (costoCompra ?? 0) + Σ(cantidad × costoUnitario)`;
  `manoObra = horasManoObra × tarifaManoObra`; `maquina = horasMaquina × tarifaMaquina`;
  `molde = piezasMolde > 0 ? costoMolde / piezasMolde : 0`; `total = materiales + manoObra +
  maquina + molde + ensamble + empaque`. Sin merma ni historial por ahora.
- **Precio/margen (solo lectura):** `precio` = `Product.basePrice` (si es 0, el mínimo de las
  variantes activas); `margen = precio − total`. Ver [`roadmap.md`](./roadmap.md).

## Pasos del storefront (`ProductPasso`)

- **Modelo B (vigente 2026-10-04):** cada paso saca sus opciones de las **variantes activas del
  componente** (`variantProductId`), no del producto navegado. Al elegir una opción se eligen las
  variantes de un componente y sus ejes compartidos filtran los pasos siguientes (cascada).
- **`panel`** agrupa pasos que se muestran juntos (ej. característica + color). Reemplaza la
  detección por texto (`isQtyStep` se retiró). El paso explícito de cantidad vive en *Revisar*.
- `getPasos(productId, seleccion)` acepta la selección para filtrar por compatibilidad (ej. rosca).
  `resolverConfiguracion` une la selección + ejes derivados y materializa/reutiliza la variante
  vendible. La agrupación se calcula por `panel`; los pasos sin `attributeId` no se emiten.
- **Taparrosca con Pincel** (consolidado 2026-10-04) usa Modelo B con 6 pasos: rosca → forma →
  color de taparrosca (componente **Taparrosca**) → altura de mango → agujero → color de cerda
  (componente **Pincel**).
- Los **5 BTVPE** (Rimel Silicon/Nylon, Delineador, Tratamiento de Noche, Lip Gloss) usan Modelo B:
  primer paso = `Tamaño de Botella` (componente Botella), que deriva `Tamaño rosca` y altura.
- **Regla BTVPE:** la altura del vástago ≤ altura de la botella + 2mm (hardcoded para SKU `BTVPE-*`
  en `public.service.ts`). El wizard muestra **un paso por sub-pregunta** (`panel` único), resalta la
  primera opción y **"Siguiente" la acepta** si no hubo clic. La **cascada se aplica al avanzar** (no al
  seleccionar), pidiendo las opciones del paso con la selección de los pasos **anteriores**. "Atrás"
  reofrece el paso conservando la elección previa y limpia en silencio los posteriores inválidos.

## Fabricación y producción (2026-10-05)

- **No existe entidad de orden de fabricación** (`ManufacturingOrder`/`ManufacturingOrderLine` y los
  enums `TipoOF`/`OrigenOF`/`EstadoOF` se retiraron; migración
  `20261005154000_remove_manufacturing_order`). La planificación dejó de ser un documento persistente.
- **Panel de necesidades** (`GET /fabricacion/necesidades`): dos listas separadas.
  - `porMinimo`: fabricables con `stock < stockMin` (necesidad = `stockMin - stock`).
  - `porVentas`: explosión neta multi-nivel de las ventas **abiertas confirmadas** (`planificacion.desglosar`
    con pool compartido de stock), calculada **sobre lo pendiente** (`cantidad - qtyDelivered`): las líneas
    entregadas no aportan demanda y las parcialidades piden solo el resto. Incluye ensambles como ítem
    *Armar* y marca los pedidos que aportan.
  - `porComprar`: no fabricables faltantes (informativo; no hay OC).
- **Prioridad de fabricación** (`ProductVariant.prioridad`, 3 niveles Alta/Media/Baja, default `baja`):
  ordena las listas `porMinimo` y `porVentas` (prioridad → déficit/nombre). Se asigna **manualmente**,
  solo `admin`, inline en `/fabricacion`; el selector de orden de la página permite alternar
  Prioridad / Cantidad / Producto.
- **Alta de producción** (`POST /fabricacion/produccion {variantId, cantidad}`): solo hojas fabricables
  (0–1 componente). Delega en `reportes.registrarProduccionInterna`: crea un `ProductionReport`
  **interno aplicado** (`interno: true`, sección `fabricacion`, línea `final` con `qtyAplicada`) y deja el
  stock en **"Recibo de Producción"** (`StockMove` motivo `produccion`), disparando el monitor. Ese
  reporte **no** alimenta métricas E3 (excluido por `interno`) y aparece en la **bandeja de ubicación**
  (`/reportes/lotes`) junto con las líneas `final` de los reportes de turno ya aplicados.
- **Ensamble (2+ componentes)**: se arma **contra pedido**, no acumula stock. Al despachar la línea
  (`ventas.despacharLinea`) se consumen sus componentes exactos (`planificacion.consumirEnsamble`,
  `motivo consumo`); se valida stock de cada componente.
- El flujo de reportes de producción (`/reportes`, `ProductionReport`) sigue existiendo y es independiente
  de fabricación; `ProductionReport.interno` se conserva por histórico.

## Inventario histórico (2026-10-07)

Registro **aislado** de existencias de productos reales que ya no se fabrican (descontinuados) y de
subensambles con stock. Sirve de "lo que tenemos guardado" sin contaminar el inventario vivo.

- **`InventarioHistorico`**: `nombre`, `sku?`, `tipo` (`descontinuado` | `subensamble`),
  `cantidad`, `ubicacion` (texto libre), `notas?`, `familiaProductoId?` (FK opcional a `Product`,
  `onDelete: SetNull`; sólo para agrupar/sugerir/filtrar), timestamps.
- **`InventarioHistoricoAtributo`** (hijos): `nombre`, `valor` (libres; se pueden dejar en blanco).
  Permiten filtrar por atributos sin depender del catálogo.
- **Aislamiento:** NO se relaciona con `ProductVariant`/`StockLevel`, así que `stock_actual`
  (`SUM(StockLevel.qty)`), mín/máx, Fabricación, Ventas, Reportes y el monitor **nunca** lo ven.
- **API/UI:** `apps/api/src/inventario-historico/` + `app/inventario-historico/page.tsx`
  (CRUD + import/export CSV; escritura sólo `admin`). El import CSV **infiere `familiaProductoId`**
  por prefijo de SKU y parsea atributos de `Atributo=Valor;…`.
- **Carga inicial:** `docs/inventario-historico-inicial.csv` (10 descontinuados + 51 subensambles Odoo).
  Ver `odoo-pendientes.csv` para el detalle de lo no migrado 1:1.

## Reglas de negocio relevantes

En [`../REQUIREMENTS.md`](../REQUIREMENTS.md) §5: una variante para todo, variante real vs perezosa
(combo), sobrantes ensamblados, marco de decisión producto vs variante, empaques/precio por dimensión,
BOM `exacto` vs `consumible`, unidades de medida y ubicaciones. **El registro de ensamble con BOM en
inventario fue retirado (2026-10-02)**; ver §5.4.
