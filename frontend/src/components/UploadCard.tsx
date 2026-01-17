import { useState, type DragEvent } from "react";

type AudioMeta = {
  name?: string;
  sizeLabel?: string;
  durationLabel?: string;
};

type UploadCardProps = {
  audioFile: File | null;
  audioMeta: AudioMeta;
  sponsorText: string;
  onSponsorChange: (value: string) => void;
  onFileSelect: (file: File | null) => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
};

const UploadCard = ({
  audioFile,
  audioMeta,
  sponsorText,
  onSponsorChange,
  onFileSelect,
  onAnalyze,
  isAnalyzing,
}: UploadCardProps) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const nextFile = event.dataTransfer.files?.[0] ?? null;
    if (nextFile) onFileSelect(nextFile);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  return (
    <section className="card workflow-card reveal">
      <h2>Create a New Insertion Job</h2>
      <p className="muted">
        Upload your audio and paste the sponsor script to get started.
      </p>
      <div className="field">
        <label>Main Audio File</label>
        <div
          className={`dropzone ${isDragging ? "dragging" : ""}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <input
            type="file"
            accept=".mp3,.wav"
            onChange={(event) =>
              onFileSelect(event.target.files?.[0] ?? null)
            }
          />
          <div>
            <p>Drop your audio file here</p>
            <span>or click to browse - MP3 or WAV</span>
          </div>
        </div>
        {audioFile && (
          <div className="file-meta">
            <span>{audioMeta.name ?? audioFile.name}</span>
            <span>{audioMeta.sizeLabel ?? "Size pending"}</span>
            <span>{audioMeta.durationLabel ?? "Duration pending"}</span>
          </div>
        )}
      </div>
      <div className="field">
        <label>Sponsor Ad Text</label>
        <textarea
          rows={4}
          placeholder="This episode is brought to you by Acme Corp - the smarter way to manage your workflow. Visit acme.co/podcast for 20% off."
          value={sponsorText}
          onChange={(event) => onSponsorChange(event.target.value)}
        />
        <span className="helper">
          Keep it 1 sentence (~8-12 seconds spoken).
        </span>
      </div>
      <button
        type="button"
        className="btn btn-primary"
        onClick={onAnalyze}
        disabled={isAnalyzing}
      >
        {isAnalyzing ? "Analyzing..." : "Analyze & Recommend Slots"}
        {isAnalyzing && <span className="spinner" />}
      </button>
    </section>
  );
};

export default UploadCard;
