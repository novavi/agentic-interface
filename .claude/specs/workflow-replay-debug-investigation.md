# Investigation: CopilotKit AG-UI Replay for Completed Workflow Runs

Related spec: [copilotkit-frontend-workflow-visualization-phase-123.md](./copilotkit-frontend-workflow-visualization-phase-123.md) — Phase 3c.

---

## What We Know (from source reading)

### Server-side replay chain

`POST /api/copilotkit` with `method: "agent/connect"` routes to:

```
handleConnectAgent → handleSseConnect → runtime.runner.connect({ threadId })
```

`runtime.runner` is `InMemoryAgentRunner` (the default for `CopilotSseRuntime`; our `route.ts` uses `CopilotRuntime` which delegates to `CopilotSseRuntime`).

`InMemoryAgentRunner.connect(threadId)`:
1. Reads `GLOBAL_STORE.get(threadId)` — a module-level `Map`
2. Gathers all `historicRuns[].events` for the thread
3. Calls `compactEvents(allHistoricEvents)` → produces one final `STATE_SNAPSHOT`
4. Streams those compacted events back as SSE

**`GLOBAL_STORE` is populated during `InMemoryAgentRunner.run()`.** During an `agent/run` request, each AG-UI event emitted by `LangGraphAgent.runAgent()` is stored in `currentRunEvents`, then compacted into `historicRuns` at the end.

**`LangGraphAgent` (`@ag-ui/langgraph`) DOES emit `STATE_SNAPSHOT`:** It emits them (a) after each node completes (`handleStreamEvents` main loop), and (b) at the end of the run via `getStateAndMessagesSnapshots()`. So `GLOBAL_STORE` should have state data.

### Client-side replay chain

`copilotkit.connectAgent({ agent })` (in `@copilotkit/core`):
1. `agent.detachActiveRun()` — cancel any in-progress run
2. `agent.setMessages([])` + `agent.setState({})` — clear local state
3. `agent.connectAgent({ tools, context, forwardedProps })` — calls the HTTP endpoint
4. Processes the returned SSE stream via `agent.apply()` / `agent.processApplyEvents()`
5. `STATE_SNAPSHOT` events in the stream cause `agent.state` to be updated + subscribers notified
6. `useAgent` subscribes to `onStateChanged` → calls `forceUpdate()` → React re-renders

### How `CopilotChat` does it (the working path)

From `copilotkit-DjxXMYHG.mjs` line ~6990:

```javascript
useEffect(() => {
  if (!hasExplicitThreadId) return;
  agent.threadId = resolvedThreadId;
  copilotkit.connectAgent({ agent });  // fire-and-forget with try/catch
  return () => {
    agent.detachActiveRun().catch(() => {});
  };
}, [resolvedThreadId, agent, resolvedAgentId, hasExplicitThreadId]);
```

Note the effect depends on `agent` — it re-runs when the agent changes from provisional → real.

### Our `Workflow.tsx` `connectAgent` effect (current)

```tsx
useEffect(() => {
  if (!currentThreadId) return;
  // check sessionStorage for non-running entry…
  agent.threadId = currentThreadId;
  copilotkit.connectAgent({ agent });
}, [currentThreadId]); // agent and copilotkit omitted from deps
```

**Key difference from CopilotChat:** our effect does NOT depend on `agent`. If the agent is still
provisional (runtime connecting) when this effect first fires, the `connectAgent` call may fail
silently (the provisional agent's HTTP call either errors or posts to the wrong URL). Because the
effect never re-runs when `agent` stabilises to the real value, we never retry.

---

## Unresolved Questions

1. **Does `GLOBAL_STORE` actually have the workflow's events when `connect()` is called?**
   - The module is alive within the Next.js dev server process.
   - Next.js HMR *can* re-evaluate modules in development, which would wipe `GLOBAL_STORE`.
   - We don't know if this is happening.

2. **Does the autonomous workflow emit any `STATE_SNAPSHOT` events at all?**
   - Source code says yes — `getStateAndMessagesSnapshots()` is always called at the end of a run.
   - But if the Python `langgraph dev` server is the source of truth and it doesn't stream updates
     events in a way that triggers `getStateAndMessagesSnapshots`, the snapshot might be empty.

3. **Is the provisional-agent timing the root cause?**
   - If `connectAgent` is called before the real agent is resolved, it fails silently and the
     effect never retries because `agent` is not in the dependency array.

---

## Debug Spike

A minimal isolated page at `/debug-replay` answers all three questions at once:

- Reads the most recent completed `threadId` from `agentic-interface-workflows` sessionStorage
- Calls `copilotkit.connectAgent({ agent })` on mount
- Displays `agent.state` and `agent.messages` live as they update
- Shows a log of each step so we can see whether `connectAgent` resolved/errored

**If data appears** → the replay pipeline works and the bug is in `Workflow.tsx` / `WorkflowRawView`
rendering logic. Fix is to mirror CopilotChat's `agent` dependency.

**If data stays empty** → either GLOBAL_STORE is stale or the workflow never emits state. Next step:
add server-side logging to `InMemoryAgentRunner.connect()` to inspect what's in `GLOBAL_STORE`.
