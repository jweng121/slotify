from pathlib import Path

from backend.services.audio_edit import insert_ad


def main() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    podcast_path = repo_root / "data" / "podcast_sample.mp3"
    ad_path = repo_root / "data" / "ad_sample.mp3"
    output_dir = repo_root / "outputs"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "final.mp3"

    result = insert_ad(
        podcast_path=str(podcast_path),
        ad_path=str(ad_path),
        insert_time=3.0,
        output_path=str(output_path),
    )

    print(f"Output written to: {result}")
    print("Audio stitching completed successfully.")


if __name__ == "__main__":
    main()
