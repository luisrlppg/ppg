const PALETA = ["#2563eb", "#0d9488", "#d97706", "#7c3aed", "#db2777", "#059669", "#dc2626", "#4f46e5"];

export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primera = partes[0][0] ?? "";
  const segunda = partes.length > 1 ? partes[1][0] ?? "" : "";
  return (primera + segunda).toUpperCase();
}

export function colorAvatar(id: number): string {
  return PALETA[Math.abs(id) % PALETA.length];
}
