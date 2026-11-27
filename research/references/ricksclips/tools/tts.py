"""Generate the narration with an ElevenLabs voice. ONE take only.

Usage:
  python3 tools/tts.py script.txt out.mp3 --voice VOICE_ID          # prints the credit cost and stops
  python3 tools/tts.py script.txt out.mp3 --voice VOICE_ID --yes    # actually spends the credits

Key: read from the ELEVEN_API_KEY env var or a local `.env` file (ELEVEN_API_KEY=...).
`.env` is in .gitignore. Never commit the key.
Voice: pass your ElevenLabs voice ID with --voice (or set ELEVEN_VOICE_ID).

Rules:
- One take per generation. Never loop takes.
- Say the credit cost before generating (eleven_v3 costs about 1 credit per character).
- mp3_44100_128 (192 kbps needs a higher paid tier).
"""
import os, sys, json, urllib.request

args = [a for a in sys.argv[1:] if not a.startswith("--")]
if len(args) < 2: sys.exit(__doc__)
script, out = args[0], args[1]
voice = sys.argv[sys.argv.index("--voice") + 1] if "--voice" in sys.argv else os.environ.get("ELEVEN_VOICE_ID")
if not voice: sys.exit("pass --voice VOICE_ID or set ELEVEN_VOICE_ID")

key = os.environ.get("ELEVEN_API_KEY")
if not key and os.path.exists(".env"):
    for line in open(".env"):
        if line.startswith("ELEVEN_API_KEY="): key = line.split("=", 1)[1].strip()
text = open(script, encoding="utf-8").read().strip()
print(f"{len(text)} characters  ->  about {len(text)} credits (eleven_v3), 1 take")
if "--yes" not in sys.argv: sys.exit("Not generated. Re-run with --yes once the cost is approved.")
if not key: sys.exit("Set ELEVEN_API_KEY (env var or .env file).")

body = {
    "text": text,
    "model_id": "eleven_v3",  # v3 reads the [audio tags] in the script
    "voice_settings": {"stability": 0.35, "similarity_boost": 0.8, "style": 0.45, "use_speaker_boost": True, "speed": 1.05},
}
req = urllib.request.Request(
    f"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128",
    data=json.dumps(body).encode(), method="POST",
    headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
)
with urllib.request.urlopen(req, timeout=300) as r, open(out, "wb") as f:
    f.write(r.read())
print("wrote", out)
