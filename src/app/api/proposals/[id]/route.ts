import { dataResponse, errorResponse, readJsonObject, requiredString, unavailableResponse } from "@/lib/http";
import { getProposal, getProposalSupporters, updateProposalGefResponse, updateProposalStatus } from "@/lib/platform-repository";
import type { ProposalStatus } from "@/lib/platform-types";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };
const statuses: ProposalStatus[] = ["received", "analysis", "development", "scheduled", "completed", "archived"];

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const viewer = await getSessionUser();
    const proposal = await getProposal(id, viewer?.role === "gef");
    if (!proposal) return errorResponse("Proposta não encontrada.", 404);
    return dataResponse({ ...proposal, supporters: await getProposalSupporters(id) });
  } catch (error) {
    return unavailableResponse("get-proposal", error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return errorResponse("Faça login para gerenciar a proposta.", 401);
    if (user.role !== "gef") return errorResponse("Somente o GEF pode gerenciar a proposta.", 403);
    const body = await readJsonObject(request);
    if (!body) return errorResponse("Envie um JSON válido.", 400);
    const status = typeof body.status === "string" && statuses.includes(body.status as ProposalStatus) ? body.status as ProposalStatus : undefined;
    const response = body.gefResponse === undefined ? undefined : requiredString(body.gefResponse, { max: 4000 }) ?? undefined;
    if (body.status !== undefined && !status) return errorResponse("Situação inválida.", 400);
    if (body.gefResponse !== undefined && !response) return errorResponse("A resposta do GEF é inválida.", 400);
    if (!status && !response) return errorResponse("Informe ao menos a situação ou a resposta do GEF.", 400);
    const { id } = await context.params;
    const proposal = status ? await updateProposalStatus(id, status, response) : await updateProposalGefResponse(id, response!);
    if (!proposal) return errorResponse("Proposta não encontrada.", 404);
    return dataResponse(proposal);
  } catch (error) {
    return unavailableResponse("update-proposal", error);
  }
}
