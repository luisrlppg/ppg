# conventions.md — Patrones y reglas de código

Reglas que **debes** respetar al modificar PPG ERP. Para ubicar archivos ver `project-nav.md`.

## API (NestJS)

1. **Cada dominio es un módulo** (`x.controller.ts`, `x.service.ts`, `x.module.ts`). Usa los guards
   existentes (`JwtAuthGuard` + `RolesGuard`) y el decorator `@Roles()`. No dupliques guards.
2. **Roles:** `admin` puede todo (configuración, seguridad y gestión de usuarios); `operador` ejecuta la
   operación (ventas, inventario, producción, clientes) y lee el resto. La app está **protegida por
   defecto**: `JwtAuthGuard` + `RolesGuard` son guards globales (`APP_GUARD` en `auth.module.ts`) y sólo
   lo marcado con `@Public()` (login/logout, `health`, `/public/*`) queda sin sesión. Son `admin` las
   escrituras de `catalogos` y `productos`, y todo `costos`, `backups`, `monitor` y `usuarios`.
3. **Rutas estáticas antes de `:param`** en los controllers (p. ej. `/inventario/existencia` vs `/inventario/:id`).
4. **Decimal ↔ number:** usa siempre `dec()` de `common/util.ts` para convertir `Decimal` de Prisma.
5. **Precios:** todo cambio de precio base/variante **debe** registrarse en `PriceChange`.
6. **BOM recursivo / ciclos:** cualquier lógica que recorra `ProductComponent` recursivamente debe
   **detectar ciclos** (patrón presente en `ventas`, `inventario`, `productos.resolveComponentVariant`
   y `catalogos.atributos-producto`). La recursión BOM hoy está duplicada en varios sitios; si la tocas,
   considera extraerla a un helper/módulo común.
   **Resolución de componente (`resolveComponentVariant`):** casa por intersección de ejes y, si hay
   varios candidatos, desempata de forma determinista con `PREFERENCIAS_RESOLUCION` (hoy
   `Versión del vástago = Nuevo`) → mayor stock → menor id. No devolver `null` por ambigüedad; se
   agregan preferencias ahí cuando el negocio pida otro criterio.
7. **Monitor tras stock:** cada mutación de stock que deba alertar llama a `monitor.afterStockChange`.
   Mantén ese contrato.
8. **Migraciones:** nunca ejecutes `prisma migrate dev` directo en shell no-TTY; genera con
   `--create-only` y aplica con `pnpm db:deploy` (ver `development.md`).

## Web (Next.js)

9. **Páginas `"use client"`**; usa `api()` de `@/lib/api` y tipos de `@/lib/types.ts`.
   **No** introduzcas Redux/Zustand/react-query: sigue `useState` + `useEffect` + `useCallback`.
10. **Tipos nuevos:** centralízalos en `apps/web/src/lib/types.ts`.
11. **UI compartida:** reutiliza `components/ui/` (`PageHeader`, `Modal`, `ConfirmDialog`, `Segmented`,
    `HelpNote`, `StickyBar`) y las clases/tokens de `app/globals.css`. No inventes clases nuevas.
    En listas con buscador envuelve la barra en `StickyBar` (queda fija y publica `--sticky-head`);
    las tarjetas que envuelven `.table` **no** deben usar `overflow:hidden` ni `.table-wrap` scrollear
    (el scroll del contenido y el `thead` fijo dependen de ello; ver §3.3 de `project-nav.md`).
12. **Exportaciones CSV en cliente** usan `lib/csv.ts`; respetan los filtros/vista activa.
13. **Preferencias de UI** (vista tabla/grid, selecciones de ejes): `local-store.ts` (`ppg.*` en `localStorage`).
14. **Cantidades mostradas:** formatea las cantidades visibles con `useFormatCantidad()` de
    `@/lib/preferences` (respeta la preferencia del usuario: coma `1,234.56` o espacio `1 234.56`).
    No lo apliques en **inputs editables** ni en filas de **CSV/exportaciones** (deben quedar crudas).
    El API que no tiene contexto de usuario usa `formatCantidad` de `@ppg/shared` con el default `coma`.
    Si tocas `@ppg/shared`, corre `pnpm --filter @ppg/shared build`.

## General

15. **No-interactividad:** nunca dejes comandos que pidan input (CI/agente). Prefiere flags no interactivos.
16. **Comentarios opcionales:** usa `{/* */}` (web) y `// ---` (api) para marcar secciones grandes,
    igual que los archivos existentes. No añadas comentarios explicativos redundantes; **no** comentes código evidente.
17. **Actualiza el mapa:** si mueves/renombras archivos o cambias zonas relevantes, actualiza
    `project-nav.md` (§2/§3/§4) para que las referencias sigan siendo válidas.
18. **Catálogo:** cámbialo con **ops declarativas** (`scripts/catalog/`, ver `docs/catalog-ops.md`);
    no crees scripts one-off. Valida con `pnpm cat:snapshot` + dry-run (`cat:apply --file …`).
    Tras editar valores de variantes en la UI, corre `pnpm cat:export-seed` para volcarlos al seed.
    Estado y pendientes: `docs/catalog-state.md`.
19. **Fabricación (necesidades y producción):** no hay entidad de orden de fabricación (retirada
    2026-10-05). `ventas.confirmar` solo calcula/guarda el desglose; el panel de Fabricación lista las
    **necesidades** (`fabricacion.necesidades`: por mínimo + por ventas, con pool compartido de stock) y
    registra producción como **entrada de stock** (`POST /fabricacion/produccion`, motivo `produccion`, a
    la ubicación elegida), sin crear reportes. Los **ensambles** (2+ componentes) se arman contra pedido:
    no se inventarían y `ventas.despacharLinea` **consume sus componentes** (`planificacion.consumirEnsamble`).
    Al tocar el BOM, `SeccionProduccion` o `ProductionReport`, genera la migración (`--create-only`) y aplica
    con `pnpm db:deploy`.
