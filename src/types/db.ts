// Hand-written row types, one per table. Mirrors supabase/migrations/0001_initial.sql.
// Keep in sync when the schema changes.

export type Role = "counselor" | "student" | "parent" | "manager";
export type UserStatus = "pending" | "approved" | "rejected";
export type TodoStatus = "todo" | "in_progress" | "done";

export type TimelineTrack =
  | "academic"
  | "testing"
  | "extracurriculars"
  | "portfolio"
  | "college_application"
  | "personal_development";

export type TimelineStatus = "planned" | "active" | "done";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  status: UserStatus;
  requested_student_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupportLink {
  id: string;
  supporter_id: string;
  student_id: string;
  created_at: string;
}

export interface FocusArea {
  area: string; // e.g. "Academics", "Extracurriculars"
  note: string;
}

export interface Stage {
  id: string;
  student_id: string;
  title: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  why_it_matters: string | null;
  focus_areas: FocusArea[];
  ai_generated: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MonthlyGoal {
  id: string;
  student_id: string;
  month: string; // YYYY-MM-01
  title: string;
  description: string | null;
  order: number;
  track: TimelineTrack | null;
  thread: string | null;
  achieved_at: string | null;
  achieved_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WeeklyTodo {
  id: string;
  student_id: string;
  week_start: string; // YYYY-MM-DD (Monday)
  monthly_goal_id: string | null;
  title: string;
  status: TodoStatus;
  notes: string | null;
  order: number;
  track: TimelineTrack | null;
  completed_at: string | null;
  completed_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimelineItem {
  id: string;
  student_id: string;
  track: TimelineTrack;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  status: TimelineStatus;
  monthly_goal_id: string | null;
  thread: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type MeetingStatus =
  | "requested"
  | "scheduled"
  | "completed"
  | "cancelled"
  | "rejected";

export interface AgendaItem {
  id: string;
  text: string;
  done?: boolean;
}

// Post-meeting AI extract — a short narrative + bulleted "what changed".
export interface MeetingAIExtract {
  summary: string;
  key_updates: string[];
}

// AI-proposed adjustment that needs counselor approval.
// We intentionally keep this as free-form "text to act on" for the MVP:
// the counselor reviews, accepts/rejects, then makes the underlying edit
// (goal/task/etc) themselves. No automatic writes to other tables.
export type MeetingSuggestionKind =
  | "goal"
  | "task"
  | "timeline"
  | "narrative"
  | "other";

export type MeetingSuggestionDecision = "pending" | "accepted" | "rejected";

export interface MeetingSuggestion {
  id: string;
  kind: MeetingSuggestionKind;
  title: string;
  rationale: string;
  status: MeetingSuggestionDecision;
  decided_by?: string | null;
  decided_at?: string | null;
}

export interface Meeting {
  id: string;
  student_id: string;
  title: string;
  scheduled_at: string | null;
  duration_minutes: number | null;
  meeting_link: string | null;
  status: MeetingStatus;
  agenda: AgendaItem[];
  notes: string | null;
  ai_extracted: MeetingAIExtract | null;
  ai_suggestions: MeetingSuggestion[];
  request_topic: string | null;
  requested_by: string | null;
  rejection_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MeetingReflection {
  id: string;
  meeting_id: string;
  student_id: string;
  content: string;
  ai_summary: string | null;
  created_at: string;
}

export type TopicStatus = "open" | "scheduled" | "completed";

export interface MeetingTopic {
  id: string;
  student_id: string;
  title: string;
  notes: string | null;
  duration_minutes: number | null;
  status: TopicStatus;
  scheduled_meeting_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ---------- Growth ----------
export type NarrativeKind =
  | "theme"
  | "value"
  | "story"
  | "growth_area"
  | "direction";

export interface NarrativeEntry {
  id: string;
  student_id: string;
  kind: NarrativeKind;
  title: string;
  content: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface JournalEntry {
  id: string;
  student_id: string;
  entry_date: string; // YYYY-MM-DD
  content: string;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  student_id: string;
  title: string;
  description: string | null;
  motivation: string | null;
  learning_outcomes: string | null;
  narrative_relevance: string | null;
  ai_summary: string | null;
  start_date: string | null;
  end_date: string | null;
  hours_per_week: number | null;
  role_label: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Each field of the AI synthesis. Stored in growth_insights.<field> as
// jsonb arrays of these shapes. Keep small and specific.
export interface ThemeInsight {
  title: string;
  evidence: string;
}
export interface ValuePattern {
  value: string;
  signal: string;
}
export interface NarrativeDirection {
  direction: string;
  why: string;
}
export interface GrowthArea {
  area: string;
  why: string;
}
export type RecommendationKind =
  | "book"
  | "practice"
  | "conversation"
  | "project"
  | "other";
export interface Recommendation {
  action: string;
  kind: RecommendationKind;
  detail: string;
}

export interface GrowthInsight {
  student_id: string;
  headline: string | null;
  emerging_themes: ThemeInsight[];
  value_patterns: ValuePattern[];
  narrative_directions: NarrativeDirection[];
  growth_areas: GrowthArea[];
  recommendations: Recommendation[];
  generated_at: string;
  generated_by: string | null;
}

export interface IdeaBoard {
  id: string;
  student_id: string;
  title: string;
  description: string | null;
  content: string | null;
  order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ReminderUrgency = "soon" | "upcoming" | "later";

export interface GrowthReminder {
  id: string;
  title: string;
  detail: string;
  date: string | null; // YYYY-MM-DD if a concrete date was detected
  urgency: ReminderUrgency;
  source_board_id: string | null;
}

export interface GrowthReminderState {
  student_id: string;
  reminders: GrowthReminder[];
  generated_at: string;
  generated_by: string | null;
}

// Expanded profile used in the UI: profile + the student they're scoped to.
export interface SessionContext {
  profile: Profile;
  studentId: string | null; // id of the student whose plan this user sees
}
