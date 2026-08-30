export interface Categoria {
  id: number;
  nombre: string;
  productos: number;
}

export interface Packaging {
  id: number;
  nombre: string;
  activo: boolean;
}

export interface AtributoValor {
  id: number;
  valor: string;
  attributeId?: number;
}

export interface Atributo {
  id: number;
  nombre: string;
  valores: AtributoValor[];
}

export interface ProductoLite {
  id: number;
  nombre: string;
  skuBase: string;
  uom: string;
  basePrice: number;
  hasVariants: boolean;
  activo: boolean;
  categoria: string | null;
  variantes: number;
  stockTotal: number;
}

export interface Variante {
  id: number;
  nombre: string;
  sku: string;
  price: number | null;
  stockMin: number;
  stockMax: number;
  longLead: boolean;
  published: boolean;
  activo: boolean;
  stockActual: number;
  uom?: string;
  valoracion: { attributeId: number; attribute: string; valueId: number; valor: string }[];
}

export interface GridCombo {
  valueIds: number[];
  valoracion: string[];
  varianteId: number | null;
  nombre: string;
  sku: string;
}

export interface Grid {
  ejes: { attributeId: number; nombre: string; valores: { id: number; valor: string }[]; sortOrder: number }[];
  combinaciones: GridCombo[];
}

export interface ProductoDetalle {
  id: number;
  nombre: string;
  skuBase: string;
  uom: string;
  basePrice: number;
  categoryId: number | null;
  hasVariants: boolean;
  activo: boolean;
  category: { id: number; nombre: string } | null;
  variantes: (Variante & { porUbicacion?: unknown })[];
  componentes: { componentId: number; nombre: string; cantidad: number; tipo: string }[];
}

export interface Ubicacion {
  id: number;
  nombre: string;
  tipo: "almacen" | "temporal";
}

export interface Existencia {
  variantId: number;
  sku: string;
  nombre: string;
  productoId: number;
  producto: string;
  uom: string;
  stockActual: number;
  stockMin: number;
  stockMax: number;
  longLead: boolean;
  publicado: boolean;
  estado: "normal" | "bajo" | "critico";
  porUbicacion: Record<number, { location: string; qty: number }>;
}

export interface StockBajo {
  variantId: number;
  sku: string;
  nombre: string;
  producto: string;
  uom: string;
  stockMin: number;
  stockMax: number;
  stockActual: number;
  longLead: boolean;
  deficit: number;
}

export interface Movimiento {
  id: number;
  qty: number;
  motivo: string;
  ref: string | null;
  createdAt: string;
  variant?: { sku: string; nombre: string };
  location?: { nombre: string };
}

export interface EventoNotificacion {
  id: number;
  type: string;
  channels: string[];
  subject: string;
  ok: boolean;
  createdAt: string;
}