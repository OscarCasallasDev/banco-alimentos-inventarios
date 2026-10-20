import { getDb, withTransaction } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { createOrder, listOrders } from "@/lib/services/order.service";
import { createOrderSchema } from "@/lib/validations/schemas";

export async function GET() {
  try {
    await requireUser();

    const db = getDb();
    const data = await listOrders(db);

    return jsonOk(data);
  } catch (error) {
    return handleRouteError(error, "pedidos:GET");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    const body = await request.json();
    const input = createOrderSchema.parse(body);

    const order = await withTransaction(async (tx) =>
      createOrder(tx, input, user.id)
    );

    return jsonOk(order, 201);
  } catch (error) {
    return handleRouteError(error, "pedidos:POST");
  }
}
