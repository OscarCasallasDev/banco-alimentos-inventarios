import { getDb, withTransaction } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { createReceipt, listReceipts } from "@/lib/services/receipt.service";
import { createReceiptSchema } from "@/lib/validations/schemas";

export async function GET() {
  try {
    await requireUser();

    const db = getDb();
    const data = await listReceipts(db);

    return jsonOk(data);
  } catch (error) {
    return handleRouteError(error, "recibos:GET");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    const body = await request.json();
    const input = createReceiptSchema.parse(body);

    const receipt = await withTransaction(async (tx) =>
      createReceipt(tx, input, user.id)
    );

    return jsonOk(receipt, 201);
  } catch (error) {
    return handleRouteError(error, "recibos:POST");
  }
}
