/**
 * Transformación de las páginas que usan el patrón
 * `useState + useEffect + fetch` hacia `useApiQuery` (React Query).
 *
 * En vez de borrarlas, las funciones `fetchX()` se convierten en llamadas al
 * `refetch` de la query: así el código de recarga sigue siendo válido y
 * además se beneficia de la caché del navegador.
 */

import fs from "node:fs";
import path from "node:path";

const BASE = "src/app/(protected)";

const pages = [
  {
    file: "pedidos/page.tsx",
    data: [
      { name: "orders", type: "Order[]", endpoint: "/api/pedidos" },
      { name: "products", type: "Product[]", endpoint: "/api/productos" },
      { name: "warehouses", type: "WarehouseItem[]", endpoint: "/api/bodegas" },
    ],
    fetches: { fetchOrders: "orders", fetchProducts: "products", fetchWarehouses: "warehouses" },
  },
  {
    file: "facturas/page.tsx",
    data: [
      { name: "invoices", type: "Invoice[]", endpoint: "/api/facturas" },
      { name: "orders", type: "Order[]", endpoint: "/api/pedidos" },
    ],
    fetches: { fetchInvoices: "invoices", fetchOrders: "orders" },
  },
  {
    file: "recibos/page.tsx",
    data: [
      { name: "receipts", type: "Receipt[]", endpoint: "/api/recibos" },
      { name: "invoices", type: "Invoice[]", endpoint: "/api/facturas" },
    ],
    fetches: { fetchReceipts: "receipts", fetchInvoices: "invoices" },
  },
  {
    file: "salidas/page.tsx",
    data: [
      { name: "dispatches", type: "Dispatch[]", endpoint: "/api/despachos" },
      { name: "receipts", type: "Receipt[]", endpoint: "/api/recibos" },
    ],
    fetches: { fetchDispatches: "dispatches", fetchReceipts: "receipts" },
  },
  {
    file: "auditoria/page.tsx",
    data: [
      { name: "audits", type: "Audit[]", endpoint: "/api/auditoria" },
      { name: "products", type: "Product[]", endpoint: "/api/productos" },
      { name: "warehouses", type: "WarehouseItem[]", endpoint: "/api/bodegas" },
    ],
    fetches: { fetchAudits: "audits", fetchProducts: "products", fetchWarehouses: "warehouses" },
  },
  {
    file: "usuarios/page.tsx",
    data: [{ name: "users", type: "User[]", endpoint: "/api/usuarios" }],
    fetches: { fetchUsers: "users" },
  },
];

const capitalize = (value) => value[0].toUpperCase() + value.slice(1);
const refetchName = (name) => `refetch${capitalize(name)}`;

let problems = 0;

/**
 * Encuentra el cuerpo de una función por conteo de llaves y lo reemplaza.
 */
function replaceFunctionBody(content, functionName, newBody) {
  const startMarker = `async function ${functionName}()`;
  const start = content.indexOf(startMarker);

  if (start === -1) return { content, found: false };

  const openBrace = content.indexOf("{", start);
  let depth = 0;
  let end = -1;

  for (let i = openBrace; i < content.length; i += 1) {
    if (content[i] === "{") depth += 1;
    if (content[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end === -1) return { content, found: false };

  const indent = "  ";
  const replacement = `${indent}async function ${functionName}() {\n${newBody}\n${indent}}`;

  return {
    content: content.slice(0, start) + replacement + content.slice(end + 1),
    found: true,
  };
}

for (const page of pages) {
  const file = path.join(BASE, page.file);
  let content = fs.readFileSync(file, "utf8");

  // 1. Import
  if (!content.includes('from "@/hooks/useApiQuery"')) {
    const importPattern = /import \{[^}]*\} from "@\/lib\/utils";/;
    if (!importPattern.test(content)) {
      console.log(`  ! ${page.file}: sin import de @/lib/utils`);
      problems += 1;
    }
    content = content.replace(
      importPattern,
      (match) => `${match}\nimport { useApiQuery } from "@/hooks/useApiQuery";`
    );
  }

  // 2. Eliminar el useEffect de carga inicial (la query carga sola)
  content = content.replace(
    /\n  useEffect\(\(\) => \{\n(?:[^\n]*\n)*?  \}, \[\]\);\n/,
    "\n"
  );

  // 3. Convertir las funciones fetch en llamadas al refetch de la query
  for (const [fetchName, dataName] of Object.entries(page.fetches)) {
    const result = replaceFunctionBody(
      content,
      fetchName,
      `    ${refetchName(dataName)}();`
    );
    if (!result.found) {
      console.log(`  ! ${page.file}: no se encontró ${fetchName}()`);
      problems += 1;
    }
    content = result.content;
  }

  // 4. Eliminar los estados de datos (los aporta la query)
  for (const { name } of page.data) {
    const statePattern = new RegExp(
      `\\n\\s*const \\[${name}, set${capitalize(name)}\\] = useState<[^>]*>\\(\\[\\]\\);`
    );
    if (!statePattern.test(content)) {
      console.log(`  ! ${page.file}: no se encontró el estado de ${name}`);
      problems += 1;
    }
    content = content.replace(statePattern, "");
  }

  // 5. Eliminar el estado de carga (lo aporta isLoading)
  content = content.replace(
    /\n\s*const \[loading, setLoading\] = useState\(true\);/,
    ""
  );

  // 6. Insertar las queries
  const queryLines = page.data
    .map(({ name, type, endpoint }, index) => {
      const loadingPart = index === 0 ? "    isLoading: loading,\n" : "";
      return `  const {\n    data: ${name} = [],\n${loadingPart}    refetch: ${refetchName(name)},\n  } = useApiQuery<${type}>("${endpoint}");`;
    })
    .join("\n\n");

  const anchor = /  const \[search, setSearch\] = useState\(""\);/;
  if (!anchor.test(content)) {
    console.log(`  ! ${page.file}: sin ancla para insertar las queries`);
    problems += 1;
  }
  content = content.replace(anchor, `${queryLines}\n\n$&`);

  // 7. Limpiar el import de useEffect si ya no se usa
  if (!content.includes("useEffect(")) {
    content = content.replace(
      'import { useEffect, useState } from "react";',
      'import { useState } from "react";'
    );
  }

  fs.writeFileSync(file, content, "utf8");
  console.log(`  ✓ ${page.file}`);
}

console.log(
  problems > 0
    ? `\n  ${problems} aviso(s) — revisa las páginas.`
    : "\n  Todas las páginas transformadas."
);
