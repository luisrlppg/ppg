import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function env(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

async function main() {
  // --- Roles y usuarios (E0) ---
  const ROLES = ["admin", "supervisor", "operador"] as const;
  for (const name of ROLES) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  const adminUsername = env("ADMIN_USERNAME", "admin");
  const adminPassword = env("ADMIN_PASSWORD", "admin123");
  const adminNombre = env("ADMIN_NOMBRE", "Administrador");

  await prisma.user.upsert({
    where: { username: adminUsername },
    update: {},
    create: {
      username: adminUsername,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      nombre: adminNombre,
      role: { connect: { name: "admin" } },
    },
  });

  const users = [
    { username: "super", password: "super123", nombre: "Supervisora de Inventario", role: "supervisor" },
    { username: "juan", password: "op123", nombre: "Juan", role: "operador" },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: {},
      create: {
        username: u.username,
        passwordHash: await bcrypt.hash(u.password, 10),
        nombre: u.nombre,
        role: { connect: { name: u.role } },
      },
    });
  }

  // --- Ubicaciones (E1) ---
  const ubicaciones = [
    { nombre: "Almacén principal", tipo: "almacen" as const },
    { nombre: "Recibo de Producción", tipo: "temporal" as const },
    { nombre: "Compartimento 1", tipo: "almacen" as const },
    { nombre: "Compartimento 2", tipo: "almacen" as const },
    { nombre: "Compartimento 3", tipo: "almacen" as const },
  ];
  for (const u of ubicaciones) {
    await prisma.location.upsert({
      where: { nombre: u.nombre },
      update: {},
      create: u,
    });
  }

  // --- Categorías y empaques de arranque (E1) ---
  const categorias = ["Cepillos", "Vástagos", "Taparroscas", "Pinceles", "Cerda", "Empaques"];
  for (const nombre of categorias) {
    await prisma.category.upsert({ where: { nombre }, update: {}, create: { nombre } });
  }

  const empaques = ["Caja de almacén", "Bolsa individual"];
  for (const nombre of empaques) {
    await prisma.packaging.upsert({ where: { nombre }, update: {}, create: { nombre } });
  }

  // --- Atributos y valores de arranque (E1) ---
  const atributos: Record<string, string[]> = {
    "Tipo de cepillo": ["Recto", "Espiral", "Bala", "Balita", "Pino", "Cacahuate", "Globo"],
    "Color de cerda": ["Negro", "Blanco", "Rojo", "Azul", "Verde", "Amarillo", "Transparente"],
    "Tamaño de vástago": ["3mm", "4.5mm", "6mm", "7mm", "8mm"],
  };
  for (const [nombre, valores] of Object.entries(atributos)) {
    const attribute = await prisma.attribute.upsert({
      where: { nombre },
      update: {},
      create: { nombre },
    });
    for (const valor of valores) {
      await prisma.attributeValue.upsert({
        where: { attributeId_valor: { attributeId: attribute.id, valor } },
        update: {},
        create: { attributeId: attribute.id, valor },
      });
    }
  }

  // --- Estado del monitor (E1): fila singleton ---
  await prisma.monitorState.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, state: { lastLowStockIds: [], lastCheck: null } },
  });

  // --- Clientes (E2) ---
  const partners = [
    { nombre: "Juguería El Tesoro", telefono: "55 1234 5678", direccion: "Av. Hidalgo 12, Cd. de México", email: "compras@eltesoro.mx" },
    { nombre: "Dulcería La Michoacana", telefono: "55 8765 4321", direccion: "Calle Allende 34, Morelia", email: "pedidos@lamichoacana.mx" },
  ];
  for (const p of partners) {
    const exists = await prisma.partner.findFirst({ where: { nombre: p.nombre } });
    if (!exists) await prisma.partner.create({ data: p });
  }

  console.log("Seed listo: auth + catálogos + ubicaciones + clientes.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());