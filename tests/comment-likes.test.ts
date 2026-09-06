import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

test("comment likes toggle independently for each user", async () => {
  const storeModule = await import("../src/lib/platform-store.ts");
  const toggleCommentLike = (storeModule as typeof storeModule & { toggleCommentLike?: (commentId: string, userId: string) => { liked: boolean; likes: number } | null }).toggleCommentLike;

  assert.equal(typeof toggleCommentLike, "function", "The platform store should expose comment like toggling.");
  if (!toggleCommentLike) return;

  let comment = storeModule.getPlatformStore().comments[0];
  if (!comment) {
    const prop = storeModule.createProposal({
      title: "Proposta para teste de curtidas",
      body: "Corpo do teste de curtidas",
      author: "Admin",
      authorId: "admin",
      anonymous: false,
      theme: "Outros",
      origin: "gef",
    });
    comment = storeModule.addComment(prop.id, {
      author: "Aluno Teste",
      authorId: "aluno_teste",
      role: "student",
      anonymous: false,
      body: "Comentário de teste",
    })!;
  }
  const initialLikes = comment.likes ?? 0;
  const testUserId = randomUUID();
  const liked = toggleCommentLike(comment.id, testUserId);
  assert.deepEqual(liked, { liked: true, likes: initialLikes + 1 });

  const unliked = toggleCommentLike(comment.id, testUserId);
  assert.deepEqual(unliked, { liked: false, likes: initialLikes });
});
