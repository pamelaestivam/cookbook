"""Speech-to-text for videos without captions.

Usage: python3 transcribe.py <audio.wav> [model]
Prints a JSON array of {"start": seconds, "text": "..."} segments.
"""

import json
import sys

from faster_whisper import WhisperModel


def main() -> None:
    audio_path = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) > 2 else "small"
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, _info = model.transcribe(audio_path, vad_filter=True)
    result = [{"start": round(s.start, 2), "text": s.text.strip()} for s in segments if s.text.strip()]
    json.dump(result, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
