import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import { Pool } from "@neondatabase/serverless";

try {
  process.loadEnvFile(path.join(process.cwd(), ".env.local"));
} catch {}

const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, "DATABASE_URL must be available for repository integration tests");
const pool = new Pool({ connectionString: databaseUrl });

const userId = randomUUID();
const otherUserId = randomUUID();
const proposalIds: string[] = [];
const questionIds: string[] = [];
const lifecycleUserIds: string[] = [];

after(async () => {
  for (const proposalId of proposalIds) {
    await pool.query("DELETE FROM proposals WHERE id = $1", [proposalId]);
  }
  for (const questionId of questionIds) {
    await pool.query("DELETE FROM chapa_questions WHERE id = $1", [questionId]);
  }
  await pool.query("DELETE FROM notifications WHERE body LIKE '%[teste-repositorio]%' OR title LIKE '%[teste-repositorio]%'");
  await pool.query("DELETE FROM notifications WHERE body LIKE $1", [`%${userId}%`]);
  for (const lifecycleUserId of lifecycleUserIds) {
    await pool.query("DELETE FROM notifications WHERE body LIKE $1", [`%${lifecycleUserId}%`]);
  }
  await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [[userId, otherUserId]]);
  await pool.end();
});

test("repository persists the complete proposal and activity lifecycle", async () => {
  const repository = await import("../src/lib/platform-repository.ts");
  const studentId = randomUUID();
  const gefId = randomUUID();
  lifecycleUserIds.push(studentId, gefId);
  await pool.query(
    `INSERT INTO users (id, username, username_normalized, class_name, role, password_hash)
     VALUES ($1, $2, $3, '1º EM A', 'student', 'test-hash'),
            ($4, $5, $6, 'GEF', 'gef', 'test-hash')`,
    [studentId, `Estudante ${studentId}`, `estudante-${studentId}`, gefId, `GEF ${gefId}`, `gef-${gefId}`],
  );

  try {
    const proposal = await repository.createProposal({
      title: "[teste-repositorio] Ciclo completo",
      body: "Uma proposta persistente para validar status, resposta, atividade e avaliação no banco.",
      author: `Estudante ${studentId}`,
      authorId: studentId,
      anonymous: false,
      theme: "Esportes",
      origin: "student",
    });
    proposalIds.push(proposal.id);

    const withStatus = await repository.updateProposalStatus(proposal.id, "analysis", "[teste-repositorio] Em avaliação.");
    assert.equal(withStatus?.status, "analysis");
    assert.equal(withStatus?.gefResponse, "[teste-repositorio] Em avaliação.");

    const withResponse = await repository.updateProposalGefResponse(proposal.id, "[teste-repositorio] Aprovada para piloto.");
    assert.equal(withResponse?.gefResponse, "[teste-repositorio] Aprovada para piloto.");

    const activity = await repository.createActivity({
      proposalId: proposal.id,
      title: "[teste-repositorio] Recreio piloto",
      date: "2026-10-01",
      time: "10:15–10:35",
      place: "Pátio central",
      audience: "Todas as turmas",
    });
    assert.ok(activity);
    assert.equal(activity.status, "upcoming");
    assert.equal((await repository.getProposal(proposal.id))?.status, "scheduled");

    assert.equal((await repository.updateActivityStatus(activity.id, "done"))?.status, "done");
    assert.equal((await repository.getProposal(proposal.id))?.status, "completed");

    const feedback = await repository.submitActivityFeedback(activity.id, {
      userId: studentId,
      participated: true,
      rating: "great",
      comment: "[teste-repositorio] Funcionou muito bem.",
    });
    assert.ok(feedback);
    assert.equal((await repository.getActivityFeedbacks(activity.id)).length, 1);

    const question = await repository.createChapaQuestion({
      chapaId: "chapa-1",
      author: `Estudante ${studentId}`,
      authorId: studentId,
      turma: "1º EM A",
      proposalArea: "Esportes e movimento",
      proposalTitle: "Circuito de jogos rápidos",
      question: "[teste-repositorio] Quando começa o circuito?",
    });
    questionIds.push(question.id);
    assert.equal(question.answered, false);
    assert.equal((await repository.answerChapaQuestion(question.id, "[teste-repositorio] Em outubro.", `GEF ${gefId}`))?.answered, true);
    assert.ok((await repository.getChapaQuestions("chapa-1")).some((item) => item.id === question.id));

    await repository.markAllNotificationsRead(studentId);
    const snapshot = await repository.getPlatformSnapshot(studentId);
    assert.ok(snapshot.notifications.length > 0);
    assert.ok(snapshot.notifications.every((notification) => notification.read));
  } finally {
    await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [[studentId, gefId]]);
  }
});

test("repository persists explicit interaction intent across concurrent requests", async () => {
  assert.equal(existsSync("src/lib/platform-repository.ts"), true, "relational repository must exist");
  const repository = await import("../src/lib/platform-repository.ts");

  await pool.query(
    `INSERT INTO users (id, username, username_normalized, class_name, role, password_hash)
     VALUES ($1, $2, $3, '3º EM A', 'student', 'test-hash'),
            ($4, $5, $6, '2º EM B', 'student', 'test-hash')`,
    [userId, `Aluno ${userId}`, `aluno-${userId}`, otherUserId, `Aluno ${otherUserId}`, `aluno-${otherUserId}`],
  );

  const proposal = await repository.createProposal({
    title: "Persistência concorrente no recreio",
    body: "Esta proposta existe para validar a persistência real entre requisições concorrentes.",
    author: `Aluno ${userId}`,
    authorId: userId,
    anonymous: false,
    theme: "Convivência",
    origin: "student",
  });
  proposalIds.push(proposal.id);

  await Promise.all(Array.from({ length: 8 }, () => repository.setSupport(proposal.id, userId, true)));
  assert.deepEqual(await repository.setSupport(proposal.id, userId, true), { supported: true, supports: 1 });

  await Promise.all(Array.from({ length: 8 }, () => repository.setSaved(proposal.id, userId, true)));
  assert.deepEqual(await repository.setSaved(proposal.id, userId, true), { saved: true });

  const comment = await repository.addComment(proposal.id, {
    author: `Aluno ${userId}`,
    authorId: userId,
    role: "student",
    anonymous: false,
    body: "Comentário persistente para testar curtidas.",
  });
  assert.ok(comment);
  await Promise.all(Array.from({ length: 8 }, () => repository.setCommentLike(comment.id, userId, true)));
  assert.deepEqual(await repository.setCommentLike(comment.id, userId, true), { liked: true, likes: 1 });

  const snapshot = await repository.getPlatformSnapshot(userId);
  assert.ok(snapshot.proposals.some((item) => item.id === proposal.id));
  assert.deepEqual(snapshot.supportedByUser[userId], [proposal.id]);
  assert.deepEqual(snapshot.savedByUser[userId], [proposal.id]);
  assert.deepEqual(snapshot.likedCommentsByUser[userId], [comment.id]);

  const otherSnapshot = await repository.getPlatformSnapshot(otherUserId);
  assert.deepEqual(otherSnapshot.supportedByUser[otherUserId], []);
  assert.deepEqual(otherSnapshot.savedByUser[otherUserId], []);
  assert.deepEqual(otherSnapshot.likedCommentsByUser[otherUserId], []);
});
