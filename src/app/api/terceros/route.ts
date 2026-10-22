import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { jsonOk, handleRouteError } from "@/lib/api/response";
import {
  listThirdParties,
  upsertThirdParty,
} from "@/lib/services/third-party.service";
import { createThirdPartySchema } from "@/lib/validations/schemas";

/**
 * Lista o busca terceros (entidades que entregan productos).
 * Búsqueda por NIT, sucursal, razón social o ciudad.
 */
export async function GET(request: Request) {
  try {
    await requireUser();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? undefined;

    const db = getDb();
    const data = await listThirdParties(db, search);

    return jsonOk(data);
  } catch (error) {
    return handleRouteError(error, "terceros:GET");
  }
}

/**
 * Crea o actualiza un tercero (la llave natural es NIT + sucursal).
 */
export async function POST(request: Request) {
  try {
    await requireUser();

    const body = await request.json();
    const input = createThirdPartySchema.parse(body);

    const db = getDb();
    const thirdParty = await upsertThirdParty(db, input);

    return jsonOk(thirdParty, 201);
  } catch (error) {
    return handleRouteError(error, "terceros:POST");
  }
}
