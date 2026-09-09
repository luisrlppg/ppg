# PPG ERP - Agente Context

## Situación actual
- Monorepo: NestJS (API) + Next.js (web) + Prisma (PostgreSQL)
- Entrega actual: E3 (producción/reportes con selección guiada de 6 pasos)
- Stack: pnpm, Docker Desktop (Windows), acceso a archivos via /mnt/d/

## Estructura del proyecto
```
/home/luisrlp/ppgapps/ppg/  (WSL2/Linux)
apps/
  api/        # NestJS API (puerto 3001)
  web/        # Next.js (puerto 3000, proxy /api → :3001)
packages/
  db/         # Prisma schema + seed
scripts/      # Scripts de utilidad
```

## Modelo de datos

### Productos
- **Vástago** (ID 1) — producto base, sin BOM
- **Cerda** (ID 2) — uom=kg, consumible
- **Pincel** (ID 3) — ensamble: Vástago + Cerda
- **Taparrosca con Pincel** (ID 4) — ensamble: Pincel + Vástago

### Atributos (globales)
- `Attribute` es global (sin productId)
- `ProductAttributeLine` asigna atributos a productos (N:N)
- Atributos propios vs heredados (de componentes del BOM)

### Atributos actuales
- Tamaño rosca (10mm, 13mm, 15mm)
- Altura vastago (10mm-35mm)
- Agujero vastago (Plano, Normal)
- Forma tapa (Hexagonal, Bala, Rebeca, Yadis)
- Color tapa (Negro, Blanco, Transparente, Personalizado)

### Pasos del storefront (ProductPasso)
6 pasos para Taparrosca con Pincel (pasos 1-3 → Vástago, paso 4 → Pincel, pasos 5-6 → Taparrosca).
**Nota (2026-08-31):** aunque el `variantProductId` apunta a los componentes, `getPasos` arma las opciones
de cada paso desde las **variantes publicadas del producto navegado** (producto 4), porque los componentes
(Vástago/Pincel) no siempre tienen variantes reconvertidas por atributo. `variantProductId` solo se conserva
por compatibilidad en la respuesta.

## API endpoints relevantes
- `GET /api/productos` — lista de productos
- `GET /api/productos/:id` — detalle con componentes
- `GET /api/productos/:id/grid` — combinaciones posibles (materializable puntual)
- `GET /api/catalogos/atributos` — todos los atributos globales
- `GET /api/catalogos/atributos/producto/:id` — propios + heredados
- `POST /catalogos/atributos` — crear atributo global
- `POST /catalogos/atributos/:id/asignar/:productoId` — asignar
- `DELETE /catalogos/atributos/:id/desasignar/:productoId` — desasignar
- `PUT /productos/:id/ejes` — asignar atributos al producto
- `GET /public/productos` — productos con ≥1 variante activa y publicada (grid de Nueva venta)
- `GET /public/productos/:id/pasos` — pasos guiados con opciones (variantes publicadas del producto navegado)
- `GET /public/catalog` — variantes publicadas con precios/empaques

## UI pages
- `/productos` — lista de productos admin
- `/productos/[id]` — editar producto (atributos, BOM, variantes). Combinaciones y variantes unificadas: selector "Materializar combinación" para crear UNA variante puntual (sin generador masivo)
- `/catalogos` — atributos globales, categorías, empaques
- `/tienda/[productId]` — storefront público con pasos guiados
- `/ventas` — alta desde **grid de productos públicos** + modal guiado de configuración; lista, confirmación con neteo y OFs
- `/fabricacion` — órdenes de fabricación

## Scripts útiles
- `scripts/reset-variants.ts` — limpia variantes, limpia atributos/valores
- `scripts/seed-products.ts` — configura estructura BOM + ProductAttributeLine + ProductPasso
- `scripts/seed-demo.ts` — siembra variantes reales + stock + OF de demostración para probar el flujo E3 (reportes/producción); idempotente
- `scripts/seed-demo-ventas.ts` — siembra variantes únicas + combo taparrosca SIN stock para probar el flujo ventas → confirmación → neteo → cascada de OFs (E2); idempotente
- `scripts/ppg.sh` — único gestor de servidores (alias `ppg` en `~/.bashrc`): `ppg start|stop|restart|reload|status|logs|db`. `start` hace bootstrap completo (Postgres + deps + migraciones) y arranca api+web con hot-reload en background; `reload` aplica migraciones y reinicia; `db <native|docker|auto|stop>` elige el motor de Postgres (persistido como `PPG_DB_MODE` en `.env`). **No siembra.**

## Pendiente
1. **Modularización** — separar código en módulos (Catálogos, Manufactura, etc.)
2. **WSL2** — setup completo de dev en Linux

> **Ventas → OFs recursivas (E2): verificado end-to-end (2026-08-31).** Al confirmar una venta se netea (fabricar vs comprar), se generan OFs únicas en cascada multi-nivel (combo → pincel → vástago) con sus líneas de componentes y la `configuracion` en la OF de ensamble, y el despacho consume stock hasta `despachada`. Durante la verificación se corrigieron 3 bugs:
> - DTO de ventas internas no aceptaba `configuracion` (el service sí la leía, pero `whitelist: true` la descartaba).
> - Doble bucle en `confirmar` generaba cada OF dos veces (neteo + `crearOFS`); se eliminó el bucle redundante y el archivo `ventas.ofs.ts`.
> - `despacharLinea` no hacía `await` del `$transaction`, lo que tumbaba el proceso (unhandled rejection) al lanzar errores de stock; ahora devuelve 400 limpio.

> **Nueva venta (2026-08-31):** el alta de venta ya no usa búsqueda libre de variantes; ahora parte de un
> **grid de productos públicos** (`GET /public/productos`) y cada producto se configura por un **modal guiado
> de pasos** (estilo storefront). El modal y `/tienda` reusan `getPasos` (opciones = variantes **publicadas**
> del producto navegado, filtradas por conjunto de variantes compatibles). En `/productos/[id]` se unificaron
> combinaciones y variantes en una sola vista con el selector "Materializar combinación". Pendiente:
> **imágenes** de opciones (hoy placeholders) y **precios** (ocultos a propósito, los revisa el equipo).

## Credenciales
- Admin: `admin` / `admin123`
- PostgreSQL: `postgresql://ppg:ppg@localhost:5432/ppg` (native o Docker, mismo puerto; elige motor con `ppg db <native|docker>`)
- Docker Desktop (Windows) accesible via `host.docker.internal`
