# roadmap.md — Pendientes y próximos pasos

Estado y trabajo pendiente de PPG ERP. Para ubicar archivos ver `project-nav.md`.

## Pendientes activos

1. **Modularización** (prioridad actual del equipo): dividir los archivos web masivos:
   `productos/[id]/page.tsx` (954), `inventario/page.tsx` (779), `reportes/page.tsx` (wizard),
   `ventas/page.tsx` (516), `fabricacion/page.tsx` (254). La API ya quedó mayormente modularizada.
2. **WSL2** — completar setup de dev en Linux.
3. **Catálogo:** pendientes en [`catalog-state.md`](./catalog-state.md) (`PIN-0011`, crosswalk con
   SKUs inexistentes, `db:seed` desalineado vs `cat:seed`).
4. **Órdenes de compra (OC):** no existe entidad persistente. Hoy lo "comprable" va al listado
   `resumen.comprar` / Pendientes de compra (sin documento). Falta un módulo `PurchaseOrder`
   (modelo + API + UI) que consuma `Product.comprable`. Fase siguiente tras E3.
5. **Seed de catálogo y flags de suministro:** `Product.fabricable`/`comprable` se editan en la UI
   pero `scripts/catalog/` (engine + `catalog.yaml`) aún **no** los declara → al re-seedear quedan en
   `false`. Pendiente extender las ops de catálogo.
6. **Costos (v1) — integración pendiente:** el módulo de costo estándar (`/costos`, `ProductCost`)
   arrancó **separado** del ERP: captura manual, sin historial ni merma y **sin** escribir el precio
   de venta. Falta, cuando se decida: (a) ligar el costo a la página de precios/margen real,
   (b) materiales automáticos desde el BOM, (c) merma, (d) historial/versionado, (e) costo por
   variante y (f) catálogo de tarifas reutilizables. Ver §8.7 de `REQUIREMENTS.md`.

## Candidatos a refactor transversal

- Recursión BOM: existe en **3+ copias** (`ventas`, `inventario`, `productos.resolveComponentVariant`,
  `catalogos.atributos-producto`). Extraer a un helper/módulo común.
- Disparo de `monitor.afterStockChange`: unificar el contrato de mutaciones de stock.
- `common/util.ts`: helpers mezclados, candidato a separar.

## Trabajo reciente (contexto)

- **Prioridad manual de fabricación por niveles (2026-10-05):** `ProductVariant` ganó
  `prioridad` (`enum Prioridad` `alta`/`media`/`baja`, default `baja`; migración
  `20261005170000_variant_prioridad`). El panel `/fabricacion` muestra una columna **Prioridad**
  (badge Alta/Media/Baja) en las listas **Por ventas** y **Por mínimo**, editable inline **solo
  `admin`** (`PATCH /fabricacion/variantes/:variantId/prioridad`), y un **selector de orden**
  Prioridad/Cantidad/Producto. `fabricacion.necesidades` devuelve `prioridad` y ordena por nivel.
  El seed declarativo la preserva (`variant.define.prioridad` en `ops`/`engine`/`export-seed`).
  Nota: `scripts/catalog/seed/catalog.yaml` sigue desalineado con la BD (pendiente 3), así que **no**
  se regeneró; la prioridad se volcará al correr `pnpm cat:export-seed` cuando se reconcilie.

- **Ensartado por pasos en el reporte de producción (2026-10-06):** el Paso 2 de `/reportes` dejó de
  usar un único `<select>` con todas las variantes de Mango y ahora elige el mango **paso a paso**
  (`Ceja → Tamaño rosca → Altura de Mango → Agujero de Mango`) y al final el color de cerda, con
  **auto-salto** de pasos que tienen una sola opción y **solo** combinaciones que resuelven pincel
  (sin callejones sin salida). `reportes.service.ensartado` devuelve ahora `ejes` del Mango
  reordenados y `mangos` con `valueIds` alineados (además de `colores`/`combinaciones`); la web
  (`app/reportes/page.tsx`) cascada en el cliente y muestra una vista previa del pincel antes de
  agregar. Sin migración.

- **Etiqueta de embarque por línea de venta (2026-10-06):** se portó la app Python `etiquetas/`
  (Flask + reportlab) al stack web con `@react-pdf/renderer`. En el detalle de venta cada línea tiene
  un botón **Etiqueta** (siempre visible) que abre un overlay con **vista previa** y **Descargar PDF**:
  `components/ventas/modal-etiqueta.tsx` (solo cantidad y pesos bruto/neto/unitario editables) y el
  layout `components/ventas/etiqueta-pdf.tsx` (**200×102.1 mm**, 3 columnas: FRÁGIL + imagen default /
  cliente + detalles de embarque / producto + imagen). Cliente y producto se toman directos de la venta;
  empresa e imagen `public/etiqueta-fragil.png` son fijas. Se extrajo `lib/imagenes.ts`
  (`useImagenesLineas`/`useImagenEstatica`) reutilizado por el documento de venta. Sin API, BD ni migración.

- **Paso 2 "Ensartado" en el reporte de producción (2026-10-06):** el wizard de `/reportes` ahora
  continúa tras los cepillos de Nylon con un **Paso 2 Ensartado** (mango + color de cerda +
  cantidad, repetible). Nuevo `GET /reportes/ensartado` (`reportes.service.ensartado`): cruza las
  variantes de **Pincel** (`PIN`) con las de **Mango** (`VAST`) por los atributos compartidos
  (Altura/Agujero/Ceja/Tamaño rosca) y devuelve `mangos`, `colores` y `combinaciones`
  mango+color→pincel. Al guardar/aplicar, cada pincel agrega una línea `final` (sección
  `ensartado`, entra a "Recibo de Producción") y una línea `consumo` agregada del **mango**
  (descuenta stock); la **cerda se maneja manual**. Sin migración. Endpoint sólo lectura; no crea
  catálogo.

- **Bandeja de aceptación retirada de `/reportes` (2026-10-06):** se eliminó la pestaña **Bandeja**
  (listar pendientes/aplicados/cancelados, aceptar/aplicar, modificar y cancelar) de
  `app/reportes/page.tsx`. La página queda con **Reporte del día** (captura por pasos) y
  **Estadísticas** (admin); los reportes siguen creándose **pendientes** (`POST /reportes`) y el
  backend (`list`/`aplicar`/`editar`/`cancelar`) queda intacto, pero sin UI de aceptación. La
  bandeja de ubicación en `/ubicaciones` no cambia. Sin migración.

- **Bandeja de ubicación unificada en `/ubicaciones` (2026-10-06):** todo lo producido termina en
  **"Recibo de Producción"** pendiente de ubicar y se gestiona en una **página nueva del sidebar**
  (`app/ubicaciones/page.tsx`), separada en secciones **Por reporte de producción** y **Por fabricación**
  (campo `origen` de `reportes.lotes`). `fabricacion.registrarProduccion` ya no pide ubicación: delega en
  `reportes.registrarProduccionInterna`, que crea un `ProductionReport` **interno aplicado**
  (`interno: true`, sección `fabricacion`) con línea `final` y deja el stock en "Recibo de Producción".
  La bandeja muestra **quién lo registró** (`usuario` del reporte) y el sidebar lleva un **globo contador**
  (`GET /reportes/por-ubicar`, refrescado por `POR_UBICAR_EVENT`/`pathname`/30 s). Se **quitó la pestaña
  "Ubicar"** de `/reportes` (su página ahora solo captura + bandeja de aceptación) y el paso de elegir
  ubicación en Fabricación. Sin migración.

- **Captura del reporte diario por pasos — wizard de cepillos de Nylon (2026-10-06):** se reescribió el
  formulario de `app/reportes/page.tsx` en dos fases. **Setup**: toggle **Matutino/Vespertino**
  (se retiró Nocturno de la UI), selector de fecha, input de personas y un único botón **Comenzar**;
  las **horas trabajadas** se derivan del turno (8 / 7.5) y ya no se piden, y se **eliminó el prefill**
  (`GET /reportes/ultimo`). **Captura**: paso *Producción de cepillos de Nylon* que encadena
  **máquina (`maquina1/2/3`) → forma → color → cantidad**, repetible, con lista de "Capturados".
  Nuevo `GET /reportes/cepillos-nylon` (producto `CNI` + `grid` de ejes/variantes vía `productos.grid`)
  para resolver la variante; se usa el producto y las combinaciones ya materializadas. Al **Finalizar**
  se crea el reporte **pendiente** con `horasTrabajadas` derivado; "Modificar" reconstruye las entradas
  desde las líneas (variante → forma/color) y preserva las no mapeables. Sin migración.

- **Desglose de venta según lo pendiente + retiro de Pendientes de compra en la venta (2026-10-05):**
  `GET /ventas/:id/desglose` y `fabricacion.necesidadesPorVentas` ahora calculan la explosión neta sobre
  `cantidad - qtyDelivered` (antes usaban la cantidad total), de modo que las **parcialidades** reflejan
  solo lo que falta y el stock ya descontado, y las líneas **entregadas** no aportan demanda. En el
  detalle de venta, la raíz de una línea `entregado` se muestra con badge **Entregado** y sin cantidades
  (`—`). Se **eliminó el card "Pendientes de compra"** de la venta; la vista de compras vive en
  Fabricación/dashboard (`GET /fabricacion/faltantes`, que conserva el `resumen.comprar` persistido).
  UI en `app/ventas/page.tsx`. Sin migración.

- **Wizard de Taparrosca con Pincel paso a paso (2026-10-05):** los 6 pasos (`ProductPasso`) estaban
  con `panel: 0`, así que el modal de ventas los mostraba todos juntos y la cascada no se aplicaba.
  Se reasignó `panel: 1..6` (uno por paso) con `scripts/catalog/ops/taparrosca-paneles.yaml`: ahora
  avanza de uno en uno como los BTVPE y, al pulsar "Siguiente", el backend (`getPasos` con selección)
  reduce las opciones del paso siguiente. Sin cambios de código.

- **Roles reducidos a `admin`/`operador` + gestión de usuarios + app protegida (2026-10-05):** se retiró
  el rol `supervisor` (migración `20261005160000_remove_supervisor_role` reasigna sus usuarios a `admin`
  y borra el rol; el seed ya sólo crea `admin`/`operador`). `JwtAuthGuard`+`RolesGuard` pasaron a
  **globales** (`APP_GUARD` en `auth/auth.module.ts`) con el decorator `@Public()` para login/logout,
  `health` y `/public/*`; el resto exige sesión. Se remapearon los `@Roles` (operador = operación
  completa: ventas, inventario, producción, clientes y reportes; admin = configuración/seguridad,
  costos, respaldos, monitor, catálogos y productos). Se añadió el módulo `usuarios/`
  (`GET/POST /usuarios`, `PATCH /usuarios/:id`, `PATCH /usuarios/:id/password`, sólo `admin`) y la
  página `app/usuarios/page.tsx` (sección **Administración**). Las escrituras de `catalogos` dejaron de
  ser públicas. Ver `conventions.md` §2.

- **Desglose de venta en árbol plegable (2026-10-06):** `GET /ventas/:id/desglose` ahora devuelve,
  además de `lineas` (lista plana agregada que sigue usando Fabricación), un `arbol` de
  `DesgloseNodo` construido por raíz vendida (`planificacion.desglosar`). En el detalle de venta
  cada producto vendido es un nodo raíz con toggle para plegar/desplegar sus componentes (arrancan
  **desplegados**); los descendientes se listan aplanados con sangría por profundidad (solo un nivel
  de plegado). UI en `app/ventas/page.tsx`; tipos en `lib/types.ts`. Sin migración.

- **Menú lateral por secciones y retiro de la página Monitor (2026-10-05):** `components/app-shell.tsx`
  pasó de lista plana a **secciones colapsables** con encabezado: **Administración** (hoy sólo
  `admin`) contiene **Usuarios** y **Costos**; **Ajustes** contiene **Preferencias** (`/ajustes`) y
  **Respaldos** (`/backups`). El estado de cada sección se persiste en `ppg.sidebar.section.<id>` y la
  sección de la ruta activa se auto-abre; el botón **Ajustes** del footer se retiró. Se **eliminó la
  página** `app/monitor/page.tsx` (su vista ya vive en Inventario/Fabricación) y la tarjeta homónima del
  dashboard. El **backend de monitoreo y notificación permanece intacto**
  (`apps/api/src/monitor/`, disparadores de stock); el dashboard ya no consume
  `GET /monitor/stock-bajo` (el módulo queda solo como backend de notificaciones).

- **Fabricación sin OF: panel de necesidades + alta de producción (2026-10-05):** se **eliminó por
  completo** la entidad de orden de fabricación (`ManufacturingOrder`/`ManufacturingOrderLine` y enums
  `TipoOF`/`OrigenOF`/`EstadoOF`; migración `20261005154000_remove_manufacturing_order`). El módulo
  `fabricacion` ahora expone `GET /fabricacion/necesidades` (dos listas: **por mínimo** y **por ventas**
  —explosión neta de las ventas abiertas confirmadas con pool compartido de stock—, más `porComprar`) y
  `POST /fabricacion/produccion {variantId, cantidad, locationId}` (entrada de stock motivo `produccion`
  a la ubicación elegida; sin reportes). La UI `app/fabricacion/page.tsx` se reescribió como dos listas
  con ingreso de producción en 2 pasos (cantidad → ubicación). Los **ensambles** se arman contra pedido y
  ahora `ventas.despacharLinea` **consume sus componentes** (`planificacion.consumirEnsamble`) al despachar.
  Se retiraron "Crear OF", la tabla de OFs de la venta, el deep-link `?of=`, el select de OF en reportes y
  `cantidadEnOF` del monitor; `reportes` ya no se liga a OF.

- **Desglose de componentes en ventas (2026-10-05):** al abrir el detalle de una venta se calcula en vivo
  la explosión neta multi-nivel (`GET /ventas/:id/desglose`, `planificacion.desglosar`, pool compartido de
  stock) y se muestra al vendedor, por componente: **necesita / en stock / falta**, con estado
  *Suficiente* / *Fabricar* / *Comprar* y un botón **Crear OF** por línea (solo si fabricable y con faltante).
  `ventas.confirmar` dejó de generar OFs: ahora solo calcula/persiste el `resumen` y marca `confirmadaAt`.
  Nuevo `POST /ventas/:id/desglose/of {variantId}` (`crearOFDesdeDesglose` → `crearOFUnica`) crea **una** OF
  de ese componente por su faltante (idempotente). Reutiliza `origen: venta`, `generatedFrom` y
  `salesOrderLineId`; **sin migración**. UI en `app/ventas/page.tsx`.

- **Restore aplica migraciones (2026-10-05):** tras restaurar un punto de retorno, tanto
  `ppg restore` (`scripts/ppg.sh`, llama `apply_migrations`) como el restore de la UI
  (`backups.service.restaurar`) corren `db:deploy` + `prisma generate`, para que un respaldo viejo
  no deje la BD desactualizada. El servicio resuelve la raíz del monorepo buscando
  `pnpm-workspace.yaml` hacia arriba.

- **Cierre de OFs desde Fabricación (2026-10-05):** las OFs ya no se cierran con reportes de
  producción. Nuevo `POST /fabricacion/:id/concluir`: un **ensamble** valida y descuenta sus
  componentes (`motivo consumo`) sin producir stock del ensamble; una **hoja** genera un
  `ProductionReport` **`interno` aplicado** con línea `final` (sección `fabricacion`) → entrada a
  "Recibo de Producción" para Ubicar. Los reportes internos no cuentan en métricas
  (`list`/`stats`/`export` los excluyen). `ventas.despacharLinea` ahora **exige la OF de ensamble
  en `hecha`** y, si existe, no descuenta stock del ensamble (siempre contra pedido). Migración
  `20261005130000_reporte_interno_of` (`ProductionReport.interno`, `SeccionProduccion.fabricacion`).
  Comprables faltantes: solo aviso informativo ("Pendientes de compra"), sin OC.

- **Resolución determinista de componentes BOM (2026-10-05):** `resolveComponentVariant`
  (`productos.service.ts`) dejó de devolver `null` cuando varios componentes son compatibles por
  ejes compartidos. Ahora desempata con `PREFERENCIAS_RESOLUCION` (hoy `Versión del vástago = Nuevo`,
  que solo tiene el **Escurridor**), luego por mayor stock y finalmente por menor id. Desbloquea la
  creación de OFs y el neteo de ventas de los **BTVPE** (p. ej. Delineador), que fallaban con
  "No hay variante de Escurridor compatible". Sin migración. Ver `conventions.md` §6.

- **Módulo de Costos v1 (2026-10-05):** página `/costos` (menú lateral, hoy sólo `admin`) para
  administrar el **costo estándar por producto**. Captura manual por concepto: materiales (líneas
  `ProductCostMaterial`), costo de compra, mano de obra (horas×tarifa), máquina (horas×tarifa), molde
  (amortización = costo/piezas), ensamble, empaque y notas. Muestra desglose, precio y margen de
  **solo lectura**. API `costos/` (`GET /costos`, `GET|PUT|DELETE /costos/:productId`). Migración
  `20261005120000_product_cost`. Ver pendientes 6 (arranca separado del resto del ERP).

- **Nota de venta en PDF real (2026-10-05):** el documento de venta dejó de ser HTML + `window.print()`
  y ahora es un **PDF vectorial generado en el cliente** con `@react-pdf/renderer` (agregado a
  `apps/web` y a `transpilePackages` en `next.config.mjs`). `components/ventas/documento-venta.tsx`
  **regenera el PDF** con `pdf().toBlob()` en cada cambio de contenido y lo muestra en un `<iframe>`,
  y ofrece **Descargar PDF**; el layout vive en
  `components/ventas/documento-venta-pdf.tsx`. Las imágenes de línea se precargan a `dataURL`
  (fallback a iniciales si fallan) y se conserva el toggle de IVA. Se eliminó el CSS de impresión.
  Cada línea muestra el **desglose de atributos** (`valoracion` que expone `ventas.service.get`,
  ordenado por los ejes del producto) una línea por atributo, y las columnas Cant./Precio/Subtotal
  van centradas.
- **Selector de variantes por atributos en Ventas (2026-10-05):** para productos **sin pasos**
  (componentes, sin BOM), el modal de Nueva venta (`components/ventas/modal-seleccion-variante.tsx`)
  dejó de listar variantes por SKU y ahora muestra un **`<select>` por eje** cargado con
  `GET /productos/:id/grid`. Sólo oferta **valores ya materializados** (variantes activas), con
  cascada entre ejes (se limpian selecciones sin variante) y resumen de la variante resuelta
  (nombre, SKU, precio). Si el producto no tiene ejes, cae a la lista plana anterior. La selección
  se guarda en la línea como `configuracion`. Los productos con BOM/pasos siguen usando el wizard.
- **Refresco del materializador al editar atributos (2026-10-05):** en la ficha de producto
  (`productos/[id]`), las altas/bajas de atributos, ejes y valores ahora recargan también el
  `grid` (`GET /productos/:id/grid`), no solo `propios`/`heredados`. Así el bloque "Materializar
  combinación" (un select por eje) aparece/se actualiza sin recargar la página. Nuevo callback
  `cargarGrid` (no usa `cargar()` para no descartar ediciones sin guardar de BOM/pasos).
- **Buscador/encabezados fijos y productos alfabético (2026-10-04):** el área de contenido
  (`.content`) pasó a ser el contenedor de scroll (`100dvh; overflow:auto`; sidebar fijo) y el
  `thead` de `.table` se pega debajo de un `StickyBar` (mide su alto en `--sticky-head`). Aplicado
  en productos, clientes, ventas e inventario; se quitó `overflow:hidden` de las tarjetas con tablas
  y `.table-wrap` dejó de scrollear (el horizontal lo hace `.content`). Además, `GET /productos`
  ahora ordena **siempre alfabético por `nombre`** (antes por `updatedAt`, que reordenaba al editar).
- **Eliminar producto solo desde el detalle (2026-10-04):** se quitó el botón "Eliminar" de la
  lista de productos (tabla y tarjetas) para reducir el riesgo de borrados accidentales; el alta
  sigue igual. El borrado (con fallback a desactivar) queda únicamente en la ficha del producto
  (`productos/[id]`).
- **Paso 2 de nueva venta como lista (2026-10-04):** el selector de producto dejó de ser un grid
  de tarjetas y ahora es una **lista filtrable** por nombre/SKU. Al hacer clic: producto con pasos
  abre `modal-config-variante.tsx` (wizard); sin pasos con varias variantes abre el nuevo
  `components/ventas/modal-seleccion-variante.tsx` (selección simple + cantidad); con una sola
  variante se agrega directo; sin variantes la fila queda deshabilitada. Se eliminó el `<select>`
  de variante por tarjeta (`varianteSel`).
- **Inventario sin vista "Por producto" (2026-10-04):** se eliminó la vista y su export
  (`inventario-por-producto.csv`); el resumen por producto (variantes/stock) ya se ve en la tabla
  de `/productos`. Inventario queda con 3 vistas: Por ubicación / Por variante / Min Max.
- **Mín/máx editable en inventario (2026-10-04):** la vista **Min Max** de `/inventario` (antes
  "Por variante min max") ahora edita inline las celdas Mín/Máx con `CantidadEditable` (props
  nuevas `title`/`min`); guarda vía `PATCH /inventario/variantes/:vid/minmax`, disponible para
  **todos** los roles. El endpoint es dedicado para no ampliar `PATCH /productos/variantes/:vid`
  (hoy sólo `admin`), que además permite nombre/activo/notas. No dispara el monitor: el estado se
  recalcula en el siguiente movimiento/consulta (paridad con `productos.updateVariant`).
- **Flags de suministro fabricable/comprable (2026-10-04):** `Product` ganó `fabricable` y
  `comprable` (migración `20261004160000_product_fabricable_comprable`, backfill desde el BOM:
  fabricable = tiene componentes exactos; comprable = no). El **neteo** (`planificacion.service`)
  ahora decide fabricar/compra por estos flags en vez de por la sola presencia de BOM: un fabricable
  sin componentes genera OF sin líneas; "ambos" prioriza fabricar. Las guardas de `fabricacion`
  (alta manual y reposición) exigen `fabricable`. UI: checkboxes en ficha y lista de productos, y en
  el alta. Sin OC persistente todavía (ver pendiente 4).
- **Impresión de venta + IVA (2026-10-04):** en `/ventas` se agregó el componente
  `components/ventas/documento-venta.tsx` (overlay + `window.print()`), con encabezado de empresa
  (solo "Plásticos Plasa"), nº de orden (`SalesOrder.numero`), fecha, **nº de cliente** (= `Partner.id`),
  datos del cliente, desglose por línea con **imagen** (`variant.imagen ?? product.imagen`), precio,
  cantidad y subtotal, y **toggle de IVA 16%** (precios netos; el documento inicia sin IVA). Se lanza
  desde el botón "Imprimir" del detalle y automáticamente al crear una venta. La API `ventas.get`
  ahora devuelve `imagen` por línea. Sin migración. Pendiente E5: cotización/facturación formal.
- **Vendible en Ventas + retiro de `published` (2026-10-04):** el selector del modal de Ventas
  ahora lista solo productos con `Product.vendible = true` (`public.service.productosPublicos`);
  se marca con el checkbox "Vendible en Ventas" en el detalle y en la lista de productos. Se
  eliminó `ProductVariant.published` (columna, checkboxes y usos en catálogo/seed); el modal vende
  los productos sin pasos eligiendo una variante activa directo, y mantiene el wizard para los que
  tienen `ProductPasso`. Migración backfillea `vendible=true` en los 6 productos con pasos.
- **Wizard de Taparrosca (2026-10-04):** "Taparrosca con Pincel" pasó a Modelo B. Se fusionó
  `Altura de Taparrosca` dentro de `Forma de Taparrosca` (el número es la forma; `Bala`/`Rebeca`/`Gg`
  conservan nombre, altura a `notas`); se eliminó la variante errónea `TPR-0016`. Pasos: rosca → tapa →
  color → altura de mango → agujero → color de cerda (bloque aplicador desde **Pincel**). Ops
  `scripts/catalog/ops/taparrosca-wizard.yaml`. Ver [`plan-taparrosca.md`](./plan-taparrosca.md).
- **Consolidación Taparrosca con Pincel (2026-10-04):** había dos productos (prototipo nativo `TP`
  id 5 sin stock y el importado de Odoo `P0019` con 19 variantes y stock). Se conservó **`P0019`
  renombrado a "Taparrosca con Pincel"** y se retiró `TP`. Se remapearon los ejes legado de `P0019`
  (`Tipo de Tapa con Pincel`+`Altura de Taparrosca`→`Forma de Taparrosca`,
  `Color de Tapa con Pincel`→`Color de Taparrosca`, `Medida pincel`→`Altura de Mango`) y se le agregó
  BOM + wizard; se borraron esos 4 atributos legado. `resolveComponentVariant` ahora casa por
  intersección de ejes (ignora `Ceja` de Pincel); las 19/19 variantes resuelven Taparrosca + Pincel.
  Op nueva `product.delete` en el toolkit. Ops:
  `scripts/catalog/ops/taparrosca-con-pincel-ensamble.yaml`. Ver [`plan-taparrosca.md`](./plan-taparrosca.md).
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
- **E2 (venta → confirmación → desglose multi-nivel → despacho/consumo → `despachada`):**
  verificado 2026-08-31 con `scripts/seed-demo-ventas.ts`. Durante la verificación se corrigieron 3 bugs:
  1. El DTO de ventas internas no aceptaba `configuracion` (`whitelist: true` la descartaba).
  2. Doble bucle en `confirmar` generaba cada OF dos veces; se eliminó el bucle redundante y `ventas.ofs.ts`.
  3. `despacharLinea` no hacía `await` del `$transaction`, tumbando el proceso; ahora devuelve 400 limpio.
