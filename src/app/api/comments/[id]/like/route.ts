import { dataResponse, errorResponse, readJsonObject, unavailableResponse } from "@/lib/http";
import { getComment, setCommentLike } from "@/lib/platform-repository";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return errorResponse("Faça login para curtir um comentário.", 401);
    const body = await readJsonObject(request);
    if (!body) return errorResponse("Envie um JSON válido.", 400);
    if (typeof body.liked !== "boolean") return errorResponse("Informe a intenção da curtida.", 400);
    if (typeof body.revision !== "number" || !Number.isSafeInteger(body.revision) || body.revision < 0) return errorResponse("Informe uma revisão de interação válida.", 400);
    const { id } = await context.params;
    if (!(await getComment(id))) return errorResponse("Comentário não encontrado.", 404);
    return dataResponse(await setCommentLike(id, user.id, body.liked, body.revision));
  } catch (error) {
    return unavailableResponse("set-comment-like", error);
  }
}
