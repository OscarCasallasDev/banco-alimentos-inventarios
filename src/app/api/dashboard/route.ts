import { NextResponse } from "next/server";
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
