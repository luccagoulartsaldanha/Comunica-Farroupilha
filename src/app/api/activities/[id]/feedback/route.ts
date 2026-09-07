import { dataResponse, errorResponse, readJsonObject, requiredString, unavailableResponse } from "@/lib/http";
import { getActivity, getActivityFeedbacks, getPlatformSnapshot, submitActivityFeedback } from "@/lib/platform-repository";
import type { ActivityFeedbackRating } from "@/lib/platform-types";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };
const ratings: ActivityFeedbackRating[] = ["great", "good", "ok", "poor"];

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return errorResponse("Faça login para consultar avaliações.", 401);
    const { id } = await context.params;
    if (!(await getActivity(id))) return errorResponse("Atividade não encontrada.", 404);
    if (user.role === "gef") return dataResponse(await getActivityFeedbacks(id));
    return dataResponse((await getPlatformSnapshot(user.id)).activityFeedbacks[id] ?? []);
  } catch (error) { return unavailableResponse("list-feedback", error); }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return errorResponse("Faça login para avaliar uma atividade.", 401);
    const body = await readJsonObject(request);
    if (!body) return errorResponse("Envie um JSON válido.", 400);
    if (typeof body.participated !== "boolean") return errorResponse("Informe se você participou da atividade.", 400);
    const reason = body.reasonNotParticipated === undefined ? undefined : requiredString(body.reasonNotParticipated, { max: 500 });
    const comment = body.comment === undefined ? undefined : requiredString(body.comment, { max: 2000 });
    const rating = typeof body.rating === "string" && ratings.includes(body.rating as ActivityFeedbackRating) ? body.rating as ActivityFeedbackRating : undefined;
    if ((body.reasonNotParticipated !== undefined && !reason) || (body.comment !== undefined && !comment) || (body.rating !== undefined && !rating)) return errorResponse("Avaliação inválida.", 400);
    const { id } = await context.params;
    if (!(await getActivity(id))) return errorResponse("Atividade não encontrada.", 404);
    return dataResponse(await submitActivityFeedback(id, {
      userId: user.id, participated: body.participated,
      ...(reason ? { reasonNotParticipated: reason } : {}), ...(rating ? { rating } : {}), ...(comment ? { comment } : {}),
    }), { status: 201 });
  } catch (error) { return unavailableResponse("submit-feedback", error); }
}
