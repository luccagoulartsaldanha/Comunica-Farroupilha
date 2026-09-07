import { dataResponse, errorResponse, readJsonObject, unavailableResponse } from "@/lib/http";
import { sanitizeLegacyImport } from "@/lib/legacy-import";
import { importLegacyData } from "@/lib/platform-repository";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return errorResponse("Faça login para importar dados antigos.", 401);
    if (user.role !== "gef") return errorResponse("Somente o GEF pode importar dados antigos.", 403);
    const body = await readJsonObject(request);
    if (!body) return errorResponse("Envie um JSON válido.", 400);
    const payload = sanitizeLegacyImport(body);
    const total = payload.proposals.length + payload.comments.length + payload.activities.length + payload.chapaQuestions.length;
    if (total === 0) return errorResponse("Nenhum dado válido foi encontrado para importar.", 400);
    return dataResponse(await importLegacyData(user.id, payload));
  } catch (error) {
    return unavailableResponse("legacy-import", error);
  }
}
