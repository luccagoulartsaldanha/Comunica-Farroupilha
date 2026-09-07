const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Vary: "Cookie",
};

export function dataResponse(data: unknown, init: ResponseInit = {}) {
  return Response.json({ data }, { ...init, headers: { ...NO_STORE_HEADERS, ...init.headers } });
}

export function errorResponse(error: string, status: number) {
  return Response.json({ error }, { status, headers: NO_STORE_HEADERS });
}

export async function readJsonObject(request: Request) {
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function requiredString(value: unknown, options: { min?: number; max: number }) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length < (options.min ?? 1) || text.length > options.max) return null;
  return text;
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function unavailableResponse(operation: string, error: unknown) {
  console.error(`[database:${operation}]`, error instanceof Error ? error.message : "unknown error");
  return errorResponse("O serviço de dados está temporariamente indisponível. Tente novamente.", 503);
}
