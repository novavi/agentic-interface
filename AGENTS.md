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
