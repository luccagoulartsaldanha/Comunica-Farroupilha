import { dataResponse, errorResponse } from "@/lib/http";
import { ELECTIONS_ENABLED } from "@/lib/feature-flags";
import { CHAPAS, CHAPA_AREAS } from "@/lib/platform-types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!ELECTIONS_ENABLED) return errorResponse("A área de chapas estará disponível quando houver uma eleição.", 410);
  const area = new URL(request.url).searchParams.get("area");
  const validArea = area && CHAPA_AREAS.includes(area as (typeof CHAPA_AREAS)[number]) ? area : null;
  return dataResponse(CHAPAS.map((chapa) => ({
    ...chapa,
    proposals: validArea ? chapa.proposals.filter((proposal) => proposal.area === validArea) : chapa.proposals,
  })));
}
