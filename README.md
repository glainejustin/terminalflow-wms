# Terminalflow — Retail Consolidation OS

Airport terminal-goods consolidation workspace (Next.js App Router, PostgreSQL, Drizzle ORM, TypeScript).

Supplier delivers to the consolidation center → security screening → warehouse storage or direct release → dispatch to the airport → confirmed delivery to the terminal store. Every step is recorded against a named operator.

## Features

- **PCC consignments** — PCC number, cage count/type, temperature class, weight, supplier docket, duty status, cage seal. Dispatch blocked until a seal is recorded.
- **Manifest lines & receiving variance** — SKU-level expected vs received with mandatory variance reasons.
- **Operator sign-in** — name + PIN (scrypt), five roles; full audit trail on every action.
- **Optimistic concurrency** — versioned orders, stale writes return 409.
- **Screening evidence & quarantine** — method, result, reference, screener, quarantine reason.
- **Outlook / Microsoft Graph** — read ops mailbox, import supplier emails, send store notifications.
- **Compliance attestation** — CSV/JSON export of every operator action.

## Run locally

1. `npm install`
2. Copy `.env.example` to `.env`; set `DATABASE_URL` and `SESSION_SECRET` (≥32 chars).
3. `npx drizzle-kit push`
4. `npm run dev` → `http://localhost:3000` (demo: Jordan Davis / 1234)

## Pushing to GitHub

Connect once, then every update is one command:

```bash
# one-time setup (replace with your repo)
git remote add origin https://github.com/<you>/<repo>.git

# after every change
./scripts/sync-github.sh "describe your change"
```

The script commits all changes and pushes `main` to `origin`. It uses the `GITHUB_TOKEN` environment variable when set (export it once per shell), otherwise your stored git credentials. A CI workflow (`.github/workflows/ci.yml`) typechecks, lints and builds every push.

## Workflow

Received → Awaiting screening → Screening → Cleared → [In storage] → Ready for dispatch → In transit → Delivered (On hold → Awaiting screening).
