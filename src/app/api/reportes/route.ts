import { NextResponse } from "next/server";
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
