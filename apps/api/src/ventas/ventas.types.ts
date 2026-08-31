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

export interface ConfiguracionLinea {
  pasos?: { pregunta: string; opciones: string[]; seleccion: string }[];
  resultado?: Record<string, { variantId: number; sku: string; nombre: string }>;
}
