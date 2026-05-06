import type { Role } from "@/types/db";

// UI-side mirror of the DB policies. The server is still the source of truth;
// these are just for hiding controls.
export const can = {
  editStage: (r: Role) => r === "counselor" || r === "manager",
  editMonthlyGoals: (r: Role) => r === "counselor" || r === "manager",
  // Counselor + the student themselves can mark a monthly goal as achieved.
  // Field-level enforcement happens in actions/goals.ts.
  markGoalAchievement: (r: Role) =>
    r === "counselor" || r === "manager" || r === "student",
  // Counselors + managers can add/delete and edit anything on a todo.
  manageTodos: (r: Role) => r === "counselor" || r === "manager",
  // Students can update status + notes on their own todos (enforced server-side).
  updateTodoProgress: (r: Role) =>
    r === "counselor" || r === "manager" || r === "student",
  // Timeline items are higher-level roadmap entries — counselor/manager only.
  manageTimeline: (r: Role) => r === "counselor" || r === "manager",
  // Meeting scheduling, notes, agenda editing, suggestion decisions.
  manageMeetings: (r: Role) => r === "counselor" || r === "manager",
  // Students can request a meeting with a topic.
  requestMeeting: (r: Role) => r === "student",
  // Reflections are private to the student.
  writeReflection: (r: Role) => r === "student",
  // Anyone linked to the student can add/remove items in the shared
  // meeting-topic backlog. Enforced by Supabase RLS as well.
  manageTopics: (_r: Role) => true,
  // Growth page: counselor + student + manager can build the narrative
  // and the activities bank together. Parent is read-only.
  editNarrative: (r: Role) =>
    r === "counselor" || r === "student" || r === "manager",
  editActivities: (r: Role) =>
    r === "counselor" || r === "student" || r === "manager",
  refreshGrowthInsights: (r: Role) =>
    r === "counselor" || r === "student" || r === "manager",
  // Shared "ideas / things we're considering" boards. Parent read-only.
  editIdeas: (r: Role) =>
    r === "counselor" || r === "student" || r === "manager",
  // Journal is private to the student.
  writeJournal: (r: Role) => r === "student",
  approveUsers: (r: Role) => r === "manager",
};

// Display labels. Chinese strings live directly here rather than going
// through next-intl because these maps are imported by server code too
// (emails, approval HTML) where React context is unavailable. Mirrored
// in messages/zh-CN.json under "roles" / "roleBlurb" so a future toggle
// has a single place to branch.
export const roleLabel: Record<Role, string> = {
  counselor: "顾问",
  student: "学生",
  parent: "家长",
  manager: "管理者",
};

export const roleBlurb: Record<Role, string> = {
  counselor: "你可以规划阶段目标、调整时间线、接受或拒绝 AI 建议。",
  student: "记录学习进展、勾选任务、写下反思，让你的故事逐渐成形。",
  parent: "你可以查看进展、了解近况；编辑权限在顾问与学生手中。",
  manager: "系统管理员：审批用户、串联各方。",
};
