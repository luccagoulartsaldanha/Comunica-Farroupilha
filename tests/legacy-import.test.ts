import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { Pool } from "@neondatabase/serverless";

try { process.loadEnvFile(path.join(process.cwd(), ".env.local")); } catch {}

test("legacy sanitizer removes credentials and bounds imported domain data", async () => {
  assert.equal(existsSync("src/lib/legacy-import.ts"), true, "legacy sanitizer must exist");
  const { sanitizeLegacyImport, previewLegacyState } = await import("../src/lib/legacy-import.ts");
  const raw = {
    user: { id: "private-user" },
    accounts: [{ name: "aluno", password: "senha-em-texto" }],
    sessions: [{ token: "raw-token" }],
    proposals: Array.from({ length: 520 }, (_, index) => ({
      id: `proposal-${index}`,
      title: `[legacy-test] Proposta ${index}`,
      body: "Descrição válida com mais de vinte caracteres para importação.",
      author: "Pessoa estudante",
      anonymous: false,
      theme: "Convivência",
      status: "received",
      origin: "student",
    })),
    comments: [{ id: "comment-1", proposalId: "proposal-0", author: "Ana", role: "student", anonymous: false, body: "Comentário legado" }],
    activities: [],
    chapaQuestions: [],
  };

  const payload = sanitizeLegacyImport(raw);
  assert.equal(payload.proposals.length, 500);
  assert.equal(payload.comments.length, 1);
  assert.equal(JSON.stringify(payload).includes("senha-em-texto"), false);
  assert.equal(JSON.stringify(payload).includes("raw-token"), false);
  assert.equal(JSON.stringify(payload).includes("private-user"), false);
  assert.deepEqual(previewLegacyState(raw), { proposals: 500, comments: 1, activities: 0, chapaQuestions: 0 });
});

test("legacy import is transactional and idempotent", async () => {
  const { sanitizeLegacyImport } = await import("../src/lib/legacy-import.ts");
  const { importLegacyData, getPlatformSnapshot } = await import("../src/lib/platform-repository.ts");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const userId = randomUUID();
  const marker = randomUUID();
  await pool.query(
    "INSERT INTO users (id, username, username_normalized, class_name, role, password_hash) VALUES ($1, $2, $3, 'GEF', 'gef', 'test-hash')",
    [userId, `GEF ${marker}`, `gef-${marker}`],
  );
  const payload = sanitizeLegacyImport({
    proposals: [{
      id: `legacy-proposal-${marker}`,
      title: `[legacy-test-${marker}] Proposta preservada`,
      body: "Descrição persistente importada do navegador com segurança.",
      author: "Estudante legado",
      anonymous: false,
      theme: "Convivência",
      status: "analysis",
      origin: "student",
    }],
    comments: [{
      id: `legacy-comment-${marker}`,
      proposalId: `legacy-proposal-${marker}`,
      author: "Estudante legado",
      role: "student",
      anonymous: false,
      body: "Comentário preservado.",
    }],
    activities: [{
      id: `legacy-activity-${marker}`,
      proposalId: `legacy-proposal-${marker}`,
      title: `[legacy-test-${marker}] Atividade`,
      date: "2026-10-20",
      time: "10:15–10:35",
      place: "Pátio central",
      audience: "Todas as turmas",
      status: "upcoming",
    }],
    chapaQuestions: [{
      id: `legacy-question-${marker}`,
      chapaId: "chapa-1",
      proposalArea: "Participação",
      question: `[legacy-test-${marker}] Como participar?`,
      author: "Estudante legado",
      turma: "2º EM",
      createdAt: "Agora",
    }],
  });

  try {
    const first = await importLegacyData(userId, payload);
    assert.deepEqual(first.imported, { proposals: 1, comments: 1, activities: 1, chapaQuestions: 1 });
    assert.equal(first.alreadyImported, false);
    const second = await importLegacyData(userId, payload);
    assert.deepEqual(second.imported, { proposals: 0, comments: 0, activities: 0, chapaQuestions: 0 });
    assert.equal(second.alreadyImported, true);
    const snapshot = await getPlatformSnapshot(userId);
    assert.equal(snapshot.proposals.filter((proposal) => proposal.title.includes(marker)).length, 1);
  } finally {
    await pool.query("DELETE FROM proposals WHERE title LIKE $1", [`%${marker}%`]);
    await pool.query("DELETE FROM chapa_questions WHERE question LIKE $1", [`%${marker}%`]);
    await pool.query("DELETE FROM legacy_imports WHERE imported_by = $1", [userId]);
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    await pool.end();
  }
});

test("legacy import endpoint requires a GEF session and sanitizes again on the server", () => {
  const routePath = "src/app/api/admin/legacy-import/route.ts";
  assert.equal(existsSync(routePath), true, "GEF import endpoint must exist");
  const source = readFileSync(routePath, "utf8");
  assert.match(source, /await getSessionUser\(\)/);
  assert.match(source, /user\.role !== ["']gef["']/);
  assert.match(source, /sanitizeLegacyImport\(body\)/);
  assert.match(source, /await importLegacyData\(user\.id, payload\)/);
});

test("GEF interface previews legacy data and imports only after an explicit action", () => {
  const source = readFileSync("src/components/gefshell.tsx", "utf8");
  assert.match(source, /comunica-farroupilha-demo/);
  assert.match(source, /gremio-comunica-demo/);
  assert.match(source, /previewLegacyState/);
  assert.match(source, /Importar dados antigos/);
  assert.match(source, /onClick=\{importLegacyData\}/);
});
