# Production Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the browser/file-backed demo state with a durable Neon Postgres source of truth so proposals, support, and saved state remain correct across refreshes and Vercel instances.

**Architecture:** A server-only relational data access layer owns all persisted entities and authentication. Existing Route Handler URLs remain stable, while the client hydrates through one coordinated snapshot request and keeps only non-sensitive UI preferences locally. A GEF-only idempotent import endpoint preserves legacy browser proposals without importing passwords or sessions.

**Tech Stack:** Next.js 16.3.4 App Router, React 19.2.8, TypeScript 5.9, Neon Serverless Postgres, Node `scrypt`, Node test runner, Vercel Marketplace/CLI.

**Spec:** `docs/superpowers/specs/2026-09-06-production-persistence-design.md`

## Global Constraints

- Work only on branch `codex/codebase-review` in the isolated worktree.
- Use the Vercel project `lgs10/comunica-farroupilha`; do not deploy manually.
- Connect Neon to `production`, `preview`, and `development` through the Vercel Marketplace.
- Keep all database access and `DATABASE_URL` reads in `server-only` modules.
- Preserve the current Route Handler URLs and `{ data }` / `{ error }` response envelopes.
- Never persist domain data, password material, or sessions in `localStorage`.
- Never commit `.env` files or database credentials.
- Use explicit support/save intent and database uniqueness constraints for idempotency.
- Run the installed Next.js 16 documentation checks before changing framework APIs.

---

### Task 1: Link Vercel, provision Neon, and establish the schema

**Files:**
- Create: `db/migrations/0001_initial.sql`
- Create: `scripts/migrate.mjs`
- Create: `src/lib/db.ts`
- Create: `tests/database-schema.test.ts`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: Vercel project `comunica-farroupilha` and Marketplace integration slug `neon`.
- Produces: `query<T>(text: string, params?: unknown[]): Promise<T[]>`, `transaction<T>(callback: (tx: TransactionQuery) => Promise<T>): Promise<T>`, `pnpm db:migrate`, and the relational tables defined in the spec.

- [ ] **Step 1: Link only the isolated worktree to the existing Vercel project**

Run:

```powershell
vercel link --yes --project comunica-farroupilha --scope lgs10
```

Expected: `.vercel/project.json` names project ID `prj_H3vlIMV7KuTyyp3m0vpVgAtU1QIr`; `.vercel` remains ignored.

- [ ] **Step 2: Provision and connect a Neon resource**

Run:

```powershell
vercel integration add neon --name comunica-farroupilha-db --environment production --environment preview --environment development --scope lgs10
```

Expected: a resource is connected to `comunica-farroupilha` and the CLI pulls environment values locally. If Marketplace terms require a browser approval, complete that approval and resume the same command/session.

- [ ] **Step 3: Add the driver and test script**

Run:

```powershell
pnpm add @neondatabase/serverless server-only
```

Modify `package.json` so `test` runs `tests/*.test.ts` and add:

```json
"db:migrate": "node scripts/migrate.mjs"
```

- [ ] **Step 4: Write the failing schema contract test**

Create `tests/database-schema.test.ts` to read `0001_initial.sql` and assert it contains all tables, foreign keys, unique keys for `(proposal_id, user_id)`, `(comment_id, user_id)`, `(activity_id, user_id)`, and no plaintext password column named `password`.

- [ ] **Step 5: Run the schema test and verify RED**

Run:

```powershell
node --experimental-strip-types --test tests/database-schema.test.ts
```

Expected: FAIL because the migration and database module do not exist yet.

- [ ] **Step 6: Implement the initial migration and database boundary**

Create UUID-based tables for users, sessions, proposals, supports, saves, comments, comment likes, activities, feedbacks, notifications, chapa questions, and legacy imports. Store `password_hash`, `token_hash`, timestamps, enums via `CHECK`, and all relation uniqueness constraints from the spec. Add transaction-safe migration tracking in `schema_migrations`.

`src/lib/db.ts` must start with `import "server-only"`, validate `DATABASE_URL`, and export only parameterized query helpers. `scripts/migrate.mjs` must execute versioned SQL files in filename order and record successful versions.

- [ ] **Step 7: Run migration and verify GREEN**

Run:

```powershell
pnpm db:migrate
node --experimental-strip-types --test tests/database-schema.test.ts
```

Expected: migration succeeds and schema contract passes.

- [ ] **Step 8: Commit**

```powershell
git add .gitignore package.json pnpm-lock.yaml db scripts/migrate.mjs src/lib/db.ts tests/database-schema.test.ts
git commit -m "feat(db): add Neon persistence foundation"
```

### Task 2: Build the relational platform repository

**Files:**
- Create: `src/lib/platform-types.ts`
- Create: `src/lib/platform-repository.ts`
- Create: `tests/platform-repository.test.ts`
- Modify: `src/lib/platform-store.ts` (remove runtime persistence implementation after consumers migrate)

**Interfaces:**
- Consumes: `query` and `transaction` from `src/lib/db.ts`.
- Produces: `getPlatformSnapshot(userId?: string): Promise<PlatformSnapshot>`, `createProposal`, `getProposal`, `getProposalSupporters`, `addComment`, `setCommentLike`, `setSupport`, `setSaved`, `updateProposalStatus`, `updateProposalGefResponse`, `createActivity`, `updateActivityStatus`, `submitActivityFeedback`, `getActivityFeedbacks`, `createChapaQuestion`, `answerChapaQuestion`, and `getChapaQuestions`, all asynchronous.

- [ ] **Step 1: Extract shared public types**

Move domain types and static chapa catalog into `platform-types.ts`. Define `PlatformSnapshot` without accounts, hashes, or sessions. Keep API-facing field names compatible with the current client.

- [ ] **Step 2: Write failing repository integration tests**

Create test-owned users and proposals with random UUIDs. Assert:

```ts
await Promise.all(Array.from({ length: 8 }, () => setSupport(proposalId, userId, true)))
assert.deepEqual(await setSupport(proposalId, userId, true), { supported: true, supports: 1 })
assert.equal((await getPlatformSnapshot(userId)).supportedByUser[userId].length, 1)
```

Repeat for save and comment-like intent; verify another user has independent state and a newly created repository request sees the proposal.

- [ ] **Step 3: Run repository tests and verify RED**

Run:

```powershell
node --experimental-strip-types --test tests/platform-repository.test.ts
```

Expected: FAIL because `platform-repository.ts` is missing.

- [ ] **Step 4: Implement query mapping and reads**

Implement row-to-domain mappers, snapshot queries, supporter lists, derived counts, and per-user support/save/like maps. Use `Promise.all` for independent snapshot queries and return empty arrays only after successful database reads.

- [ ] **Step 5: Implement transactional writes**

Use `INSERT ... ON CONFLICT DO NOTHING` for true intents and `DELETE` for false intents. Re-read canonical counts inside the operation. Create related notifications and proposal/activity status changes in the same transaction.

- [ ] **Step 6: Run repository and existing domain tests**

Run:

```powershell
node --experimental-strip-types --test tests/platform-repository.test.ts tests/platform-store.test.ts tests/comment-likes.test.ts
```

Expected: PASS; adapt old store tests to repository contracts instead of retaining a second in-memory source of truth.

- [ ] **Step 7: Commit**

```powershell
git add src/lib/platform-types.ts src/lib/platform-repository.ts src/lib/platform-store.ts tests/platform-repository.test.ts tests/platform-store.test.ts tests/comment-likes.test.ts
git commit -m "feat(db): persist platform domain in Postgres"
```

### Task 3: Harden accounts and persistent sessions

**Files:**
- Create: `src/lib/password.ts`
- Modify: `src/lib/session.ts`
- Modify: `src/lib/platform-repository.ts`
- Modify: `src/app/api/auth/login/route.ts`
- Modify: `src/app/api/auth/signup/route.ts`
- Modify: `src/app/api/auth/me/route.ts`
- Modify: `src/app/api/auth/logout/route.ts`
- Create: `scripts/seed-admin.mjs`
- Create: `tests/auth-persistence.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: users/sessions tables and database helpers.
- Produces: `hashPassword(password): Promise<string>`, `verifyPassword(password, encoded): Promise<boolean>`, persistent `startSession`, `getSessionUser`, `endSession`, and `pnpm db:seed-admin`.

- [ ] **Step 1: Write failing password/session tests**

Assert a stored hash does not contain the original password, valid verification succeeds, invalid verification fails, expired sessions are rejected, logout revokes the session, and API DTOs contain no `password_hash` or `token_hash`.

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
node --experimental-strip-types --test tests/auth-persistence.test.ts
```

Expected: FAIL because secure password functions and persistent sessions do not exist.

- [ ] **Step 3: Implement scrypt password derivation**

Use random 16-byte salt, `scrypt` with explicit parameters, an encoded versioned format, and `timingSafeEqual`. Enforce password length before hashing.

- [ ] **Step 4: Replace file/global sessions with database sessions**

Generate a random 32-byte token, store only its SHA-256 hash with expiry, and put the raw token only in the secure cookie. Remove token-embedded user metadata and all `/tmp`/`.data` session persistence.

- [ ] **Step 5: Update auth routes and admin seed**

Use normalized unique usernames, repository DTOs, and server-side validation. `scripts/seed-admin.mjs` must require `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and optional `ADMIN_CLASS`, upsert the GEF account with a fresh hash, and never log the password.

- [ ] **Step 6: Run auth tests and migration smoke checks**

Run:

```powershell
node --experimental-strip-types --test tests/auth-persistence.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/lib/password.ts src/lib/session.ts src/lib/platform-repository.ts src/app/api/auth scripts/seed-admin.mjs tests/auth-persistence.test.ts package.json
git commit -m "feat(auth): persist secure accounts and sessions"
```

### Task 4: Move every API route to the database source of truth

**Files:**
- Modify: `src/app/api/platform/route.ts`
- Modify: `src/app/api/proposals/**/route.ts`
- Modify: `src/app/api/comments/**/route.ts`
- Modify: `src/app/api/activities/**/route.ts`
- Modify: `src/app/api/notifications/route.ts`
- Modify: `src/app/api/chapas/**/route.ts`
- Modify: `src/app/api/health/route.ts`
- Create: `src/lib/http.ts`
- Create: `tests/api-contract.test.ts`

**Interfaces:**
- Consumes: async repository and persistent session functions.
- Produces: existing API routes with validation, `Cache-Control: no-store`, stable error envelopes, and a database-aware health response.

- [ ] **Step 1: Write failing API source/contract tests**

Assert all dynamic routes await repository calls, no route imports `platform-store`, mutation bodies reject wrong types/oversized strings, snapshot responses omit secrets, and the support/save routes pass explicit desired booleans.

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
node --experimental-strip-types --test tests/api-contract.test.ts
```

Expected: FAIL because routes still import the synchronous in-memory store.

- [ ] **Step 3: Add shared HTTP helpers**

Implement `dataResponse`, `errorResponse`, `readJsonObject`, string/boolean/enum validators, and a database error boundary. Always set `Cache-Control: no-store, max-age=0` and `Vary: Cookie` on session-specific responses.

- [ ] **Step 4: Convert read routes**

Await the repository in platform, proposals, comments, activities, notifications, chapas questions, and health. Return 503 for database unavailability rather than successful empty lists.

- [ ] **Step 5: Convert mutation routes**

Await secure sessions and repository mutations, preserve current role rules, validate all IDs and fields, and return 400/401/403/404/409/503 consistently.

- [ ] **Step 6: Run all API tests**

Run:

```powershell
node --experimental-strip-types --test tests/api-contract.test.ts tests/platform-repository.test.ts tests/auth-persistence.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/app/api src/lib/http.ts tests/api-contract.test.ts
git commit -m "refactor(api): use durable database repository"
```

### Task 5: Make client hydration and optimistic interactions race-safe

**Files:**
- Create: `src/lib/client-platform-state.ts`
- Modify: `src/components/gefshell.tsx`
- Modify: `src/app/globals.css`
- Create: `tests/client-platform-state.test.ts`
- Modify: `tests/ui-interactions.test.ts`

**Interfaces:**
- Consumes: `/api/auth/me`, `/api/platform`, and explicit-intent mutation responses.
- Produces: `loadPlatform(signal): Promise<{ user: User | null; snapshot: PlatformSnapshot }>`, load status `loading | ready | error`, revision-safe optimistic reducers, visible retry/error UI, and UI-preference-only local storage.

- [ ] **Step 1: Write failing client state tests**

Test pure reducers for these sequences:

```ts
const first = beginOptimisticSupport(state, proposalId, true, 1)
const second = beginOptimisticSupport(first, proposalId, false, 2)
assert.deepEqual(applySupportResponse(second, proposalId, true, 1), second)
assert.equal(applySupportResponse(second, proposalId, false, 2).supported, false)
```

Also assert loading/error are distinct from a successful empty snapshot and that persisted UI preferences exclude domain/auth keys.

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
node --experimental-strip-types --test tests/client-platform-state.test.ts tests/ui-interactions.test.ts
```

Expected: FAIL because the coordinated loader and pure reducers do not exist.

- [ ] **Step 3: Implement coordinated hydration**

Create one abortable loader that requests session and platform together, rejects non-2xx responses, and only commits the newest load revision. Remove full `DemoState` hydration and persistence from both legacy local-storage keys.

- [ ] **Step 4: Add truthful load states**

Render a stable loading surface until the canonical snapshot succeeds. Render a Portuguese error message and retry action on failure. Render “nenhuma proposta” only in `ready` state with a successful empty snapshot.

- [ ] **Step 5: Make interactions revision-safe and observable**

Retain immediate optimistic support/save feedback. Send explicit intent, ignore stale responses, rollback only the matching latest revision, and show a non-blocking error message instead of only `console.error`. Apply the same explicit-intent pattern to comment likes.

- [ ] **Step 6: Run client tests**

Run:

```powershell
node --experimental-strip-types --test tests/client-platform-state.test.ts tests/ui-interactions.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/lib/client-platform-state.ts src/components/gefshell.tsx src/app/globals.css tests/client-platform-state.test.ts tests/ui-interactions.test.ts
git commit -m "fix(client): prevent hydration and interaction races"
```

### Task 6: Add safe legacy browser-data import

**Files:**
- Create: `src/lib/legacy-import.ts`
- Create: `src/app/api/admin/legacy-import/route.ts`
- Modify: `src/lib/platform-repository.ts`
- Modify: `src/components/gefshell.tsx`
- Modify: `src/app/globals.css`
- Create: `tests/legacy-import.test.ts`

**Interfaces:**
- Consumes: legacy `comunica-farroupilha-demo` or `gremio-comunica-demo` JSON after GEF authentication.
- Produces: `previewLegacyState(raw): LegacyImportPreview`, `sanitizeLegacyImport(raw): LegacyImportPayload`, and an idempotent admin POST returning imported/skipped counts.

- [ ] **Step 1: Write failing sanitizer and idempotency tests**

Assert accounts, passwords, user/session fields, unknown keys, excessive records, invalid IDs, and oversized text are rejected or removed. Send the same `migrationKey` twice and assert the second request imports zero duplicate proposals/comments/activities.

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
node --experimental-strip-types --test tests/legacy-import.test.ts
```

Expected: FAIL because import modules do not exist.

- [ ] **Step 3: Implement client-side preview and sanitizer**

Read legacy keys only to build a bounded preview. Never copy `accounts`, `user`, passwords, sessions, or per-user identity maps into the request. Generate a stable SHA-256 migration key from sanitized content.

- [ ] **Step 4: Implement GEF-only transactional import**

Validate again on the server, lock/insert the migration key, import supported entities with deterministic fingerprints, map legacy relationships, and return counts. Roll back the whole transaction on invalid data or database failure.

- [ ] **Step 5: Add explicit administrative UI**

Show the import panel only to GEF users when legacy content exists and has not been marked completed. Display counts, require an explicit import click, show success/failure, and offer deletion of the legacy browser copy only after success.

- [ ] **Step 6: Run import and client tests**

Run:

```powershell
node --experimental-strip-types --test tests/legacy-import.test.ts tests/client-platform-state.test.ts tests/ui-interactions.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/lib/legacy-import.ts src/lib/platform-repository.ts src/app/api/admin/legacy-import src/components/gefshell.tsx src/app/globals.css tests/legacy-import.test.ts
git commit -m "feat(admin): import legacy browser data safely"
```

### Task 7: Document, verify end to end, and push

**Files:**
- Modify: `README.md`
- Modify: `docs/backend.md`
- Modify: `docs/delivery.md`
- Modify: `docs/plans/task.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: completed database, API, client, migration, and Vercel configuration.
- Produces: reproducible operations documentation, complete verification evidence, and remote branch `pessoal/codex/codebase-review`.

- [ ] **Step 1: Update operational documentation**

Document required env names without values, `pnpm db:migrate`, admin seed, local development, backup/migration expectations, legacy import, health behavior, and the fact that Git integration owns deployment.

- [ ] **Step 2: Ensure the default test command covers every test**

Set:

```json
"test": "node --experimental-strip-types --test tests/*.test.ts"
```

- [ ] **Step 3: Run the complete automated gate**

Run:

```powershell
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

Expected: all commands exit 0 and `pnpm test` reports every test file.

- [ ] **Step 4: Run the application with Vercel development variables**

Run the dev server on an unused local port through `vercel env run -e development`. Verify with browser automation:

1. create/login as a student;
2. observe proposals after repeated reloads;
3. support and save one proposal;
4. reload and verify both remain selected;
5. repeat rapid clicks and verify final intent wins;
6. log in as another user and verify independent state;
7. force an unavailable API response in a controlled test and verify error/retry instead of an empty feed.

- [ ] **Step 5: Verify Vercel resource connection without deploying**

Run:

```powershell
vercel integration list comunica-farroupilha --format=json
vercel env ls --project comunica-farroupilha --scope lgs10
```

Expected: Neon resource and database environment variables exist for production, preview, and development. Do not print secret values.

- [ ] **Step 6: Review the final diff and repository state**

Run:

```powershell
git diff --check
git status --short
git log --oneline --decorate -10
```

Expected: no uncommitted implementation files remain after the documentation commit and all commits belong to `codex/codebase-review`.

- [ ] **Step 7: Commit documentation**

```powershell
git add README.md docs/backend.md docs/delivery.md docs/plans/task.md package.json
git commit -m "docs: document production persistence operations"
```

- [ ] **Step 8: Push the isolated branch**

Run:

```powershell
git push -u pessoal codex/codebase-review
```

Expected: GitHub accepts the branch at `git@github.com-pessoal:luccagoulartsaldanha/Comunica-Farroupilha.git`. The existing Git integration may create a preview; do not invoke a manual deployment.
