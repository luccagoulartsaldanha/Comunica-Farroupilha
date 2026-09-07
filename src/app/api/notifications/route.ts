import { dataResponse, errorResponse, unavailableResponse } from "@/lib/http";
import { getNotifications, markAllNotificationsRead } from "@/lib/platform-repository";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return errorResponse("Faça login para ver suas notificações.", 401);
    return dataResponse(await getNotifications(user.id));
  } catch (error) { return unavailableResponse("list-notifications", error); }
}

export async function PATCH() {
  try {
    const user = await getSessionUser();
    if (!user) return errorResponse("Faça login para atualizar suas notificações.", 401);
    await markAllNotificationsRead(user.id);
    return dataResponse(await getNotifications(user.id));
  } catch (error) { return unavailableResponse("read-notifications", error); }
}
