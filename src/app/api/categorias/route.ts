import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import {
  createCategory,
  listCategories,
} from "@/lib/services/product.service";
import { createCategorySchema } from "@/lib/validations/schemas";

export async function GET() {
  try {
    await requireUser();

    const db = getDb();
    const data = await listCategories(db);

    return jsonOk(data);
  } catch (error) {
    return handleRouteError(error, "categorias:GET");
  }
}

export async function POST(request: Request) {
  try {
    await requireUser();

    const body = await request.json();
    const input = createCategorySchema.parse(body);

    const db = getDb();
    const category = await createCategory(db, input);

    return jsonOk(category, 201);
  } catch (error) {
    return handleRouteError(error, "categorias:POST");
  }
}
