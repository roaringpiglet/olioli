# College Application OS

A collaborative, AI-assisted system that helps a **counselor**, a **student**,
and a **parent** navigate the North American college application journey
together.

Not a to-do app — a living operating system that answers:

- What stage is the student in right now?
- What should they be focusing on, and why?
- What are this month's priorities? This week's work?
- How do today's actions contribute to a coherent personal narrative?

This iteration delivers the **dashboard** — the always-on answer to "what
matters right now" — sitting on top of real accounts, role-based permissions,
and manager-approved registration.

## Stack

- **Next.js 14** (App Router) + TypeScript + Tailwind
- **Supabase** — Postgres + Auth + Row-Level Security
- **Anthropic (Claude)** — generates the Stage Overview when the counselor asks
- **Resend** — emails the manager on signup (optional in dev)

## Architecture

| Concern                       | Where                                       |
| ----------------------------- | ------------------------------------------- |
| Schema + RLS                  | `supabase/migrations/0001_initial.sql`      |
| Session + role gating         | `src/lib/session.ts`, `src/middleware.ts`   |
| Permissions (UI mirror)       | `src/lib/permissions.ts`                    |
| Mutations                     | `src/app/actions/*.ts` (Server Actions)     |
| Manager approval (email + link) | `src/app/api/admin/approve/route.ts` + `src/lib/approval.ts` |
| AI stage generator            | `src/app/api/ai/stage/route.ts`             |
| Dashboard UI                  | `src/components/dashboard/*`                |

Permissions are enforced **twice**:

1. Postgres RLS policies (the source of truth — a leaked service key is the
   only way around them, and that key is never sent to the client).
2. Server Actions re-check the caller's role before any mutation.

The UI uses `src/lib/permissions.ts` only to hide controls. A parent clicking
around in dev-tools cannot cause writes.

## Roles

| Role        | What they can do                                                     |
| ----------- | -------------------------------------------------------------------- |
| `manager`   | Approves new accounts. Full read/write. (That's you.)                |
| `counselor` | Defines the stage, writes monthly goals, creates/edits weekly todos. |
| `student`   | Updates status + notes on their own weekly todos.                    |
| `parent`    | Read-only.                                                           |

`counselor` and `parent` accounts are linked to a student via
`support_links`, which the approval flow creates automatically when the
manager approves a supporter who named a student's email during sign-up.

## Setup

See `SETUP.md` for the full step-by-step (creating the Supabase project,
running the migration, bootstrapping the manager account, adding keys).

Short version:

```bash
cp .env.example .env.local      # fill in Supabase + Anthropic
npm install
# run supabase/migrations/0001_initial.sql in the Supabase SQL editor
# promote your first user to role='manager', status='approved' (see SETUP.md)
npm run dev
```

Open `http://localhost:3000`.

## What's in this iteration

- Sign-up + sign-in + pending-approval page
- Manager-approval via signed email link (console-log fallback for dev)
- Dashboard:
  - **Stage Overview** card (counselor-editable; "Generate with AI" button)
  - **Monthly Goals** card (3–5 counselor-managed priorities, month toggle)
  - **Weekly Todos** card (status + notes editor, week toggle, linked to a
    monthly goal)
- Prev / Next / Today navigation for both week and month (URL-driven, so
  back-button works)

## What's intentionally not here yet

Per the product vision, these are next:

- The **Meaning layer** — reflections, journaling, narrative threading
- Meeting notes upload + comments from the parent
- Timeline view of past/future stages
- Admin UI (approvals are email-only for now)
- Multi-student support for one counselor

The schema and session helpers were designed to accept these additions
without restructuring.
# olioli
