# Plan BTVPE — Implementación de productos tipo envase cosmético

> Estado: **aprobado** (2026-09-03) — lista para implementar
> Última actualización: 2026-09-03 (Opción X)

---

## 1. Contexto

La empresa fabrica envases para cosméticos. Ya está implementada la **taparrosca con pincel**. Se agregan **5 productos nuevos** que comparten componentes (botella, tapa/sobretapa, vástago, escurridor) pero difieren en el **aplicador (punta)**.

**Los 5 productos vendidos (nombre de cliente):**

| Producto | SKU interno | Aplicador |
|----------|-------------|-----------|
| Rimel Silicon | BTVPE-S | Cepillo silicon (varios diámetros) |
| Rimel Nylon | BTVPE-N | Cepillo nylon (mismo diámetro = mismo vástago) |
| Delineador | BTVPE-D | Cerdas de delineador (1 solo tipo, sin color) |
| Tratamiento de Noche | BTVPE-TN | Cerdas diferentes (1 solo tipo, sin color) |
| Lip Gloss | BTVPE-LG | Punta de lip gloss (varios grosores, sin color) |

> BTVPE (Botella, Tapa, Vástago, Punta, Escurridor) es código interno. El cliente ve los nombres reales.

---

## 2. Modelo de color — Opción X (DECISIÓN CLAVE)

**Cada componente tiene su propio atributo de color**, con sus propios valores elegidos por el usuario. Esto permite que botella, vástago, sobretapa y escurridor tengan **colores independientes** dentro del mismo envase.

### Atributos de color por componente

| Atributo color | Componente | Valores iniciales (editables) |
|----------------|-----------|-------------------------------|
| `Color Botella` | Botella | Negro, Transparente, Blanco |
| `Color Vástago` | Vástago | Negro, Transparente, Blanco |
| `Color Sobretapa` | Sobretapa | Negro, Transparente, Blanco |
| `Color Escurridor` | Escurridor | Negro, Transparente, Blanco |
| `Color Cepillo` | Cepillo Silicon + Nylon | Negro, Transparente, Blanco |

### Reglas del color

- **Puntas SIN color:** Delineador, Tratamiento Noche, Lip Gloss (no tienen atributo color ni paso de color en el wizard).
- **Cepillos (silicon y nylon):** SÍ tienen `Color Cepillo`.
- **Preselección "Negro"** por default → a nivel de **UI (frontend)**.
- **Los pasos de color no dependen de otras selecciones** (ningún color filtra a otro; solo dependen del componente propio).
- Cada componente muestra **solo los valores de color que el usuario publique** en sus variantes (mecanismo `getPasos` ya filtra por variantes publicadas).

---

## 3. Atributos globales (`Attribute` + `AttributeValue`)

**Atributos de selección (no-color):**

| atributo | valores |
|----------|---------|
| `Botella` | 10mL, 15mL, 30mL |
| `Forma` (solo cepillos) | Recto, Espiral, Pino, Cacahuate, Globo, Balita, Redondo |
| `Diámetro` | 3mm, 4mm, 5mm, 6mm, 7mm, 8mm |

**Atributos de color por componente (Opción X):** ver §2.

> `Forma tapa` (Hexagonal, Bala, Rebeca, Yadis) ya existe y se reutiliza para la sobretapa.
> `Tamaño rosca`, `Altura vastago` ya existen y se reutilizan.

---

## 4. Productos / componentes

### Renombre
- `VAST` "Vástago" → **"Mango"** (solo nombre; SKU y BOM de taparrosca intactos). No es intercambiable con el nuevo vástago.

### Nueva categoría
- **"Envases"**

### Productos a crear (upsert por `skuBase`)

| sku | nombre | categoria | hasVariants | notas |
|-----|--------|-----------|-------------|-------|
| `BOT` | Botella | Envases | **true** | variantes por capacidad con atributos internos |
| `VST` | Vástago | Vástagos | false | hoja |
| `STP` | Sobretapa | Taparroscas | false | hoja |
| `ESC` | Escurridor | Envases | false | hoja; altura es metadata |
| `CSI` | Cepillo Silicon | Cepillos | false | hoja |
| `CNI` | Cepillo Nylon | Cepillos | false | hoja |
| `DPL` | Delineador | Cepillos | false | 1 solo tipo, sin color |
| `TRN` | Tratamiento Noche | Cepillos | false | 1 solo tipo, sin color |
| `LGL` | Lip Gloss | Cepillos | false | sin color |
| `BTVPE-S` | Rimel Silicon | Envases | true | |
| `BTVPE-N` | Rimel Nylon | Envases | true | |
| `BTVPE-D` | Delineador | Envases | true | |
| `BTVPE-TN` | Tratamiento de Noche | Envases | true | |
| `BTVPE-LG` | Lip Gloss | Envases | true | |

---

## 5. BOM (`ProductComponent`) — todos `exacto`, cantidad 1

Cada BTVPE = `Vástago + Botella + Sobretapa + Escurridor + [punta]`:

| Producto | Punta |
|----------|-------|
| BTVPE-S | Cepillo Silicon (CSI) |
| BTVPE-N | Cepillo Nylon (CNI) |
| BTVPE-D | Delineador (DPL) |
| BTVPE-TN | Tratamiento Noche (TRN) |
| BTVPE-LG | Lip Gloss (LGL) |

---

## 6. Ejes del grid (`ProductAttributeLine`)

### 6.1 Ejes de COMPONENTES (necesarios para `resolveComponentVariant`)
Para que el ensamble iguale el color correcto por componente, cada componente define sus ejes:

| Componente | Ejes |
|-----------|------|
| Botella (BOT) | `Botella` + `Color Botella` + `Tamaño rosca` |
| Vástago (VST) | `Tamaño rosca` + `Altura vastago` + `Color Vástago` |
| Sobretapa (STP) | `Tamaño rosca` + `Forma tapa` + `Color Sobretapa` |
| Escurridor (ESC) | `Tamaño rosca` + `Color Escurridor` |
| Cepillo Silicon (CSI) | `Forma` + `Color Cepillo` |
| Cepillo Nylon (CNI) | `Forma` + `Color Cepillo` |
| Delineador/Tratamiento/LipGloss | (sin ejes, variante única) |

### 6.2 Ejes de los BTVPE (grid del producto vendido)

Ejes comunes a los BTVPE:
1. `Botella` (capacidad)
2. `Color Botella`
3. `Tamaño rosca` (derivado, no es paso guiado)
4. `Altura vastago`
5. `Color Vástago`
6. `Forma tapa` (sobretapa)
7. `Color Sobretapa`
8. `Color Escurridor`

**Por producto** (se antepone/n la característica propia del aplicador):

| Producto | Ejes |
|----------|------|
| **BTVPE-S** | `Forma`, `Color Cepillo`, + comunes |
| **BTVPE-N** | `Forma`, `Color Cepillo`, + comunes |
| **BTVPE-D** | comunes |
| **BTVPE-TN** | comunes |
| **BTVPE-LG** | `Diámetro`, + comunes |

---

## 7. Pasos guiados (`ProductPasso`) — Opción A (agrupación en frontend)

**Regla:** se usan pares **[característica, color] consecutivos** para cada componente. El frontend agrupa características+color de un componente en **un panel** (detección por atributo de color = `Color ...` agrupado al paso inmediato anterior).

**Comportamiento del color en el wizard:**
- **≥2 colores** → se muestra selector de color junto a la característica.
- **1 solo color** → se oculta el selector (se usa ese color automáticamente).
- **Preselección Negro** por default (UI).
- **Cepillo silicon (BTVPE-S):** la forma se elige primero y en el mismo panel aparecen los colores del cepillo.
- **Cepillo nylon (BTVPE-N):** la forma y los colores se muestran a la vez en el mismo panel.
- **No hay paso de punta** para Delineador/Tratamiento de Noche (punta fija).
- **No hay paso de color** para la punta de Lip Gloss/Delineador/Tratamiento de Noche.

### BTVPE-S (Rimel Silicon) — orden de paneles/pasos
1. Forma (cepillo) + Color Cepillo
2. Botella + Color Botella
3. (Tamaño rosca derivado — no paso)
4. Altura vástago + Color Vástago
5. Forma tapa + Color Sobretapa
6. Color Escurridor
7. Cantidad (qty)

### BTVPE-N (Rimel Nylon) — orden
1. Forma (cepillo) + Color Cepillo
2. Botella + Color Botella
3. Altura vástago + Color Vástago
4. Forma tapa + Color Sobretapa
5. Color Escurridor
6. Cantidad

### BTVPE-D / BTVPE-TN — orden (sin punta en wizard)
1. Botella + Color Botella
2. Altura vástago + Color Vástago
3. Forma tapa + Color Sobretapa
4. Color Escurridor
5. Cantidad

### BTVPE-LG (Lip Gloss) — orden
1. Diámetro (punta, sin color)
2. Botella + Color Botella
3. Altura vástago + Color Vástago
4. Forma tapa + Color Sobretapa
5. Color Escurridor
6. Cantidad

---

## 8. Archivos a implementar

| Archivo | Cambio |
|---------|--------|
| `packages/db/prisma/seed.ts` | Categoría Envases, renombre Mango, atributos nuevos (\$3), 14 productos (\$4) |
| `scripts/seed-products.ts` | Ejes componentes + ejes BTVPE (\$6), BOM (\$5), pasos (\$7) |
| `apps/web/src/app/tienda/[productId]/page.tsx` | Agrupación Opción A (paneles característica+color), preselección Negro, ocultar selector con 1 color |
| `apps/web/src/components/ventas/modal-config-variante.tsx` | Ídem agrupación Opción A |
| `docs/plan-btvpe.md` | Este documento |

---

## 9. Notas / supuestos

- **Valores de color por componente** (Negro/Transparente/Blanco) son **valores iniciales editables** por el usuario.
- **Botella (BOT)** = producto `hasVariants=true` **sin variantes materializadas** aún (las crea el usuario manualmente o con seed posterior).
- **No se materializan variantes de BTVPE por el agente** — las crea el usuario para probar. La **publicación** (`published=true`) de variantes válidas las hace visibles en el wizard (Opción C).
- **Altura del escurridor** = metadata del componente (no seleccionable por el cliente).
- **Logo de la sobretapa** NO es atributo del sistema; se maneja por WhatsApp (trabajo costoso).

---

## 10. Decisions log

| Fecha | Decisión | Razón |
|-------|----------|-------|
| 2026-09-03 | 5 productos separados (no 1 padre) | Los clientes buscan envase por producto específico |
| 2026-09-03 | BTVPE = código interno, clientes ven nombres reales | Nombres de la tabla son lo que ve el cliente |
| 2026-09-03 | Reutilizar "Tamaño rosca" para vástago y mango | Mismo concepto |
| 2026-09-03 | "Altura vástago" y "Altura botella" son attributes separados | Regla vástago ≤ botella, no igualdad |
| 2026-09-03 | Opción C filtrado: grid + publicar solo válidas | Balance automatización y control |
| 2026-09-03 | No materializar variantes (las crea el usuario) | Prueba manual |
| 2026-09-03 | Botella seleccionada por nombre (10mL, 15mL...) | Mejor UX; el cliente no ve rosca/altura/diámetro |
| 2026-09-03 | **Opción X**: atributo de color por componente | Permite colores independientes por componente, cada uno con sus valores |
| 2026-09-03 | Atributo global no es suficiente para color por componente | Un solo `attributeId` forzaría un color único para todo el envase |
| 2026-09-03 | Color = paso por componente (excepto puntas D/TN/LG) | El cliente elige color de cada pieza |
| 2026-09-03 | Puntas Delineador/Tratamiento/LipGloss SIN color | El usuario lo confirmó; solo cepillos tienen color |
| 2026-09-03 | `Color Cepillo` es de Cepillo Silicon y Nylon | Ambos cepillos tienen color |
| 2026-09-03 | Preselección Negro = a nivel UI | Simple, sin cambios de datos |
| 2026-09-03 | Altura escurridor = metadata (no seleccionable) | No aporta valor seleccionarla |
| 2026-09-03 | **Opción A**: agrupar característica+color en panel (frontend) | Sin migración; 1 passo = 1 attributeId se mantiene |
| 2026-09-03 | Cepillo silicon: color secuencial tras forma; Nylon: forma+color simultáneos | Comportamiento por producto definido por el usuario |
| 2026-09-03 | Logo NO está en wizard | Se acuerda por WhatsApp |
| 2026-09-03 | Tamaño rosca es eje pero NO paso guiado | Se deriva de la botella |
