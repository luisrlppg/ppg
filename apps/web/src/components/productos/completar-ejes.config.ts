export interface DerivacionRule {
  from: string;
  to: string;
  map: Record<string, string>;
}

/** Reglas para derivar un eje a partir de otro (por nombre de producto). */
export const DERIVACIONES: Record<string, DerivacionRule[]> = {
  Vastago: [
    {
      from: "Punta",
      to: "Agujero de Vastago",
      map: {
        Delineador: "Delineador",
        Nylon: "Cepillo Nylon",
        Gloss: "Lip Gloss",
        "Silicon chico": "Cepillo Silicon chico",
        "Silicon grande": "Cepillo Silicon grande",
      },
    },
  ],
};

/** Valores por defecto por producto y atributo. */
export const DEFAULTS: Record<string, Record<string, string>> = {
  Mango: { Ceja: "Gruesa", "Tipo de Mango": "Normal", "Agujero de Mango": "Normal" },
  Pincel: { Ceja: "Gruesa", "Tipo de Mango": "Normal", "Color de Cerda de Pincel": "Negro" },
};

export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
