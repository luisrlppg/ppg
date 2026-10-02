const KEY = (prodId: number) => `ppg.producto.${prodId}.sel`;

/** Selección de valores por atributo guardada en el navegador para un producto. */
export function leerSeleccion(prodId: number): Record<number, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY(prodId));
    if (!raw) return {};
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<number, number> = {};
    for (const [k, v] of Object.entries(obj)) {
      const n = Number(v);
      if (Number.isFinite(n)) out[Number(k)] = n;
    }
    return out;
  } catch {
    return {};
  }
}

export function guardarSeleccion(prodId: number, sel: Record<number, number>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY(prodId), JSON.stringify(sel));
  } catch {
    /* almacenamiento no disponible */
  }
}

export function borrarSeleccion(prodId: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY(prodId));
  } catch {
    /* noop */
  }
}

export type VistaProductos = "tabla" | "grid";

const VISTA_KEY = "ppg.productos.vista";

export function leerVistaProductos(): VistaProductos {
  if (typeof window === "undefined") return "tabla";
  try {
    return window.localStorage.getItem(VISTA_KEY) === "grid" ? "grid" : "tabla";
  } catch {
    return "tabla";
  }
}

export function guardarVistaProductos(vista: VistaProductos): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VISTA_KEY, vista);
  } catch {
    /* noop */
  }
}

export type VistaClientes = "tabla" | "grid";

const VISTA_CLIENTES_KEY = "ppg.clientes.vista";

export function leerVistaClientes(): VistaClientes {
  if (typeof window === "undefined") return "tabla";
  try {
    return window.localStorage.getItem(VISTA_CLIENTES_KEY) === "grid" ? "grid" : "tabla";
  } catch {
    return "tabla";
  }
}

export function guardarVistaClientes(vista: VistaClientes): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VISTA_CLIENTES_KEY, vista);
  } catch {
    /* noop */
  }
}
