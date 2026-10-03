/** Descarga en el navegador un CSV con BOM (para Excel) a partir de filas. */
export function descargarCSV(nombre: string, filas: (string | number)[][]): void {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const texto = "\uFEFF" + filas.map((f) => f.map(esc).join(",")).join("\r\n");
  const blob = new Blob([texto], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
