from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class SelectionResult:
    chosen_candidate_index: int
    chosen_insertion_ms: int
    rationale: str
    refined_sponsor_text: Optional[str]
    debug: Dict[str, Any]


def _ends_sentence(text: str) -> bool:
    cleaned = text.strip()
    return bool(re.search(r'[.!?]["\')\]]?$', cleaned))


def _starts_new_sentence(text: str) -> bool:
    cleaned = text.lstrip()
    return bool(re.match(r"[A-Z0-9\"'(\[]", cleaned))


def _mid_sentence_penalty(text: str) -> bool:
    cleaned = text.strip()
    if not cleaned:
        return False
    if _ends_sentence(cleaned):
        return False
    return bool(re.search(r"[A-Za-z0-9]$", cleaned))


def _score_podcast_candidate(candidate: Dict[str, Any]) -> float:
    score = 0.0
    silence_ms = float(candidate.get("silence_ms", 0) or 0)
    score += min(silence_ms / 500.0, 2.0)
    before = str(candidate.get("transcript_before") or "")
    after = str(candidate.get("transcript_after") or "")
    if before == "TRANSCRIPT_UNAVAILABLE":
        before = ""
    if after == "TRANSCRIPT_UNAVAILABLE":
        after = ""
    if before and _ends_sentence(before):
        score += 1.0
    if after and _starts_new_sentence(after):
        score += 0.5
    if before and _mid_sentence_penalty(before):
        score -= 1.0
    return score


def _normalize(values: List[float]) -> List[float]:
    if not values:
        return []
    min_val = min(values)
    max_val = max(values)
    if max_val == min_val:
        return [0.0 for _ in values]
    return [(max_val - val) / (max_val - min_val) for val in values]


def _score_song_candidates(candidates: List[Dict[str, Any]]) -> List[float]:
    rms_before_vals = [float(c.get("rms_before", 0) or 0) for c in candidates]
    rms_after_vals = [float(c.get("rms_after", 0) or 0) for c in candidates]
    norm_before = _normalize(rms_before_vals)
    norm_after = _normalize(rms_after_vals)
    scores: List[float] = []
    for idx, candidate in enumerate(candidates):
        score = 0.0
        if candidate.get("beat_aligned"):
            score += 1.0
        score += 0.6 * (norm_before[idx] if idx < len(norm_before) else 0.0)
        score += 0.4 * (norm_after[idx] if idx < len(norm_after) else 0.0)
        rms_before = rms_before_vals[idx]
        rms_after = rms_after_vals[idx]
        if rms_before > 0 and rms_after > rms_before * 1.25:
            score -= 0.5
        if rms_before > 0 and rms_after > rms_before * 1.5:
            score -= 0.8
        scores.append(score)
    return scores


def _choose_by_heuristic(
    mode: str, candidates: List[Dict[str, Any]]
) -> tuple[int, int, str]:
    if not candidates:
        return 0, 0, "No candidates provided; defaulting to 0ms."
    if mode == "song":
        scores = _score_song_candidates(candidates)
        best_idx = max(range(len(scores)), key=lambda i: scores[i])
        rationale = "Heuristic: beat alignment + low RMS valley with minimal post-insert rise."
    else:
        scores = [_score_podcast_candidate(cand) for cand in candidates]
        best_idx = max(range(len(scores)), key=lambda i: scores[i])
        rationale = "Heuristic: larger silence gap and sentence boundary cues."
    chosen_ms = int(candidates[best_idx].get("insertion_ms", 0))
    return best_idx, chosen_ms, rationale


def _build_prompt_payload(
    sponsor_text: str,
    mode: str,
    main_audio_duration_ms: int,
    candidates: List[Dict[str, Any]],
) -> Dict[str, Any]:
    return {
        "mode": mode,
        "sponsor_text": sponsor_text,
        "main_audio_duration_ms": int(main_audio_duration_ms),
        "candidates": candidates,
    }


def select_best_insertion(
    provider: str,
    model: str,
    sponsor_text: str,
    mode: str,
    main_audio_duration_ms: int,
    candidates: List[Dict[str, Any]],
) -> SelectionResult:
    prompt_payload = _build_prompt_payload(
        sponsor_text=sponsor_text,
        mode=mode,
        main_audio_duration_ms=main_audio_duration_ms,
        candidates=candidates,
    )
    system_prompt = (
        "You are a careful audio editor. Pick the best insertion point for a seamless "
        "ad transition and optionally refine the sponsor text to match the tone. "
        "Use only the provided metadata and short transcript snippets."
    )
    user_prompt = (
        "Select the candidate that yields the most seamless transition. "
        "For podcasts, prefer natural breaks and sentence boundaries. "
        "For songs, prefer beat-aligned low-energy valleys and avoid sharp energy rises. "
        "Return JSON that matches the schema, and copy the insertion_ms from the chosen candidate.\n\n"
        f"{json.dumps(prompt_payload, ensure_ascii=True)}"
    )
    prompt_preview = (system_prompt + "\n" + user_prompt)[:500]

    if provider != "openai" or not os.getenv("OPENAI_API_KEY"):
        idx, insertion_ms, rationale = _choose_by_heuristic(mode, candidates)
        debug = {
            "model": None,
            "prompt_preview": prompt_preview,
            "raw_model_output_json": "",
            "why_chosen": rationale,
        }
        return SelectionResult(
            chosen_candidate_index=idx,
            chosen_insertion_ms=insertion_ms,
            rationale=rationale,
            refined_sponsor_text=None,
            debug=debug,
        )

    try:
        from openai import OpenAI

        client = OpenAI()
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "ad_insertion_choice",
                    "strict": True,
                    "schema": {
                        "type": "object",
                        "properties": {
                            "chosen_candidate_index": {
                                "type": "integer",
                                "minimum": 0,
                            },
                            "chosen_insertion_ms": {
                                "type": "integer",
                                "minimum": 0,
                            },
                            "rationale": {"type": "string"},
                            "refined_sponsor_text": {
                                "type": ["string", "null"]
                            },
                        },
                        "required": [
                            "chosen_candidate_index",
                            "chosen_insertion_ms",
                            "rationale",
                            "refined_sponsor_text",
                        ],
                        "additionalProperties": False,
                    },
                },
            },
            temperature=0.2,
        )
        raw_text = response.choices[0].message.content or ""
        logger.debug("LLM prompt preview: %s", prompt_preview)
        logger.debug("LLM raw response: %s", raw_text)
        data = json.loads(raw_text)
        chosen_idx = int(data["chosen_candidate_index"])
        if chosen_idx < 0 or chosen_idx >= len(candidates):
            raise ValueError("LLM chose candidate index out of range.")
        chosen_ms = int(data["chosen_insertion_ms"])
        expected_ms = int(candidates[chosen_idx].get("insertion_ms", 0))
        if expected_ms != chosen_ms:
            raise ValueError("LLM insertion_ms does not match chosen candidate.")
        refined = data.get("refined_sponsor_text")
        refined_text = str(refined).strip() if refined else None
        rationale = str(data.get("rationale", "")).strip()
        debug = {
            "model": model,
            "prompt_preview": prompt_preview,
            "raw_model_output_json": raw_text,
            "why_chosen": rationale,
        }
        return SelectionResult(
            chosen_candidate_index=chosen_idx,
            chosen_insertion_ms=chosen_ms,
            rationale=rationale,
            refined_sponsor_text=refined_text,
            debug=debug,
        )
    except Exception as exc:
        idx, insertion_ms, rationale = _choose_by_heuristic(mode, candidates)
        debug = {
            "model": model,
            "prompt_preview": prompt_preview,
            "raw_model_output_json": "",
            "why_chosen": f"{rationale} (LLM failed: {exc})",
        }
        logger.debug("LLM failure: %s", exc)
        return SelectionResult(
            chosen_candidate_index=idx,
            chosen_insertion_ms=insertion_ms,
            rationale=debug["why_chosen"],
            refined_sponsor_text=None,
            debug=debug,
        )
