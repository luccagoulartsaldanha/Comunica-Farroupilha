import type { PlatformSnapshot, PlatformUser, UserRole } from "./platform-types.ts";

export type LoadStatus = "loading" | "ready" | "error";
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type ProposalState = { id: string; supports: number };
type CommentState = { id: string; likes?: number };
type UserState = { id: string; name: string; turma: string; role: UserRole };
type InteractiveState = {
  proposals: ProposalState[];
  comments: CommentState[];
  supporters: Record<string, Array<{ id: string; name: string; turma: string }>>;
  supportedByUser: Record<string, string[]>;
  savedByUser: Record<string, string[]>;
  likedCommentsByUser: Record<string, string[]>;
};

async function responseJson(response: Response) {
  const value: unknown = await response.json();
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export async function loadPlatform(signal: AbortSignal, fetcher: FetchLike = fetch) {
  const [authResponse, platformResponse] = await Promise.all([
    fetcher("/api/auth/me", { signal, cache: "no-store" }),
    fetcher("/api/platform", { signal, cache: "no-store" }),
  ]);
  const [authBody, platformBody] = await Promise.all([responseJson(authResponse), responseJson(platformResponse)]);
  if (!authResponse.ok) throw new Error(typeof authBody.error === "string" ? authBody.error : "Não foi possível verificar a sessão.");
  if (!platformResponse.ok) throw new Error(typeof platformBody.error === "string" ? platformBody.error : "Os dados da plataforma estão indisponíveis.");
  if (!platformBody.data || typeof platformBody.data !== "object") throw new Error("A plataforma retornou uma resposta inválida.");
  const user = authBody.user && typeof authBody.user === "object" ? authBody.user as PlatformUser : null;
  return { user, snapshot: platformBody.data as PlatformSnapshot };
}

export function beginInteraction(revisions: Map<string, number>, key: string, now = Date.now()) {
  const revision = Math.max(now, (revisions.get(key) ?? 0) + 1);
  revisions.set(key, revision);
  return revision;
}

export function isLatestInteraction(revisions: Map<string, number>, key: string, revision: number) {
  return revisions.get(key) === revision;
}

export function applySupportState<T extends InteractiveState>(state: T, user: UserState, proposalId: string, supported: boolean, supports: number): T {
  const ids = state.supportedByUser[user.id] ?? [];
  const nextIds = supported ? (ids.includes(proposalId) ? ids : [...ids, proposalId]) : ids.filter((id) => id !== proposalId);
  const existingSupporters = state.supporters[proposalId] ?? [];
  const nextSupporters = supported
    ? existingSupporters.some((supporter) => supporter.id === user.id) ? existingSupporters : [...existingSupporters, { id: user.id, name: user.name, turma: user.turma }]
    : existingSupporters.filter((supporter) => supporter.id !== user.id);
  return {
    ...state,
    proposals: state.proposals.map((proposal) => proposal.id === proposalId ? { ...proposal, supports } : proposal),
    supportedByUser: { ...state.supportedByUser, [user.id]: nextIds },
    supporters: { ...state.supporters, [proposalId]: nextSupporters },
  } as T;
}

export function applySavedState<T extends InteractiveState>(state: T, userId: string, proposalId: string, saved: boolean): T {
  const ids = state.savedByUser[userId] ?? [];
  const nextIds = saved ? (ids.includes(proposalId) ? ids : [...ids, proposalId]) : ids.filter((id) => id !== proposalId);
  return { ...state, savedByUser: { ...state.savedByUser, [userId]: nextIds } } as T;
}

export function applyCommentLikeState<T extends InteractiveState>(state: T, userId: string, commentId: string, liked: boolean, likes: number): T {
  const ids = state.likedCommentsByUser[userId] ?? [];
  const nextIds = liked ? (ids.includes(commentId) ? ids : [...ids, commentId]) : ids.filter((id) => id !== commentId);
  return {
    ...state,
    comments: state.comments.map((comment) => comment.id === commentId ? { ...comment, likes } : comment),
    likedCommentsByUser: { ...state.likedCommentsByUser, [userId]: nextIds },
  } as T;
}

const preferenceKeys = ["view", "query", "themeFilter", "statusFilter", "sort"] as const;

export function serializeUiPreferences(input: Record<string, unknown>) {
  const preferences: Record<string, string> = {};
  for (const key of preferenceKeys) if (typeof input[key] === "string") preferences[key] = input[key];
  return JSON.stringify(preferences);
}

export function parseUiPreferences(raw: string | null) {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const source = value as Record<string, unknown>;
    const preferences: Record<string, string> = {};
    for (const key of preferenceKeys) if (typeof source[key] === "string") preferences[key] = source[key];
    return preferences;
  } catch {
    return {};
  }
}
