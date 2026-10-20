import { getDb, withTransaction } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import { createInvoice, listInvoices } from "@/lib/services/invoice.service";
import { createInvoiceSchema } from "@/lib/validations/schemas";

export async function GET() {
  try {
    await requireUser();

    const db = getDb();
    const data = await listInvoices(db);

    return jsonOk(data);
  } catch (error) {
    return handleRouteError(error, "facturas:GET");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    const body = await request.json();
    const input = createInvoiceSchema.parse(body);

    const invoice = await withTransaction(async (tx) =>
      createInvoice(tx, input, user.id)
    );

    return jsonOk(invoice, 201);
  } catch (error) {
    return handleRouteError(error, "facturas:POST");
  }
}
