from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path


def run_cmd(cmd: list[str]) -> None:
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as exc:
        msg = exc.stderr.strip() if exc.stderr else "Command failed"
        raise RuntimeError(msg) from exc


def get_duration_seconds(path: str) -> float:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        path,
    ]
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as exc:
        msg = exc.stderr.strip() if exc.stderr else "ffprobe failed"
        raise RuntimeError(msg) from exc
    return float(result.stdout.strip())


def insert_ad(
    podcast_path: str,
    ad_path: str,
    insert_time: float,
    output_path: str,
) -> str:
    """
    Insert ad audio into podcast audio at insert_time (in seconds) and export to output_path.
    Returns output_path.
    """
    if insert_time < 0:
        raise ValueError("insert_time must be >= 0")

    podcast_file = Path(podcast_path)
    ad_file = Path(ad_path)
    output_file = Path(output_path)

    if not podcast_file.is_file():
        raise FileNotFoundError(f"Podcast file not found: {podcast_file}")
    if not ad_file.is_file():
        raise FileNotFoundError(f"Ad file not found: {ad_file}")

    ad_size = ad_file.stat().st_size
    if ad_size <= 0:
        raise ValueError("Ad file is empty")

    duration = get_duration_seconds(str(podcast_file))
    if insert_time >= duration - 0.1:
        insert_time = duration
    insert_time = max(0.0, min(insert_time, duration))

    with tempfile.TemporaryDirectory(prefix="audio_edit_") as tmp_dir:
        tmp = Path(tmp_dir)
        left_wav = tmp / "left.wav"
        right_wav = tmp / "right.wav"
        ad_wav = tmp / "ad.wav"
        concat_list = tmp / "concat.txt"

        common_args = [
            "-ac",
            "2",
            "-ar",
            "44100",
            "-c:a",
            "pcm_s16le",
        ]
        run_cmd(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(podcast_file),
                "-t",
                f"{insert_time}",
                *common_args,
                str(left_wav),
            ]
        )

        if insert_time < duration:
            run_cmd(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    str(podcast_file),
                    "-ss",
                    f"{insert_time}",
                    *common_args,
                    str(right_wav),
                ]
            )
        else:
            right_wav.write_bytes(b"")

        run_cmd(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(ad_file),
                *common_args,
                str(ad_wav),
            ]
        )

        concat_lines = [
            f"file '{left_wav.as_posix()}'",
            f"file '{ad_wav.as_posix()}'",
        ]
        if right_wav.stat().st_size > 0:
            concat_lines.append(f"file '{right_wav.as_posix()}'")
        concat_list.write_text("\n".join(concat_lines), encoding="utf-8")

        run_cmd(
            [
                "ffmpeg",
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(concat_list),
                "-codec:a",
                "libmp3lame",
                str(output_file),
            ]
        )

    return str(output_file)
