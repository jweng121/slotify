import "dotenv/config";
import cors from "cors";
import express from "express";
import multer from "multer";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const app = express();
const port = Number.parseInt(process.env.PORT ?? "3001", 10);

// Check for ElevenLabs API key
if (!process.env.ELEVENLABS_API_KEY) {
  console.warn(
    "Warning: ELEVENLABS_API_KEY not set. Voice cloning and TTS will fail.",
  );
}

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});
const upload = multer({ storage: multer.memoryStorage() });

const allowedOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("CORS blocked"));
    },
  }),
);
app.use(express.json({ limit: "2mb" }));

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    elevenlabsConfigured: !!process.env.ELEVENLABS_API_KEY,
  });
});

app.post("/api/clone", upload.array("files"), async (req, res) => {
  const files = req.files ?? [];
  if (!Array.isArray(files) || files.length === 0) {
    res.status(400).json({ error: "No audio files uploaded." });
    return;
  }

  if (!process.env.ELEVENLABS_API_KEY) {
    res.status(500).json({
      error:
        "ELEVENLABS_API_KEY not configured. Please set it in your environment variables.",
    });
    return;
  }

  const name = req.body?.name?.toString()?.trim() || "My Voice Clone";
  const tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "voice-clone-"),
  );
  const tempPaths = [];

  try {
    for (const file of files) {
      const safeName = path.basename(file.originalname || "sample.wav");
      const tempPath = path.join(
        tempDir,
        `${Date.now()}-${Math.random().toString(16).slice(2)}-${safeName}`,
      );
      await fs.promises.writeFile(tempPath, file.buffer);
      tempPaths.push(tempPath);
    }

    const streams = tempPaths.map((tempPath) =>
      fs.createReadStream(tempPath),
    );
    const voice = await elevenlabs.voices.ivc.create({
      name,
      files: streams,
    });

    res.json({ voiceId: voice.voiceId });
  } catch (error) {
    console.error("Clone error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Clone failed.";
    res.status(500).json({
      error: errorMessage,
    });
  } finally {
    await Promise.all(
      tempPaths.map((tempPath) =>
        fs.promises.unlink(tempPath).catch(() => undefined),
      ),
    );
    await fs.promises.rmdir(tempDir).catch(() => undefined);
  }
});

const runFfmpeg = (args) =>
  new Promise((resolve, reject) => {
    const process = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    process.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    process.on("error", reject);
    process.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `ffmpeg exited with code ${code}`));
      }
    });
  });

const getAudioDuration = async (filePath) =>
  new Promise((resolve, reject) => {
    const process = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    process.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    process.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    process.on("error", reject);
    process.on("close", (code) => {
      if (code === 0) {
        const duration = Number.parseFloat(stdout.trim());
        resolve(Number.isFinite(duration) && duration > 0 ? duration : null);
      } else {
        reject(new Error(stderr || `ffprobe exited with code ${code}`));
      }
    });
  });

const ensureDir = async (dirPath) => {
  await fs.promises.mkdir(dirPath, { recursive: true });
};

const streamToFile = (readable, filePath) =>
  new Promise((resolve, reject) => {
    const writable = fs.createWriteStream(filePath);
    writable.on("finish", resolve);
    writable.on("error", reject);
    readable.on("error", reject);
    readable.pipe(writable);
  });

const runPythonJson = async (args, cwd) =>
  new Promise((resolve, reject) => {
    const pythonBin = process.env.PYTHON_BIN ?? "python";
    const child = spawn(pythonBin, args, { cwd, env: process.env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `python exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim() || "{}"));
      } catch (parseError) {
        reject(
          new Error(
            `Failed to parse python output: ${parseError?.message ?? "unknown"}`,
          ),
        );
      }
    });
  });

const jobRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "tmp",
);

const resolveJobDir = (jobId) => path.join(jobRoot, jobId);

const loadJob = async (jobId) => {
  const jobPath = path.join(resolveJobDir(jobId), "job.json");
  try {
    const raw = await fs.promises.readFile(jobPath, "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
};

const saveJob = async (jobId, payload) => {
  const dir = resolveJobDir(jobId);
  await ensureDir(dir);
  await fs.promises.writeFile(
    path.join(dir, "job.json"),
    JSON.stringify(payload, null, 2),
  );
};

const estimateSpeechSeconds = (text) => {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (!words) return 3;
  return Math.min(12, Math.max(3, words / 2.8));
};

const ensureSponsorAudio = async ({ jobDir, sponsorText, voiceId }) => {
  const hash = crypto
    .createHash("sha256")
    .update(`${voiceId ?? "default"}::${sponsorText}`)
    .digest("hex")
    .slice(0, 12);
  const sponsorPath = path.join(jobDir, `sponsor-${hash}.mp3`);
  try {
    await fs.promises.access(sponsorPath);
    return sponsorPath;
  } catch {
    // continue
  }

  if (process.env.ELEVENLABS_API_KEY && voiceId) {
    try {
      const audio = await elevenlabs.textToSpeech.convert(voiceId, {
        text: sponsorText,
        modelId: "eleven_multilingual_v2",
        outputFormat: "mp3_44100_128",
      });
      const stream = Readable.fromWeb(audio);
      await streamToFile(stream, sponsorPath);
      return sponsorPath;
    } catch (error) {
      console.warn("ElevenLabs TTS failed, using silence fallback.", error);
    }
  }

  const duration = estimateSpeechSeconds(sponsorText);
  const args = [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=44100:cl=stereo",
    "-t",
    duration.toFixed(2),
    "-c:a",
    "libmp3lame",
    "-q:a",
    "5",
    sponsorPath,
  ];
  await runFfmpeg(args);
  return sponsorPath;
};

app.post(
  "/api/merge",
  upload.fields([
    { name: "audio", maxCount: 1 },
    { name: "insert", maxCount: 1 },
  ]),
  async (req, res) => {
    const audioFile = req.files?.audio?.[0];
    const insertFile = req.files?.insert?.[0];
    const insertAt = Number.parseFloat(req.body?.insertAt ?? "");
    const crossfade = Number.parseFloat(req.body?.crossfade ?? "0.08");
    const pause = Number.parseFloat(req.body?.pause ?? "0.2");

    if (!audioFile || !insertFile) {
      res.status(400).json({ error: "audio and insert files are required." });
      return;
    }

    if (!Number.isFinite(insertAt) || insertAt < 0) {
      res.status(400).json({ error: "insertAt must be a positive number." });
      return;
    }

    if (!Number.isFinite(crossfade) || crossfade < 0) {
      res.status(400).json({ error: "crossfade must be a positive number." });
      return;
    }

    if (!Number.isFinite(pause) || pause < 0) {
      res.status(400).json({ error: "pause must be a positive number." });
      return;
    }

    const tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "voice-merge-"),
    );
    const basePath = path.join(tempDir, "base.mp3");
    const insertPath = path.join(tempDir, "insert.mp3");
    const outPath = path.join(tempDir, "merged.mp3");
    const cleanup = async () => {
      await Promise.all(
        [basePath, insertPath, outPath].map((filePath) =>
          fs.promises.unlink(filePath).catch(() => undefined),
        ),
      );
      await fs.promises.rmdir(tempDir).catch(() => undefined);
    };

    try {
      await fs.promises.writeFile(basePath, audioFile.buffer);
      await fs.promises.writeFile(insertPath, insertFile.buffer);

      // Get main audio duration to validate and clamp insertAt
      const mainDuration = await getAudioDuration(basePath);
      const adDuration = await getAudioDuration(insertPath);

      // Validate and clamp insertAt
      let clampedInsertAt = insertAt;
      if (mainDuration !== null) {
        if (clampedInsertAt < 0) {
          clampedInsertAt = 0;
        } else if (clampedInsertAt > mainDuration) {
          clampedInsertAt = mainDuration;
        }
      }

      // Debug logging
      const expectedDuration =
        mainDuration !== null && adDuration !== null
          ? mainDuration + adDuration
          : null;
      console.log("Merge debug:", {
        mainDuration: mainDuration?.toFixed(3),
        insertDuration: adDuration?.toFixed(3),
        insertAt: insertAt.toFixed(3),
        expectedDuration: expectedDuration?.toFixed(3),
      });

      const filter = [
        `[0:a]aformat=sample_rates=44100:channel_layouts=stereo,` +
          `atrim=0:${clampedInsertAt},asetpts=PTS-STARTPTS[a0]`,
        `[0:a]aformat=sample_rates=44100:channel_layouts=stereo,` +
          `atrim=${clampedInsertAt},asetpts=PTS-STARTPTS[a1]`,
        `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,` +
          `asetpts=PTS-STARTPTS[ad]`,
        `[a0][ad][a1]concat=n=3:v=0:a=1[out]`,
      ].join(";");

      // Input 0: main audio
      // Input 1: insert audio
      const args = [
        "-y",
        "-i", basePath,
        "-i", insertPath,
        "-filter_complex",
        filter,
        "-map",
        "[out]",
        "-c:a",
        "libmp3lame",
        "-q:a",
        "2",
        outPath,
      ];

      await runFfmpeg(args);
      await fs.promises.access(outPath);
      
      // Log final duration for verification
      const finalDuration = await getAudioDuration(outPath).catch(() => null);
      if (finalDuration !== null) {
        console.log("Merge result:", {
          finalDuration: finalDuration.toFixed(3),
          expectedDuration: expectedDuration?.toFixed(3),
          match:
            expectedDuration !== null
              ? Math.abs(finalDuration - expectedDuration) < 0.1
              : "unknown",
        });
      }
      
      res.setHeader("Content-Type", "audio/mpeg");

      const stream = fs.createReadStream(outPath);
      stream.on("error", (streamError) => {
        if (!res.headersSent) {
          res.status(500).json({
            error:
              streamError instanceof Error
                ? streamError.message
                : "Failed to stream merged audio.",
          });
        }
      });
      res.on("close", cleanup);
      res.on("finish", cleanup);
      stream.pipe(res);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Merge failed.",
      });
      await cleanup();
    }
  },
);

app.post("/api/insert-sections", upload.single("audio"), async (req, res) => {
  const audioFile = req.file;
  const count = Number.parseInt(req.body?.count ?? "5", 10);
  const mode = req.body?.mode?.toString()?.trim() || "podcast";

  if (!audioFile) {
    res.status(400).json({ error: "audio file is required." });
    return;
  }

  const tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "insert-sections-"),
  );
  const audioPath = path.join(
    tempDir,
    `${Date.now()}-${audioFile.originalname || "audio.mp3"}`,
  );
  const cleanup = async () => {
    await fs.promises.unlink(audioPath).catch(() => undefined);
    await fs.promises.rmdir(tempDir).catch(() => undefined);
  };

  try {
    await fs.promises.writeFile(audioPath, audioFile.buffer);

    const result = await runPythonJson(
      [
        "-m",
        "ad_inserter.recommend",
        "--audio",
        audioPath,
        "--mode",
        mode === "song" ? "song" : "podcast",
        "--top",
        Number.isFinite(count) ? String(count) : "5",
      ],
      path.dirname(fileURLToPath(import.meta.url)),
    );

    const recommendations = Array.isArray(result?.recommendations)
      ? result.recommendations
      : [];
    const points = recommendations
      .map((rec) => rec?.insertion_time_seconds)
      .filter((value) => Number.isFinite(value));

    res.json({
      points,
      duration: Number.isFinite(result?.duration_ms)
        ? result.duration_ms / 1000.0
        : null,
      source: "heuristic",
    });
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error ? error.message : "Insert analysis failed.",
    });
  } finally {
    await cleanup();
  }
});

app.post("/api/analyze", upload.single("audio"), async (req, res) => {
  const audioFile = req.file;
  const sponsorText = req.body?.sponsorText?.toString()?.trim() ?? "";
  const mode = req.body?.mode?.toString()?.trim() || "podcast";
  const debug = req.query?.debug === "1" || req.body?.debug === "1";

  if (!audioFile) {
    res.status(400).json({ error: "audio file is required." });
    return;
  }

  if (!sponsorText) {
    res.status(400).json({ error: "sponsorText is required." });
    return;
  }

  const jobId = crypto.randomUUID();
  const jobDir = resolveJobDir(jobId);
  await ensureDir(jobDir);

  const ext = path.extname(audioFile.originalname || ".mp3") || ".mp3";
  const mainPath = path.join(jobDir, `main${ext}`);

  try {
    await fs.promises.writeFile(mainPath, audioFile.buffer);
    const result = await runPythonJson(
      [
        "-m",
        "ad_inserter.recommend",
        "--audio",
        mainPath,
        "--mode",
        mode === "song" ? "song" : "podcast",
        "--top",
        "3",
        ...(debug ? ["--debug"] : []),
      ],
      path.dirname(fileURLToPath(import.meta.url)),
    );

    const recommendations = Array.isArray(result?.recommendations)
      ? result.recommendations
      : [];
    const mapped = recommendations.map((rec, index) => ({
      slotId: rec.slotId ?? `slot-${index}`,
      insertion_ms: rec.insertion_ms,
      insertion_time_seconds: rec.insertion_time_seconds,
      seamlessness_percent: rec.seamlessness_percent,
      pros: Array.isArray(rec.pros) ? rec.pros : [],
      cons: Array.isArray(rec.cons) ? rec.cons : [],
      rationale: rec.rationale ?? "",
      preview_request_payload: { jobId, slotId: rec.slotId ?? `slot-${index}` },
    }));

    console.log("Analyze candidates:", {
      jobId,
      candidates: result?.candidates_count ?? 0,
      topSlots: mapped.map((slot) => ({
        slotId: slot.slotId,
        insertion_ms: slot.insertion_ms,
        seamlessness_percent: slot.seamlessness_percent,
      })),
    });

    await saveJob(jobId, {
      jobId,
      createdAt: new Date().toISOString(),
      mainPath,
      sponsorText,
      mode: mode === "song" ? "song" : "podcast",
      duration_ms: result?.duration_ms ?? null,
      recommendations: mapped,
    });

    res.json({
      jobId,
      duration_ms: result?.duration_ms ?? null,
      recommendations: mapped,
      ...(debug && result?.debug ? { debug: result.debug } : {}),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Analyze failed.",
    });
  }
});

app.post("/api/preview", async (req, res) => {
  const { jobId, slotId, sponsorText, voiceId } = req.body ?? {};
  if (!jobId || !slotId) {
    res.status(400).json({ error: "jobId and slotId are required." });
    return;
  }

  try {
    const job = await loadJob(jobId);
    if (!job) {
      res.status(404).json({ error: "Job not found." });
      return;
    }
    const slot = (job.recommendations ?? []).find(
      (entry) => entry.slotId === slotId,
    );
    if (!slot) {
      res.status(404).json({ error: "Slot not found for job." });
      return;
    }

    const mainPath = job.mainPath;
    const resolvedText = (sponsorText ?? job.sponsorText ?? "").trim();
    if (!resolvedText) {
      res.status(400).json({ error: "sponsorText is required." });
      return;
    }

    const resolvedVoiceId =
      voiceId || process.env.ELEVENLABS_VOICE_ID || "";
    const jobDir = resolveJobDir(jobId);
    const insertPath = await ensureSponsorAudio({
      jobDir,
      sponsorText: resolvedText,
      voiceId: resolvedVoiceId,
    });

    const durationSec =
      Number.isFinite(job?.duration_ms) && job.duration_ms > 0
        ? job.duration_ms / 1000.0
        : await getAudioDuration(mainPath);
    const insertAtSec = slot.insertion_ms / 1000.0;
    const preStart = Math.max(0, insertAtSec - 3);
    const postEnd =
      durationSec && Number.isFinite(durationSec)
        ? Math.min(durationSec, insertAtSec + 3)
        : insertAtSec + 3;

    const previewPath = path.join(jobDir, `preview-${slotId}.mp3`);
    const filter = [
      `[0:a]aformat=sample_rates=44100:channel_layouts=stereo,` +
        `atrim=${preStart}:${insertAtSec},asetpts=PTS-STARTPTS[pre]`,
      `[0:a]aformat=sample_rates=44100:channel_layouts=stereo,` +
        `atrim=${insertAtSec}:${postEnd},asetpts=PTS-STARTPTS[post]`,
      `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,` +
        `asetpts=PTS-STARTPTS[ad]`,
      `[pre][ad][post]concat=n=3:v=0:a=1[out]`,
    ].join(";");

    const args = [
      "-y",
      "-i",
      mainPath,
      "-i",
      insertPath,
      "-filter_complex",
      filter,
      "-map",
      "[out]",
      "-c:a",
      "libmp3lame",
      "-q:a",
      "2",
      previewPath,
    ];

    await runFfmpeg(args);

    const insertDuration = await getAudioDuration(insertPath).catch(() => null);
    const preWindow = insertAtSec - preStart;
    const postWindow = postEnd - insertAtSec;
    console.log("Preview window:", {
      jobId,
      slotId,
      preStart: preStart.toFixed(2),
      insertAtSec: insertAtSec.toFixed(2),
      postEnd: postEnd.toFixed(2),
      expectedDuration:
        insertDuration !== null
          ? (preWindow + insertDuration + postWindow).toFixed(2)
          : "unknown",
    });

    res.setHeader("Content-Type", "audio/mpeg");
    const stream = fs.createReadStream(previewPath);
    stream.on("error", (streamError) => {
      if (!res.headersSent) {
        res.status(500).json({
          error:
            streamError instanceof Error
              ? streamError.message
              : "Failed to stream preview.",
        });
      }
    });
    stream.pipe(res);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Preview failed.",
    });
  }
});

app.post("/api/render", async (req, res) => {
  const { jobId, slotId, sponsorText, voiceId } = req.body ?? {};
  if (!jobId || !slotId) {
    res.status(400).json({ error: "jobId and slotId are required." });
    return;
  }

  try {
    const job = await loadJob(jobId);
    if (!job) {
      res.status(404).json({ error: "Job not found." });
      return;
    }
    const slot = (job.recommendations ?? []).find(
      (entry) => entry.slotId === slotId,
    );
    if (!slot) {
      res.status(404).json({ error: "Slot not found for job." });
      return;
    }

    const mainPath = job.mainPath;
    const resolvedText = (sponsorText ?? job.sponsorText ?? "").trim();
    if (!resolvedText) {
      res.status(400).json({ error: "sponsorText is required." });
      return;
    }

    const resolvedVoiceId =
      voiceId || process.env.ELEVENLABS_VOICE_ID || "";
    const jobDir = resolveJobDir(jobId);
    const insertPath = await ensureSponsorAudio({
      jobDir,
      sponsorText: resolvedText,
      voiceId: resolvedVoiceId,
    });

    const insertAtSec = slot.insertion_ms / 1000.0;
    const outPath = path.join(jobDir, `render-${slotId}.mp3`);
    const filter = [
      `[0:a]aformat=sample_rates=44100:channel_layouts=stereo,` +
        `atrim=0:${insertAtSec},asetpts=PTS-STARTPTS[a0]`,
      `[0:a]aformat=sample_rates=44100:channel_layouts=stereo,` +
        `atrim=${insertAtSec},asetpts=PTS-STARTPTS[a1]`,
      `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,` +
        `asetpts=PTS-STARTPTS[ad]`,
      `[a0][ad][a1]concat=n=3:v=0:a=1[out]`,
    ].join(";");

    const args = [
      "-y",
      "-i",
      mainPath,
      "-i",
      insertPath,
      "-filter_complex",
      filter,
      "-map",
      "[out]",
      "-c:a",
      "libmp3lame",
      "-q:a",
      "2",
      outPath,
    ];

    await runFfmpeg(args);

    res.setHeader("Content-Type", "audio/mpeg");
    const stream = fs.createReadStream(outPath);
    stream.on("error", (streamError) => {
      if (!res.headersSent) {
        res.status(500).json({
          error:
            streamError instanceof Error
              ? streamError.message
              : "Failed to stream render.",
        });
      }
    });
    stream.pipe(res);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Render failed.",
    });
  }
});

app.post("/api/tts", async (req, res) => {
  const { voiceId, text, modelId, outputFormat } = req.body ?? {};
  if (!voiceId || !text) {
    res.status(400).json({ error: "voiceId and text are required." });
    return;
  }

  try {
    const audio = await elevenlabs.textToSpeech.convert(voiceId, {
      text,
      modelId: modelId ?? "eleven_multilingual_v2",
      outputFormat: outputFormat ?? "mp3_44100_128",
    });

    res.setHeader("Content-Type", "audio/mpeg");
    const stream = Readable.fromWeb(audio);
    stream.pipe(res);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "TTS failed.",
    });
  }
});

app.post("/api/speech", async (req, res) => {
  res.redirect(307, "/api/tts");
});

app.post("/api/generate", upload.single("audio"), async (req, res) => {
  const audioFile = req.file;
  const voiceId = req.body?.voiceId?.toString()?.trim();
  const brand = req.body?.brand?.toString()?.trim();
  const productDesc = req.body?.productDesc?.toString()?.trim();

  if (!audioFile) {
    res.status(400).json({ error: "audio file is required." });
    return;
  }

  if (!voiceId) {
    res.status(400).json({ error: "voiceId is required." });
    return;
  }

  if (!brand) {
    res.status(400).json({ error: "brand is required." });
    return;
  }

  const resolvedDesc =
    productDesc || `A short audio ad spot for ${brand}.`;

  const tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "ad-generate-"),
  );
  const basePath = path.join(tempDir, "base.mp3");
  const outPath = path.join(tempDir, "out.mp3");
  const cleanup = async () => {
    await Promise.all(
      [basePath, outPath].map((filePath) =>
        fs.promises.unlink(filePath).catch(() => undefined),
      ),
    );
    await fs.promises.rmdir(tempDir).catch(() => undefined);
  };

  try {
    await fs.promises.writeFile(basePath, audioFile.buffer);

    const pythonBin = process.env.PYTHON_BIN ?? "python";
    const baseUrl =
      process.env.API_BASE_URL ?? `http://localhost:${port}`;

    const args = [
      "-m",
      "ad_inserter.cli",
      "--main",
      basePath,
      "--voice-id",
      voiceId,
      "--product-name",
      brand,
      "--product-desc",
      resolvedDesc,
      "--out",
      outPath,
      "--tts-url",
      `${baseUrl}/api/tts`,
      "--merge-url",
      `${baseUrl}/api/merge`,
    ];

    await new Promise((resolve, reject) => {
      const child = spawn(pythonBin, args, {
        cwd: path.dirname(fileURLToPath(import.meta.url)),
        env: process.env,
      });
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve(null);
        } else {
          reject(
            new Error(
              stderr || `ad_inserter exited with code ${code}`,
            ),
          );
        }
      });
    });
    await fs.promises.access(outPath);
    res.setHeader("Content-Type", "audio/mpeg");
    const stream = fs.createReadStream(outPath);
    stream.on("error", (streamError) => {
      if (!res.headersSent) {
        res.status(500).json({
          error:
            streamError instanceof Error
              ? streamError.message
              : "Failed to stream output.",
        });
      }
    });
    res.on("close", cleanup);
    res.on("finish", cleanup);
    stream.pipe(res);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Generation failed.",
    });
    await cleanup();
  }
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
  console.log(`CORS allowed origins: ${allowedOrigins.join(", ")}`);
  if (!process.env.ELEVENLABS_API_KEY) {
    console.warn(
      "⚠️  ELEVENLABS_API_KEY not set. Voice cloning and TTS endpoints will fail.",
    );
  } else {
    console.log("✓ ElevenLabs API key configured");
  }
});
