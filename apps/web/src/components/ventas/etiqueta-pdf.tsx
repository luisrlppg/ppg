"use client";

import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { EtiquetaEmbarque } from "@/lib/types";

const MM = 2.8346456693;
const ANCHO_PT = 200 * MM;
const ALTO_PT = 102.1 * MM;
const LINE_Y = 0.18 * ALTO_PT;
const PAD = 8;
const INK = "#1a1a1a";

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 8, color: INK },

  header: { position: "absolute", top: 13, left: PAD, right: PAD },
  headerTitulo: { fontFamily: "Helvetica-Bold", fontSize: 16, textAlign: "center" },
  headerLinea: { fontSize: 8, textAlign: "center", marginTop: 2 },

  divider: {
    position: "absolute",
    top: LINE_Y,
    left: PAD / 2,
    right: PAD / 2,
    borderTopWidth: 0.5,
    borderTopColor: INK,
  },

  columnas: {
    position: "absolute",
    top: LINE_Y + PAD,
    bottom: PAD,
    left: 0,
    right: 0,
    flexDirection: "row",
    paddingTop: 20,
  },
  col: { paddingHorizontal: PAD },
  colIzq: { width: "30%", alignItems: "center" },
  colCentro: { width: "30%" },
  colDer: { width: "40%" },

  fragilTitulo: { fontFamily: "Helvetica-Bold", fontSize: 18, textAlign: "center" },
  fragilSub: { fontSize: 12, textAlign: "center", marginTop: 2 },
  fragilImg: { width: 75, height: 120, objectFit: "contain", marginTop: 8 },
  fragilEstiba: { fontSize: 12, textAlign: "center", marginTop: 2 },

  seccionTitulo: { fontFamily: "Helvetica-Bold", fontSize: 9 },
  clienteNombre: { fontFamily: "Helvetica-Bold", fontSize: 12, marginTop: 10 },
  dato: { fontSize: 8, marginTop: 3, lineHeight: 1.2 },
  bloqueDetalles: { marginTop: 14 },
  filaDetalle: { fontSize: 8, marginTop: 3 },

  productoNombre: { fontFamily: "Helvetica-Bold", fontSize: 12 },
  productoAtributo: { fontSize: 7.5, marginTop: 2 },
  productoSku: { fontSize: 7.5, color: "#777777", marginTop: 2 },
  productoImg: { width: "90%", height: 140, objectFit: "contain", marginTop: 8, alignSelf: "center" },

  footer: {
    position: "absolute",
    bottom: 4,
    left: 0,
    right: 0,
    fontFamily: "Helvetica-Oblique",
    fontSize: 6,
    textAlign: "center",
  },
});

function fechaHoy(): { fecha: string; lote: string } {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const yy = String(yyyy).slice(-2);
  return { fecha: `${dd}/${mm}/${yyyy}`, lote: `${yy}${mm}${dd}` };
}

export interface EtiquetaPDFProps {
  etiqueta: EtiquetaEmbarque;
  imagenProducto?: string | null;
  imagenFragil?: string | null;
  avatarProducto?: { color: string; iniciales: string } | null;
}

export function EtiquetaPDF({ etiqueta, imagenProducto, imagenFragil, avatarProducto }: EtiquetaPDFProps) {
  const { cliente, producto, header, footer } = etiqueta;
  const { fecha, lote } = fechaHoy();

  const detalles: [string, string][] = [
    ["Lote", lote],
    ["Cantidad", etiqueta.cantidad],
    ["Peso bruto", etiqueta.pesoBruto],
    ["Peso neto", etiqueta.pesoNeto],
    ["Peso unitario", etiqueta.pesoUnitario],
  ];

  return (
    <Document
      title="Etiqueta de embarque"
      author="Plásticos Plasa"
      subject="Etiqueta de embarque"
      creator="PLASA ERP"
      producer="PLASA ERP"
    >
      <Page size={[ANCHO_PT, ALTO_PT]} style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerTitulo}>{header.titulo}</Text>
          <Text style={styles.headerLinea}>{header.direccion}</Text>
          <Text style={styles.headerLinea}>{header.ciudad}</Text>
          <Text style={styles.headerLinea}>{header.contacto}</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.columnas}>
          <View style={[styles.col, styles.colIzq]}>
            <Text style={styles.fragilTitulo}>FRÁGIL</Text>
            <Text style={styles.fragilSub}>Manejese con Cuidado</Text>
            {imagenFragil ? <Image style={styles.fragilImg} src={imagenFragil} /> : null}
            <Text style={styles.fragilEstiba}>ESTIBA MÁXIMA 3 CAJAS</Text>
          </View>

          <View style={[styles.col, styles.colCentro]}>
            <Text style={styles.seccionTitulo}>Información del cliente:</Text>
            <Text style={styles.clienteNombre}>{cliente.nombre}</Text>
            {cliente.telefono ? <Text style={styles.dato}>Tel: {cliente.telefono}</Text> : null}
            {cliente.direccion ? <Text style={styles.dato}>Dirección: {cliente.direccion}</Text> : null}
            {cliente.email ? <Text style={styles.dato}>Email: {cliente.email}</Text> : null}

            <View style={styles.bloqueDetalles}>
              <Text style={styles.seccionTitulo}>Detalles del Embarque:</Text>
              <Text style={styles.filaDetalle}>Fecha: {fecha}</Text>
              {detalles.map(([label, val]) => (
                <Text key={label} style={styles.filaDetalle}>
                  {label}: {val}
                </Text>
              ))}
            </View>
          </View>

          <View style={[styles.col, styles.colDer]}>
            <Text style={styles.productoNombre}>{producto.nombre}</Text>
            {producto.valoracion.length > 0
              ? producto.valoracion.map((a) => (
                  <Text key={a.attribute} style={styles.productoAtributo}>
                    {a.attribute}: {a.valor}
                  </Text>
                ))
              : null}
            <Text style={styles.productoSku}>{producto.sku}</Text>
            {imagenProducto ? (
              <Image style={styles.productoImg} src={imagenProducto} />
            ) : avatarProducto ? (
              <View
                style={[
                  styles.productoImg,
                  { backgroundColor: avatarProducto.color, alignItems: "center", justifyContent: "center" },
                ]}
              >
                <Text style={{ color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 28 }}>
                  {avatarProducto.iniciales}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <Text style={styles.footer} fixed>
          {footer}
        </Text>
      </Page>
    </Document>
  );
}
