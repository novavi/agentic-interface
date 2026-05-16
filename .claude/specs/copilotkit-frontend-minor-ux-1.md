# CopilotKit-based Frontend — Minor UX 1

## Overview

Four UX polish items: larger header text, a sparkles icon in the header bar, a custom sparkles favicon, and a fix for the horizontal layout glitch caused by CopilotKit Inspector interacting with the Radix UI Select component.

---

## Phase 1 — Header and favicon polish

### R1 — Larger header text

**File:** `frontend/app/page.tsx`

Change the `<h1>` class from `text-lg` to `text-xl`.

---

### R2 — Sparkles icon in header bar

**File:** `frontend/app/page.tsx`

Import `Sparkles` from `lucide-react` and render it immediately to the left of the `<h1>` text. Use `text-amber-400` (gold) at `w-5 h-5` to complement the updated `text-xl` heading without overpowering it.

```tsx
import { Sparkles } from "lucide-react";

<header className="flex-none h-14 flex items-center px-6 border-b border-gray-800 bg-gray-950">
  <Sparkles className="w-5 h-5 text-amber-400 mr-2 flex-none" />
  <h1 className="text-xl font-semibold text-gray-100">
    Agentic Interface - Proof of Concept by Derek Novavi
  </h1>
</header>
```

---

### R3 — Sparkles favicon

**File:** `frontend/app/icon.svg` (new file)

Next.js App Router natively serves `app/icon.svg` as the site favicon via an auto-generated `<link rel="icon">` tag — no manual `<head>` changes or build steps required. The existing `app/favicon.ico` will be removed by the user separately.

Create `app/icon.svg` using the Lucide Sparkles icon paths. Use `#FBBF24` (amber-400) as the explicit colour. The main star path should be both filled and stroked so the icon reads clearly at small browser-tab sizes (16×16 / 32×32). The small accent lines are stroked only.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
  <path
    d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"
    fill="#FBBF24" stroke="#FBBF24" stroke-width="1.5"
    stroke-linecap="round" stroke-linejoin="round"
  />
  <path
    d="M5 3v4M19 17v4M3 5h4M17 19h4"
    stroke="#FBBF24" stroke-width="1.5"
    stroke-linecap="round" stroke-linejoin="round"
  />
</svg>
```

---

## Phase 2 — CopilotKit Inspector / Select dropdown layout glitch

### R4 — Suppress spurious horizontal expansion when Select opens

**Symptom:** With the CopilotKit Inspector pinned to the left side of the window, opening the graph Select caused empty horizontal space equal to the Inspector panel width to appear between the Inspector and the app navbar. The space collapsed when the Select closed.

**Investigation — two failed attempts:**

1. **`overflow-clip` on root div** (`frontend/app/page.tsx`): Initial hypothesis was that Radix's `@radix-ui/react-remove-scroll` scroll-lock was over-compensating for the Inspector panel. Changing `overflow-hidden` to `overflow-clip` on the outermost div did not resolve it; reverted.

2. **`modal={false}` default on shadcn Select** (`frontend/components/ui/select.tsx`): Setting `modal={false}` as the default on `SelectPrimitive.Root` disables scroll-lock entirely. This also had no effect — proving scroll-lock was not the root cause; reverted.

**Actual root cause:** The Radix UI `SelectContent` renders via `SelectPrimitive.Portal`, which appends a new element to `document.body` when the dropdown opens. The CopilotKit Inspector appears to watch for DOM mutations on the body (to re-measure its pinned panel offset) and re-applies its panel shift in response, producing the visual glitch.

**Fix:** Replace the shadcn `Select` component in `frontend/components/Workflow.tsx` with a vanilla HTML5 `<select>` element. A native select has no Portal and makes no changes to `document.body` when opened, eliminating the trigger entirely.

**Implementation details:**

- `appearance-none` removes the native OS arrow; a `ChevronDown` icon from lucide-react is overlaid absolutely at the right edge of a wrapper `<div>` to replace it consistently across browsers.
- `style={{ colorScheme: "dark" }}` ensures the OS-rendered option list renders in dark mode.
- `w-auto` (rather than a fixed width) lets the trigger and the native option panel size to the same content width, avoiding the trigger overhanging the panel edge.
- `rounded-md` used for trigger corners (less pronounced than `rounded-lg`).
- `frontend/components/ui/select.tsx` deleted as it was no longer imported anywhere.

```tsx
<div className="relative">
  <select
    value={selectedGraphId}
    onChange={(e) => handleGraphChange(e.target.value)}
    disabled={agent.isRunning}
    className="h-8 w-auto appearance-none rounded-md border border-gray-700 bg-gray-800 text-sm text-gray-100 px-2.5 pr-7 outline-none focus:border-gray-500 disabled:cursor-not-allowed disabled:opacity-50"
    style={{ colorScheme: "dark" }}
  >
    {graphs.map((g) => (
      <option key={g.graphId} value={g.graphId}>{g.name}</option>
    ))}
  </select>
  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
</div>
```

**Known limitations of native `<select>`:** The OS-rendered option panel's width, corner radius, and other visual properties cannot be controlled via CSS. Minor visual differences between the trigger and the open panel (e.g., corner style) are accepted as a trade-off for the simpler, glitch-free implementation.

---

## Phase 3 — Codebase clean-up

### R5 — Remove unused Next.js boilerplate from `public/`

**Files deleted:** `frontend/public/` (entire folder, including `file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`)

These were default Next.js starter assets, none of which were referenced anywhere in the project. The folder itself was also removed — Next.js's `public/` directory is sufficiently well-known that it does not need a placeholder file to signal its purpose to future developers or agents.
