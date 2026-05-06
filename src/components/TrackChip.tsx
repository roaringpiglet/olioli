import { TRACKS, trackById } from "@/lib/tracks";
import type { TimelineTrack } from "@/types/db";

interface ChipProps {
  track: TimelineTrack | null | undefined;
  muted?: boolean;
}

// Small colored pill that identifies which of the six tracks a piece of
// content belongs to. Used on goals, todos, and timeline items so the
// visual language stays consistent across views.
export function TrackChip({ track, muted }: ChipProps) {
  if (!track) return null;
  const t = trackById[track];
  return (
    <span
      className={`chip ${t.chip} ${muted ? "opacity-70" : ""}`}
      title={t.blurb}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
      {t.label}
    </span>
  );
}

interface SelectProps {
  value: TimelineTrack | null;
  onChange: (t: TimelineTrack | null) => void;
  disabled?: boolean;
  id?: string;
  // When true the first option reads "Uncategorized" instead of "(optional)".
  includeUncategorized?: boolean;
}

// Dropdown for picking one of the six tracks (or leaving it uncategorized).
// Kept as a plain <select> so it plays nicely with existing form styling.
export function TrackSelect({
  value,
  onChange,
  disabled,
  id,
  includeUncategorized = true,
}: SelectProps) {
  return (
    <select
      id={id}
      className="input"
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v ? (v as TimelineTrack) : null);
      }}
    >
      {includeUncategorized ? (
        <option value="">— 未分类 —</option>
      ) : null}
      {TRACKS.map((t) => (
        <option key={t.id} value={t.id}>
          {t.label}
        </option>
      ))}
    </select>
  );
}
