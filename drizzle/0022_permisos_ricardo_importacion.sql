-- Permisos de superadministrador para Ricardo Montenegro.
--
-- Ricardo ya existe en la base de datos con el usuario «ricardomontenegro».
-- Se le asigna el rol SUPERADMIN (mismo conjunto de permisos y acceso a todos
-- los módulos). No se crea ni se duplica la cuenta, ni se tocan credenciales
-- o datos personales.
--
-- La importación de Excel queda restringida a SUPERADMIN (Ricardo incluido)
-- en `requireImportAccess`; el agente local conserva su propia clave.

UPDATE "users"
SET "role" = 'SUPERADMIN',
    "updated_at" = now()
WHERE "id" = '5741cd9a-1112-4edd-bdc0-9c1fa7c8e4ae'
  AND "username" = 'ricardomontenegro';
