# Coding Agent Rules

## Security

- Never include real API keys, secrets, or credentials in code files, configuration files, or documentation (including `.md` files and plan files).
- **Python projects** — load secrets from `.env` via `python-dotenv`. Commit `.env.example` with placeholder values as the template; `.env` is gitignored.
- **Next.js projects** — put secrets in `.env.local` (gitignored by Next.js by default). Use `.env` only for non-secret defaults that are safe to commit. Never put secrets in `.env`.
- **`.gitignore`** — always verify that files which can contain secrets are excluded. For Python projects this means `.env`; for Next.js projects this means `.env.local`, `.env.development.local`, `.env.test.local`, and `.env.production.local`. Never remove these entries from `.gitignore`.

## Git Operations

- Never run any git command that writes to or modifies repository state — this includes staging, unstaging, committing, resetting, pushing, pulling, merging, rebasing, and switching branches.
- The only permitted git commands are read-only ones (e.g. `git log`, `git diff`, `git status`, `git show`).
- Even read-only git commands must not be run without first asking the user for explicit permission.

## npm Operations

- Never run any npm command without first asking for explicit permission.
- For package installation, version upgrades, uninstallation, and script execution: provide the exact command(s) for the user to run, then wait for the user to confirm the commands have been run and share any relevant output before proceeding.

## Python Operations

- Never run any `uv`, `pip`, or `python` command without first asking for explicit permission.
- For dependency installation (`uv add`, `uv sync`, `pip install`), environment management, and script execution (`uv run`, `python`): provide the exact command(s) for the user to run, then wait for the user to confirm the commands have been run and share any relevant output before proceeding.

## Plan Files

- Plan files (`.claude/specs/*.md`) are the authoritative record of what was designed and why. Treat each completed phase's content as a locked historical record — never remove, restructure, or reword existing sections when adding new content.
- Amendments to a completed phase must be minimal, surgical, and purposeful (e.g. correcting a factual error or updating a stale value). If an amendment is needed, make only the targeted change and leave surrounding content intact.
- When extending a plan with a new phase, add new sections below the existing content. Do not reorganise the existing sections to accommodate the new phase.
- If existing plan content needs significant restructuring, ask the user before making changes.
