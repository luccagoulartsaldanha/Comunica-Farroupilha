import type { ActivityStatus, ProposalStatus, UserRole } from "./platform-types.ts";

export type LegacyProposal = {
  id: string; title: string; body: string; author: string; anonymous: boolean; theme: string;
  status: ProposalStatus; origin: "student" | "gef"; gefResponse?: string;
};
export type LegacyComment = {
  id: string; proposalId: string; author: string; role: UserRole; anonymous: boolean; body: string; parentId?: string;
};
export type LegacyActivity = {
  id: string; proposalId: string; title: string; date: string; time: string; place: string; audience: string; status: ActivityStatus;
};
export type LegacyChapaQuestion = {
  id: string; chapaId: string; proposalArea: string; proposalTitle?: string; question: string;
  author: string; turma: string; answer?: string; answeredBy?: string;
};
export type LegacyImportPayload = {
  proposals: LegacyProposal[];
  comments: LegacyComment[];
  activities: LegacyActivity[];
  chapaQuestions: LegacyChapaQuestion[];
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown, min: number, max: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= min && normalized.length <= max ? normalized : null;
}

function list(value: unknown, limit: number) {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}

const proposalStatuses: ProposalStatus[] = ["received", "analysis", "development", "scheduled", "completed", "archived"];
const activityStatuses: ActivityStatus[] = ["upcoming", "done", "cancelled"];

export function sanitizeLegacyImport(raw: unknown): LegacyImportPayload {
  const source = object(raw) ?? {};
  const proposals = list(source.proposals, 500).flatMap((value): LegacyProposal[] => {
    const item = object(value);
    if (!item) return [];
    const id = text(item.id, 1, 200);
    const title = text(item.title, 5, 160);
    const body = text(item.body, 20, 4000);
    const author = text(item.author, 1, 160);
    const theme = text(item.theme, 1, 80);
    const status = typeof item.status === "string" && proposalStatuses.includes(item.status as ProposalStatus) ? item.status as ProposalStatus : "received";
    const origin = item.origin === "gef" ? "gef" : "student";
    if (!id || !title || !body || !author || !theme) return [];
    const gefResponse = text(item.gefResponse, 1, 4000);
    return [{ id, title, body, author, theme, status, origin, anonymous: item.anonymous === true, ...(gefResponse ? { gefResponse } : {}) }];
  });
  const proposalIds = new Set(proposals.map((proposal) => proposal.id));

  const comments = list(source.comments, 2000).flatMap((value): LegacyComment[] => {
    const item = object(value);
    if (!item) return [];
    const id = text(item.id, 1, 200);
    const proposalId = text(item.proposalId, 1, 200);
    const author = text(item.author, 1, 160);
    const body = text(item.body, 1, 2000);
    const role = item.role === "gef" ? "gef" : "student";
    const parentId = text(item.parentId, 1, 200);
    if (!id || !proposalId || !proposalIds.has(proposalId) || !author || !body) return [];
    return [{ id, proposalId, author, body, role, anonymous: item.anonymous === true, ...(parentId ? { parentId } : {}) }];
  });

  const activities = list(source.activities, 500).flatMap((value): LegacyActivity[] => {
    const item = object(value);
    if (!item) return [];
    const id = text(item.id, 1, 200);
    const proposalId = text(item.proposalId, 1, 200);
    const title = text(item.title, 1, 160);
    const date = typeof item.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : null;
    const time = text(item.time, 1, 80);
    const place = text(item.place, 1, 160);
    const audience = text(item.audience, 1, 160);
    const status = typeof item.status === "string" && activityStatuses.includes(item.status as ActivityStatus) ? item.status as ActivityStatus : "upcoming";
    if (!id || !proposalId || !proposalIds.has(proposalId) || !title || !date || !time || !place || !audience) return [];
    return [{ id, proposalId, title, date, time, place, audience, status }];
  });

  const chapaQuestions = list(source.chapaQuestions, 1000).flatMap((value): LegacyChapaQuestion[] => {
    const item = object(value);
    if (!item) return [];
    const id = text(item.id, 1, 200);
    const chapaId = item.chapaId === "chapa-1" || item.chapaId === "chapa-2" ? item.chapaId : null;
    const proposalArea = text(item.proposalArea, 1, 120);
    const proposalTitle = text(item.proposalTitle, 1, 160);
    const question = text(item.question, 5, 2000);
    const author = text(item.author, 1, 160);
    const turma = text(item.turma, 1, 160);
    const answer = text(item.answer, 1, 4000);
    const answeredBy = text(item.answeredBy, 1, 160);
    if (!id || !chapaId || !proposalArea || !question || !author || !turma) return [];
    return [{ id, chapaId, proposalArea, question, author, turma, ...(proposalTitle ? { proposalTitle } : {}), ...(answer ? { answer } : {}), ...(answeredBy ? { answeredBy } : {}) }];
  });

  return { proposals, comments, activities, chapaQuestions };
}

export function previewLegacyState(raw: unknown) {
  const payload = sanitizeLegacyImport(raw);
  return {
    proposals: payload.proposals.length,
    comments: payload.comments.length,
    activities: payload.activities.length,
    chapaQuestions: payload.chapaQuestions.length,
  };
}
