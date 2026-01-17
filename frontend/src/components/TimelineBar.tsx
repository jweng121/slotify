import type { Slot } from "./SlotCards";

type TimelineBarProps = {
  slots: Slot[];
  duration?: number | null;
  selectedId: string | null;
};

const parseTime = (value: string) => {
  const parts = value.split(":").map((part) => Number.parseInt(part, 10));
  if (parts.length === 2 && parts.every(Number.isFinite)) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
};

const formatLabel = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
};

const TimelineBar = ({ slots, duration, selectedId }: TimelineBarProps) => {
  const total = duration && duration > 0 ? duration : 60;

  return (
    <div className="timeline">
      <div className="timeline-labels">
        <span>0:00</span>
        <span>{formatLabel(total)}</span>
      </div>
      <div className="timeline-track">
        {slots.map((slot) => {
          const position = Math.min(100, (parseTime(slot.time) / total) * 100);
          return (
            <span
              key={slot.id}
              className={`timeline-marker ${
                slot.id === selectedId ? "active" : ""
              }`}
              style={{ left: `${position}%` }}
              title={slot.time}
            />
          );
        })}
      </div>
    </div>
  );
};

export default TimelineBar;
