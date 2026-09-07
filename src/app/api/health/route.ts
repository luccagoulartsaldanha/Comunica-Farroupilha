import { checkDatabaseConnection } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const database = await checkDatabaseConnection();
    return Response.json({ ok: database, service: "comunica-farroupilha", database: "connected" }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("[database:health]", error instanceof Error ? error.message : "unknown error");
    return errorResponse("Banco de dados indisponível.", 503);
  }
}
