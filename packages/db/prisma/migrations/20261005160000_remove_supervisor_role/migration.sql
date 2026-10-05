-- Retira el rol "supervisor": los usuarios pasan a "admin" y se elimina el rol.
-- Prisma no genera esta migración porque los roles son datos, no esquema.

-- Reasigna los usuarios con rol supervisor al rol admin.
UPDATE "User"
SET "roleId" = (SELECT id FROM "Role" WHERE name = 'admin')
WHERE "roleId" = (SELECT id FROM "Role" WHERE name = 'supervisor');

-- Elimina el rol supervisor (ya sin usuarios).
DELETE FROM "Role" WHERE name = 'supervisor';
