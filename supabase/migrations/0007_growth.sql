-- ======================================================================
-- College Application OS — Growth (narrative + activities)
--
-- A space for developing self-understanding over time. Combines:
--   * narrative_entries — collaborative story threads (themes, values,
--     story moments, growth areas, directions) edited by counselor and
--     student.
--   * journal_entries   — student's private freeform journal. Only the
--     student (and the manager, for system ops) can read these. The AI
--     can read them internally when building insights, but counselors
--     and parents never see raw entries.
--   * activities        — the Activities Bank: description, motivation,
--     learning outcomes, narrative relevance, plus an AI-generated
--     narrative overview per activity.
--   * growth_insights   — cached AI synthesis (themes, value patterns,
--     narrative directions, growth areas, concrete coach-style
--     recommendations).
-- ======================================================================

-- ---------- narrative_entries ----------
create type public.narrative_kind as enum (
  'theme',        -- recurring idea about who the student is
  'value',        -- what they care about
  'story',        -- specific event / story moment
  'growth_area',  -- something to work on
  'direction'     -- where they're heading
);

create table if not exists public.narrative_entries (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  kind        public.narrative_kind not null default 'theme',
  title       text not null,
  content     text,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists narrative_entries_student_idx
  on public.narrative_entries(student_id, kind);

alter table public.narrative_entries enable row level security;

drop policy if exists narrative_entries_read on public.narrative_entries;
create policy narrative_entries_read on public.narrative_entries
  for select using (public.can_view_student(student_id));

-- Counselor, student, and manager can write — parent is read-only.
drop policy if exists narrative_entries_write on public.narrative_entries;
create policy narrative_entries_write on public.narrative_entries
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'approved'
        and p.role in ('counselor', 'student', 'manager')
        and public.can_view_student(student_id)
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'approved'
        and p.role in ('counselor', 'student', 'manager')
        and public.can_view_student(student_id)
    )
  );

drop trigger if exists narrative_entries_touch on public.narrative_entries;
create trigger narrative_entries_touch before update on public.narrative_entries
  for each row execute function public.tg_touch_updated_at();

-- ---------- journal_entries (student-private) ----------
create table if not exists public.journal_entries (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  entry_date  date not null default (now() at time zone 'utc')::date,
  content     text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists journal_entries_student_date_idx
  on public.journal_entries(student_id, entry_date desc);

alter table public.journal_entries enable row level security;

-- Only the student themselves (or manager) can read/write their journal.
-- Counselors and parents see nothing here. The AI endpoint uses the
-- service-role client internally for synthesis, which bypasses RLS.
drop policy if exists journal_entries_owner_read on public.journal_entries;
create policy journal_entries_owner_read on public.journal_entries
  for select using (
    student_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'manager' and p.status = 'approved'
    )
  );

drop policy if exists journal_entries_owner_write on public.journal_entries;
create policy journal_entries_owner_write on public.journal_entries
  for all using (
    student_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'manager' and p.status = 'approved'
    )
  ) with check (
    student_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'manager' and p.status = 'approved'
    )
  );

drop trigger if exists journal_entries_touch on public.journal_entries;
create trigger journal_entries_touch before update on public.journal_entries
  for each row execute function public.tg_touch_updated_at();

-- ---------- activities ----------
create table if not exists public.activities (
  id                  uuid primary key default gen_random_uuid(),
  student_id          uuid not null references public.profiles(id) on delete cascade,
  title               text not null,
  description         text,
  motivation          text,
  learning_outcomes   text,
  narrative_relevance text,
  ai_summary          text,
  start_date          date,
  end_date            date,
  hours_per_week      int,
  role_label          text,
  created_by          uuid references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists activities_student_idx
  on public.activities(student_id, created_at desc);

alter table public.activities enable row level security;

drop policy if exists activities_read on public.activities;
create policy activities_read on public.activities
  for select using (public.can_view_student(student_id));

drop policy if exists activities_write on public.activities;
create policy activities_write on public.activities
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'approved'
        and p.role in ('counselor', 'student', 'manager')
        and public.can_view_student(student_id)
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'approved'
        and p.role in ('counselor', 'student', 'manager')
        and public.can_view_student(student_id)
    )
  );

drop trigger if exists activities_touch on public.activities;
create trigger activities_touch before update on public.activities
  for each row execute function public.tg_touch_updated_at();

-- ---------- growth_insights (cached AI synthesis) ----------
-- One row per student. Refreshed on demand by counselor/student/manager.
-- Parent can read the synthesis (it intentionally does not expose raw
-- journal text) but cannot trigger a refresh or write.
create table if not exists public.growth_insights (
  student_id           uuid primary key references public.profiles(id) on delete cascade,
  emerging_themes      jsonb not null default '[]'::jsonb,
  value_patterns       jsonb not null default '[]'::jsonb,
  narrative_directions jsonb not null default '[]'::jsonb,
  growth_areas         jsonb not null default '[]'::jsonb,
  recommendations      jsonb not null default '[]'::jsonb,
  headline             text,
  generated_at         timestamptz not null default now(),
  generated_by         uuid references public.profiles(id)
);

alter table public.growth_insights enable row level security;

drop policy if exists growth_insights_read on public.growth_insights;
create policy growth_insights_read on public.growth_insights
  for select using (public.can_view_student(student_id));

drop policy if exists growth_insights_write on public.growth_insights;
create policy growth_insights_write on public.growth_insights
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'approved'
        and p.role in ('counselor', 'student', 'manager')
        and public.can_view_student(student_id)
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'approved'
        and p.role in ('counselor', 'student', 'manager')
        and public.can_view_student(student_id)
    )
  );
