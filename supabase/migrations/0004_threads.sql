-- Throughlines: named ongoing threads of work inside a track.
-- Examples under "Extracurriculars":
--   - "Parsons Summer School"
--   - "Upcycling Fashion Club"
-- Each gets its own faint strip on the timeline, spanning the period where
-- something is actively happening for it. The strip is computed from every
-- timeline_item and monthly_goal that shares the same (track, thread) pair.

alter table public.timeline_items
  add column if not exists thread text;

alter table public.monthly_goals
  add column if not exists thread text;

-- Weekly todos can inherit their thread from their linked monthly goal, so
-- we don't add a column there yet. (Easy to add later if needed.)

-- Indexes to make per-track/thread lookups cheap when the grid re-groups.
create index if not exists timeline_items_thread_idx
  on public.timeline_items (student_id, track, thread);

create index if not exists monthly_goals_thread_idx
  on public.monthly_goals (student_id, track, thread);
