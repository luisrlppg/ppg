# PPG ERP — Requerimientos

ERP propio y altamente personalizado para Plásticos Plasa de Guadalajara S.A. de C.V. Este documento define los requerimientos y es la fuente de verdad del diseño. Todo lo que **no** aparece aquí, no existe (filosofía bottom-up).

---

## 1. Visión

Construir un ERP propio, libre de Odoo, con una **base de datos central (PostgreSQL)** accesible por múltiples aplicaciones mediante una **API** propia.

- **Odoo queda como respaldo**, siempre activo, pero el ERP no depende de él. Los datos se definen y dan de alta por nosotros (entrada manual o importación CSV puntual).
- Se construye **módulo por módulo**; cada entrega es funcional por sí sola.
- **Minimalismo por diseño**: cada tabla/campo/pantalla existe porque la empresa la necesita de verdad. Ninguna opción de relleno.

## 2. Decisiones registradas

| Tema | Decisión |
|---|---|
| Stack | TypeScript full-stack |
| Backend | NestJS (apps/api) |
| Frontend | Panel interno `apps/web` (Next.js, detrás de login) + futura `apps/storefront` (tienda pública, tras E2) + pantallas TV |
| DB | PostgreSQL central, única; propiedad exclusiva de `apps/api` vía Prisma |
| Acceso multi-app | Otras apps solo por API/REST (futuro SSE); nunca acceso directo a la DB |
| Despliegue | Servidor local / LAN · Linux · Docker Compose |
| Alcance inicial | Portar PPG Unified (reportes de producción, signage, stock) |
| Ventas internas | Panel interno (equipo): teléfono/WhatsApp/correo; neteo, venta mínima, OF (§7) |
| Venta pública (futura) | Tienda propia (storefront) tras E2: catálogo + pedido invitado; SOLO vía `/api/public` (leer productos + alta de órdenes); **nunca** acceso directo a la DB (§7.7) |
| Usuarios | Login por usuario con roles y distintos alcances administrativos |
| Moneda | Solo MXN |
| Precios | Netos (sin IVA); IVA (16%) se aplica en ventas/cotizaciones después |
| Variantes configurables | Creación bajo demanda (lazy); el inventario incluye la acción "materializar variante" |
| Venta en E2 | **Mínima**: solo lo necesario para planear (cliente, producto, cantidad, precio, fecha de entrega). Cotización/factura/IVA después |
| Desglose BOM | **Multi-nivel** para componentes `exacto`; los `consumible` (cerda) quedan **fuera del neteo** (§5.7) |
| Componentes faltantes | **Cascada automática**: generar órdenes de fabricación en cascada para componentes fabricables (§7.5) |
| Unidad de medida | `products.uom` (pieza / metro…); cantidades decimales cuando `uom = metro` (§5.8) |
| Ubicaciones | **Desde el schema inicial** (`locations` + `stock_levels`); stock por ubicación y `stock_actual` = suma (§5.9) |
| Confirmación de inventario | El reporte de producción **no toca inventario**: `pendiente` → revisión por la encargada → `aplicado` (§8.2) |
| Auto-inventario | Solo líneas `final` (producto terminado vendible/almacenable) incrementan stock; los consumibles restan con líneas `consumo` y solo tras confirmación (§8.2) |

## 3. Arquitectura

```
apps/erp/
├── apps/
│   ├── api/            # NestJS + Prisma + PostgreSQL + jobs (monitor de stock)
│   ├── web/            # Next.js — panel interno (inventario, ventas, reportes)
│   └── storefront/     # (futura, tras E2) Next.js — tienda pública; SOLO usa /api/public
├── packages/
│   ├── db/             # Schema Prisma + migraciones (dueño: apps/api)
│   └── shared/         # Tipos TS, constantes, validadores
└── infra/              # docker-compose (postgres, api, web, caddy/nginx), backups
```

**Regla de oro**: la DB central es *individual*, no pertenece a ninguna app; pero solo `apps/api` la lee/escribe. Todo lo demás consume API.

## 4. Modelo de datos v1

### Diagrama

```
users ──< roles (admin | supervisor | operador)

categories
packagings                       — catálogo (Caja de almacén, Caja de cartón, Bolsa...)

attributes ──< attribute_values ──< product_attribute_lines ──< products
                                     │
products ──< product_variants ──> variant_attributes (valores de su combo)
              │         └───────< variant_packagings (variante, empaque, cantidad)
              │         └───────< stock_levels ──> locations
              │         └───────< stock_moves (origen ─→ destino, motivo, ref)
              └────> price_changes (historial)
products ──< product_components  — BOM (producto → componente, cantidad, tipo)

partners ──< sales_orders ──< sales_order_lines ── variant_id   (E2)
manufacturing_orders ──< manufacturing_order_lines ── producto/componentes  (E2)

production_reports ──< production_report_lines ── variant_id   (E3)
```

### Tablas

#### users / roles
| Tabla | Campos | Notas |
|---|---|---|
| `users` | id, username, password_hash, role_id, nombre, activo, timestamps | Login propio |
| `roles` | id, nombre | `admin`, `supervisor`, `operador` |

Alcances:
- **admin**: todo + gestión de usuarios.
- **supervisor**: alta/edición/ajuste de inventario, registrar ensamble, ventas y órdenes de fabricación, ver reportes.
- **operador**: lectura de productos/stock; (futuro) reportar producción.
- **Encargada de inventario** (rol supervisor u otro): revisa y **acepta** reportes (E3), asigna **ubicaciones** — la cantidad nunca se tipea dos veces.

#### Catálogos
| Tabla | Campos |
|---|---|
| `categories` | id, nombre, orden |
| `packagings` | id, nombre, activo |

#### Producto
| Tabla | Campos | Notas |
|---|---|---|
| `products` | id, nombre, category_id, `uom`, `base_price`, imagen, activo, notas, timestamps | Familia o producto simple |
| `product_variants` | id, product_id, nombre, sku (único), `price` (override, nullable), `stock_min`, `stock_max` (decimal), `long_lead` (bool), imagen, activo, published (bool) | Una sola estructura para TODO (color, tamaño, combo). **`stock_actual` es derivado** (suma de `stock_levels`, §4-Stock). `published` = visible en tienda pública (§7.7) |
| `attributes` | id, nombre | Ej. "Tamaño de vástago", "Color de cerda", "Tipo de agujero" |
| `attribute_values` | id, attribute_id, valor | Ej. "4.5mm", "Negro", "Circular" |
| `product_attribute_lines` | id, product_id, attribute_id | Ejes del grid de una familia |
| `variant_attributes` | id, variant_id, attribute_id, value_id | Qué combo es cada variante |
| `product_components` | id, product_id, component_id→products, cantidad, `tipo` | BOM a nivel producto; `tipo: "exacto"` \| `"consumible"` (§5.7) |

#### Empaques por variante
| Tabla | Campos | Notas |
|---|---|---|
| `variant_packagings` | id, variant_id, packaging_id, cantidad | Piezas que caben en cada empaque de esa variante |

La "cantidad por caja de almacén" **no tiene campo propio**: es un `packaging` llamado "Caja de almacén".

#### Precios
| Tabla | Campos | Notas |
|---|---|---|
| (en `products`) | `base_price` | Precio vigente de la familia |
| (en `product_variants`) | `price` nullable | Precio propio si difiere del base |
| `price_changes` | id, variant_id, campo (`base`\|`variante`), precio_anterior, precio_nuevo, source (`manual`\|`api`), user_id, created_at | Historial |

**Regla de precio efectivo:**
```
precio_efectivo(variante) = COALESCE(variant.price, product.base_price)
```

#### Ubicaciones
| Tabla | Campos | Notas |
|---|---|---|
| `locations` | id, nombre, tipo (`temporal`\|`almacen`), activo | Compartimentos enumerados; seed: `"Almacén principal"` y `"Recibo de Producción"` (temporal) |
| `stock_levels` | id, variant_id, location_id, qty | Único por variante + ubicación; la física del stock |

Regla: `stock_actual(variante) = SUM(stock_levels.qty)`.

#### Stock
| Tabla | Campos | Notas |
|---|---|---|
| `stock_moves` | id, variant_id, from_location_id (null), to_location_id (null), cantidad, motivo, ref (reporte/orden/venta), user_id, created_at | Historial desde el primer día; toda variación es un movimiento, **nunca** re-escritura directa de cantidades |

Motivos: `produccion`, `consumo`, `ensamble`, `ubicacion`, `despacho`, `ajuste`, `sobrante ensamblado`.

#### Ventas (E2)
| Tabla | Campos | Notas |
|---|---|---|
| `partners` | id, nombre, telefono, direccion, email, activo, timestamps | Clientes |
| `sales_orders` | id, numero, partner_id, fecha, fecha_entrega_deseada, estado (`abierta`\|`despachada`\|`cancelada`), `origen` (`interno`\|`web`), `payment_method` (nullable; extensión de pago futuro), nombre_envio, telefono_envio, email_envio, notas, user_id, timestamps | Orden de venta; `origen=web` → datos de invitado (§7.7) |
| `sales_order_lines` | id, order_id, variant_id, cantidad, precio_unitario, qty_delivered, estado_entrega (`pendiente`\|`parcial`\|`entregado`) | Líneas de la orden |

#### Fabricación (E2)
| Tabla | Campos | Notas |
|---|---|---|
| `manufacturing_orders` | id, numero, variant_id (a fabricar), cantidad, estado (`borrador`\|`confirmada`\|`en_progreso`\|`hecha`\|`cancelada`), fecha, notas, generated_from (id de venta/orden), user_id | Orden de fabricación |
| `manufacturing_order_lines` | id, order_id, component_variant_id, cantidad_requerida, cantidad_reservada | Componentes que consume la orden |

#### Producción (E3)
| Tabla | Campos | Notas |
|---|---|---|
| `production_reports` | id, numero, user_id, turno, fecha, trabajadores, estado (`pendiente`\|`aplicado`), notas, timestamps | Reporte diario; **no toca inventario solo** |
| `production_report_lines` | id, report_id, variant_id, cantidad, tipo (`final`\|`consumo`), seccion (máquina 1-3, ensamble, ensartado, pegado, perforado, etc.) | Líneas ligadas a variantes reales |

## 5. Reglas de negocio (producto y variantes)

### 5.1 Una variante para todo
**No** hay tipos distintos de filas de producto. Una `product_variants` representa: producto simple, variante por color, variante por tamaño, o combinación de un configurable. La diferencia es la **política de creación** y el **origen del stock**, no la estructura.

### 5.2 ¿Variante real o perezosa (combo)?
| Si el producto... | Entonces sus variantes... |
|---|---|
| **Se almacena físicamente** (vástago, cerda, taparrosca) | **Reales**: se materializan porque existen físicamente, cada una con su stock |
| **Se arma bajo pedido / no se almacena** (pincel) | **Perezosas (combos)**: el grid existe como metadata; la variante se crea bajo demanda |

El sistema permite **materializar una variante en cualquier momento** (no solo al vender): botón en el producto y también desde la venta.

### 5.3 Sobrantes ensamblados
Cuando existan piezas ensambladas almacenadas (pinceles sobrados), **se registran como stock de la variante combo**, NO como otro producto:
- `stock_actual = n`, `stock_min = 0`, `stock_max = 0` (nunca dispara alerta, no se reponen).
- Ajuste con motivo referenciando el BOM cuando aplique.

### 5.4 Registrar ensamble (con BOM)
**Qué es**: operación de inventario para cuando físicamente **armas un producto terminado a partir de sus componentes** (su BOM) — por ejemplo los pinceles sobrados del §5.3. Se asienta en un solo paso para que el stock nunca mienta.

"armé n de &lt;combo&gt;" → el sistema:
1. suma el stock del combo/terminado en `n`,
2. decrementa automáticamente cada componente `exacto` del BOM (cantidad × n),
3. registra `stock_moves` con motivo `ensamble` para todo.

> Vocabulario: "ensamble" aquí es la **operación de inventario** (armar + contabilizar). Es distinta de las secciones de producción (Ensamble/Ensartado/Pegado/Perforado) del módulo de reportes (E3).

### 5.5 Marco de decisión: ¿producto nuevo o variante?
Guía permanente de modelado (aplicar en este orden):

| # | Pregunta | Si sí | Si no |
|---|---|---|---|
| 1 | ¿El cliente **identifica/ordena esa diferencia** (pedido, etiqueta, factura)? | Dimensión real | No modelar |
| 2 | ¿Es variación sobre un eje del **mismo artículo** compartiendo precio/empaque/catálogo? | Variante | — |
| 3 | ¿Cada versión necesitaría **sus propios ejes** de variación? | Productos separados | Variantes (mismos ejes) |
| 4 | ¿Se venden a **distintos clientes/encajes/mercados**? | Productos separados | Sustitutos intercambiables → variantes |
| 5 | ¿Es **dato de manufactura** (molde, turno, lote)? | **Nunca atributo** — va a producción/trazabilidad | — |

**Ejemplos acordados:**
- **Vástago**: un solo producto; atributos `[largo, diámetro, agujero]`. El **molde de inyección NO es atributo**: es trazabilidad de producción.
- **Taparrosca 13 mm con distintas formas**: productos **separados** (cada forma encaja a un frasco/cliente; ejes propios). Unificables después si resultan intercambiables: es solo agrupación de catálogo.
- **Pincel**: configurable; combos perezosos `[tamaño de vástago] × [color de cerda]`; almacenando solo componentes (vástagos, cerdas) salvo sobrantes (§5.3).

### 5.6 Empaques y precio según dimensión
- **Empaque**: definido por variante; para dimensiones que no cambian la capacidad (ej. color), se usa "copiar empaques de la familia/última variante".
- **Precio**: dimensión que cambia precio → override en la variante; las que no → base + copia (regla COALESCE).
- **IVA**: precios netos; el IVA se agrega en ventas/cotizaciones. Moneda: solo MXN.

### 5.7 BOM: componentes `exacto` vs `consumible`
Dos tipos de componente en `product_components`:

| Tipo | Qué es | Participa en neteo/desglose/vía cascada |
|---|---|---|
| `exacto` | Contable por unidad (vástago ×1, taparrosca ×1) | **Sí** |
| `consumible` | Variable / comprado por metro (cerda, pegamento…) | **No** — solo informativo; stock vigilado por su umbral mínimo |

- El desglose de una venta y la verificación de disponibilidad operan **solo sobre `exacto`**.
- **Cerda**: producto propio con variantes por color, `uom = metro`. Si el reporte de producción indica su consumo (línea `consumo`), al confirmarse (E3) **resta del stock de cerda**. El monitor de bajo stock (§6.3) evita que se acabe sin aviso.

Ejemplo multi-nivel resolviendo la venta de "taparrosca con pincel":
```
"Taparrosca con Pincel" (vendible)
   └─ taparrosca rosca 13  ×1   (exacto)
   └─ pincel               ×1   (exacto)
        └─ vástago 4.5     ×1   (exacto)
        └─ cerda                (consumible → NO se netea; se reporta en producción)
```

### 5.8 Unidad de medida
- `products.uom`: unidad del producto (pieza, metro…). Todas las variantes de un producto comparten su `uom`.
- Cantidades de stock (`stock_min/max`, `stock_levels`) y de BOM soportan **decimales** (necesario para `uom = metro`).
- Conteo humano en piezas, metros u otras unidades según `uom`; el empaque siempre en unidades del producto.

### 5.9 Ubicaciones (compartimentos enumerados)
- Una ubicación es un **espacio enumerado** donde caben lotes (varias cajas, no siempre la misma cantidad; ya están numerados en la empresa).
- **Asignación por lote de producción**: un lote recibido se ubica en **uno o varios** compartimentos.
- Toda entrada/salida de stock pasa por movimientos con origen y destino (`locations`); el total por variante es la suma sobre ubicaciones.
- `"Almacén principal"` es la ubicación por defecto para las operaciones de E1/E2; `"Recibo de Producción"` (temporal) es donde entran los productos terminados al confirmarse un reporte (E3).

## 6. Módulo Inventario (E1) — alcance funcional

### 6.1 API
- `GET/POST /products` · `PATCH /products/:id`
- `POST /products/:id/attributes` · `POST /products/:id/variants` (crear variante real o materializar combo)
- `POST /products/:id/components` (BOM con `tipo`)
- `POST /variants/:id/packagings`
- `POST /variants/:id/stock` (ajuste con motivo → `stock_moves` con origen/destino; default `"Almacén principal"`; soporta decimales)
- `POST /products/:id/assemble` (Registrar ensamble con BOM, §5.4)
- `GET /stock/low` (suma ≤ stock_min) · `POST /stock/check` (verificación **manual** opcional) · `POST /stock/notify` (forzado)
- `GET /locations` (física de stock visible; el flujo completo de ubicación se usar en E3)

### 6.2 Web (una sola app)
- **Dashboard** de inventario con badges `normal` / `bajo` / `crítico` (long_lead + bajo) y stock por ubicación.
- **Página de producto**: atributos y grid de combos, variantes, empaques (con copiar), BOM (con tipo), precios (base + override) e historial, `uom`, stock por ubicación.
- **Ajuste de stock** con motivo; **Registrar ensamble**.
- **Alerta manual** y estado del monitor.

### 6.3 Monitor de stock + notificaciones
**Sin timer ni polling**: el propio ERP conoce el instante exacto de cada cambio de inventario, así que el monitor se dispara de inmediato al registrar un movimiento (`stock_moves`: ajuste, entrada, salida, transferencia, ensamble, venta, producción, consumo). En el momento en que una variante queda **igual o por debajo de su `stock_min`**, se genera el evento y notifica **solo lo nuevo** (no se repite mientras siga bajo el umbral, y vuelve a avisar si sube y vuelve a bajar), marcando críticos `long_lead`. Canales portados del código actual: Email, Telegram, WhatsApp (CallMeBot). `POST /stock/check` queda como verificación manual opcional (botón "revisar ahora") y `POST /stock/notify` como reporte **forzado** de todo lo bajo stock. Aplica a cualquier `uom`.

## 7. Módulo Ventas y Fabricación (E2) — alcance funcional

### 7.1 Clientes
- CRUD de `partners` (nombre, teléfono, dirección, email). Alta manual; datos iniciales importables por CSV.

### 7.2 Venta mínima
- Captura: cliente, producto (variante/combos), cantidad, precio_unitario, fecha de entrega deseada. Estado abierta/despachada/cancelada y estado de entrega por línea (pendiente/parcial/entregado).
- NOTA: cotización/facturación/IVA quedan para una entrega posterior (E5); aquí la venta existe solo para planear.

### 7.3 Desglose BOM (multi-nivel, solo `exacto`)
Al crear la orden de venta, el sistema descompone cada línea vendida recorriendo el árbol del BOM únicamente por componentes `tipo = "exacto"`. Los `consumible` (cerda) se ignoran en el desglose (§5.7).

### 7.4 Verificación de disponibilidad (neteo)
Para cada artículo requerido (terminado y componentes):
```
requerido = (cantidad vendida/consumida) − stock_actual   [stock_actual = suma sobre ubicaciones]
   si requerido ≤ 0  → hay en existencia → se despacha
   si requerido > 0  → falta → se genera orden de fabricación (o compra)
```

### 7.5 Órdenes de fabricación y cascada automática
- El sistema **genera la orden de fabricación** para los artículos que faltan.
- **Cascada**: los componentes `exacto` que a su vez faltan y tienen su propio BOM generan órdenes de fabricación hijas; los componentes fabricables sin stock suficiente se van neteando nivel a nivel.
- Los faltantes **no fabricables** se listan como *pendientes de compra* (no se auto-compra).
- Cada orden guarda su origen (`generated_from`) para trazabilidad; el despacho decrementa stock desde la ubicación elegida (default `"Almacén principal"`) con motivo `despacho`.
- Al final queda un **resumen de fabricación**: órdenes creadas + faltantes de compra.

### 7.6 Web
- **Órdenes de venta**: crear, ver, editar; desglose visible y resultado del neteo (fabricar vs existencia).
- **Órdenes de fabricación**: lista con estado y componentes requeridos; confirmada→en progreso→hecha (ejecución real se registra en E3 con los reportes).
- **Resumen de faltantes** y pendientes de compra.

### 7.7 Tienda pública (storefront) — futura, después de E2
- App separada `apps/storefront` (Next.js) en su propio dominio; **es la única pieza expuesta a internet**.
- **NO se conecta a la DB**: consume solo `/api/public/*` de `apps/api` (se mantiene §2: DB propiedad exclusiva de la API).
- Endpoints públicos:
  - `GET /api/public/catalog` → productos/variantes con `published=true`, precio efectivo y empaques.
  - `GET /api/public/products/:id` → detalle para ficha del producto.
  - `POST /api/public/orders` → alta de orden **pendiente**, `origen='web'`, datos de invitado (nombre, teléfono, email).
  - `GET /api/public/orders/:numero` → el cliente consulta el estado de su pedido.
- Reglas: los **precios se recalculan en servidor** (nunca se confía en el precio que manda el cliente); límite de peticiones/rate-limit; **sin** inventario, usuarios, reportes ni datos internos.
- La orden web entra a la **misma tubería** `sales_orders` (§7.1–7.5): al confirmar el equipo se aplica neteo, venta mínima y órdenes de fabricación con cascada.
- Pago: `sales_orders.payment_method` queda **nullable** como punto de extensión; hoy la tienda solo registra el pedido y se cobra por teléfono/WhatsApp. Una pasarela (Stripe/MercadoPago…) se integra después sin cambiar la estructura.

## 8. Módulo Producción y Reportes (E3) — alcance funcional

### 8.1 Reporte ligado a variantes
- Las líneas del reporte **referencian variantes reales** (ya no texto libre), con su `seccion`/origen (máquina 1-3, ensamble, ensartado, pegado, perforado).
- `tipo` de línea:
  - `final` → producto terminado vendible/almacenable → **incrementa** inventario al confirmarse.
  - `consumo` → consumible (ej. cerda en metros) → **decrementa** su stock al confirmarse.
- Métricas operativas portadas: producción/persona/hora según turno (Matutino 8h · Vespertino 7.5h · Nocturno 8h), stats y CSV.

### 8.2 Confirmación de inventario (pendiente → aplicado)
El reporte **nunca modifica inventario por sí solo**; hay validación humana antes:

```
1. Manufactura ingresa el reporte        → estado PENDIENTE (no toca inventario)
2. Encargada de inventario lo revisa
       ├─ ¿Correcto?        → ACEPTAR
       └─ ¿Incorrecto?      → MODIFICAR (regresa a pendiente)
3. AL ACEPTAR se aplican movimientos (todo con ref = reporte):
       • líneas `final`     → +N hacia "Recibo de Producción" (temporal), motivo `produccion`
       • líneas `consumo`   → −N del consumible (ej. cerda), motivo `consumo`
4. Luego: Ubicar (§8.3)
```

Reglas:
- Un reporte solo se edita mientras esté `pendiente`.
- Si ya está `aplicado` y se detecta un error, la corrección se hace con un **ajuste/contracargo con referencia** — nunca re-girando el reporte.

### 8.3 Ubicar (la encargada asigna la ubicación)
- Lista los lotes recibidos en `"Recibo de Producción"` (producto, cantidad, reporte de origen).
- La encargada asigna cada lote a **uno o varios compartimentos enumerados** → movimientos `Recibo de Producción → Compartimento`, motivo `ubicacion`.
- La cantidad **nunca se vuelve a tipear**: la encargada solo decide el dónde.

### 8.4 Anti-doble-conteo
Si un producto atraviesa varias secciones dentro del proceso, **solo la línea `final`** (la que entrega/almacena) incrementa inventario; el resto de secciones quedan como métrica operativa (persona/hora).

### 8.5 Ejecución de órdenes de fabricación (E2 → E3)
- Las órdenes de E2 `confirmadas` se ejecutan desde la línea: al cerrar la jornada, el reporte correspondiente aplica (con la confirmación de §8.2) el producto terminado y el consumo de componentes vinculados → la orden pasa a `hecha`.
- Las secciones de producción se asocian a la orden en ejecución cuando aplique (trazabilidad).

### 8.6 Web
- Formulario de reporte por turno con líneas a variantes (máquinas + secciones).
- **Bandeja de pendientes** para la encargada: ver, editar, aceptar.
- **Pantalla "Ubicar"**: recibidos sin ubicar → asignación a compartimentos.
- Stats, gráficas y exportación CSV portados; reporte con edición/eliminación protegida.

## 9. Principios de UI (usabilidad)

**La usabilidad es el requisito #1 de este sistema.** Se aprende en cada entrega, desde E0.

- **Público**: usuarios con poca experiencia digital, mouse + teclado, en computadoras. La UI guía paso a paso; nunca exige "aprender el sistema".
- **Menos de 3 clicks** en toda operación frecuente (dar de alta reporte, aceptar, ubicar, ajustar stock, crear venta).
- **Idioma de la planta**: botones y mensajes en el lenguaje que ya usan los operadores (cajas, cepillo, compartimento, "Recibo de Producción"); cero jerga ERP.
- **Opciones visibles**: chips/radio en lugar de dropdowns cuando son pocas opciones; búsqueda por nombre/letras (no se escriben códigos); sin escáner de códigos de barras.
- **Valores precargados**: turno según la hora, fecha = hoy, formularios prellenados con lo de la jornada anterior.
- **Formularios guiados**: un campo a la vez cuando ayude; el siguiente campo aparece solo después de completar el anterior.
- **Home = la tarea del día por rol**: el operador ve su formulario de reporte; la encargada ve su bandeja de pendientes; el admin ve su panel. Cero menús para llegar a lo importante.
- **Alto contraste, texto grande, feedback claro** ("guardado ✔", "esperando aceptación", "error: cantidad inválida").
- **Confirmación solo en acciones irreversibles** (aceptar reporte, borrar, ajuste de stock grande).
- **Prevención de errores por diseño**: cantidades validadas, selección obligatoria, mensajes en lenguaje humano.
- **Flujos de un paso**: "Aceptar" = 1 click; "Ubicar lote" = elegir lote → compartimento → listo.

## 10. Plan de entregas

| Entrega | Contenido | Estado |
|---|---|---|
| **E0** | Fundaciones: monorepo (pnpm), docker-compose (postgres + api + web + caddy), Prisma base, auth (users/roles), esqueleto de proceso | ✅ entregado |
| **E1** | Inventario completo: schema v1 (§4, incl. ubicaciones), API, web, uom, monitor + notificaciones (event-driven, sin timer), registrar ensamble | ✅ entregado |
| **E2** | Ventas + Fabricación: clientes, venta mínima, desglose BOM multi-nivel, neteo, órdenes de fabricación con cascada automática | ✅ entregado |
| **Tienda (futura)** | Storefront público: `/api/public` + `apps/storefront` (catálogo de publicados, pedido invitado, misma tubería E2, pago futuro) — entrega propia después de E2. **La tubería de pedido web (`origen=web`, invitado, precio recalculado en servidor, consulta por número) está operativa**; falta la app `apps/storefront` separada + pasarela de pago + marcar variantes `published`. | 🟡 tubería operativa |
| **E3** | Producción/Reportes: reporte ligado a variantes, confirmación de inventario (pendiente→aplicado), auto-inventario a "Recibo de Producción", pantalla Ubicar, ejecución de órdenes de fabricación, consumo de cerda, stats/CSV. **Flujo verificado end-to-end (2026-08-31)** | ✅ entregado |
| **E4** | Signage: pantallas TV leyendo de nuestras ventas/fabricación/stock (ya no de Odoo) | ⏳ pendiente |
| **E5** | Etiquetas + ventas consolidadas + facturación/IVA + pricing updater; desconexión progresiva de Odoo (queda como respaldo) | ⏳ pendiente |

## 11. Requerimientos no funcionales

- LAN + Docker Compose sobre Linux; dominio/servicio local.
- Reverse proxy (caddy/nginx) como capa única de entrada.
- Backup automatizado de PostgreSQL.
- Auth con sesión (JWT httpOnly sobre cookie); distintos alcances por rol.
- SSE con auto-reconnect y keepalive (pantallas TV, desde E4).
- Migraciones de datos: entrada manual o importación CSV puntual (sin dependencia de Odoo para operar).
- **Trazabilidad de stock**: toda variación es un `stock_moves` con origen/destino/motivo/referencia; nunca re-escritura directa de cantidades.
- Trazabilidad de manufactura (molde) hacia el futuro módulo de producción — no en el modelo de producto.

## 12. Fuentes de referencia

- Código legacy: `apps/produccion` (PPG Unified) — referencia de lógica de negocio y notificaciones.
- Datos Odoo que consume la app legacy (pauta mínima de desacople): `product.product` (stock/tags/imagen), `stock.warehouse.orderpoint` (min/max), `product.tag` ("long lead"), `mrp.production` (órdenes de fabricación), `sale.order(.line)` (ventas/consolidación), `res.partner` (clientes).