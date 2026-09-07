import { dataResponse, unavailableResponse } from "@/lib/http";
import { getPlatformSnapshot } from "@/lib/platform-repository";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getSessionUser();
    return dataResponse(await getPlatformSnapshot(user?.id));
  } catch (error) {
    return unavailableResponse("platform-snapshot", error);
  }
}
