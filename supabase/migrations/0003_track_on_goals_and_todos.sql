-- ======================================================================
-- College Application OS — categorize goals and todos by track
--
-- Reuses the public.timeline_track enum created in 0002. Adds an optional
-- track column to monthly_goals and weekly_todos so every piece of the
-- plan (strategy → goals → weekly todos → timeline items) can be read
-- against the same six aspects.
--
-- Apply this AFTER 0002. Existing rows stay NULL (uncategorized) and can
-- be tagged from the UI.
-- ======================================================================

alter table public.monthly_goals
    add column if not exists track public.timeline_track;

alter table public.weekly_todos
    add column if not exists track public.timeline_track;

create index if not exists monthly_goals_track_idx
    on public.monthly_goals(student_id, track);
create index if not exists weekly_todos_track_idx
    on public.weekly_todos(student_id, track);
