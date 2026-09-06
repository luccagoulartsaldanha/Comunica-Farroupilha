import { dataResponse, errorResponse, readJsonObject, unavailableResponse } from "@/lib/http";
import { getProposal, setSaved } from "@/lib/platform-repository";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return errorResponse("Faça login para acompanhar uma proposta.", 401);
    const body = await readJsonObject(request);
    if (!body) return errorResponse("Envie um JSON válido.", 400);
    if (typeof body.saved !== "boolean") return errorResponse("Informe a intenção de acompanhamento.", 400);
    const { id } = await context.params;
    if (!(await getProposal(id))) return errorResponse("Proposta não encontrada.", 404);
    return dataResponse(await setSaved(id, user.id, body.saved));
  } catch (error) {
    return unavailableResponse("set-save", error);
  }
}
