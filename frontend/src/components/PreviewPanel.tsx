import type { Slot } from "./SlotCards";

type PreviewPanelProps = {
  slot: Slot | null;
  previewUrl: string | null;
  isLoading: boolean;
};

const PreviewPanel = ({ slot, previewUrl, isLoading }: PreviewPanelProps) => {
  if (!slot) return null;

  return (
    <section className="card preview-card">
      <h2>Preview Transition</h2>
      <p className="muted">
        3 seconds before insertion, sponsor read, 3 seconds after.
      </p>
      <div className="preview-body">
        <div className="preview-meta">
          <span className="badge">{slot.confidence}% confidence</span>
          <span className="muted">Selected slot: {slot.time}</span>
        </div>
        {isLoading && <p className="muted">Preview rendering...</p>}
        {previewUrl && (
          <audio controls src={previewUrl} className="audio-player" />
        )}
      </div>
    </section>
  );
};

export default PreviewPanel;
