# Plan: Copilot Runtime Fixes

## Overview

Eliminate HTTP 404 errors seen in the browser DevTools console and Next.js terminal on page load, caused by GET requests to `/api/copilotkit/threads?agentId=<id>`.

---

## R1 — Fix 404 errors for `GET /api/copilotkit/threads?agentId=...`

### Observed behaviour

On page load, three GET requests are issued (one per registered agent) and all return HTTP 404:

```
GET http://localhost:3000/api/copilotkit/threads?agentId=agent_convo_basic       → 404
GET http://localhost:3000/api/copilotkit/threads?agentId=agent_auto_ex_1         → 404
GET http://localhost:3000/api/copilotkit/threads?agentId=agent_auto_ex_2         → 404
```

These appear both in the browser DevTools Network panel and in the Next.js terminal. They are not related to any user action — they fire automatically during app initialisation.

---

### Root cause analysis

#### Who makes the requests

The CopilotKit **web-inspector** (`@copilotkit/web-inspector`) is the source. It is enabled by the `showDevConsole={true}` prop on `<CopilotKit>` in `frontend/components/Providers.tsx`.

On mount, the inspector calls `ensureOwnedThreadStore(agentId)` for every agent registered with the runtime — all three in our case. Each owned thread store is wired up as follows (from `web-inspector/dist/index.umd.js`):

```
ensureOwnedThreadStore(agentId)
  → ɵcreateThreadStore({ fetch })          // creates a new thread store
  → core.registerThreadStore(agentId, store)
  → store.setContext({ runtimeUrl, agentId, wsUrl, … })
      → issues GET ${runtimeUrl}/threads?agentId=<id>   ← the failing request
```

Thread stores are part of the CopilotKit **Intelligence Platform** thread-management feature, which provides thread listing, renaming, archiving, and deletion for production deployments. The inspector uses the thread list to populate its "Threads" panel.

#### Why 404

In Next.js App Router, a `route.ts` file handles requests to its **exact path only** — not sub-paths. The file at `app/api/copilotkit/route.ts` handles `/api/copilotkit`. There is no file at `app/api/copilotkit/threads/route.ts`, so Next.js returns 404 for all requests to `/api/copilotkit/threads` and sub-paths.

Additionally, the existing `route.ts` only exports `POST`:

```ts
// frontend/app/api/copilotkit/route.ts  (current)
export const POST = async (req: NextRequest) => { … };
// No GET export — even for /api/copilotkit itself
```

#### What the runtime would return if properly routed

The runtime's `handleListThreads` handler (`@copilotkit/runtime/src/v2/runtime/handlers/intelligence/threads.ts`) has three code paths:

1. **Intelligence Platform configured**: proxies to the platform and returns real thread data.
2. **InMemoryAgentRunner in use** (in-process dev mode): returns `{ threads: [], nextCursor: null }` — a clean empty list.
3. **LangGraph agents without Intelligence Platform (our setup)**: returns HTTP **422** `"Missing CopilotKitIntelligence configuration. Thread operations require a CopilotKitIntelligence instance…"`

Our setup uses `LangGraphAgent` objects, which use a different runner internally — not `InMemoryAgentRunner`. So if we route the request through the runtime unchanged, the 404 becomes a 422. The frontend thread store treats any non-2xx response as an error, so the inspector would still show an error state.

#### Will `/threads/subscribe` also be called?

The thread store optionally opens a WebSocket connection to `/threads/subscribe` for realtime updates. However, this is only attempted when `wsUrl` is present in the thread context. `wsUrl` is sourced from `copilotkit.intelligence?.wsUrl`. Without an Intelligence Platform configured, `intelligence` is `undefined`, so `wsUrl` is `undefined` and the subscribe call is skipped. Only the initial `GET /threads?agentId=…` list fetch fires.

---

### Fix options

Three approaches are possible. They differ on whether to fix at the routing layer, the runtime layer, or the component configuration layer.

---

#### Option A — Add a stub threads route (recommended for this POC)

Create `frontend/app/api/copilotkit/threads/route.ts` with a GET handler that returns an empty thread list:

```ts
// frontend/app/api/copilotkit/threads/route.ts
export const GET = () => Response.json({ threads: [], nextCursor: null });
```

This returns HTTP 200 with the shape the thread store expects for "no threads found". The web-inspector renders an empty thread list. No console errors. No frontend error state.

**Why this is appropriate here**: The project is a proof-of-concept without thread persistence. There is no real thread history to serve. An empty list is both truthful and non-disruptive.

Pros:
- Eliminates the 404s completely
- No frontend console noise
- Simple, targeted, minimal change
- Appropriate for a POC without the Intelligence Platform

Cons:
- Returns a hardcoded stub rather than real data
- Does not provide a path to real thread management if the Intelligence Platform is added later (though that would require a different approach to the whole route handler anyway)

---

#### Option B — Route through the CopilotKit runtime handler

Create `frontend/app/api/copilotkit/threads/route.ts` using `createCopilotRuntimeHandler` from `@copilotkit/runtime/v2`, sharing the same `runtime` instance. The runtime's fetch-router strips the `/api/copilotkit` prefix, matches `/threads` → `threads/list`, and dispatches to `handleListThreads`.

For our LangGraph setup this returns HTTP 422. The web-inspector thread store treats 422 as an error and enters error state. This does **not** eliminate console noise — the 404 becomes a 422.

Pros:
- Principled; uses existing runtime logic
- Would serve real data if InMemoryAgentRunner or Intelligence Platform were configured

Cons:
- Still produces error responses (422) and frontend noise in our setup
- The `runtime` object must be exported from `route.ts` and imported in `threads/route.ts`, adding coupling
- No practical benefit over Option A for a POC

---

#### Option C — Disable the web-inspector

Remove `showDevConsole={true}` from `<CopilotKit>` in `frontend/components/Providers.tsx` (or set it to `false`). The inspector never mounts, no thread stores are created, no GET requests are made.

Pros:
- Eliminates the requests entirely at their source
- No new route files needed

Cons:
- Loses the CopilotKit developer console, which provides useful visibility during development (active run events, message streams, agent state)
- A blunt instrument — removes a useful tool to suppress an unrelated error

---

### Recommendation

**Option A** for this project. The Inspector's thread-listing panel is a feature of the Intelligence Platform, which is not in scope for this POC. Returning an empty list is the right behaviour — it keeps the inspector functional and error-free without misrepresenting state.

If the Intelligence Platform is integrated in future, Option A's stub route would need to be replaced with either Option B or a dedicated intelligence-aware handler — but that migration would be straightforward.

---

### Implementation (Option A)

**File to create**: `frontend/app/api/copilotkit/threads/route.ts`

```ts
export const GET = () => Response.json({ threads: [], nextCursor: null });
```

That is the entire file. No imports needed — `Response` is a global in Next.js App Router.

**File to leave unchanged**: `frontend/app/api/copilotkit/route.ts` — the existing POST handler for agent interactions is unaffected.

**No frontend changes required.**

---

### Decisions

1. **Keep the web-inspector**: `showDevConsole={true}` remains. Option C ruled out.
2. **Approach**: Option A (stub empty list). Option B ruled out.

---

## Status

| Item | Status |
|------|--------|
| R1 investigation | Complete |
| R1 implementation | Complete |
