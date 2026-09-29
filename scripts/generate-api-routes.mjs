/**
 * Script para generar las API routes restantes usando el cliente de Supabase
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const API_DIR = join(process.cwd(), "src", "app", "api");

// Configuración de las API routes a generar
const routes = [
  {
    path: "productos/[id]",
    table: "products",
    name: "producto",
    fields: ["code", "name", "description", "presentation", "weight", "unit", "category_id", "status", "min_stock"],
  },
  {
    path: "bodegas/[id]",
    table: "warehouses",
    name: "bodega",
    fields: ["code", "name", "description", "type", "status", "observations"],
  },
  {
    path: "usuarios/[id]",
    table: "users",
    name: "usuario",
    fields: ["username", "email", "first_name", "last_name", "role", "status"],
  },
  {
    path: "categorias",
    table: "categories",
    name: "categoría",
    fields: ["name", "description"],
  },
  {
    path: "inventario",
    table: "inventory",
    name: "inventario",
    fields: ["product_id", "warehouse_id", "quantity"],
  },
  {
    path: "entradas",
    table: "entries",
    name: "entrada",
    fields: ["format", "number", "date", "nit", "origin", "document", "status", "user_id", "notes"],
  },
  {
    path: "pedidos",
    table: "orders",
    name: "pedido",
    fields: ["number", "date", "nit", "destination", "status", "user_id", "notes"],
  },
  {
    path: "facturas",
    table: "invoices",
    name: "factura",
    fields: ["format", "number", "order_id", "date", "status", "user_id"],
  },
  {
    path: "recibos",
    table: "receipts",
    name: "recibo",
    fields: ["format", "number", "invoice_id", "date", "status", "user_id"],
  },
  {
    path: "despachos",
    table: "dispatches",
    name: "despacho",
    fields: ["number", "receipt_id", "date", "status", "user_id", "notes"],
  },
  {
    path: "auditoria",
    table: "audits",
    name: "auditoría",
    fields: ["date", "warehouse_id", "responsible", "status", "user_id", "notes"],
  },
  {
    path: "dashboard",
    table: null,
    name: "dashboard",
    fields: [],
  },
  {
    path: "reportes",
    table: null,
    name: "reportes",
    fields: [],
  },
];

function generateIdRoute(route) {
  const { table, name, fields } = route;
  
  return `import { NextResponse } from "next/server";
import { supabase } from "@/lib/db/supabase-client";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { data, error } = await supabase
      .from("${table}")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "${name} no encontrado" } },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { success: false, error: { code: "DB_ERROR", message: "Error de base de datos" } },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error obteniendo ${name}:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error interno" } },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { data, error } = await supabase
      .from("${table}")
      .update(body)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: "DB_ERROR", message: "Error actualizando ${name}" } },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error actualizando ${name}:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error interno" } },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { error } = await supabase
      .from("${table}")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: "DB_ERROR", message: "Error eliminando ${name}" } },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: "${name} eliminado correctamente" });
  } catch (error) {
    console.error("Error eliminando ${name}:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error interno" } },
      { status: 500 }
    );
  }
}
`;
}

function generateListRoute(route) {
  const { table, name, fields } = route;
  
  return `import { NextResponse } from "next/server";
import { supabase } from "@/lib/db/supabase-client";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("${table}")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: "DB_ERROR", message: "Error al obtener ${name}s" } },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error obteniendo ${name}s:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error interno" } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { data, error } = await supabase
      .from("${table}")
      .insert(body)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: "DB_ERROR", message: "Error creando ${name}" } },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("Error creando ${name}:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error interno" } },
      { status: 500 }
    );
  }
}
`;
}

function generateDashboardRoute() {
  return `import { NextResponse } from "next/server";
import { supabase } from "@/lib/db/supabase-client";

export async function GET() {
  try {
    const [users, products, warehouses, inventory, entries, orders] = await Promise.all([
      supabase.from("users").select("id", { count: "exact", head: true }),
      supabase.from("products").select("id", { count: "exact", head: true }),
      supabase.from("warehouses").select("id", { count: "exact", head: true }),
      supabase.from("inventory").select("id", { count: "exact", head: true }),
      supabase.from("entries").select("id", { count: "exact", head: true }),
      supabase.from("orders").select("id", { count: "exact", head: true }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        users: users.count || 0,
        products: products.count || 0,
        warehouses: warehouses.count || 0,
        inventory: inventory.count || 0,
        entries: entries.count || 0,
        orders: orders.count || 0,
      },
    });
  } catch (error) {
    console.error("Error obteniendo dashboard:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error interno" } },
      { status: 500 }
    );
  }
}
`;
}

function generateReportesRoute() {
  return `import { NextResponse } from "next/server";
import { supabase } from "@/lib/db/supabase-client";

export async function GET() {
  try {
    const [products, inventory, entries, orders] = await Promise.all([
      supabase.from("products").select("*").limit(100),
      supabase.from("inventory").select("*, products(name), warehouses(name)").limit(100),
      supabase.from("entries").select("*").limit(100),
      supabase.from("orders").select("*").limit(100),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        products: products.data || [],
        inventory: inventory.data || [],
        entries: entries.data || [],
        orders: orders.data || [],
      },
    });
  } catch (error) {
    console.error("Error obteniendo reportes:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Error interno" } },
      { status: 500 }
    );
  }
}
`;
}

// Generar las API routes
console.log("Generando API routes...\n");

for (const route of routes) {
  const routePath = join(API_DIR, route.path);
  mkdirSync(routePath, { recursive: true });

  if (route.path === "dashboard") {
    writeFileSync(join(routePath, "route.ts"), generateDashboardRoute());
    console.log(`✓ /api/${route.path}`);
  } else if (route.path === "reportes") {
    writeFileSync(join(routePath, "route.ts"), generateReportesRoute());
    console.log(`✓ /api/${route.path}`);
  } else if (route.path.endsWith("[id]")) {
    writeFileSync(join(routePath, "route.ts"), generateIdRoute(route));
    console.log(`✓ /api/${route.path}`);
  } else {
    writeFileSync(join(routePath, "route.ts"), generateListRoute(route));
    console.log(`✓ /api/${route.path}`);
  }
}

console.log("\n✓ API routes generadas exitosamente");
