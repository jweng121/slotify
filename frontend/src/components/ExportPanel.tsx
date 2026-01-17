import type { Slot } from "./SlotCards";

type ExportPanelProps = {
  slot: Slot | null;
  sponsorText: string;
  isRendering: boolean;
  exportUrl: string | null;
  onRender: () => void;
};

const ExportPanel = ({
  slot,
  sponsorText,
  isRendering,
  exportUrl,
  onRender,
}: ExportPanelProps) => {
  if (!slot) return null;

  return (
    <section className="card export-card">
      <h2>Render & Export</h2>
      <p className="muted">
        Review your settings and export the final audio with the sponsor ad
        inserted.
      </p>
      <div className="export-summary">
        <div className="summary-item">
          <span>Insert Time</span>
          <strong>{slot.time}</strong>
        </div>
        <div className="summary-item">
          <span>Confidence</span>
          <strong>{slot.confidence}%</strong>
        </div>
        <div className="summary-item wide">
          <span>Sponsor Script</span>
          <strong>{sponsorText || "Add sponsor text to continue."}</strong>
        </div>
      </div>
      <button
        type="button"
        className="btn btn-primary"
        onClick={onRender}
        disabled={isRendering}
      >
        {isRendering ? "Rendering..." : "Insert & Render Final MP3"}
        {isRendering && <span className="spinner" />}
      </button>
      {exportUrl && (
        <div className="export-ready">
          <div className="success-banner">Export ready</div>
          <audio controls src={exportUrl} className="audio-player" />
          <div className="export-meta">
            <span>slotify_export.mp3</span>
            <span>Inserted at {slot.time}</span>
          </div>
          <a className="btn btn-success" href={exportUrl} download>
            Download MP3
          </a>
        </div>
      )}
    </section>
  );
};

export default ExportPanel;
