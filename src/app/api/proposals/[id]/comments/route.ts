import { dataResponse, errorResponse, readJsonObject, requiredString, unavailableResponse } from "@/lib/http";
import { addComment, getComments, getProposal } from "@/lib/platform-repository";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!(await getProposal(id))) return errorResponse("Proposta não encontrada.", 404);
    return dataResponse(await getComments(id));
  } catch (error) {
    return unavailableResponse("list-comments", error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return errorResponse("Faça login para comentar.", 401);
    const body = await readJsonObject(request);
    if (!body) return errorResponse("Envie um JSON válido.", 400);
    const text = requiredString(body.body, { min: 3, max: 2000 });
    const parentId = body.parentId === undefined ? undefined : requiredString(body.parentId, { max: 64 });
    if (!text || (body.parentId !== undefined && !parentId)) return errorResponse("O comentário precisa ter entre 3 e 2000 caracteres.", 400);
    const { id } = await context.params;
    if (!(await getProposal(id))) return errorResponse("Proposta não encontrada.", 404);
    const comment = await addComment(id, {
      author: user.name, authorId: user.id, role: user.role,
      anonymous: user.role === "student" && body.anonymous === true,
      body: text, ...(parentId ? { parentId } : {}),
    });
    return dataResponse(comment, { status: 201 });
  } catch (error) {
    return unavailableResponse("create-comment", error);
  }
}
