import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function env(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

async function main() {
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

  console.log("Seed listo: roles + usuarios iniciales.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());