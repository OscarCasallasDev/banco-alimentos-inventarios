import { getDb, withTransaction } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import {
  createProduct,
  listProducts,
} from "@/lib/services/product.service";
import { recordAuditLog } from "@/lib/services/audit-log.service";
import { createProductSchema } from "@/lib/validations/schemas";

export async function GET() {
  try {
    await requireUser();

    const db = getDb();
    const data = await listProducts(db);

    return jsonOk(data);
  } catch (error) {
    return handleRouteError(error, "productos:GET");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    const body = await request.json();
    const input = createProductSchema.parse(body);

    const product = await withTransaction(async (tx) => {
      const created = await createProduct(tx, input);

      await recordAuditLog(tx, {
        userId: user.id,
        action: "PRODUCT_CREATE",
        entity: "products",
        entityId: created.id,
        details: `Producto ${created.code} — ${created.name}`,
      });

      return created;
    });

    return jsonOk(product, 201);
  } catch (error) {
    return handleRouteError(error, "productos:POST");
  }
}
