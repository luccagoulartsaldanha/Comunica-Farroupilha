import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";

test("platform loading rejects an unavailable snapshot instead of returning an empty feed", async () => {
  assert.equal(existsSync("src/lib/client-platform-state.ts"), true, "client state module must exist");
  const { loadPlatform } = await import("../src/lib/client-platform-state.ts");
  const fetcher = async (input: string | URL | Request) => {
    const url = String(input);
    return url.endsWith("/api/auth/me")
      ? Response.json({ user: null })
      : Response.json({ error: "indisponível" }, { status: 503 });
  };

  await assert.rejects(() => loadPlatform(new AbortController().signal, fetcher), /indisponível/i);
});

test("only the newest optimistic interaction response can change state", async () => {
  const stateModule = await import("../src/lib/client-platform-state.ts");
  const revisions = new Map<string, number>();
  const first = stateModule.beginInteraction(revisions, "support:proposal-1");
  const second = stateModule.beginInteraction(revisions, "support:proposal-1");

  assert.equal(first, 1);
  assert.equal(second, 2);
  assert.equal(stateModule.isLatestInteraction(revisions, "support:proposal-1", first), false);
  assert.equal(stateModule.isLatestInteraction(revisions, "support:proposal-1", second), true);
});

test("optimistic support, save, and like reducers keep user state internally consistent", async () => {
  const { applySupportState, applySavedState, applyCommentLikeState } = await import("../src/lib/client-platform-state.ts");
  const user = { id: "user-1", name: "Ana", turma: "2º EM", role: "student" as const };
  const initial = {
    proposals: [{ id: "proposal-1", supports: 0 }],
    comments: [{ id: "comment-1", likes: 0 }],
    supporters: {},
    supportedByUser: {},
    savedByUser: {},
    likedCommentsByUser: {},
  };

  const supported = applySupportState(initial, user, "proposal-1", true, 1);
  assert.deepEqual(supported.supportedByUser[user.id], ["proposal-1"]);
  assert.equal(supported.proposals[0].supports, 1);
  assert.equal(supported.supporters["proposal-1"][0].id, user.id);

  const saved = applySavedState(supported, user.id, "proposal-1", true);
  assert.deepEqual(saved.savedByUser[user.id], ["proposal-1"]);

  const liked = applyCommentLikeState(saved, user.id, "comment-1", true, 1);
  assert.deepEqual(liked.likedCommentsByUser[user.id], ["comment-1"]);
  assert.equal(liked.comments[0].likes, 1);
});

test("local persistence serializes UI preferences only", async () => {
  const { serializeUiPreferences } = await import("../src/lib/client-platform-state.ts");
  const serialized = serializeUiPreferences({
    view: "saved",
    query: "xadrez",
    themeFilter: "Esportes",
    statusFilter: "analysis",
    sort: "supports",
    proposals: [{ id: "secret-domain-data" }],
    accounts: [{ password: "não-pode-vazar" }],
    user: { id: "private-user" },
  });
  const parsed = JSON.parse(serialized);

  assert.deepEqual(Object.keys(parsed).sort(), ["query", "sort", "statusFilter", "themeFilter", "view"]);
  assert.equal(serialized.includes("secret-domain-data"), false);
  assert.equal(serialized.includes("não-pode-vazar"), false);
  assert.equal(serialized.includes("private-user"), false);
});
