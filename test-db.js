const postgres = require("postgres");

// Pooler de Supabase con project reference en el usuario
const sql = postgres(
  "postgresql://postgres.hszylkcojdjnbjatuhnv:Y3iVdMCxRx%26YR3Y@aws-0-us-west-2.pooler.supabase.com:6543/postgres",
  { connect_timeout: 15 }
);

sql`SELECT 1 as test`
  .then((r) => {
    console.log("Conexión exitosa con pooler:", r);
    process.exit(0);
  })
  .catch((e) => {
    console.error("Error con pooler:", e.message);
    process.exit(1);
  });
