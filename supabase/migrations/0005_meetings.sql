-- ======================================================================
-- College Application OS — Meetings (Collaboration & Alignment)
--
-- Two tables:
--   * meetings               — shared, readable by anyone linked to the
--                              student. Writable by counselor/manager;
--                              students can INSERT a row in 'requested'
--                              state (a meeting request).
--   * meeting_reflections    — append-only, private to the student. Only
--                              the student can read or write them. Their
--                              AI summary may be shared through the
--                              meeting itself (counselor-visible) via a
--                              separate explicit action, not through RLS.
--
-- AI-assisted flows live in jsonb columns:
--   * meetings.agenda         — [ { id, text, done? } ]
--   * meetings.ai_extracted   — { summary, key_updates: [...] }
--   * meetings.ai_suggestions — [ { id, kind, title, rationale,
--                                   status: pending|accepted|rejected,
--                                   decided_by, decided_at } ]
-- ======================================================================

create type public.meeting_status as enum (
  'requested',    -- student asked; counselor hasn't decided
  'scheduled',    -- confirmed upcoming
  'completed',    -- past, has notes
  'cancelled',    -- was scheduled, then called off
  'rejected'      -- student's request was declined
);

create table if not exists public.meetings (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.profiles(id) on delete cascade,
  title             text not null,
  scheduled_at      timestamptz,
  duration_minutes  int default 30,
  meeting_link      text,
  status            public.meeting_status not null default 'scheduled',
  agenda            jsonb not null default '[]'::jsonb,
  notes             text,
  ai_extracted      jsonb,
  ai_suggestions    jsonb not null default '[]'::jsonb,
  request_topic     text,
  requested_by      uuid references public.profiles(id),
  rejection_reason  text,
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists meetings_student_when_idx
  on public.meetings(student_id, scheduled_at);
create index if not exists meetings_student_status_idx
  on public.meetings(student_id, status);

alter table public.meetings enable row level security;

-- Anyone linked to the student can see the meeting list.
drop policy if exists meetings_read on public.meetings;
create policy meetings_read on public.meetings
  for select using (public.can_view_student(student_id));

-- Counselor / manager write anything. Students may INSERT a 'requested'
-- meeting for themselves and UPDATE their own still-pending request. They
-- cannot flip other statuses or touch anyone else's rows.
drop policy if exists meetings_counselor_write on public.meetings;
create policy meetings_counselor_write on public.meetings
  for all using (
    public.is_approved() and (
      public.current_role() = 'manager' or (
        public.current_role() = 'counselor'
        and public.can_view_student(student_id)
      )
    )
  ) with check (
    public.is_approved() and (
      public.current_role() = 'manager' or (
        public.current_role() = 'counselor'
        and public.can_view_student(student_id)
      )
    )
  );

drop policy if exists meetings_student_request_insert on public.meetings;
create policy meetings_student_request_insert on public.meetings
  for insert with check (
    public.is_approved()
    and public.current_role() = 'student'
    and auth.uid() = student_id
    and status = 'requested'
    and requested_by = auth.uid()
  );

drop policy if exists meetings_student_request_update on public.meetings;
create policy meetings_student_request_update on public.meetings
  for update using (
    public.is_approved()
    and public.current_role() = 'student'
    and auth.uid() = student_id
    and status = 'requested'
    and requested_by = auth.uid()
  ) with check (
    public.is_approved()
    and public.current_role() = 'student'
    and auth.uid() = student_id
    and status = 'requested'
    and requested_by = auth.uid()
  );

drop trigger if exists meetings_touch on public.meetings;
create trigger meetings_touch before update on public.meetings
  for each row execute function public.tg_touch_updated_at();

-- ---------------------------------------------------------------
-- meeting_reflections  — append-only, private to the student
-- ---------------------------------------------------------------
create table if not exists public.meeting_reflections (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references public.meetings(id) on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  content     text not null,
  ai_summary  text,
  created_at  timestamptz not null default now()
);

create index if not exists meeting_reflections_meeting_idx
  on public.meeting_reflections(meeting_id, created_at);

alter table public.meeting_reflections enable row level security;

-- Only the student themselves (or the manager, for admin access) can see
-- or add reflections. No UPDATE or DELETE policies — these are meant to
-- be immutable once written.
drop policy if exists meeting_reflections_self_read on public.meeting_reflections;
create policy meeting_reflections_self_read on public.meeting_reflections
  for select using (
    public.is_approved() and (
      auth.uid() = student_id or public.current_role() = 'manager'
    )
  );

drop policy if exists meeting_reflections_self_insert on public.meeting_reflections;
create policy meeting_reflections_self_insert on public.meeting_reflections
  for insert with check (
    public.is_approved()
    and public.current_role() = 'student'
    and auth.uid() = student_id
  );
