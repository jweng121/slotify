import { useEffect, useMemo, useRef, useState } from "react";
import { analyzeSlots, fetchPreview, renderFinal } from "../api/client";
import DashboardHeader from "../components/DashboardHeader";
import ExportPanel from "../components/ExportPanel";
import PreviewPanel from "../components/PreviewPanel";
import SlotCards, { type Slot } from "../components/SlotCards";
import Stepper from "../components/Stepper";
import TimelineBar from "../components/TimelineBar";
import ToastStack, { type ToastItem, type ToastTone } from "../components/Toast";
import UploadCard from "../components/UploadCard";

type Step = "upload" | "analyze" | "preview" | "export";

const fallbackSlots: Slot[] = [
  {
    id: "slot-1",
    time: "00:12",
    confidence: 92,
    pros: ["Natural topic shift detected", "Clean pause boundary (0.8s)"],
    cons: ["Slightly early in content"],
    rationale: "Topic transition + natural pause boundary",
  },
  {
    id: "slot-2",
    time: "00:25",
    confidence: 81,
    pros: ["Extended silence detected (1.2s)", "Mid-episode engagement peak"],
    cons: ["Minor audio level mismatch"],
    rationale: "Silence boundary between segments",
  },
  {
    id: "slot-3",
    time: "00:41",
    confidence: 74,
    pros: ["Audio energy valley", "Speaker breath pause"],
    cons: ["Near existing music transition"],
    rationale: "Beat valley alignment + breath pause",
  },
];

const formatBytes = (bytes: number) => {
  if (!bytes) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDuration = (seconds: number | null) => {
  if (!seconds || !Number.isFinite(seconds)) return undefined;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
};

const formatSlotTime = (
  value: string | number | undefined,
  fallback: string,
) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const minutes = Math.floor(value / 60);
    const remainder = Math.floor(value % 60);
    return `${minutes.toString().padStart(2, "0")}:${remainder
      .toString()
      .padStart(2, "0")}`;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    if (value.includes(":")) return value;
    const asNumber = Number.parseFloat(value);
    if (Number.isFinite(asNumber)) {
      const minutes = Math.floor(asNumber / 60);
      const remainder = Math.floor(asNumber % 60);
      return `${minutes.toString().padStart(2, "0")}:${remainder
        .toString()
        .padStart(2, "0")}`;
    }
    return value;
  }
  return fallback;
};

const createSlots = (data: Slot[]) =>
  data.map((slot, index) => ({
    ...slot,
    id: slot.id ?? `slot-${index + 1}`,
  }));

const DashboardPage = () => {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [sponsorText, setSponsorText] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("upload");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [showRightsModal, setShowRightsModal] = useState(false);
  const [rightsChecked, setRightsChecked] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastId = useRef(0);

  const selectedSlot = useMemo(
    () => slots.find((slot) => slot.id === selectedSlotId) ?? null,
    [slots, selectedSlotId],
  );

  useEffect(() => {
    if (!audioFile) {
      setAudioDuration(null);
      return;
    }

    const url = URL.createObjectURL(audioFile);
    const audio = new Audio();
    audio.src = url;
    audio.onloadedmetadata = () => {
      setAudioDuration(audio.duration);
      URL.revokeObjectURL(url);
    };
    audio.onerror = () => {
      setAudioDuration(null);
      URL.revokeObjectURL(url);
    };

    return () => URL.revokeObjectURL(url);
  }, [audioFile]);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (exportUrl?.startsWith("blob:")) URL.revokeObjectURL(exportUrl);
    };
  }, [exportUrl]);

  const pushToast = (message: string, tone: ToastTone) => {
    const id = `${Date.now()}-${toastId.current++}`;
    setToasts((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 4000);
  };

  const resetJob = () => {
    setAudioFile(null);
    setAudioDuration(null);
    setSponsorText("");
    setSlots([]);
    setSelectedSlotId(null);
    setPreviewUrl(null);
    setShowPreview(false);
    setExportUrl(null);
    setShowPreview(false);
    setStep("upload");
    setErrorMessage(null);
    setRightsChecked(false);
    setToasts([]);
  };

  const handleAnalyzeRequest = () => {
    if (!audioFile) {
      setErrorMessage("Upload a main audio file to continue.");
      pushToast("Main audio required", "error");
      return;
    }
    if (!sponsorText.trim()) {
      setErrorMessage("Add sponsor text to continue.");
      pushToast("Sponsor text required", "error");
      return;
    }
    setErrorMessage(null);
    setShowRightsModal(true);
  };

  const handleAnalyze = async () => {
    if (!audioFile) return;
    setShowRightsModal(false);
    setErrorMessage(null);
    setIsAnalyzing(true);
    setStep("analyze");
    setPreviewUrl(null);
    setExportUrl(null);

    try {
      const apiSlots = await analyzeSlots(audioFile, sponsorText);
      const normalized =
        apiSlots.length > 0
          ? apiSlots.map((slot, index) => ({
              id: `slot-${index + 1}`,
              time: formatSlotTime(
                slot.time,
                fallbackSlots[index]?.time ?? "00:00",
              ),
              confidence: Math.round(
                slot.confidence ?? fallbackSlots[index]?.confidence ?? 70,
              ),
              pros: slot.pros?.length
                ? slot.pros
                : fallbackSlots[index]?.pros ?? [],
              cons: slot.cons?.length
                ? slot.cons
                : fallbackSlots[index]?.cons ?? [],
              rationale:
                slot.rationale ??
                fallbackSlots[index]?.rationale ??
                "Optimized insertion point",
            }))
          : createSlots(fallbackSlots);

      setSlots(normalized);
      setSelectedSlotId(null);
      pushToast("Analysis complete", "success");
    } catch (error) {
      setSlots(createSlots(fallbackSlots));
      setSelectedSlotId(null);
      setErrorMessage(
        error instanceof Error
          ? `${error.message} Showing demo slots instead.`
          : "Analyze failed. Showing demo slots instead.",
      );
      pushToast("Analysis complete (demo)", "info");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePreview = async (slot: Slot) => {
    setSelectedSlotId(slot.id);
    setStep("preview");
    setIsPreviewing(true);
    setPreviewUrl(null);
    setShowPreview(true);
    setErrorMessage(null);

    try {
      const url = await fetchPreview(slot.time);
      setPreviewUrl(url);
      pushToast("Preview ready", "success");
    } catch (error) {
      setPreviewUrl("/rogan-test1.mp3");
      setErrorMessage(
        error instanceof Error
          ? `${error.message} Using demo preview.`
          : "Preview failed. Using demo preview.",
      );
      pushToast("Preview ready (demo)", "info");
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleSelectSlot = (slot: Slot) => {
    setSelectedSlotId(slot.id);
    setStep("preview");
  };

  const handleRender = async () => {
    if (!selectedSlot) return;
    setIsRendering(true);
    setExportUrl(null);
    setStep("export");
    setErrorMessage(null);

    try {
      const url = await renderFinal(selectedSlot.time, sponsorText);
      setExportUrl(url);
      pushToast("Export ready", "success");
    } catch (error) {
      setExportUrl("/david-test1.mp3");
      setErrorMessage(
        error instanceof Error
          ? `${error.message} Using demo export.`
          : "Render failed. Using demo export.",
      );
      pushToast("Export ready (demo)", "info");
    } finally {
      setIsRendering(false);
    }
  };

  const audioMeta = useMemo(
    () => ({
      name: audioFile?.name,
      sizeLabel: audioFile ? formatBytes(audioFile.size) : undefined,
      durationLabel: formatDuration(audioDuration),
    }),
    [audioFile, audioDuration],
  );

  return (
    <div className="page dashboard">
      <DashboardHeader onReset={resetJob} />
      <Stepper currentStep={step} />
      {errorMessage && <div className="error-banner">{errorMessage}</div>}
      <UploadCard
        audioFile={audioFile}
        audioMeta={audioMeta}
        sponsorText={sponsorText}
        onSponsorChange={setSponsorText}
        onFileSelect={setAudioFile}
        onAnalyze={handleAnalyzeRequest}
        isAnalyzing={isAnalyzing}
      />

      {slots.length > 0 && (
        <section className="analysis-section">
          <div className="section-header compact">
            <h2>Recommended Insertion Points (Top 3)</h2>
            <p>Optimized for smooth transitions and listener retention.</p>
          </div>
          <TimelineBar
            slots={slots}
            duration={audioDuration ?? undefined}
            selectedId={selectedSlotId}
          />
          <SlotCards
            slots={slots}
            selectedId={selectedSlotId}
            onSelect={handleSelectSlot}
            onPreview={handlePreview}
          />
        </section>
      )}

      {showPreview && (
        <PreviewPanel
          slot={selectedSlot}
          previewUrl={previewUrl}
          isLoading={isPreviewing}
        />
      )}

      <ExportPanel
        slot={selectedSlot}
        sponsorText={sponsorText}
        isRendering={isRendering}
        exportUrl={exportUrl}
        onRender={handleRender}
      />

      {showRightsModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Voice Rights Certification</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowRightsModal(false)}
              >
                x
              </button>
            </div>
            <p className="muted">
              Before proceeding, please confirm that you have the necessary
              rights.
            </p>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={rightsChecked}
                onChange={(event) => setRightsChecked(event.target.checked)}
              />
              <span>
                I certify that I own the rights to this audio and voice. I
                confirm no unauthorized impersonation is involved.
              </span>
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowRightsModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleAnalyze}
                disabled={!rightsChecked}
              >
                Continue to Analysis
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastStack
        items={toasts}
        onDismiss={(id) =>
          setToasts((prev) => prev.filter((toast) => toast.id !== id))
        }
      />
    </div>
  );
};

export default DashboardPage;
