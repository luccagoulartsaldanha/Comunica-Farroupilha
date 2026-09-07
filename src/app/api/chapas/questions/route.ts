import { dataResponse, errorResponse, readJsonObject, requiredString, unavailableResponse } from "@/lib/http";
import { answerChapaQuestion, createChapaQuestion, getChapaQuestions } from "@/lib/platform-repository";
import { CHAPA_AREAS } from "@/lib/platform-types";
import { getSessionUser } from "@/lib/session";
import { ELECTIONS_ENABLED } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!ELECTIONS_ENABLED) return errorResponse("A área de chapas estará disponível quando houver uma eleição.", 410);
  try {
    const url = new URL(request.url);
    return dataResponse(await getChapaQuestions(url.searchParams.get("chapaId") ?? undefined, url.searchParams.get("area") ?? undefined));
  } catch (error) { return unavailableResponse("list-chapa-questions", error); }
}

export async function POST(request: Request) {
  if (!ELECTIONS_ENABLED) return errorResponse("A área de chapas estará disponível quando houver uma eleição.", 410);
  try {
    const user = await getSessionUser();
    if (!user) return errorResponse("Faça login para enviar uma dúvida.", 401);
    const body = await readJsonObject(request);
    if (!body) return errorResponse("Envie um JSON válido.", 400);
    const chapaId = typeof body.chapaId === "string" && ["chapa-1", "chapa-2"].includes(body.chapaId) ? body.chapaId : null;
    const area = typeof body.proposalArea === "string" && CHAPA_AREAS.includes(body.proposalArea as (typeof CHAPA_AREAS)[number]) ? body.proposalArea : null;
    const question = requiredString(body.question, { min: 5, max: 2000 });
    const proposalTitle = body.proposalTitle === undefined ? undefined : requiredString(body.proposalTitle, { max: 160 });
    if (!chapaId || !area || !question || (body.proposalTitle !== undefined && !proposalTitle)) return errorResponse("Identificador da chapa, área e pergunta válidos são obrigatórios.", 400);
    return dataResponse(await createChapaQuestion({
      chapaId, proposalArea: area, question, author: user.name, authorId: user.id, turma: user.turma,
      ...(proposalTitle ? { proposalTitle } : {}),
    }), { status: 201 });
  } catch (error) { return unavailableResponse("create-chapa-question", error); }
}

export async function PATCH(request: Request) {
  if (!ELECTIONS_ENABLED) return errorResponse("A área de chapas estará disponível quando houver uma eleição.", 410);
  try {
    const user = await getSessionUser();
    if (!user) return errorResponse("Faça login para responder dúvidas.", 401);
    if (user.role !== "gef") return errorResponse("Somente o GEF pode responder dúvidas das chapas.", 403);
    const body = await readJsonObject(request);
    if (!body) return errorResponse("Envie um JSON válido.", 400);
    const questionId = requiredString(body.questionId, { max: 64 });
    const answer = requiredString(body.answer, { min: 2, max: 4000 });
    if (!questionId || !answer) return errorResponse("ID da dúvida e resposta são obrigatórios.", 400);
    const updated = await answerChapaQuestion(questionId, answer, user.name);
    return updated ? dataResponse(updated) : errorResponse("Dúvida não encontrada.", 404);
  } catch (error) { return unavailableResponse("answer-chapa-question", error); }
}
