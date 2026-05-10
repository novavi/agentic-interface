# Patch CopilotKit Inspector

## Status
Phase 1: Implemented

## Overview

The CopilotKit Inspector (`@copilotkit/web-inspector`) hard-codes two constants that cap the number of AG-UI events retained in the inspector UI:

| Constant | Current value | Target value |
|---|---|---|
| `MAX_AGENT_EVENTS` | `200` | `10_000` |
| `MAX_TOTAL_EVENTS` | `500` | `10_000` |

These constants are not configurable via any public API. The only way to raise them is to patch the compiled dist files directly in `node_modules`. A patch script applies the changes after every `npm install` via `postinstall`.

---

## Phase 1: Patch script

### Goals

- Add `frontend/scripts/patch-cki.mjs` — a self-contained Node.js ESM script that patches the CopilotKit Inspector dist files
- Wire `patch:cki` and `postinstall` npm scripts in `frontend/package.json`
- Script verifies the installed version before patching; warns and exits cleanly if the version does not match

---

### File Structure Changes

```
frontend/
├── scripts/
│   └── patch-cki.mjs       # NEW — patch script
└── package.json            # MODIFY — add patch:cki and postinstall scripts
```

---

### Target Files

The constants appear in two compiled dist files inside `@copilotkit/web-inspector`. Both are referenced in the package's exports map and must be patched:

| File | Line (v1.57.1) | Format |
|---|---|---|
| `node_modules/@copilotkit/web-inspector/dist/index.mjs` | 32–33 | ESM (`import`) |
| `node_modules/@copilotkit/web-inspector/dist/index.cjs` | 33–34 | CJS (`require`) |

`dist/index.umd.js` and `src/index.ts` are present in the package directory but are not referenced in the exports map and are not loaded at runtime — they are not patched.

The `@copilotkit/web-inspector` package is pulled in as a dependency of `@copilotkit/react-core`, not installed directly.

---

### `frontend/scripts/patch-cki.mjs`

A Node.js ESM script (no dependencies beyond Node built-ins). Behaviour:

1. **Version check** — reads `node_modules/@copilotkit/web-inspector/package.json` and checks that `version === "1.57.1"`. If it does not match, logs a prominent `[WARN]` message explaining the mismatch and that the patch was skipped, then exits with code `0` so `npm install` is not broken. The warn message should make clear the script needs to be reviewed against the new version before re-enabling.

2. **Patch each file** — for both `index.mjs` and `index.cjs`:
   - Read the file content
   - Extract the current values of `MAX_AGENT_EVENTS` and `MAX_TOTAL_EVENTS` using regex
   - Log the filename and the before values
   - If both values are already equal to `TARGET_MAX_AGENT_EVENTS` / `TARGET_MAX_TOTAL_EVENTS`, log `already patched` and skip the write
   - Otherwise replace `const MAX_AGENT_EVENTS = <N>` and `const MAX_TOTAL_EVENTS = <N>` with the target values and write the file back
   - Log the after values and `patched successfully`

3. **Constants defined at the top of the script:**
   ```js
   const TARGET_MAX_AGENT_EVENTS = 10_000;
   const TARGET_MAX_TOTAL_EVENTS = 10_000;
   const EXPECTED_VERSION = "1.57.1";
   ```

4. **No external dependencies** — uses only Node.js built-ins (`fs`, `path`, `url`).

#### Example output (happy path, first run)

```
[patch-cki] Checking @copilotkit/web-inspector version... 1.57.1 ✓
[patch-cki] Patching dist/index.mjs
[patch-cki]   MAX_AGENT_EVENTS: 200 → 10000
[patch-cki]   MAX_TOTAL_EVENTS: 500 → 10000
[patch-cki]   patched successfully
[patch-cki] Patching dist/index.cjs
[patch-cki]   MAX_AGENT_EVENTS: 200 → 10000
[patch-cki]   MAX_TOTAL_EVENTS: 500 → 10000
[patch-cki]   patched successfully
```

#### Example output (already patched, second run)

```
[patch-cki] Checking @copilotkit/web-inspector version... 1.57.1 ✓
[patch-cki] Patching dist/index.mjs
[patch-cki]   already patched (MAX_AGENT_EVENTS=10000, MAX_TOTAL_EVENTS=10000)
[patch-cki] Patching dist/index.cjs
[patch-cki]   already patched (MAX_AGENT_EVENTS=10000, MAX_TOTAL_EVENTS=10000)
```

#### Example output (version mismatch)

```
[patch-cki] WARN: @copilotkit/web-inspector is 1.58.0, expected 1.57.1.
[patch-cki] WARN: Patch skipped. Review patch-cki.mjs against the new version before re-enabling.
```

---

### `frontend/package.json` changes

Add two entries to `"scripts"`:

```json
"patch:cki": "node scripts/patch-cki.mjs",
"postinstall": "npm run patch:cki"
```

`postinstall` runs automatically after every `npm install`, ensuring the patch is re-applied whenever `node_modules` is rebuilt.

---

### Implementation Notes

- Regex replacement must be precise enough not to match other numeric literals in the files. The pattern `const MAX_AGENT_EVENTS = \d+` is unambiguous in both dist files since the constant name is unique.
- The script is idempotent: running it multiple times is safe.
- The `postinstall` hook runs after both `npm install` and `npm ci`. In CI environments where node_modules are cached and restored, `postinstall` may not run — in that case the patch will already have been applied in the cache. This is acceptable behaviour.
- The script lives in `frontend/scripts/` to make clear it is a build/maintenance tool, not frontend runtime code. It is not bundled or imported by any app code.

---

### Acceptance Criteria (Phase 1)

- [x] `npm run patch:cki` applies the patch and logs before/after values
- [ ] Running `npm run patch:cki` a second time detects already-patched values and skips the write
- [ ] If `@copilotkit/web-inspector` version does not match `1.57.1`, script logs a `WARN` and exits with code `0`
- [ ] `npm install` triggers `postinstall` which in turn runs `patch:cki` automatically
- [x] After patching, the CopilotKit Inspector retains up to 10,000 events per agent and 10,000 total events
