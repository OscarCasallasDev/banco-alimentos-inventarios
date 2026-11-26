-- El rol Almacenista puede registrar la recepción en despacho.
-- Se agrega únicamente `salidas.receive`; no se otorgan permisos adicionales.
UPDATE "roles"
SET "permissions" = array_append("permissions", 'salidas.receive')
WHERE "name" = 'ALMACENISTA'
  AND NOT ('salidas.receive' = ANY("permissions"));
