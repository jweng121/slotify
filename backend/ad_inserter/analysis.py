from __future__ import annotations

import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
from pydub import AudioSegment
from pydub.silence import detect_silence
from pydub.utils import which


@dataclass
class SongAnalysis:
    candidates_ms: List[int]
    tempo: Optional[float]
    beat_times_ms: List[int]


def check_ffmpeg() -> None:
    if which("ffmpeg") is None:
        raise RuntimeError(
            "ffmpeg not found. Install ffmpeg and ensure it is in your PATH."
        )


def load_audio(path: Path) -> AudioSegment:
    if not path.exists():
        raise FileNotFoundError(f"Audio file not found: {path}")
    return AudioSegment.from_file(path)


def standardize_audio(audio: AudioSegment) -> AudioSegment:
    return audio.set_frame_rate(44100).set_channels(2)


def detect_silence_ranges(
    audio: AudioSegment, min_silence_len: int = 500
) -> List[tuple[int, int]]:
    silence_thresh = audio.dBFS - 16 if audio.dBFS != float("-inf") else -40
    return detect_silence(
        audio, min_silence_len=min_silence_len, silence_thresh=silence_thresh
    )


def candidates_from_silence_ranges(silence_ranges: List[tuple[int, int]]) -> List[int]:
    candidates = [(start + end) // 2 for start, end in silence_ranges]
    return sorted(set(candidates))


def detect_podcast_candidates(audio: AudioSegment) -> List[int]:
    silence_ranges = detect_silence_ranges(audio)
    return candidates_from_silence_ranges(silence_ranges)


def _rms_minima_times(
    y: np.ndarray,
    sr: int,
    frame_ms: float = 50.0,
    hop_ms: float = 25.0,
    top_k: int = 12,
) -> List[float]:
    frame_length = int(sr * frame_ms / 1000.0)
    hop_length = int(sr * hop_ms / 1000.0)
    if y.size < frame_length or frame_length <= 0 or hop_length <= 0:
        return [0.0]
    windows = np.lib.stride_tricks.sliding_window_view(y, frame_length)[::hop_length]
    if windows.size == 0:
        return [0.0]
    rms = np.sqrt(np.mean(np.square(windows), axis=1))
    if rms.size == 0:
        return []
    idx = np.argsort(rms)[:top_k]
    times = (idx * hop_length) / float(sr)
    return times.tolist()


def analyze_song(path: Path) -> SongAnalysis:
    import librosa

    y, sr = librosa.load(path, sr=44100, mono=True)
    if y.size == 0:
        return SongAnalysis(candidates_ms=[], tempo=None, beat_times_ms=[])

    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    beat_times_ms = [int(t * 1000) for t in beat_times]

    minima_times = _rms_minima_times(y, sr)
    candidates_ms = []
    seen = set()
    for t in minima_times:
        t_ms = int(t * 1000)
        if beat_times_ms:
            nearest = min(beat_times_ms, key=lambda b: abs(b - t_ms))
            if nearest not in seen:
                candidates_ms.append(nearest)
                seen.add(nearest)
        else:
            if t_ms not in seen:
                candidates_ms.append(t_ms)
                seen.add(t_ms)
    return SongAnalysis(
        candidates_ms=candidates_ms,
        tempo=float(tempo) if tempo is not None else None,
        beat_times_ms=beat_times_ms,
    )


def whisper_available() -> bool:
    try:
        import whisper  # noqa: F401

        return True
    except Exception:
        return False


def transcribe_snippet(
    audio: AudioSegment, start_ms: int, end_ms: int, model_name: str = "base"
) -> str:
    try:
        import whisper
    except Exception:
        return "TRANSCRIPT_UNAVAILABLE"

    start_ms = max(0, start_ms)
    end_ms = max(start_ms, end_ms)
    snippet = audio[start_ms:end_ms]
    if len(snippet) == 0:
        return ""

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = Path(tmp.name)
    try:
        snippet.export(tmp_path, format="wav")
        model = whisper.load_model(model_name)
        result = model.transcribe(str(tmp_path), fp16=False)
        return str(result.get("text", "")).strip()
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass


def _clip_text(text: str, max_chars: int, from_end: bool = False) -> str:
    if len(text) <= max_chars:
        return text
    if from_end:
        return text[-max_chars:]
    return text[:max_chars]


def build_transcript_snippets(
    audio: AudioSegment,
    candidates: List[int],
    window_ms: int = 15000,
    max_chars: int = 260,
    model_name: str = "base",
    max_candidates: Optional[int] = None,
) -> Dict[int, Dict[str, str]]:
    if not candidates:
        return {}
    limited = candidates if max_candidates is None else candidates[:max_candidates]
    snippets: Dict[int, Dict[str, str]] = {}
    for cand in limited:
        before = transcribe_snippet(audio, cand - window_ms, cand, model_name=model_name)
        after = transcribe_snippet(audio, cand, cand + window_ms, model_name=model_name)
        snippets[cand] = {
            "before": _clip_text(before, max_chars, from_end=True),
            "after": _clip_text(after, max_chars, from_end=False),
        }
    return snippets


def choose_default_insertion(candidates: List[int], min_offset_ms: int = 30000) -> int:
    if not candidates:
        return min_offset_ms
    for cand in sorted(candidates):
        if cand >= min_offset_ms:
            return cand
    return sorted(candidates)[-1]


def _segment_rms(audio: AudioSegment, start_ms: int, end_ms: int) -> float:
    start_ms = max(0, start_ms)
    end_ms = max(start_ms, end_ms)
    segment = audio[start_ms:end_ms]
    if len(segment) == 0:
        return 0.0
    return float(segment.rms)


def _silence_ms_for_candidate(
    candidate_ms: int, silence_ranges: Optional[List[tuple[int, int]]]
) -> int:
    if not silence_ranges:
        return 0
    for start_ms, end_ms in silence_ranges:
        if start_ms <= candidate_ms <= end_ms:
            return int(end_ms - start_ms)
    return 0


def _is_beat_aligned(
    candidate_ms: int,
    beat_times_ms: Optional[List[int]],
    tolerance_ms: int,
) -> bool:
    if not beat_times_ms:
        return False
    return any(abs(candidate_ms - beat) <= tolerance_ms for beat in beat_times_ms)


def build_candidate_payload(
    audio: AudioSegment,
    candidates: List[int],
    mode: str,
    beat_times_ms: Optional[List[int]] = None,
    silence_ranges: Optional[List[tuple[int, int]]] = None,
    transcripts: Optional[Dict[int, Dict[str, str]]] = None,
    rms_window_ms: int = 400,
    beat_tolerance_ms: int = 60,
) -> List[Dict[str, Any]]:
    payload: List[Dict[str, Any]] = []
    transcripts = transcripts or {}
    for idx, cand in enumerate(candidates):
        transcript = transcripts.get(cand, {})
        payload.append(
            {
                "index": idx,
                "insertion_ms": int(cand),
                "silence_ms": _silence_ms_for_candidate(cand, silence_ranges),
                "rms_before": _segment_rms(audio, cand - rms_window_ms, cand),
                "rms_after": _segment_rms(audio, cand, cand + rms_window_ms),
                "beat_aligned": _is_beat_aligned(
                    cand, beat_times_ms, tolerance_ms=beat_tolerance_ms
                )
                if mode == "song"
                else False,
                "transcript_before": transcript.get(
                    "before", "TRANSCRIPT_UNAVAILABLE"
                ),
                "transcript_after": transcript.get("after", "TRANSCRIPT_UNAVAILABLE"),
            }
        )
    return payload
