import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
  const state = await sql`select
    (select count(*)::int from lots) as lots,
    (select count(*)::int from lots where origin='OPENING') as opening_lots,
    (select coalesce(sum(quantity_available),0) from lots where status='ACTIVE') as lot_total,
    (select coalesce(sum(quantity),0) from inventory) as inventory_total,
    (select count(*)::int from v_inventory_reconciliation where difference <> 0) as reconciliation_mismatches`;
  const products = await sql`select code,name,presentation,stock_unit,unit_kind,net_weight_grams,net_volume_ml,weight_is_estimate,tracks_expiration from products order by code limit 5`;
  const lots = await sql`select code,product_code,warehouse_code,quantity_available,stock_unit,available_weight_kg,available_volume_l,expiration_date,days_to_expire from v_lot_stock order by product_code limit 5`;
  console.log(JSON.stringify({state, products, lots}, null, 2));
} finally { await sql.end({timeout:2}); }
