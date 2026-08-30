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

// ---------------------------------------------------------------- E2: ventas

export interface Partner {
  id: number;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  email: string | null;
  activo: boolean;
  ordenes?: number;
}

export interface VarianteBuscada {
  id: number;
  sku: string;
  nombre: string;
  productId: number;
  producto: string;
  uom: string;
  activo: boolean;
  stockActual: number;
  precio: number;
}

export interface VentaLinea {
  id: number;
  variantId: number;
  sku: string;
  nombre: string;
  producto: string;
  uom: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  qtyDelivered: number;
  estadoEntrega: "pendiente" | "parcial" | "entregado";
}

export interface ResumenItem {
  variantId: number;
  sku: string;
  nombre: string;
  producto: string;
  cantidad: number;
  tipo?: "fabricacion" | "ensamble";
}

export interface ResumenNeteo {
  fabricar: ResumenItem[];
  comprar: ResumenItem[];
}

export interface Venta {
  id: number;
  numero: string;
  fecha: string;
  fechaEntregaDeseada: string | null;
  estado: "abierta" | "despachada" | "cancelada";
  origen: "interno" | "web";
  confirmadaAt: string | null;
  notas: string | null;
  partnerId: number | null;
  partner: (Pick<Partner, "id" | "nombre" | "telefono" | "direccion" | "email">) | null;
  resumen: ResumenNeteo | null;
  lines: VentaLinea[];
  ordenesFabricacion: OrdenFabricacion[];
}

export interface OrdenFabricacion {
  id: number;
  numero: string;
  sku: string;
  nombre: string;
  producto: string;
  cantidad: number;
  uom?: string;
  tipo: "fabricacion" | "ensamble";
  estado: "borrador" | "confirmada" | "en_progreso" | "hecha" | "cancelada";
  fecha?: string;
  notas?: string | null;
  generatedFrom?: string | null;
  componenteVariantes?: number;
  lines: {
    id: number;
    variantId: number;
    sku: string;
    nombre: string;
    producto: string;
    uom: string;
    cantidadRequerida: number;
    cantidadReservada: number;
  }[];
}

export interface FaltanteCompra {
  variantId: number;
  sku: string;
  nombre: string;
  producto: string;
  cantidad: number;
  pedidos: string[];
}