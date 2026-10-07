import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function env(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

/**
 * Bootstrap de autenticación y estado de la app.
 *
 * El CATÁLOGO (categorías, ubicaciones, productos, atributos, variantes, BOM,
 * pasos, empaques y stock) NO vive aquí: se define en el seed declarativo
 * (`scripts/catalog/seed/catalog.yaml` + `stock.yaml`, vía `pnpm cat:seed` /
 * `pnpm cat:stock`) o se carga con un respaldo completo. Así una sola fuente
 * de verdad evita el desalineamiento histórico entre `db:seed` y `cat:seed`.
 */
async function main() {
  // --- Roles y usuarios (E0) ---
  const ROLES = ["admin", "operador"] as const;
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

  // --- Estado del monitor (E1): fila singleton ---
  await prisma.monitorState.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, state: { lastLowStockIds: [], lastCheck: null } },
  });

  console.log("Seed listo: roles + usuarios + estado del monitor (catálogo aparte: pnpm cat:seed).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
