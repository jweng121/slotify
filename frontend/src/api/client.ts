const apiBase =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

export type ApiSlot = {
  time?: string;
  confidence?: number;
  pros?: string[];
  cons?: string[];
  rationale?: string;
};

type JsonRecord = Record<string, unknown>;

const isJson = (contentType: string | null) =>
  Boolean(contentType && contentType.includes("application/json"));

const safeJson = async (response: Response) => {
  try {
    return (await response.json()) as JsonRecord;
  } catch {
    return null;
  }
};

export const analyzeSlots = async (
  audio: File,
  sponsorText: string,
): Promise<ApiSlot[]> => {
  const form = new FormData();
  form.append("audio", audio);
  form.append("sponsorText", sponsorText);

  const response = await fetch(`${apiBase}/api/analyze`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Analyze request failed.");
  }

  const data = await safeJson(response);
  if (!data) return [];

  const payload = Array.isArray(data) ? data : data.slots;
  return Array.isArray(payload) ? (payload as ApiSlot[]) : [];
};

export const fetchPreview = async (slotTime: string): Promise<string> => {
  const response = await fetch(
    `${apiBase}/api/preview?slot=${encodeURIComponent(slotTime)}`,
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Preview request failed.");
  }

  if (isJson(response.headers.get("content-type"))) {
    const data = await safeJson(response);
    const url = data?.url;
    if (typeof url === "string") return url;
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
};

export const renderFinal = async (
  slotTime: string,
  sponsorText: string,
): Promise<string> => {
  const response = await fetch(`${apiBase}/api/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slotTime, sponsorText }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Render request failed.");
  }

  if (isJson(response.headers.get("content-type"))) {
    const data = await safeJson(response);
    const url = data?.url;
    if (typeof url === "string") return url;
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
};
