import { getDb, withTransaction } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import {
  deactivateProduct,
  getProduct,
  updateProduct,
} from "@/lib/services/product.service";
import { recordAuditLog } from "@/lib/services/audit-log.service";
import { updateProductSchema } from "@/lib/validations/schemas";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();

    const { id } = await params;
    const db = getDb();
    const product = await getProduct(db, id);

    return jsonOk(product);
  } catch (error) {
    return handleRouteError(error, "productos:GET:id");
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();

    const { id } = await params;
    const body = await request.json();
    const input = updateProductSchema.parse(body);

    const product = await withTransaction(async (tx) => {
      const updated = await updateProduct(tx, id, input);

      await recordAuditLog(tx, {
        userId: user.id,
        action: "PRODUCT_UPDATE",
        entity: "products",
        entityId: id,
        details: `Producto ${updated.code} actualizado`,
      });

      return updated;
    });

    return jsonOk(product);
  } catch (error) {
    return handleRouteError(error, "productos:PUT");
  }
}

/**
 * Baja lógica del producto (regla 4: los productos con historial no se eliminan).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();

    const { id } = await params;

    const product = await withTransaction(async (tx) => {
      const deactivated = await deactivateProduct(tx, id);

      await recordAuditLog(tx, {
        userId: user.id,
        action: "PRODUCT_DEACTIVATE",
        entity: "products",
        entityId: id,
        details: `Producto ${deactivated.code} desactivado`,
      });

      return deactivated;
    });

    return jsonOk({
      id: product.id,
      code: product.code,
      name: product.name,
      status: product.status,
      message: "El producto se desactivó. Su historial se conserva.",
    });
  } catch (error) {
    return handleRouteError(error, "productos:DELETE");
  }
}
