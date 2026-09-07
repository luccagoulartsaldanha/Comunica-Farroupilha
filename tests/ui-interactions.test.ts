import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const shellSource = readFileSync("src/components/gefshell.tsx", "utf8");
const stylesSource = readFileSync("src/app/globals.css", "utf8");
const landingSource = readFileSync("src/app/page.tsx", "utf8");
const listeningDemoSource = readFileSync("src/components/listening-demo.tsx", "utf8");
const supportRouteSource = readFileSync("src/app/api/proposals/[id]/support/route.ts", "utf8");
const saveRouteSource = readFileSync("src/app/api/proposals/[id]/save/route.ts", "utf8");

test("proposal card keeps action controls outside an interactive card button", () => {
  assert.match(shellSource, /<div\s+className="proposal-card-main"/s);
  assert.match(shellSource, /<button type="button" className="proposal-card-select"/s);
  assert.doesNotMatch(shellSource, /<button\s+className="proposal-card-main"/s);
  assert.match(shellSource, /<button type="button" className=\{`support-button/);
});

test("tactile press feedback is scoped to controls instead of every button", () => {
  assert.match(stylesSource, /\.tactile-control:active:not\(:disabled\)/);
  assert.doesNotMatch(stylesSource, /button:active:not\(:disabled\)\{transform/);
});

test("new proposal panel has an intentional materialized entrance", () => {
  assert.match(stylesSource, /@keyframes composer-panel-in/);
  assert.match(stylesSource, /\.composer-panel[^}]*animation:[^;}]*composer-panel-in/);
});

test("app selection controls use the rounded listbox component", () => {
  assert.match(shellSource, /<SelectMenu/);
  assert.match(readFileSync("src/components/select-menu.tsx", "utf8"), /role="listbox"/);
  assert.match(readFileSync("src/components/select-menu.tsx", "utf8"), /aria-expanded/);
});

test("comment count is an action that opens the proposal detail", () => {
  assert.match(shellSource, /<button type="button" className="comment-count tactile-control"/);
  assert.match(shellSource, /className="comment-count tactile-control"[^>]*onClick=\{[^}]*onSelect\(\);/);
  assert.doesNotMatch(shellSource, /<span className="comment-count"/);
});

test("tactile controls have a visible press and commit response", () => {
  assert.match(stylesSource, /\.tactile-control:active:not\(:disabled\)\{transform:translateY\(1px\) scale\(\.94\)/);
  assert.match(stylesSource, /@keyframes control-commit/);
  assert.match(stylesSource, /\.tactile-control\.is-committing[^}]*animation:[^;}]*control-commit/);
});

test("proposal comments detail has a smooth card-attached entrance", () => {
  assert.match(stylesSource, /@keyframes proposal-detail-in/);
  assert.match(stylesSource, /\.detail-grid[^}]*animation:[^;}]*proposal-detail-in/);
});

test("comment reply and like controls are independent actions", () => {
  assert.match(shellSource, /className="comment-actions"/);
  assert.match(shellSource, /className=\{`comment-like[\s\S]*aria-pressed=\{liked\}/);
  assert.match(shellSource, /onLike\(comment\.id\)/);
  assert.doesNotMatch(shellSource, /<button className="reply-link"[\s\S]*<span><Icon name="thumbs"/);
});

test("support and save update the local state before waiting for the API", () => {
  for (const functionName of ["toggleSupport", "toggleSaved"]) {
    const start = shellSource.indexOf(`async function ${functionName}`);
    const end = shellSource.indexOf("\n  async function", start + 1);
    const functionSource = shellSource.slice(start, end === -1 ? shellSource.length : end);
    const fetchIndex = functionSource.indexOf("await fetch");
    const stateIndex = functionSource.indexOf("setState((curr)");

    assert.ok(start >= 0, `${functionName} should exist`);
    assert.ok(stateIndex >= 0, `${functionName} should update local state`);
    assert.ok(fetchIndex >= 0, `${functionName} should still synchronize with the API`);
    assert.ok(stateIndex < fetchIndex, `${functionName} should render feedback before the network response`);
  }
});

test("support and save requests carry an explicit desired state", () => {
  assert.match(shellSource, /const interactionKey = `support:\$\{id\}`;/);
  assert.match(shellSource, /const interactionKey = `save:\$\{id\}`;/);
  assert.match(shellSource, /beginInteraction\(interactionRevisions\.current, interactionKey\)/);
  assert.match(shellSource, /body: JSON\.stringify\(\{ supported: optimisticSupported, revision: interactionRevision \}\)/);
  assert.match(shellSource, /body: JSON\.stringify\(\{ saved: optimisticSaved, revision: interactionRevision \}\)/);
  assert.match(supportRouteSource, /await setSupport\(id, user\.id, body\.supported, body\.revision\)/);
  assert.match(saveRouteSource, /await setSaved\(id, user\.id, body\.saved, body\.revision\)/);
});

test("comments detail keeps the conversation focused without the explanatory banner", () => {
  assert.doesNotMatch(shellSource, /<aside className="how-card">/);
  assert.doesNotMatch(shellSource, /ÚLTIMO RETORNO DO GEF/);
});

test("top-right profile menu is anchored to its trigger", () => {
  assert.match(shellSource, /profileOpen === "topbar"/);
  assert.match(shellSource, /className="topbar-profile-wrap"/);
  assert.match(stylesSource, /\.topbar-profile-wrap \.profile-menu[^}]*top:calc\(100% \+ 10px\)/);
});

test("comments return as an attached tab with a calm empty state", () => {
  assert.match(shellSource, /className="comments-empty-state"/);
  assert.match(stylesSource, /\.detail-grid\{align-items:start;margin:0 12px 8px;padding:22px 18px;border:1px solid var\(--app-border\);border-top:0/);
  assert.match(stylesSource, /\.comments-section\{padding:0;border:0;border-radius:0;background:transparent;box-shadow:none/);
  assert.match(stylesSource, /\.comments-empty-state/);
});

test("app omits the mid-feed institutional banner", () => {
  assert.doesNotMatch(shellSource, /className="institutional-banner"/);
});

test("landing is led by real school photography", () => {
  assert.match(landingSource, /className="landing-hero-image"/);
  assert.match(landingSource, /className="landing-story-image/);
  assert.match(landingSource, /className="landing-platform-image"/);
  assert.match(landingSource, /\/landing\/mural-pista\.webp/);
  assert.match(landingSource, /\/landing\/patio-geral\.webp/);
  assert.match(landingSource, /\/landing\/corredor-jogos\.webp/);
});

test("landing removes redundant institutional copy", () => {
  assert.doesNotMatch(landingSource, /className="institutional-note"/);
  assert.doesNotMatch(landingSource, /className="closing-approval"/);
  assert.match(stylesSource, /\.landing-hero/);
  assert.match(stylesSource, /\.landing-photo-grid/);
});

test("landing demo keeps its scenario copy concise", () => {
  assert.doesNotMatch(listeningDemoSource, /Como preservar um espaço tranquilo/);
  assert.doesNotMatch(listeningDemoSource, /quem ainda não conhece ninguém/);
  assert.match(listeningDemoSource, /O que você gostaria de ouvir\? Em quais dias\?/);
});

test("production login never exposes administrative credentials", () => {
  assert.doesNotMatch(shellSource, /admteste123/);
  assert.doesNotMatch(shellSource, /Conta administrativa pré-configurada/);
});

test("resized application logos preserve their intrinsic aspect ratio", () => {
  assert.match(stylesSource, /\.app-logo img\{width:98px;height:auto/);
  assert.match(stylesSource, /\.auth-brand img\{width:98px;height:auto/);
  assert.match(stylesSource, /\.mobile-brand img\{width:73px;height:auto/);
});
