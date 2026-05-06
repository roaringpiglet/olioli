import type { TimelineTrack, TimelineStatus } from "@/types/db";

export interface TrackMeta {
  id: TimelineTrack;
  label: string;
  blurb: string;
  // Tailwind classes applied to the lane bar background and the chip.
  bar: string;
  chip: string;
  dot: string;
}

// Display order on the timeline (top → bottom). Chinese labels are
// mirrored in messages/zh-CN.json under "tracks.*" so a future English
// toggle has a single place to branch; for now we keep them inline
// because this map is imported by server code (AI prompt builders).
export const TRACKS: TrackMeta[] = [
  {
    id: "academic",
    label: "学术",
    blurb: "校内课程、学期测试、成绩单关键节点。",
    bar: "bg-sky-500",
    chip: "bg-sky-100 text-sky-800",
    dot: "bg-sky-500",
  },
  {
    id: "testing",
    label: "标化考试",
    blurb: "TOEFL、SAT/ACT、AP、IB 等考试的报名与备考。",
    bar: "bg-violet-500",
    chip: "bg-violet-100 text-violet-800",
    dot: "bg-violet-500",
  },
  {
    id: "extracurriculars",
    label: "课外活动",
    blurb: "社团、项目、竞赛、领导经历。",
    bar: "bg-emerald-500",
    chip: "bg-emerald-100 text-emerald-800",
    dot: "bg-emerald-500",
  },
  {
    id: "portfolio",
    label: "作品集",
    blurb: "项目、写作、艺术、代码、研究。",
    bar: "bg-amber-500",
    chip: "bg-amber-100 text-amber-800",
    dot: "bg-amber-500",
  },
  {
    id: "college_application",
    label: "申请准备",
    blurb: "选校、文书、推荐信、网申各环节。",
    bar: "bg-rose-500",
    chip: "bg-rose-100 text-rose-800",
    dot: "bg-rose-500",
  },
  {
    id: "personal_development",
    label: "个人成长",
    blurb: "阅读、反思、导师对话、长期成长的练习。",
    bar: "bg-fuchsia-500",
    chip: "bg-fuchsia-100 text-fuchsia-800",
    dot: "bg-fuchsia-500",
  },
];

export const trackById: Record<TimelineTrack, TrackMeta> = TRACKS.reduce(
  (acc, t) => {
    acc[t.id] = t;
    return acc;
  },
  {} as Record<TimelineTrack, TrackMeta>
);

export const STATUS_LABEL: Record<TimelineStatus, string> = {
  planned: "计划中",
  active: "进行中",
  done: "已完成",
};

export const STATUS_CHIP: Record<TimelineStatus, string> = {
  planned: "bg-ink-100 text-ink-700",
  active: "bg-brand-100 text-brand-700",
  done: "bg-emerald-100 text-emerald-700",
};
