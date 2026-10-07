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

export interface Usuario {
  id: number;
  username: string;
  nombre: string;
  active: boolean;
  separadorMiles: "espacio" | "coma";
  createdAt: string;
  role: "admin" | "operador";
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
  productIds?: number[];
  permitidos?: number[];
}

export interface AtributosProducto {
  propios: Atributo[];
  heredados: Atributo[];
}

export interface ProductoLite {
  id: number;
  nombre: string;
  skuBase: string;
  uom: string;
  basePrice: number;
  hasVariants: boolean;
  vendible: boolean;
  fabricable: boolean;
  comprable: boolean;
  activo: boolean;
  imagen: string | null;
  categoria: string | null;
  variantes: number;
  stockTotal: number;
}

export interface Variante {
  id: number;
  nombre: string;
  sku: string;
  price: number | null;
  costoCompra?: number | null;
  stockMin: number;
  stockMax: number;
  longLead: boolean;
  activo: boolean;
  stockActual: number;
  uom?: string;
  notas?: string | null;
  valoracion: { attributeId: number; attribute: string; valueId: number; valor: string }[];
  packagings?: { packagingId: number; nombre: string; cantidad: number }[];
}

export interface GridCombo {
  valueIds: number[];
  valoracion: string[];
  varianteId: number | null;
  nombre: string;
  sku: string;
}

export interface GridVarianteExistente {
  varianteId: number;
  valueIds: number[];
  nombre: string;
  sku: string;
}

export interface Grid {
  ejes: { attributeId: number; nombre: string; valores: { id: number; valor: string }[]; sortOrder: number }[];
  existentes: GridVarianteExistente[];
}

export interface CepillosNylonGrid extends Grid {
  productId: number;
  nombre: string;
}

export interface EnsartadoCombinacion {
  mangoVariantId: number;
  colorId: number;
  pincelVariantId: number;
  sku: string;
  nombre: string;
}

export interface EnsartadoData {
  productId: number;
  nombre: string;
  ejes: { attributeId: number; nombre: string; valores: { id: number; valor: string }[] }[];
  mangos: { variantId: number; sku: string; etiqueta: string; valueIds: number[] }[];
  colores: { id: number; valor: string }[];
  combinaciones: EnsartadoCombinacion[];
}

export interface ProductoDetalle {
  id: number;
  nombre: string;
  skuBase: string;
  uom: string;
  basePrice: number;
  categoryId: number | null;
  hasVariants: boolean;
  vendible: boolean;
  fabricable: boolean;
  comprable: boolean;
  activo: boolean;
  category: { id: number; nombre: string } | null;
  variantes: (Variante & { porUbicacion?: unknown })[];
  componentes: { componentId: number; nombre: string; cantidad: number; tipo: string }[];
  pasos?: PassoRow[];
}

export interface PassoRow {
  id: number;
  sortOrder: number;
  panel: number;
  pregunta: string;
  attributeId: number | null;
  variantProductId: number | null;
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
  estado: "normal" | "bajo" | "critico";
  porUbicacion: Record<number, { location: string; qty: number }>;
  valoracion: { attribute: string; valor: string }[];
}

export interface ExistenciaDe {
  variantId: number;
  sku: string;
  nombre: string;
  productoId: number;
  producto: string;
  uom: string;
  price: number | null;
  basePrice: number;
  stockMin: number;
  stockMax: number;
  longLead: boolean;
  activo: boolean;
  notas: string | null;
  stockActual: number;
  valoracion: { attribute: string; valor: string }[];
  packagings: { packagingId: number; nombre: string; cantidad: number }[];
  porUbicacion: { locationId: number; location: string; qty: number }[];
  movimientos: Movimiento[];
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
  objetivo: number;
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
  empresa: string | null;
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

export interface VariantePublica {
  id: number;
  nombre: string;
  sku: string;
  precio: number;
}

export interface ProductoPublico {
  productId: number;
  nombre: string;
  skuBase: string;
  uom: string;
  basePrice: number;
  hasVariants: boolean;
  tienePasos: boolean;
  variantes: VariantePublica[];
}

export interface VentaLinea {
  id: number;
  variantId: number;
  sku: string;
  nombre: string;
  producto: string;
  uom: string;
  imagen: string | null;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  qtyDelivered: number;
  estadoEntrega: "pendiente" | "parcial" | "entregado";
  valoracion?: { attribute: string; valor: string }[];
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

export interface DesgloseLinea {
  variantId: number;
  sku: string;
  nombre: string;
  producto: string;
  uom: string;
  requerido: number;
  stockActual: number;
  faltante: number;
  suficiente: boolean;
  fabricable: boolean;
  comprable: boolean;
  tipo?: "fabricacion" | "ensamble";
  raiz: boolean;
  salesOrderLineId: number | null;
}

export interface DesgloseNodo {
  variantId: number;
  sku: string;
  nombre: string;
  producto: string;
  uom: string;
  requerido: number;
  stockActual: number;
  faltante: number;
  suficiente: boolean;
  fabricable: boolean;
  comprable: boolean;
  tipo?: "fabricacion" | "ensamble";
  salesOrderLineId: number | null;
  componentes: DesgloseNodo[];
}

export interface Desglose {
  lineas: DesgloseLinea[];
  arbol: DesgloseNodo[];
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
  nombreEnvio?: string | null;
  telefonoEnvio?: string | null;
  emailEnvio?: string | null;
  paymentMethod?: string | null;
  partnerId: number | null;
  partner: (Pick<Partner, "id" | "nombre" | "empresa" | "telefono" | "direccion" | "email">) | null;
  resumen: ResumenNeteo | null;
  lines: VentaLinea[];
}

export interface EtiquetaEmbarque {
  cliente: {
    nombre: string;
    telefono: string;
    direccion: string;
    email: string;
  };
  producto: {
    nombre: string;
    sku: string;
    valoracion: { attribute: string; valor: string }[];
  };
  cantidad: string;
  pesoBruto: string;
  pesoNeto: string;
  pesoUnitario: string;
  header: {
    titulo: string;
    direccion: string;
    ciudad: string;
    contacto: string;
  };
  footer: string;
}

export interface FaltanteCompra {
  variantId: number;
  sku: string;
  nombre: string;
  producto: string;
  cantidad: number;
  pedidos: string[];
}

export type Prioridad = "alta" | "media" | "baja";

export interface NecesidadFabricacion {
  variantId: number;
  sku: string;
  nombre: string;
  productoId: number;
  producto: string;
  uom: string;
  valoracion: { attribute: string; valor: string }[];
  stockActual: number;
  stockMin: number;
  stockMax: number;
  objetivo: number;
  necesidad: number;
  tipo?: "fabricacion" | "ensamble";
  ensamble: boolean;
  prioridad: Prioridad;
  pedidos: string[];
}

export interface NecesidadesResp {
  porMinimo: NecesidadFabricacion[];
  porVentas: NecesidadFabricacion[];
  porComprar: NecesidadFabricacion[];
}

// ---------------------------------------------------------------- E3: reportes

export type Turno = "matutino" | "vespertino" | "nocturno";
export type SeccionReporte = "maquina1" | "maquina2" | "maquina3" | "ensamble" | "ensartado" | "pegado" | "perforado";
export type TipoLineaReporte = "final" | "consumo";

export interface ReporteLinea {
  id: number;
  variantId: number;
  sku: string;
  nombre: string;
  producto: string;
  uom: string;
  seccion: SeccionReporte;
  tipo: TipoLineaReporte;
  ok: number;
  qtyAplicada: number;
  qtyUbicada: number;
  pendienteUbicar: number;
}

export interface Reporte {
  id: number;
  numero: string;
  turno: Turno;
  fecha: string;
  personas: number;
  horasTrabajadas: number | null;
  notas: string | null;
  estado: "pendiente" | "aplicado" | "cancelado";
  aplicadoAt: string | null;
  lineas: number;
  secciones: string[];
  totalFinal: number;
  totalConsumo: number;
}

export interface ReporteDetalle {
  id: number;
  numero: string;
  turno: Turno;
  fecha: string;
  personas: number;
  horasTrabajadas: number | null;
  notas: string | null;
  estado: "pendiente" | "aplicado" | "cancelado";
  aplicadoAt: string | null;
  lines: ReporteLinea[];
}

export type OrigenLote = "reporte" | "fabricacion";

export interface LoteUbicar {
  lineaId: number;
  reporte: string;
  origen: OrigenLote;
  usuario: string | null;
  variantId: number;
  sku: string;
  nombre: string;
  productoId: number;
  producto: string;
  uom: string;
  valoracion: { attribute: string; valor: string }[];
  aplicado: number;
  ubicado: number;
  pendiente: number;
}

export interface PorUbicarCount {
  total: number;
  reporte: number;
  fabricacion: number;
}

export interface StatsSeccion {
  seccion: string;
  unidades: number;
  unidadesPorPersonaHora: number;
}

export interface StatsConsumo {
  variantId: number;
  nombre: string;
  producto: string;
  unidades: number;
}

export interface PassoOption {
  valueId: number;
  valor: string;
  enStock: boolean;
}

export interface Passo {
  sortOrder: number;
  panel: number;
  pregunta: string;
  attributeId: number;
  variantProductId: number;
  opciones: PassoOption[];
}

export interface SeleccionPaso {
  attributeId: number;
  valueId: number;
}

export interface ResolucionVariante {
  variantId: number | null;
  sku: string | null;
  nombre: string | null;
  existe: boolean;
  creada?: boolean;
}

export interface ConfiguracionLinea {
  pasos?: { pregunta: string; opciones: string[]; seleccion: string }[];
  resultado?: Record<string, { variantId: number; sku: string; nombre: string }>;
}

export interface BackupFile {
  nombre: string;
  bytes: number;
  modificado: string;
  formato: "custom" | "sql";
}

export interface HealthInfo {
  status: string;
  service: string;
  time: string;
  commit: string | null;
  buildTime: string | null;
  migracion: string | null;
}

export interface StatsReporte {
  desde: string;
  hasta: string;
  reportesAplicados: number;
  totalFinal: number;
  totalConsumo: number;
  porSeccion: StatsSeccion[];
  consumo: StatsConsumo[];
}

// ------------------------------------------------------------------ Costos
export interface CostoMaterial {
  nombre: string;
  cantidad: number;
  costoUnitario: number;
  orden?: number;
}

export interface CostoDesglose {
  costoCompra: number;
  materiales: number;
  manoObra: number;
  maquina: number;
  molde: number;
  ensamble: number;
  empaque: number;
  total: number;
}

export interface CostoMargen {
  precio: number;
  precioMin: number;
  precioMax: number;
  margen: number | null;
  margenPct: number | null;
}

export interface CostoFila extends CostoDesglose, CostoMargen {
  productId: number;
  nombre: string;
  skuBase: string;
  uom: string;
  fabricable: boolean;
  comprable: boolean;
  tieneReceta: boolean;
  notas: string | null;
  variantes: number;
}

export interface CostoReceta {
  costoCompra: number;
  horasManoObra: number;
  tarifaManoObra: number;
  horasMaquina: number;
  tarifaMaquina: number;
  costoMolde: number;
  piezasMolde: number;
  costoEnsamble: number;
  costoEmpaque: number;
  notas: string | null;
  materiales: CostoMaterial[];
}

export interface CostoVariante {
  variantId: number;
  sku: string;
  nombre: string;
  costoCompra: number | null;
}

export interface CostoDetalle extends CostoDesglose, CostoMargen {
  productId: number;
  nombre: string;
  skuBase: string;
  uom: string;
  fabricable: boolean;
  comprable: boolean;
  tieneReceta: boolean;
  receta: CostoReceta;
  variantes: CostoVariante[];
}

export interface InventarioHistoricoAtributo {
  nombre: string;
  valor: string;
}

export interface InventarioHistoricoItem {
  id: number;
  nombre: string;
  sku: string | null;
  tipo: string;
  cantidad: number;
  ubicacion: string;
  notas: string | null;
  familiaProductoId: number | null;
  familia: string | null;
  atributos: InventarioHistoricoAtributo[];
  createdAt: string;
  updatedAt: string;
}
