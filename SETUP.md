# Setup — step by step

This gets you from a clean clone to a working app in about 15 minutes.
Everything you need is free-tier friendly.

## 1. Supabase

1. Go to [supabase.com](https://supabase.com) → **New project**. Pick a
   region near you. Save the database password somewhere.
2. After the project spins up, grab these from **Project Settings → API**:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY`  ⚠️ server-only
3. Open the **SQL Editor**, paste the full contents of
   `supabase/migrations/0001_initial.sql`, and **Run**.
   You should see `profiles`, `support_links`, `stages`, `monthly_goals`,
   and `weekly_todos` under **Table Editor** afterward.
4. Open a new SQL Editor query, paste
   `supabase/migrations/0002_timeline_items.sql`, and **Run**. This adds
   the `timeline_items` table that powers the multi-track Timeline page.
5. Run `supabase/migrations/0003_track_on_goals_and_todos.sql`. This
   adds an optional `track` column to `monthly_goals` and `weekly_todos`
   so every piece of the plan can be tagged with one of the six
   aspects (Academic, Testing, Extracurriculars, Portfolio, College
   Application, Personal Development). Existing rows are left NULL
   (uncategorized) — you can tag them from the UI.
6. Run `supabase/migrations/0004_threads.sql`. This adds an optional
   `thread` column to `timeline_items` and `monthly_goals` so you can
   group related work into named **throughlines** (e.g. "Parsons Summer
   School", "Upcycling Fashion Club"). Each throughline renders as its
   own faint line in its track's lane on the timeline, and hovering any
   line auto-generates an AI summary of where that thread stands.
7. Run `supabase/migrations/0005_meetings.sql`. This adds the
   `meetings` and `meeting_reflections` tables that power the new
   **Meetings** page — upcoming/past meetings, AI-suggested agendas,
   post-meeting notes with AI extraction, and the student's private
   append-only reflections. Without this migration, `/meetings` will
   throw a "relation does not exist" error.
8. Run `supabase/migrations/0006_meeting_topics.sql`. Adds the
   `meeting_topics` backlog — a shared "Topics to discuss" inbox that
   counselor, student, and parent can all drop items into. When
   scheduling a new meeting, selected topics become the starting agenda
   items and auto-complete when the meeting is marked completed.
9. Run `supabase/migrations/0007_growth.sql`. Adds the **Growth** page
   tables: `narrative_entries` (collaborative themes / values / story
   moments / growth areas / directions), `journal_entries` (private to
   the student), `activities` (activities bank with description,
   motivation, learning outcomes, narrative relevance, plus AI framing
   per activity), and `growth_insights` (cached AI synthesis:
   emerging themes, value patterns, narrative directions, growth areas,
   and coach-style recommendations including book suggestions).
10. Run `supabase/migrations/0008_ideas.sql`. Adds `idea_boards` and
    `idea_items` — the **Ideas & options** section between Narrative
    Builder and Activities Bank on the Growth page. Counselor, student,
    and manager create named boards (e.g. "Summer programs", "Teachers
    for recs", "Books to read together") and drop items into each with
    optional link and notes. Parent is read-only.
11. Run `supabase/migrations/0009_ideas_as_docs.sql`. Converts idea
    boards from rigid item rows into **free-text docs**: adds a
    `content` column to `idea_boards`, folds any existing `idea_items`
    into their board's body, then drops the items table. Also creates
    `growth_reminders`, a cache for AI-extracted deadlines / follow-ups
    from the board notes. The Growth page now shows a **Reminders**
    section below Ideas & options — click "Scan boards" to pull out
    concrete things to remember with date chips and jump-to-source
    links.
    (If you're upgrading an existing project, run whichever migrations
    you haven't applied yet — the earlier ones haven't changed.)

### 1a. Disable email confirmation for sign-ups

The sign-up flow uses `admin.createUser({ email_confirm: true })` to auto-confirm,
so you don't need to change anything here unless you also want end users to
verify their email. The manager-approval step is the real gate.

## 2. Anthropic (Claude)

Get an API key from [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
and stash it as `ANTHROPIC_API_KEY`. The default model is
`claude-sonnet-4-5` (strong strategic reasoning, fine for the stage overview).
Override with `ANTHROPIC_MODEL` if you'd like a cheaper/faster or deeper
option (e.g. `claude-haiku-4-5`, `claude-opus-4-5`).

The stage generator uses **tool use** rather than freeform JSON, so Claude
is forced to return output matching the expected schema — no fragile prose
parsing.

## 3. Email (optional, for approvals)

If you skip this, approval links are printed to the server console — fine
for local development.

1. Sign up at [resend.com](https://resend.com) → create an API key →
   `RESEND_API_KEY`.
2. `MANAGER_EMAIL` — where approval requests get sent (your email).
3. `FROM_EMAIL` — a verified sender. For quick testing,
   `onboarding@resend.dev` works out of the box.

## 4. `.env.local`

```bash
cp .env.example .env.local
```

Fill in the values from steps 1–3. Also set:

```
APPROVAL_SECRET=<any long random string; e.g. openssl rand -hex 32>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 5. Install + run

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`. You'll land on the sign-in page.

## 6. Bootstrap yourself as manager

The sign-up form only offers `counselor`, `student`, and `parent` — there's
no self-service path to `manager`. Do this once, manually:

1. Go to `/sign-up` and create an account for yourself. Any role is fine —
   you'll change it in the next step.
2. In the Supabase **Table Editor → profiles**, find your row and:
   - Set `role` to `manager`
   - Set `status` to `approved`
3. Sign out and sign back in.

You can now approve future users by clicking the links in the emails you
receive (or the ones printed to the Next.js terminal if `RESEND_API_KEY` is
blank).

## 7. First real account

1. Have the student sign up with role `Student`. Approve them.
2. Have the counselor sign up with role `Counselor` and the student's email
   in "Email of the student you support". Approve them — the approval handler
   creates a `support_links` row automatically.
3. Have the parent do the same with role `Parent`.

Everyone now lands on the dashboard showing the same plan, with controls
gated by role.

## Local dev tips

- Revoke and re-issue `APPROVAL_SECRET` invalidates every outstanding
  approval link — use this if you ever leak one.
- The RLS helper `public.current_role()` and `public.can_view_student(sid)`
  are the two functions to read if you ever wonder why a query is blocked.
- To reset your local plan, the simplest path is:
  `DELETE FROM stages; DELETE FROM monthly_goals; DELETE FROM weekly_todos; DELETE FROM timeline_items;`
  in the Supabase SQL editor. Auth users stay intact.
- The Dashboard (`/`) is the "right now" view. The Timeline (`/timeline`)
  is the multi-month roadmap. They share the same student plan — items
  on the timeline can be linked to a monthly goal so they show up as
  chips on the dashboard, and edits on either page revalidate the other.
- The Meetings page (`/meetings`) is where counselor and student align:
  counselors schedule meetings, drop in a Zoom link, and can ask AI to
  suggest an agenda grounded in the current stage + goals + upcoming
  deadlines. After a meeting, counselors paste their notes and run AI
  extract to get a summary + proposed adjustments they can accept or
  reject one-by-one. Students can request new meetings (the counselor
  is emailed) and add private, append-only reflections after each
  meeting — those are visible only to the student and can be
  summarized by AI into a narrative paragraph.

## Deploying

Anywhere that runs Next.js works (Vercel, Fly, self-host). Remember to set
every variable from `.env.example` in the host's secret store, and update
`NEXT_PUBLIC_APP_URL` to your production URL so approval emails contain the
right link.
