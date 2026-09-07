import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { QueryResultRow } from "@neondatabase/serverless";
import { query, transaction, type TransactionQuery } from "./db.ts";
import {
  CHAPAS,
  type ActivityFeedbackRating,
  type ActivityFeedbackRecord,
  type ActivityRecord,
  type ActivityStatus,
  type ChapaQuestionRecord,
  type CommentRecord,
  type NotificationRecord,
  type PlatformSnapshot,
  type ProposalRecord,
  type ProposalStatus,
  type SupporterRecord,
  type UserRole,
} from "./platform-types.ts";
import type { LegacyImportPayload } from "./legacy-import.ts";

type ProposalRow = QueryResultRow & {
  id: string; title: string; body: string; author_id: string | null; author_name: string; anonymous: boolean;
  theme: string; status: ProposalStatus; origin: "student" | "gef"; gef_response: string | null;
  gef_response_at: Date | string | null; created_at: Date | string; updated_at: Date | string;
  supports: number | string; comments: number | string;
};
type CommentRow = QueryResultRow & {
  id: string; proposal_id: string; author_id: string | null; author_name: string; author_role: UserRole;
  anonymous: boolean; body: string; parent_id: string | null; created_at: Date | string; likes: number | string;
};
type ActivityRow = QueryResultRow & {
  id: string; proposal_id: string; title: string; activity_date: Date | string; time_label: string;
  place: string; audience: string; status: ActivityStatus;
};
type FeedbackRow = QueryResultRow & {
  id: string; activity_id: string; user_id: string; username: string; class_name: string; participated: boolean;
  reason_not_participated: string | null; rating: ActivityFeedbackRating | null; comment: string | null; created_at: Date | string;
};
type NotificationRow = QueryResultRow & {
  id: string; title: string; body: string; activity_id: string | null; created_at: Date | string; read: boolean;
};
type ChapaQuestionRow = QueryResultRow & {
  id: string; chapa_id: string; proposal_area: string; proposal_title: string | null; question: string;
  author_id: string | null; author_name: string; class_name: string; answer: string | null;
  answered_by: string | null; answered_at: Date | string | null; created_at: Date | string;
};

const proposalSelect = `
  SELECT p.id, p.title, p.body, p.author_id, p.author_name, p.anonymous, p.theme, p.status, p.origin,
         p.gef_response, p.gef_response_at, p.created_at, p.updated_at,
         (SELECT count(*)::int FROM proposal_supports ps WHERE ps.proposal_id = p.id) AS supports,
         (SELECT count(*)::int FROM comments c WHERE c.proposal_id = p.id) AS comments
  FROM proposals p`;

function timeLabel(value: Date | string | null) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  const elapsed = Date.now() - date.getTime();
  if (elapsed >= 0 && elapsed < 60_000) return "Agora";
  if (elapsed >= 0 && elapsed < 3_600_000) return `Há ${Math.max(1, Math.floor(elapsed / 60_000))} min`;
  if (elapsed >= 0 && elapsed < 86_400_000) return `Há ${Math.max(1, Math.floor(elapsed / 3_600_000))} h`;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
}

function dateOnly(value: Date | string) {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function mapProposal(row: ProposalRow, revealAnonymousIdentity = false): ProposalRecord {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    author: row.anonymous && !revealAnonymousIdentity ? "" : row.author_name,
    authorId: row.anonymous && !revealAnonymousIdentity ? "" : row.author_id ?? "",
    anonymous: row.anonymous,
    theme: row.theme,
    status: row.status,
    supports: Number(row.supports),
    comments: Number(row.comments),
    createdAt: timeLabel(row.created_at) ?? "",
    updatedAt: timeLabel(row.updated_at) ?? "",
    origin: row.origin,
    ...(row.gef_response ? { gefResponse: row.gef_response } : {}),
    ...(row.gef_response_at ? { gefResponseAt: timeLabel(row.gef_response_at) } : {}),
  };
}

function mapComment(row: CommentRow, revealAnonymousIdentity = false): CommentRecord {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    author: row.anonymous && !revealAnonymousIdentity ? "" : row.author_name,
    authorId: row.anonymous && !revealAnonymousIdentity ? "" : row.author_id ?? "",
    role: row.author_role,
    anonymous: row.anonymous,
    body: row.body,
    createdAt: timeLabel(row.created_at) ?? "",
    ...(row.parent_id ? { parentId: row.parent_id } : {}),
    likes: Number(row.likes),
  };
}

function mapActivity(row: ActivityRow): ActivityRecord {
  return {
    id: row.id, proposalId: row.proposal_id, title: row.title, date: dateOnly(row.activity_date),
    time: row.time_label, place: row.place, audience: row.audience, status: row.status,
  };
}

function mapFeedback(row: FeedbackRow): ActivityFeedbackRecord {
  return {
    id: row.id, activityId: row.activity_id, userId: row.user_id, userName: row.username,
    turma: row.class_name, participated: row.participated, createdAt: timeLabel(row.created_at) ?? "",
    ...(row.reason_not_participated ? { reasonNotParticipated: row.reason_not_participated } : {}),
    ...(row.rating ? { rating: row.rating } : {}),
    ...(row.comment ? { comment: row.comment } : {}),
  };
}

async function interactionIds(table: "proposal_supports" | "proposal_saves", userId?: string) {
  if (!userId) return [];
  const rows = await query<{ proposal_id: string }>(`SELECT proposal_id FROM ${table} WHERE user_id = $1 ORDER BY created_at`, [userId]);
  return rows.map((row) => row.proposal_id);
}

export async function getPlatformSnapshot(userId?: string): Promise<PlatformSnapshot> {
  const feedbackVisibility = userId
    ? `WHERE f.user_id = $1 OR EXISTS (SELECT 1 FROM users viewer WHERE viewer.id = $1 AND viewer.role = 'gef')`
    : "WHERE false";
  const params = userId ? [userId] : [];
  const [viewerRows, proposalRows, commentRows, activityRows, notificationRows, supporterRows, feedbackRows, questionRows, supported, saved, likedRows] = await Promise.all([
    userId ? query<{ role: UserRole }>("SELECT role FROM users WHERE id = $1", [userId]) : Promise.resolve([]),
    query<ProposalRow>(`${proposalSelect} ORDER BY p.created_at DESC`),
    query<CommentRow>(`SELECT c.*, (SELECT count(*)::int FROM comment_likes cl WHERE cl.comment_id = c.id) AS likes FROM comments c ORDER BY c.created_at`),
    query<ActivityRow>("SELECT id, proposal_id, title, activity_date, time_label, place, audience, status FROM activities ORDER BY activity_date"),
    query<NotificationRow>(`SELECT n.id, n.title, n.body, n.activity_id, n.created_at,
      ${userId ? "EXISTS (SELECT 1 FROM notification_reads nr WHERE nr.notification_id = n.id AND nr.user_id = $1)" : "false"} AS read
      FROM notifications n ORDER BY n.created_at DESC`, params),
    query<QueryResultRow & { proposal_id: string; id: string; username: string; class_name: string; anonymous: boolean }>(
      `SELECT ps.proposal_id, u.id, u.username, u.class_name, p.anonymous
       FROM proposal_supports ps
       JOIN users u ON u.id = ps.user_id
       JOIN proposals p ON p.id = ps.proposal_id
       ORDER BY ps.created_at`,
    ),
    query<FeedbackRow>(`SELECT f.*, u.username, u.class_name FROM activity_feedbacks f JOIN users u ON u.id = f.user_id ${feedbackVisibility} ORDER BY f.created_at`, params),
    query<ChapaQuestionRow>("SELECT * FROM chapa_questions ORDER BY created_at DESC"),
    interactionIds("proposal_supports", userId),
    interactionIds("proposal_saves", userId),
    userId ? query<{ comment_id: string }>("SELECT comment_id FROM comment_likes WHERE user_id = $1 ORDER BY created_at", [userId]) : Promise.resolve([]),
  ]);

  const revealAnonymousIdentity = viewerRows[0]?.role === "gef";
  const supportersByProposal: Record<string, SupporterRecord[]> = {};
  for (const row of supporterRows) {
    if (row.anonymous && !revealAnonymousIdentity) continue;
    (supportersByProposal[row.proposal_id] ??= []).push({ id: row.id, name: row.username, turma: row.class_name });
  }
  const activityFeedbacks: Record<string, ActivityFeedbackRecord[]> = {};
  for (const row of feedbackRows) (activityFeedbacks[row.activity_id] ??= []).push(mapFeedback(row));
  const notifications: NotificationRecord[] = notificationRows.map((row) => ({
    id: row.id, title: row.title, body: row.body, createdAt: timeLabel(row.created_at) ?? "", read: row.read,
    ...(row.activity_id ? { activityId: row.activity_id } : {}),
  }));
  const chapaQuestions: ChapaQuestionRecord[] = questionRows.map((row) => ({
    id: row.id, chapaId: row.chapa_id, proposalArea: row.proposal_area, question: row.question,
    author: row.author_name, authorId: row.author_id ?? "", turma: row.class_name, answered: Boolean(row.answer),
    createdAt: timeLabel(row.created_at) ?? "",
    ...(row.proposal_title ? { proposalTitle: row.proposal_title } : {}),
    ...(row.answer ? { answer: row.answer } : {}),
    ...(row.answered_by ? { answeredBy: row.answered_by } : {}),
    ...(row.answered_at ? { answeredAt: timeLabel(row.answered_at) } : {}),
  }));

  return {
    proposals: proposalRows.map((row) => mapProposal(row, revealAnonymousIdentity)),
    comments: commentRows.map((row) => mapComment(row, revealAnonymousIdentity)),
    activities: activityRows.map(mapActivity),
    notifications,
    supportersByProposal,
    supportedByUser: userId ? { [userId]: supported } : {},
    savedByUser: userId ? { [userId]: saved } : {},
    likedCommentsByUser: userId ? { [userId]: likedRows.map((row) => row.comment_id) } : {},
    chapas: CHAPAS,
    activityFeedbacks,
    chapaQuestions,
  };
}

export async function createProposal(input: {
  title: string; body: string; author: string; authorId: string; anonymous: boolean; theme: string; origin: "student" | "gef";
}) {
  const id = randomUUID();
  await transaction(async (tx) => {
    await tx(
      `INSERT INTO proposals (id, title, body, author_id, author_name, anonymous, theme, origin)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, input.title, input.body, input.authorId, input.author, input.anonymous, input.theme, input.origin],
    );
    await tx("INSERT INTO notifications (id, title, body) VALUES ($1, $2, $3)", [
      randomUUID(), "Nova proposta recebida", `${input.anonymous ? "Uma pessoa estudante" : input.author} publicou uma ideia para o recreio.`,
    ]);
  });
  return (await getProposal(id))!;
}

export async function getProposal(id: string, revealAnonymousIdentity = false) {
  const rows = await query<ProposalRow>(`${proposalSelect} WHERE p.id = $1`, [id]);
  return rows[0] ? mapProposal(rows[0], revealAnonymousIdentity) : undefined;
}

export async function getProposalSupporters(proposalId: string, revealAnonymousIdentity = false) {
  const rows = await query<QueryResultRow & { id: string; username: string; class_name: string; anonymous: boolean }>(
    `SELECT u.id, u.username, u.class_name, p.anonymous
     FROM proposal_supports ps
     JOIN users u ON u.id = ps.user_id
     JOIN proposals p ON p.id = ps.proposal_id
     WHERE ps.proposal_id = $1 ORDER BY ps.created_at`,
    [proposalId],
  );
  if (rows[0]?.anonymous && !revealAnonymousIdentity) return [];
  return rows.map((row) => ({ id: row.id, name: row.username, turma: row.class_name }));
}

export async function addComment(proposalId: string, input: {
  author: string; authorId: string; role: UserRole; anonymous: boolean; body: string; parentId?: string;
}) {
  const id = randomUUID();
  await transaction(async (tx) => {
    const exists = await tx<{ exists: boolean }>("SELECT EXISTS (SELECT 1 FROM proposals WHERE id = $1) AS exists", [proposalId]);
    if (!exists[0]?.exists) throw new Error("PROPOSAL_NOT_FOUND");
    await tx(
      `INSERT INTO comments (id, proposal_id, author_id, author_name, author_role, anonymous, body, parent_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, proposalId, input.authorId, input.author, input.role, input.anonymous, input.body, input.parentId ?? null],
    );
    await tx("UPDATE proposals SET updated_at = now() WHERE id = $1", [proposalId]);
    await tx("INSERT INTO notifications (id, title, body) VALUES ($1, $2, $3)", [
      randomUUID(), "Nova interação na comunidade", `${input.anonymous ? "Uma pessoa estudante" : input.author} comentou uma proposta.`,
    ]);
  });
  const rows = await query<CommentRow>(
    "SELECT c.*, (SELECT count(*)::int FROM comment_likes cl WHERE cl.comment_id = c.id) AS likes FROM comments c WHERE c.id = $1",
    [id],
  );
  return rows[0] ? mapComment(rows[0]) : null;
}

async function setRelationIntent(
  tx: TransactionQuery,
  table: "proposal_supports" | "proposal_saves",
  proposalId: string,
  userId: string,
  enabled: boolean,
) {
  if (enabled) {
    await tx(`INSERT INTO ${table} (proposal_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [proposalId, userId]);
  } else {
    await tx(`DELETE FROM ${table} WHERE proposal_id = $1 AND user_id = $2`, [proposalId, userId]);
  }
}

async function acceptInteractionRevision(
  tx: TransactionQuery,
  action: "support" | "save" | "comment_like",
  resourceId: string,
  userId: string,
  revision?: number,
) {
  if (revision === undefined) return true;
  const rows = await tx<{ revision: number }>(
    `INSERT INTO interaction_revisions (user_id, action, resource_id, revision)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, action, resource_id) DO UPDATE
       SET revision = EXCLUDED.revision, updated_at = now()
       WHERE interaction_revisions.revision < EXCLUDED.revision
     RETURNING revision`,
    [userId, action, resourceId, revision],
  );
  return Boolean(rows[0]);
}

export async function setSupport(proposalId: string, userId: string, supported: boolean, revision?: number) {
  return transaction(async (tx) => {
    if (await acceptInteractionRevision(tx, "support", proposalId, userId, revision)) {
      await setRelationIntent(tx, "proposal_supports", proposalId, userId, supported);
    }
    const rows = await tx<{ supports: number | string }>("SELECT count(*)::int AS supports FROM proposal_supports WHERE proposal_id = $1", [proposalId]);
    const current = await tx<{ supported: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM proposal_supports WHERE proposal_id = $1 AND user_id = $2) AS supported",
      [proposalId, userId],
    );
    return { supported: Boolean(current[0]?.supported), supports: Number(rows[0]?.supports ?? 0) };
  });
}

export async function setSaved(proposalId: string, userId: string, saved: boolean, revision?: number) {
  return transaction(async (tx) => {
    if (await acceptInteractionRevision(tx, "save", proposalId, userId, revision)) {
      await setRelationIntent(tx, "proposal_saves", proposalId, userId, saved);
    }
    const current = await tx<{ saved: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM proposal_saves WHERE proposal_id = $1 AND user_id = $2) AS saved",
      [proposalId, userId],
    );
    return { saved: Boolean(current[0]?.saved) };
  });
}

export async function setCommentLike(commentId: string, userId: string, liked: boolean, revision?: number) {
  return transaction(async (tx) => {
    if (await acceptInteractionRevision(tx, "comment_like", commentId, userId, revision)) {
      if (liked) await tx("INSERT INTO comment_likes (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [commentId, userId]);
      else await tx("DELETE FROM comment_likes WHERE comment_id = $1 AND user_id = $2", [commentId, userId]);
    }
    const rows = await tx<{ likes: number | string }>("SELECT count(*)::int AS likes FROM comment_likes WHERE comment_id = $1", [commentId]);
    const current = await tx<{ liked: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM comment_likes WHERE comment_id = $1 AND user_id = $2) AS liked",
      [commentId, userId],
    );
    return { liked: Boolean(current[0]?.liked), likes: Number(rows[0]?.likes ?? 0) };
  });
}

export async function updateProposalStatus(proposalId: string, status: ProposalStatus, gefResponse?: string) {
  const updated = await transaction(async (tx) => {
    const rows = await tx<{ id: string; title: string }>(
      `UPDATE proposals
       SET status = $2,
           gef_response = CASE WHEN $3::text IS NULL OR btrim($3) = '' THEN gef_response ELSE btrim($3) END,
           gef_response_at = CASE WHEN $3::text IS NULL OR btrim($3) = '' THEN gef_response_at ELSE now() END,
           updated_at = now()
       WHERE id = $1
       RETURNING id, title`,
      [proposalId, status, gefResponse ?? null],
    );
    if (!rows[0]) return false;
    await tx("INSERT INTO notifications (id, title, body) VALUES ($1, $2, $3)", [
      randomUUID(),
      "Atualização de proposta",
      `A proposta "${rows[0].title.slice(0, 30)}..." agora está: ${status}.`,
    ]);
    return true;
  });
  return updated ? getProposal(proposalId) : null;
}

export async function updateProposalGefResponse(proposalId: string, gefResponse: string) {
  const updated = await transaction(async (tx) => {
    const rows = await tx<{ id: string; title: string }>(
      `UPDATE proposals SET gef_response = btrim($2), gef_response_at = now(), updated_at = now()
       WHERE id = $1 RETURNING id, title`,
      [proposalId, gefResponse],
    );
    if (!rows[0]) return false;
    await tx("INSERT INTO notifications (id, title, body) VALUES ($1, $2, $3)", [
      randomUUID(), "Resposta oficial do GEF", `O GEF respondeu a proposta "${rows[0].title.slice(0, 30)}...".`,
    ]);
    return true;
  });
  return updated ? getProposal(proposalId) : null;
}

export async function getActivity(activityId: string) {
  const rows = await query<ActivityRow>(
    "SELECT id, proposal_id, title, activity_date, time_label, place, audience, status FROM activities WHERE id = $1",
    [activityId],
  );
  return rows[0] ? mapActivity(rows[0]) : null;
}

export async function getActivities() {
  const rows = await query<ActivityRow>(
    "SELECT id, proposal_id, title, activity_date, time_label, place, audience, status FROM activities ORDER BY activity_date",
  );
  return rows.map(mapActivity);
}

export async function getComments(proposalId: string, revealAnonymousIdentity = false) {
  const rows = await query<CommentRow>(
    `SELECT c.*, (SELECT count(*)::int FROM comment_likes cl WHERE cl.comment_id = c.id) AS likes
     FROM comments c WHERE c.proposal_id = $1 ORDER BY c.created_at`,
    [proposalId],
  );
  return rows.map((row) => mapComment(row, revealAnonymousIdentity));
}

export async function getComment(commentId: string) {
  const rows = await query<CommentRow>(
    `SELECT c.*, (SELECT count(*)::int FROM comment_likes cl WHERE cl.comment_id = c.id) AS likes
     FROM comments c WHERE c.id = $1`,
    [commentId],
  );
  return rows[0] ? mapComment(rows[0]) : null;
}

export async function getNotifications(userId: string) {
  const rows = await query<NotificationRow>(
    `SELECT n.id, n.title, n.body, n.activity_id, n.created_at,
       EXISTS (SELECT 1 FROM notification_reads nr WHERE nr.notification_id = n.id AND nr.user_id = $1) AS read
     FROM notifications n ORDER BY n.created_at DESC`,
    [userId],
  );
  return rows.map((row) => ({
    id: row.id, title: row.title, body: row.body, createdAt: timeLabel(row.created_at) ?? "", read: row.read,
    ...(row.activity_id ? { activityId: row.activity_id } : {}),
  }));
}

export async function createActivity(input: {
  proposalId: string; title: string; date: string; time: string; place: string; audience: string;
}) {
  const id = randomUUID();
  const created = await transaction(async (tx) => {
    const inserted = await tx<{ id: string }>(
      `INSERT INTO activities (id, proposal_id, title, activity_date, time_label, place, audience)
       SELECT $1, p.id, $3, $4::date, $5, $6, $7 FROM proposals p WHERE p.id = $2
       RETURNING id`,
      [id, input.proposalId, input.title, input.date, input.time, input.place, input.audience],
    );
    if (!inserted[0]) return false;
    await tx("UPDATE proposals SET status = 'scheduled', updated_at = now() WHERE id = $1", [input.proposalId]);
    await tx("INSERT INTO notifications (id, title, body, activity_id) VALUES ($1, $2, $3, $4)", [
      randomUUID(), "Nova atividade na agenda", `${input.title} foi adicionada à agenda do recreio.`, id,
    ]);
    return true;
  });
  return created ? getActivity(id) : null;
}

export async function updateActivityStatus(activityId: string, status: ActivityStatus) {
  const updated = await transaction(async (tx) => {
    const rows = await tx<{ proposal_id: string }>(
      "UPDATE activities SET status = $2, updated_at = now() WHERE id = $1 RETURNING proposal_id",
      [activityId, status],
    );
    if (!rows[0]) return false;
    if (status === "done") {
      await tx("UPDATE proposals SET status = 'completed', updated_at = now() WHERE id = $1", [rows[0].proposal_id]);
    }
    return true;
  });
  return updated ? getActivity(activityId) : null;
}

export async function submitActivityFeedback(activityId: string, feedback: {
  userId: string; participated: boolean; reasonNotParticipated?: string; rating?: ActivityFeedbackRating; comment?: string;
}) {
  const id = randomUUID();
  const rows = await query<FeedbackRow>(
    `INSERT INTO activity_feedbacks
       (id, activity_id, user_id, participated, reason_not_participated, rating, comment)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (activity_id, user_id) DO UPDATE SET
       participated = EXCLUDED.participated,
       reason_not_participated = EXCLUDED.reason_not_participated,
       rating = EXCLUDED.rating,
       comment = EXCLUDED.comment,
       updated_at = now()
     RETURNING *,
       (SELECT username FROM users WHERE id = user_id) AS username,
       (SELECT class_name FROM users WHERE id = user_id) AS class_name`,
    [id, activityId, feedback.userId, feedback.participated, feedback.reasonNotParticipated ?? null, feedback.rating ?? null, feedback.comment ?? null],
  );
  return rows[0] ? mapFeedback(rows[0]) : null;
}

export async function getActivityFeedbacks(activityId: string) {
  const rows = await query<FeedbackRow>(
    `SELECT f.*, u.username, u.class_name FROM activity_feedbacks f
     JOIN users u ON u.id = f.user_id WHERE f.activity_id = $1 ORDER BY f.created_at`,
    [activityId],
  );
  return rows.map(mapFeedback);
}

function mapQuestion(row: ChapaQuestionRow): ChapaQuestionRecord {
  return {
    id: row.id, chapaId: row.chapa_id, proposalArea: row.proposal_area, question: row.question,
    author: row.author_name, authorId: row.author_id ?? "", turma: row.class_name, answered: Boolean(row.answer),
    createdAt: timeLabel(row.created_at) ?? "",
    ...(row.proposal_title ? { proposalTitle: row.proposal_title } : {}),
    ...(row.answer ? { answer: row.answer } : {}),
    ...(row.answered_by ? { answeredBy: row.answered_by } : {}),
    ...(row.answered_at ? { answeredAt: timeLabel(row.answered_at) } : {}),
  };
}

export async function createChapaQuestion(input: {
  chapaId: string; proposalArea: string; proposalTitle?: string; question: string;
  author: string; authorId: string; turma: string;
}) {
  const id = randomUUID();
  const rows = await query<ChapaQuestionRow>(
    `INSERT INTO chapa_questions
       (id, chapa_id, proposal_area, proposal_title, question, author_id, author_name, class_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [id, input.chapaId, input.proposalArea, input.proposalTitle ?? null, input.question, input.authorId, input.author, input.turma],
  );
  return mapQuestion(rows[0]);
}

export async function answerChapaQuestion(questionId: string, answer: string, answeredBy: string) {
  const rows = await query<ChapaQuestionRow>(
    `UPDATE chapa_questions SET answer = btrim($2), answered_by = btrim($3), answered_at = now()
     WHERE id = $1 RETURNING *`,
    [questionId, answer, answeredBy],
  );
  return rows[0] ? mapQuestion(rows[0]) : null;
}

export async function getChapaQuestions(chapaId?: string, area?: string) {
  const rows = await query<ChapaQuestionRow>(
    `SELECT * FROM chapa_questions
     WHERE ($1::text IS NULL OR chapa_id = $1)
       AND ($2::text IS NULL OR proposal_area = $2)
     ORDER BY created_at DESC`,
    [chapaId ?? null, area ?? null],
  );
  return rows.map(mapQuestion);
}

export async function markAllNotificationsRead(userId: string) {
  await query(
    `INSERT INTO notification_reads (notification_id, user_id)
     SELECT id, $1 FROM notifications ON CONFLICT DO NOTHING`,
    [userId],
  );
}

type ImportCounts = { proposals: number; comments: number; activities: number; chapaQuestions: number };

function stableUuid(value: string) {
  const bytes = createHash("sha256").update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function importLegacyData(importedBy: string, payload: LegacyImportPayload) {
  const migrationKey = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return transaction(async (tx) => {
    const claimed = await tx<{ migration_key: string }>(
      `INSERT INTO legacy_imports (migration_key, imported_by) VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING migration_key`,
      [migrationKey, importedBy],
    );
    if (!claimed[0]) {
      return { migrationKey, alreadyImported: true, imported: { proposals: 0, comments: 0, activities: 0, chapaQuestions: 0 } satisfies ImportCounts };
    }

    const counts: ImportCounts = { proposals: 0, comments: 0, activities: 0, chapaQuestions: 0 };
    const proposalIds = new Map<string, string>();
    for (const proposal of payload.proposals) {
      const id = stableUuid(`legacy:proposal:${proposal.id}:${proposal.title}:${proposal.body}`);
      proposalIds.set(proposal.id, id);
      const rows = await tx<{ id: string }>(
        `INSERT INTO proposals
          (id, title, body, author_name, anonymous, theme, status, origin, gef_response, gef_response_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $9::text IS NULL THEN NULL ELSE now() END)
         ON CONFLICT DO NOTHING RETURNING id`,
        [id, proposal.title, proposal.body, proposal.author, proposal.anonymous, proposal.theme, proposal.status, proposal.origin, proposal.gefResponse ?? null],
      );
      if (rows[0]) counts.proposals += 1;
      await tx(
        "INSERT INTO legacy_entities (fingerprint, migration_key, entity_type, entity_id) VALUES ($1, $2, 'proposal', $3) ON CONFLICT DO NOTHING",
        [createHash("sha256").update(`proposal:${proposal.id}`).digest("hex"), migrationKey, id],
      );
    }

    const commentIds = new Map<string, string>();
    for (const comment of payload.comments) {
      const proposalId = proposalIds.get(comment.proposalId);
      if (!proposalId) continue;
      const id = stableUuid(`legacy:comment:${comment.id}:${comment.body}`);
      commentIds.set(comment.id, id);
      const rows = await tx<{ id: string }>(
        `INSERT INTO comments (id, proposal_id, author_name, author_role, anonymous, body)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING RETURNING id`,
        [id, proposalId, comment.author, comment.role, comment.anonymous, comment.body],
      );
      if (rows[0]) counts.comments += 1;
    }
    for (const comment of payload.comments) {
      if (!comment.parentId) continue;
      const id = commentIds.get(comment.id);
      const parentId = commentIds.get(comment.parentId);
      if (id && parentId) await tx("UPDATE comments SET parent_id = $2 WHERE id = $1", [id, parentId]);
    }

    for (const activity of payload.activities) {
      const proposalId = proposalIds.get(activity.proposalId);
      if (!proposalId) continue;
      const id = stableUuid(`legacy:activity:${activity.id}:${activity.title}`);
      const rows = await tx<{ id: string }>(
        `INSERT INTO activities (id, proposal_id, title, activity_date, time_label, place, audience, status)
         VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8) ON CONFLICT DO NOTHING RETURNING id`,
        [id, proposalId, activity.title, activity.date, activity.time, activity.place, activity.audience, activity.status],
      );
      if (rows[0]) counts.activities += 1;
    }

    for (const question of payload.chapaQuestions) {
      const id = stableUuid(`legacy:question:${question.id}:${question.question}`);
      const rows = await tx<{ id: string }>(
        `INSERT INTO chapa_questions
          (id, chapa_id, proposal_area, proposal_title, question, author_name, class_name, answer, answered_by, answered_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $8::text IS NULL THEN NULL ELSE now() END)
         ON CONFLICT DO NOTHING RETURNING id`,
        [id, question.chapaId, question.proposalArea, question.proposalTitle ?? null, question.question, question.author, question.turma, question.answer ?? null, question.answeredBy ?? null],
      );
      if (rows[0]) counts.chapaQuestions += 1;
    }

    await tx("UPDATE legacy_imports SET result = $2::jsonb WHERE migration_key = $1", [migrationKey, JSON.stringify(counts)]);
    return { migrationKey, alreadyImported: false, imported: counts };
  });
}
