from __future__ import annotations

import argparse
import json
from pathlib import Path

from ad_inserter.recommend import recommend_slots


def run() -> None:
    parser = argparse.ArgumentParser(description="Smoke test slot recommendations.")
    parser.add_argument("--audio", required=True, type=Path)
    parser.add_argument("--mode", choices=["podcast", "song"], default="podcast")
    args = parser.parse_args()

    result = recommend_slots(args.audio, args.mode, top_n=3, debug=False)
    summary = [
        {
            "slotId": rec["slotId"],
            "insertion_ms": rec["insertion_ms"],
            "seamlessness_percent": rec["seamlessness_percent"],
        }
        for rec in result.get("recommendations", [])
    ]
    print(json.dumps({"duration_ms": result.get("duration_ms"), "slots": summary}, indent=2))


if __name__ == "__main__":
    run()
