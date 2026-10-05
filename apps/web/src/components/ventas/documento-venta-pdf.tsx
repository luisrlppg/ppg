"use client";

import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { colorAvatar, iniciales } from "@/lib/avatar";
import type { Venta, VentaLinea } from "@/lib/types";

export interface DocumentoPDFProps {
  venta: Venta;
  cobrarIva: boolean;
  imagenes: Record<number, string>;
  formatCantidad: (valor: number | string | null | undefined) => string;
}

const IVA = 0.16;
const BRAND = "#b30f2e";
const INK = "#1a1a1a";
const MUTED = "#777777";
const LINE = "#d6d6d6";
const LINE_SOFT = "#ececec";
const ZEBRA = "#fafafa";

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingHorizontal: 40,
    paddingBottom: 64,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: INK,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    borderBottomColor: BRAND,
    paddingBottom: 12,
    marginBottom: 16,
  },
  empresa: { fontSize: 18, fontFamily: "Helvetica-Bold", color: BRAND },
  tagline: { fontSize: 8, color: MUTED, marginTop: 3 },
  titulo: { fontSize: 13, fontFamily: "Helvetica-Bold", textAlign: "right", textTransform: "uppercase", letterSpacing: 0.5 },
  headerMeta: { fontSize: 8.5, color: MUTED, textAlign: "right", marginTop: 4 },
  headerMetaStrong: { color: INK, fontFamily: "Helvetica-Bold" },

  cliente: { borderWidth: 1, borderColor: LINE, borderRadius: 6, padding: 10, marginBottom: 16 },
  clienteTitulo: { fontSize: 8, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5, color: BRAND, marginBottom: 6 },
  clienteGrid: { flexDirection: "row", flexWrap: "wrap" },
  clienteItem: { width: "50%", marginBottom: 6, paddingRight: 8 },
  clienteFull: { width: "100%", paddingRight: 0 },
  label: { fontSize: 7, color: MUTED, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 1 },
  valor: { fontSize: 9 },

  table: { borderWidth: 1, borderColor: LINE, borderRadius: 6, overflow: "hidden" },
  thead: { flexDirection: "row", backgroundColor: "#f2f2f2", borderBottomWidth: 1, borderBottomColor: LINE },
  trow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: LINE_SOFT, alignItems: "center", minHeight: 38 },
  trowZebra: { backgroundColor: ZEBRA },
  th: { fontFamily: "Helvetica-Bold", fontSize: 7.5, textTransform: "uppercase", letterSpacing: 0.4, paddingVertical: 7, paddingHorizontal: 7 },
  td: { paddingVertical: 6, paddingHorizontal: 7, fontSize: 9 },
  num: { textAlign: "right" },

  colThumb: { width: 46 },
  colProducto: { flexGrow: 1, flexShrink: 1 },
  colCant: { width: 62 },
  colPrecio: { width: 72 },
  colSubtotal: { width: 82 },
  productoNombre: { fontFamily: "Helvetica-Bold", fontSize: 9 },
  productoSub: { fontSize: 7.5, color: MUTED, marginTop: 1 },

  thumb: { width: 30, height: 30, borderRadius: 4, objectFit: "cover" },
  thumbPlaceholder: { width: 30, height: 30, borderRadius: 4, alignItems: "center", justifyContent: "center" },
  thumbIniciales: { color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 9 },

  totales: { marginTop: 14, alignSelf: "flex-end", width: 240 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalFinal: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1.5,
    borderTopColor: INK,
    marginTop: 4,
    paddingTop: 7,
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
  },

  notas: { marginTop: 18, paddingTop: 10, borderTopWidth: 1, borderTopColor: LINE_SOFT },
  notasTexto: { fontSize: 9, marginTop: 3 },

  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: LINE_SOFT,
    paddingTop: 6,
    fontSize: 7.5,
    color: MUTED,
  },
});

function LineaImagen({ linea, dataUrl }: { linea: VentaLinea; dataUrl?: string }) {
  if (dataUrl) {
    return <Image style={styles.thumb} src={dataUrl} />;
  }
  return (
    <View style={[styles.thumbPlaceholder, { backgroundColor: colorAvatar(linea.variantId) }]}>
      <Text style={styles.thumbIniciales}>{iniciales(linea.producto)}</Text>
    </View>
  );
}

export function DocumentoPDF({ venta, cobrarIva, imagenes, formatCantidad }: DocumentoPDFProps) {
  const subtotal = venta.lines.reduce((a, l) => a + l.subtotal, 0);
  const iva = cobrarIva ? subtotal * IVA : 0;
  const total = subtotal + iva;

  const cliente = venta.partner;
  const nombreCliente = cliente?.nombre ?? venta.nombreEnvio ?? "Público general";
  const telefono = cliente?.telefono ?? venta.telefonoEnvio ?? null;
  const email = cliente?.email ?? venta.emailEnvio ?? null;
  const numeroCliente = cliente ? String(cliente.id).padStart(4, "0") : "—";
  const fecha = new Date(venta.fecha).toLocaleDateString("es-MX");

  return (
    <Document
      title={`Venta ${venta.numero}`}
      author="Plásticos Plasa"
      subject="Documento de venta"
      creator="PPG ERP"
      producer="PPG ERP"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.empresa}>Plásticos Plasa</Text>
            <Text style={styles.tagline}>Documento de venta</Text>
          </View>
          <View>
            <Text style={styles.titulo}>Orden de compra</Text>
            <Text style={styles.headerMeta}>
              Nº <Text style={styles.headerMetaStrong}>{venta.numero}</Text>
            </Text>
            <Text style={styles.headerMeta}>Fecha: {fecha}</Text>
          </View>
        </View>

        <View style={styles.cliente}>
          <Text style={styles.clienteTitulo}>Cliente</Text>
          <View style={styles.clienteGrid}>
            <View style={styles.clienteItem}>
              <Text style={styles.label}>Nombre</Text>
              <Text style={styles.valor}>{nombreCliente}</Text>
            </View>
            <View style={styles.clienteItem}>
              <Text style={styles.label}>Nº de cliente</Text>
              <Text style={styles.valor}>{numeroCliente}</Text>
            </View>
            {cliente?.empresa ? (
              <View style={styles.clienteItem}>
                <Text style={styles.label}>Empresa</Text>
                <Text style={styles.valor}>{cliente.empresa}</Text>
              </View>
            ) : null}
            {telefono ? (
              <View style={styles.clienteItem}>
                <Text style={styles.label}>Teléfono</Text>
                <Text style={styles.valor}>{telefono}</Text>
              </View>
            ) : null}
            {email ? (
              <View style={styles.clienteItem}>
                <Text style={styles.label}>Email</Text>
                <Text style={styles.valor}>{email}</Text>
              </View>
            ) : null}
            {cliente?.direccion ? (
              <View style={[styles.clienteItem, styles.clienteFull]}>
                <Text style={styles.label}>Dirección</Text>
                <Text style={styles.valor}>{cliente.direccion}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.thead} fixed>
            <Text style={[styles.th, styles.colThumb]} />
            <Text style={[styles.th, styles.colProducto]}>Producto</Text>
            <Text style={[styles.th, styles.colCant, styles.num]}>Cant.</Text>
            <Text style={[styles.th, styles.colPrecio, styles.num]}>Precio</Text>
            <Text style={[styles.th, styles.colSubtotal, styles.num]}>Subtotal</Text>
          </View>

          {venta.lines.map((l, i) => (
            <View key={l.id} style={[styles.trow, i % 2 === 1 ? styles.trowZebra : {}]} wrap={false}>
              <View style={[styles.td, styles.colThumb]}>
                <LineaImagen linea={l} dataUrl={imagenes[l.id]} />
              </View>
              <View style={[styles.td, styles.colProducto]}>
                <Text style={styles.productoNombre}>{l.producto}</Text>
                <Text style={styles.productoSub}>
                  {l.nombre} · {l.sku}
                </Text>
              </View>
              <Text style={[styles.td, styles.colCant, styles.num]}>
                {formatCantidad(l.cantidad)} {l.uom}
              </Text>
              <Text style={[styles.td, styles.colPrecio, styles.num]}>${(l.precioUnitario ?? 0).toFixed(2)}</Text>
              <Text style={[styles.td, styles.colSubtotal, styles.num]}>${(l.subtotal ?? 0).toFixed(2)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totales}>
          <View style={styles.totalRow}>
            <Text>Subtotal</Text>
            <Text>${subtotal.toFixed(2)}</Text>
          </View>
          {cobrarIva ? (
            <View style={styles.totalRow}>
              <Text>IVA (16%)</Text>
              <Text>${iva.toFixed(2)}</Text>
            </View>
          ) : null}
          <View style={styles.totalFinal}>
            <Text>Total</Text>
            <Text>${total.toFixed(2)}</Text>
          </View>
        </View>

        {venta.notas ? (
          <View style={styles.notas}>
            <Text style={styles.label}>Notas</Text>
            <Text style={styles.notasTexto}>{venta.notas}</Text>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text>Plásticos Plasa · Documento de venta</Text>
          <Text
            render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
