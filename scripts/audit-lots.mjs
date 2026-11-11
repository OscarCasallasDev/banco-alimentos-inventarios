/**
 * Auditoría de trazabilidad por lotes — SOLO LECTURA
 * Sistema de Gestión, Trazabilidad y Conciliación de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Uso:  npm run db:auditar
 *
 * Revisa la coherencia entre el inventario agregado, los lotes, los
 * movimientos y los documentos. NO modifica ningún dato: es una
 * herramienta de diagnóstico para el Banco.
 */

import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: ".env.local" });

const url = process.env.DATABASE_URL;

if (!url) {
  console.error("DATABASE_URL no está definida en .env.local");
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 15 });

const checks = [
  {
    titulo: "Diferencia entre el inventario agregado y la suma de los lotes",
    consulta: `select count(*)::int as filas,
                      coalesce(sum(abs(difference)), 0) as diferencia_total
               from v_inventory_reconciliation
               where abs(difference) > 0.0005`,
    revisar: (r) =>
      r[0].filas === 0
        ? "OK: el agregado coincide con la suma de los lotes activos"
        : `REVISAR: ${r[0].filas} fila(s) con diferencia`,
  },
  {
    titulo: "Entradas confirmadas sin lotes (histórico anterior al modelo)",
    consulta: `select e.number, e.date::text, e.stock_applied_at is not null as aplicada
               from entries e
               where e.status = 'CONFIRMED'
                 and not exists (select 1 from lots l where l.entry_id = e.id)
               order by e.date`,
    revisar: (r) =>
      r.length === 0
        ? "OK: todas las entradas confirmadas tienen lotes"
        : `INFORMATIVO: ${r.length} entrada(s) sin lotes (tracabilidad parcial)`,
  },
  {
    titulo: "Despachos despachados sin stock aplicado",
    consulta: `select number, date::text, stock_applied_at
               from dispatches
               where status = 'DISPATCHED' and stock_applied_at is null
               order by date`,
    revisar: (r) =>
      r.length === 0
        ? "OK: todos los despachos despachados aplicaron stock"
        : `REVISAR: ${r.length} despacho(s) despachados sin descontar stock`,
  },
  {
    titulo: "Movimientos sin lote (no se les inventa una relación)",
    consulta: `select type, count(*)::int as n
               from inventory_movements
               where lot_id is null
               group by type order by type`,
    revisar: (r) =>
      r.length === 0
        ? "OK: todos los movimientos tienen lote"
        : `INFORMATIVO: ${r.reduce(
            (sum, row) => sum + row.n,
            0
          )} movimiento(s) histórico(s) sin lote`,
  },
  {
    titulo: "Lotes de productos que controlan vencimiento pero sin fecha",
    consulta: `select count(*)::int as n
               from lots l join products p on p.id = l.product_id
               where l.status = 'ACTIVE' and l.quantity_available > 0
                 and l.expiration_date is null and p.tracks_expiration`,
    revisar: (r) =>
      r[0].n === 0
        ? "OK: no hay lotes sin fecha en productos perecederos"
        : `PENDIENTE DEL BANCO: ${r[0].n} lote(s) necesitan fecha de vencimiento`,
  },
  {
    titulo: "Lotes vencidos que todavía conservan existencias",
    consulta: `select code, product_id, quantity_available, expiration_date::text
               from lots
               where status = 'ACTIVE' and quantity_available > 0
                 and expiration_date is not null
                 and expiration_date < (now() at time zone 'America/Bogota')::date`,
    revisar: (r) =>
      r.length === 0
        ? "OK: no hay lotes vencidos con existencias"
        : `REVISAR: ${r.length} lote(s) vencido(s) no despachable`,
  },
  {
    titulo: "Productos con lotes pero sin contenido neto informado",
    consulta: `select count(distinct l.product_id)::int as n
               from lots l
               where l.status = 'ACTIVE' and l.quantity_available > 0
                 and l.net_weight_grams is null and l.net_volume_ml is null`,
    revisar: (r) =>
      r[0].n === 0
        ? "OK: todos los lotes con existencia tienen contenido neto"
        : `PENDIENTE DEL BANCO: ${r[0].n} producto(s) sin peso/volumen por unidad`,
  },
  {
    titulo: "Códigos de lote duplicados",
    consulta: `select code, count(*)::int as n from lots group by code having count(*) > 1`,
    revisar: (r) =>
      r.length === 0
        ? "OK: no hay códigos duplicados"
        : `ERROR: ${r.length} código(s) duplicado(s)`,
  },
  {
    titulo: "Lotes con disponible mayor que lo recibido",
    consulta: `select code from lots where quantity_available > quantity_received`,
    revisar: (r) =>
      r.length === 0
        ? "OK: el disponible nunca supera lo recibido"
        : `ERROR: ${r.length} lote(s) inconsistentes`,
  },
  {
    titulo: "Lotes con existencia y unidades de stock incompatibles",
    consulta: `select stock_unit, count(*)::int as n
               from lots
               where status = 'ACTIVE' and quantity_available > 0
               group by stock_unit order by n desc`,
    revisar: (r) =>
      `INFORMATIVO: ${r
        .map((row) => `${row.stock_unit}=${row.n}`)
        .join(", ")}`,
  },
];

try {
  console.log("\n=== Auditoría de trazabilidad por lotes (solo lectura) ===\n");

  let problemas = 0;

  for (const check of checks) {
    const rows = await sql.unsafe(check.consulta);
    const veredicto = check.revisar(rows);

    if (veredicto.startsWith("REVISAR") || veredicto.startsWith("ERROR")) {
      problemas += 1;
    }

    console.log(`• ${check.titulo}`);
    console.log(`  ${veredicto}`);

    if (veredicto.startsWith("REVISAR") || veredicto.startsWith("ERROR")) {
      console.log(`  Detalle: ${JSON.stringify(rows)}`);
    }

    console.log("");
  }

  console.log(
    problemas === 0
      ? "Resultado: sin hallazgos que requieran intervencion.\n"
      : `Resultado: ${problemas} punto(s) requieren revision del Banco.\n`
  );
} catch (error) {
  console.error("Error al ejecutar la auditoria:", error.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 }).catch(() => {});
}
