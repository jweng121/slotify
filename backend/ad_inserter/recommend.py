from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from pydub import AudioSegment
from pydub.silence import detect_silence

from ad_inserter import analysis


@dataclass
class Candidate:
    insertion_ms: int
    silence_ms: Optional[int]
    rms_before: float
    rms_after: float
    beat_aligned: bool
    notes: str = ""
    boundary: bool = False
    rms_center: Optional[float] = None
    score: float = 0.0


def _clamp(value: float, min_val: float, max_val: float) -> float:
    return max(min_val, min(max_val, value))


def _rms_normalized(segment: AudioSegment) -> float:
    if len(segment) == 0:
        return 0.0
    max_val = float(1 << (8 * segment.sample_width - 1))
    return float(segment.rms) / max_val if max_val > 0 else 0.0


def _rms_window(audio: AudioSegment, start_ms: int, end_ms: int) -> float:
    start_ms = max(0, start_ms)
    end_ms = max(start_ms, end_ms)
    return _rms_normalized(audio[start_ms:end_ms])


def _quietness_from_rms(rms: float) -> float:
    # Heuristic mapping: lower RMS => higher quietness score.
    return _clamp(1.0 - min(1.0, rms * 3.5), 0.0, 1.0)


def _fallback_candidates(duration_ms: int, count: int = 12) -> List[int]:
    if duration_ms <= 0:
        return [0]
    start = int(duration_ms * 0.15)
    end = int(duration_ms * 0.85)
    if end <= start:
        return [duration_ms // 2]
    points = np.linspace(start, end, num=count)
    return [int(round(p)) for p in points]


def _detect_podcast_candidates(audio: AudioSegment) -> List[Tuple[int, int]]:
    silence_thresh = audio.dBFS - 16 if audio.dBFS != float("-inf") else -40
    silence_ranges = detect_silence(
        audio, min_silence_len=500, silence_thresh=silence_thresh
    )
    return silence_ranges


def _podcast_candidates(audio: AudioSegment) -> List[Candidate]:
    silence_ranges = _detect_podcast_candidates(audio)
    candidates: List[Candidate] = []
    for start_ms, end_ms in silence_ranges:
        insert_ms = (start_ms + end_ms) // 2
        silence_ms = max(0, end_ms - start_ms)
        rms_before = _rms_window(audio, insert_ms - 800, insert_ms)
        rms_after = _rms_window(audio, insert_ms, insert_ms + 800)
        candidates.append(
            Candidate(
                insertion_ms=insert_ms,
                silence_ms=silence_ms,
                rms_before=rms_before,
                rms_after=rms_after,
                beat_aligned=False,
                notes="silence",
            )
        )

    if len(candidates) < 10:
        existing = {cand.insertion_ms for cand in candidates}
        for insert_ms in _fallback_candidates(len(audio)):
            if insert_ms in existing:
                continue
            candidates.append(
                Candidate(
                    insertion_ms=insert_ms,
                    silence_ms=0,
                    rms_before=_rms_window(audio, insert_ms - 800, insert_ms),
                    rms_after=_rms_window(audio, insert_ms, insert_ms + 800),
                    beat_aligned=False,
                    notes="fallback",
                )
            )
            existing.add(insert_ms)
            if len(candidates) >= 12:
                break

    if len(candidates) > 30:
        candidates = sorted(
            candidates,
            key=lambda cand: (cand.silence_ms or 0),
            reverse=True,
        )[:30]
        candidates = sorted(candidates, key=lambda cand: cand.insertion_ms)
    return candidates


def _apply_transcript_boundaries(
    audio: AudioSegment, candidates: List[Candidate], max_snippets: int = 8
) -> None:
    if not analysis.whisper_available() or not candidates:
        return

    # Prioritize longer silences for boundary checks.
    ranked = sorted(
        enumerate(candidates),
        key=lambda pair: (pair[1].silence_ms or 0),
        reverse=True,
    )
    for idx, candidate in ranked[:max_snippets]:
        snippet = analysis.transcribe_snippet(
            audio, candidate.insertion_ms - 12000, candidate.insertion_ms
        )
        if not snippet:
            continue
        candidate.boundary = bool(re.search(r"[.!?]\s*$", snippet))
        if candidate.boundary:
            candidate.notes = f"{candidate.notes},boundary" if candidate.notes else "boundary"


def _song_candidates(path: Path, audio: AudioSegment) -> List[Candidate]:
    song = analysis.analyze_song(path)
    candidates_ms = song.candidates_ms or _fallback_candidates(len(audio))
    beat_times_ms = song.beat_times_ms
    candidates: List[Candidate] = []
    for insert_ms in candidates_ms:
        rms_before = _rms_window(audio, insert_ms - 800, insert_ms)
        rms_after = _rms_window(audio, insert_ms, insert_ms + 800)
        rms_center = _rms_window(audio, insert_ms - 200, insert_ms + 200)
        beat_aligned = False
        if beat_times_ms:
            beat_aligned = min(abs(insert_ms - b) for b in beat_times_ms) <= 80
        candidates.append(
            Candidate(
                insertion_ms=insert_ms,
                silence_ms=None,
                rms_before=rms_before,
                rms_after=rms_after,
                rms_center=rms_center,
                beat_aligned=beat_aligned,
                notes="beat" if beat_aligned else "energy",
            )
        )
    if len(candidates) < 10:
        existing = {cand.insertion_ms for cand in candidates}
        for insert_ms in _fallback_candidates(len(audio)):
            if insert_ms in existing:
                continue
            candidates.append(
                Candidate(
                    insertion_ms=insert_ms,
                    silence_ms=None,
                    rms_before=_rms_window(audio, insert_ms - 800, insert_ms),
                    rms_after=_rms_window(audio, insert_ms, insert_ms + 800),
                    rms_center=_rms_window(audio, insert_ms - 200, insert_ms + 200),
                    beat_aligned=False,
                    notes="fallback",
                )
            )
            existing.add(insert_ms)
            if len(candidates) >= 12:
                break
    if len(candidates) > 30:
        candidates = candidates[:30]
    return candidates


def _score_podcast(candidate: Candidate, duration_ms: int) -> float:
    silence_ms = candidate.silence_ms or 0
    silence_score = min(silence_ms, 1500) / 1500.0
    quiet_before = _quietness_from_rms(candidate.rms_before)
    quiet_after = _quietness_from_rms(candidate.rms_after)

    score = 45.0 * silence_score + 20.0 * quiet_before + 10.0 * quiet_after
    if candidate.boundary:
        score += 12.0
    score -= 10.0 * (1.0 - quiet_after)

    if candidate.insertion_ms < 5000:
        score -= 25.0
    if duration_ms - candidate.insertion_ms < 5000:
        score -= 25.0
    return _clamp(score, 0.0, 100.0)


def _score_song(candidate: Candidate, duration_ms: int) -> float:
    quiet_before = _quietness_from_rms(candidate.rms_before)
    quiet_after = _quietness_from_rms(candidate.rms_after)
    valley = _quietness_from_rms(candidate.rms_center or 0.0)

    score = 40.0 * (1.0 if candidate.beat_aligned else 0.0)
    score += 30.0 * valley + 15.0 * quiet_before + 10.0 * quiet_after

    if candidate.insertion_ms < 5000:
        score -= 20.0
    if duration_ms - candidate.insertion_ms < 5000:
        score -= 20.0
    return _clamp(score, 0.0, 100.0)


def _select_top(
    candidates: List[Candidate], top_n: int = 3, min_sep_ms: int = 6000
) -> List[Candidate]:
    ordered = sorted(
        candidates,
        key=lambda cand: (-cand.score, cand.insertion_ms),
    )
    selected: List[Candidate] = []
    for candidate in ordered:
        if all(abs(candidate.insertion_ms - sel.insertion_ms) >= min_sep_ms for sel in selected):
            selected.append(candidate)
        if len(selected) >= top_n:
            break
    if len(selected) < top_n:
        for candidate in ordered:
            if candidate not in selected:
                selected.append(candidate)
            if len(selected) >= top_n:
                break
    return selected


def _podcast_pros_cons(candidate: Candidate, duration_ms: int) -> Tuple[List[str], List[str], str]:
    pros: List[str] = []
    cons: List[str] = []

    silence_ms = candidate.silence_ms or 0
    if silence_ms >= 800:
        pros.append(f"Natural pause detected (~{silence_ms}ms silence)")
    elif silence_ms >= 500:
        pros.append(f"Short pause detected (~{silence_ms}ms silence)")

    if candidate.boundary:
        pros.append("Likely sentence boundary or topic shift")

    quiet_before = _quietness_from_rms(candidate.rms_before)
    quiet_after = _quietness_from_rms(candidate.rms_after)
    if quiet_before >= 0.7:
        pros.append("Low background energy before insert")
    if quiet_after >= 0.7:
        pros.append("Low background energy after insert")

    if silence_ms < 600:
        cons.append(f"Short pause (only ~{silence_ms}ms) could feel abrupt")
    if quiet_after < 0.5:
        cons.append("Higher energy immediately after insertion")
    if candidate.insertion_ms < 5000:
        cons.append("Close to the start of the audio")
    if duration_ms - candidate.insertion_ms < 5000:
        cons.append("Close to the end of the audio")

    if len(pros) < 2:
        pros.append("Balanced pause with manageable energy shift")
    pros = pros[:3]
    cons = cons[:2] if cons else ["Minor timing tradeoff compared to top slot"]
    rationale = " ".join(pros[:2])
    return pros, cons, rationale


def _song_pros_cons(candidate: Candidate, duration_ms: int) -> Tuple[List[str], List[str], str]:
    pros: List[str] = []
    cons: List[str] = []

    if candidate.beat_aligned:
        pros.append("Beat-aligned insertion point")
    valley = _quietness_from_rms(candidate.rms_center or 0.0)
    if valley >= 0.7:
        pros.append("Low-energy valley (smooth entry)")

    quiet_after = _quietness_from_rms(candidate.rms_after)
    if quiet_after >= 0.6:
        pros.append("Stable energy after insert")

    if not candidate.beat_aligned:
        cons.append("Not perfectly beat-aligned")
    if valley < 0.5:
        cons.append("Energy valley is modest")
    if quiet_after < 0.5:
        cons.append("Higher energy change after insertion")
    if candidate.insertion_ms < 5000 or duration_ms - candidate.insertion_ms < 5000:
        cons.append("Close to the intro or outro")

    if len(pros) < 2:
        pros.append("Solid rhythmic placement with manageable energy")
    pros = pros[:3]
    cons = cons[:2] if cons else ["Less optimal alignment compared to top choice"]
    rationale = " ".join(pros[:2])
    return pros, cons, rationale


def recommend_slots(
    audio_path: Path,
    mode: str,
    top_n: int = 3,
    debug: bool = False,
) -> Dict[str, Any]:
    analysis.check_ffmpeg()
    audio = analysis.standardize_audio(analysis.load_audio(audio_path))
    duration_ms = len(audio)

    if mode == "song":
        candidates = _song_candidates(audio_path, audio)
        for candidate in candidates:
            candidate.score = _score_song(candidate, duration_ms)
    else:
        candidates = _podcast_candidates(audio)
        _apply_transcript_boundaries(audio, candidates)
        for candidate in candidates:
            candidate.score = _score_podcast(candidate, duration_ms)

    if candidates:
        max_score = max(cand.score for cand in candidates)
        if max_score < 65.0:
            bump = 65.0 - max_score
            for cand in candidates:
                cand.score = _clamp(cand.score + bump, 0.0, 100.0)
        for cand in candidates:
            cand.score = min(cand.score, 95.0)

    selected = _select_top(candidates, top_n=top_n)

    recommendations = []
    for index, candidate in enumerate(selected):
        if mode == "song":
            pros, cons, rationale = _song_pros_cons(candidate, duration_ms)
        else:
            pros, cons, rationale = _podcast_pros_cons(candidate, duration_ms)
        recommendations.append(
            {
                "slotId": f"slot-{index}",
                "insertion_ms": int(candidate.insertion_ms),
                "insertion_time_seconds": round(candidate.insertion_ms / 1000.0, 2),
                "seamlessness_percent": int(round(candidate.score)),
                "pros": pros,
                "cons": cons,
                "rationale": rationale,
                "candidate": {
                    "insertion_ms": int(candidate.insertion_ms),
                    "silence_ms": candidate.silence_ms,
                    "rms_before": round(candidate.rms_before, 6),
                    "rms_after": round(candidate.rms_after, 6),
                    "beat_aligned": candidate.beat_aligned,
                    "notes": candidate.notes,
                },
            }
        )

    payload: Dict[str, Any] = {
        "duration_ms": duration_ms,
        "mode": mode,
        "candidates_count": len(candidates),
        "recommendations": recommendations,
    }

    if debug:
        payload["debug"] = {
            "candidates": [
                {
                    "insertion_ms": cand.insertion_ms,
                    "silence_ms": cand.silence_ms,
                    "rms_before": cand.rms_before,
                    "rms_after": cand.rms_after,
                    "beat_aligned": cand.beat_aligned,
                    "notes": cand.notes,
                    "boundary": cand.boundary,
                    "score": cand.score,
                }
                for cand in candidates
            ]
        }
    return payload


def run() -> None:
    parser = argparse.ArgumentParser(description="Recommend insertion slots.")
    parser.add_argument("--audio", required=True, type=Path)
    parser.add_argument("--mode", choices=["podcast", "song"], default="podcast")
    parser.add_argument("--top", type=int, default=3)
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    result = recommend_slots(
        audio_path=args.audio,
        mode=args.mode,
        top_n=max(1, args.top),
        debug=args.debug,
    )
    print(json.dumps(result))


if __name__ == "__main__":
    run()
