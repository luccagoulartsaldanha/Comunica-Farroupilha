import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "no-store, max-age=0", Vary: "Cookie" };

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ user: null }, { headers: privateHeaders });
  }
  return Response.json({ user }, { headers: privateHeaders });
}
