import { dataResponse, errorResponse, readJsonObject, unavailableResponse } from "@/lib/http";
import { getActivity, updateActivityStatus } from "@/lib/platform-repository";
import type { ActivityStatus } from "@/lib/platform-types";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };
const statuses: ActivityStatus[] = ["upcoming", "done", "cancelled"];

export async function GET(_request: Request, context: RouteContext) {
  try {
    const activity = await getActivity((await context.params).id);
    return activity ? dataResponse(activity) : errorResponse("Atividade não encontrada.", 404);
  } catch (error) { return unavailableResponse("get-activity", error); }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return errorResponse("Faça login para gerenciar atividades.", 401);
    if (user.role !== "gef") return errorResponse("Somente o GEF pode alterar o status de atividades.", 403);
    const body = await readJsonObject(request);
    if (!body) return errorResponse("Envie um JSON válido.", 400);
    if (typeof body.status !== "string" || !statuses.includes(body.status as ActivityStatus)) return errorResponse("Status inválido.", 400);
    const activity = await updateActivityStatus((await context.params).id, body.status as ActivityStatus);
    return activity ? dataResponse(activity) : errorResponse("Atividade não encontrada.", 404);
  } catch (error) { return unavailableResponse("update-activity", error); }
}
