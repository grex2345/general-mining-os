#!/usr/bin/env python3
"""
voice.py — neural speech + word timing, for the Round 5 character pipeline.

Two engines, used for two different things:

  * piper (MIT, ONNX) supplies the AUDIO. It is a real neural TTS: natural
    prosody, no robotic buzz. Model: en_US-amy-medium (63 MB), fetched from a
    MIT-licensed GitHub repo because huggingface.co is unreachable from here.
  * espeak-ng supplies the TIMING and the IPA. Its own voice is a formant
    synthesiser and sounds like 1985, but its word events and phoneme
    transcription are exact and it needs no model.

The join: piper synthesises each SENTENCE separately, so the final audio has
known sentence boundaries. espeak gives word onsets for each sentence; those are
linearly scaled onto the piper sentence duration. Drift is therefore bounded by
one sentence rather than by the whole paragraph.

This is NOT forced alignment. It is a proportional estimate, and the JSON says
so in `"alignment": "proportional-estimate"`. A real aligner (MFA, torchaudio
forced alignment) would need models we cannot download here.

Usage:  python3 voice.py '<json>'
  {"text": "...", "out": "out/voice.wav", "voice": "piper/amy"}
Prints a JSON report on stdout.
"""

import ctypes
import json
import os
import re
import struct
import sys
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
ESPEAK_DIR = os.path.join(HERE, "lib", "espeakng_loader")
PIPER_LIB = os.path.join(HERE, "lib_piper")
# numpy and onnxruntime live in the piper target dir, not in the system python
for _p in (PIPER_LIB, os.path.join(HERE, "lib")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

# ----------------------------------------------------------------- espeak-ng

_espeak = None
_ESPEAK_RATE = 22050


class _Event(ctypes.Structure):
    _fields_ = [
        ("type", ctypes.c_int),
        ("unique_identifier", ctypes.c_uint),
        ("text_position", ctypes.c_int),
        ("length", ctypes.c_int),
        ("audio_position", ctypes.c_int),
        ("sample", ctypes.c_int),
        ("user_data", ctypes.c_void_p),
    ]


def espeak_init():
    global _espeak, _ESPEAK_RATE
    if _espeak is not None:
        return _espeak
    if not os.path.isdir(ESPEAK_DIR):
        raise SystemExit("espeak-ng data missing: run studio/voice_setup.sh")
    lib = ctypes.CDLL(os.path.join(ESPEAK_DIR, "libespeak-ng.so.1"))
    _ESPEAK_RATE = lib.espeak_Initialize(
        2, 0, os.path.join(ESPEAK_DIR, "espeak-ng-data").encode(), 0
    )
    lib.espeak_SetVoiceByName(b"en-us")
    _espeak = lib
    return lib


def espeak_words_and_audio(text):
    """Word onsets (seconds) from espeak, plus a buffer of its own samples."""
    lib = espeak_init()
    events = []
    samples = []

    def cb(wav, n, ev):
        cnt = n if n > 0 else -n
        for i in range(cnt):
            samples.append(wav[i])
        j = 0
        while ev[j].type != 0 and j < 2000:
            events.append(
                (ev[j].type, ev[j].text_position, ev[j].length, ev[j].audio_position)
            )
            j += 1
        return 0

    CB = ctypes.CFUNCTYPE(
        ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.POINTER(_Event)
    )
    cb_ref = CB(cb)  # keep alive
    lib.espeak_SetSynthCallback(cb_ref)
    data = text.encode("utf-8")
    uid = ctypes.c_uint(1)
    lib.espeak_Synth(data, len(data) + 1, 0, 1, 0, 0, ctypes.byref(uid),
                     ctypes.byref(ctypes.c_uint(2)), 0)
    rate = _ESPEAK_RATE or 22050
    words = []
    for t, pos, ln, ms in events:
        if t != 1:
            continue
        # espeak's text_position is NOT reliably a character offset into the
        # source string: measured, it lands 1-2 characters late, so every word
        # came back missing its opening letters ("Every" -> "ight"). Rather than
        # trusting it, only the ONSET TIME is taken from espeak and the words
        # are recovered by aligning against our own tokenisation in `main()`.
        words.append({"t": ms / 1000.0, "pos": pos, "len": ln})
    duration = len(samples) / float(rate) if samples else 0.0
    return words, duration


def espeak_ipa(text):
    """IPA for a phrase. Returns a list of phoneme symbols, no stress marks."""
    lib = espeak_init()
    lib.espeak_TextToPhonemes.restype = ctypes.c_char_p
    buf = ctypes.c_char_p(text.encode("utf-8"))
    res = lib.espeak_TextToPhonemes(ctypes.byref(buf), 1, 0x02)  # espeakCHARS_IPA
    if not res:
        return []
    s = res.decode("utf-8", "ignore")
    # espeak joins phonemes with '_' in some builds and spaces in others
    parts = re.split(r"[\s_]+", s)
    return [p for p in parts if p]


# --------------------------------------------------------------------- piper

_piper_voice = None


def piper_load(model_base):
    global _piper_voice
    if _piper_voice is not None:
        return _piper_voice
    if PIPER_LIB not in sys.path:
        sys.path.insert(0, PIPER_LIB)
    from piper import PiperVoice

    onnx = model_base + ".onnx"
    cfg = model_base + ".json"
    if not (os.path.exists(onnx) and os.path.exists(cfg)):
        raise SystemExit("piper model missing: " + onnx)
    _piper_voice = PiperVoice.load(onnx, cfg)
    return _piper_voice


def piper_synth_sentences(voice, sentences):
    """Synthesise each sentence separately; return list of float32 arrays."""
    import numpy as np

    out = []
    for s in sentences:
        chunks = list(voice.synthesize(s))
        if not chunks:
            out.append(np.zeros(0, dtype=np.float32))
            continue
        # piper 1.8 yields AudioChunk objects with .audio_float_array
        parts = []
        for c in chunks:
            arr = getattr(c, "audio_float_array", None)
            if arr is None:
                arr = np.frombuffer(c.audio_int16_bytes, dtype=np.int16).astype(np.float32) / 32768.0
            parts.append(np.asarray(arr, dtype=np.float32).ravel())
        out.append(np.concatenate(parts) if parts else np.zeros(0, dtype=np.float32))
    return out


def write_wav(path, samples, rate):
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        pcm = (np.clip(samples, -1.0, 1.0) * 32767.0).astype("<i2")
        w.writeframes(pcm.tobytes())


_IPA_VOWELS = "aeiouyæɑɒɔəɜɛɪʊʌɐɞɘɵɨʉɯœøɶɤɜɝɚɷɘɵ"
_DIACRITICS = set("\u0300\u0301\u0302\u0303\u0304\u0308\u0329\u02b0\u02b1\u02b2\u02b3\u02b4\u02b7\u02e0\u02e4ːˑˈˌ")
_AFFRICATES = ("tʃ", "dʒ")


def split_ipa(cluster):
    """Split an IPA cluster into phonemes, keeping length and stress attached."""
    if not cluster:
        return []
    cluster = cluster.replace("_", "")
    out = []
    i = 0
    while i < len(cluster):
        two = cluster[i:i + 2]
        if two in _AFFRICATES:
            out.append(two)
            i += 2
            continue
        ch = cluster[i]
        if ch in _DIACRITICS and out:
            out[-1] += ch          # length/nasalisation belongs to the phoneme
            i += 1
            continue
        if ch in _DIACRITICS:
            i += 1
            continue
        out.append(ch)
        i += 1
    return out


def split_sentences(text):
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p for p in parts if p]


def main():
    global np
    import numpy as np

    spec = json.loads(sys.argv[1])
    text = spec["text"]
    out_path = spec["out"]
    model = spec.get("model", os.path.join(HERE, "piper", "amy"))

    voice = piper_load(model)
    sentences = split_sentences(text)
    audio_parts = piper_synth_sentences(voice, sentences)
    rate = voice.config.sample_rate

    # concatenate with a short gap between sentences, and remember where each starts
    gap = np.zeros(int(rate * 0.06), dtype=np.float32)
    pieces, starts = [], []
    cursor = 0
    for i, a in enumerate(audio_parts):
        starts.append(cursor)
        pieces.append(a)
        cursor += len(a)
        if i < len(audio_parts) - 1:
            pieces.append(gap)
            cursor += len(gap)
    audio = np.concatenate(pieces) if pieces else np.zeros(1, dtype=np.float32)

    # normalise to -1.5 dBFS
    peak = float(np.max(np.abs(audio))) if len(audio) else 0.0
    if peak > 0:
        audio = audio * (10 ** (-1.5 / 20) / peak)

    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    write_wav(out_path, audio, rate)

    # ---- timing: espeak word onsets, scaled per sentence ----
    all_words = []
    timing_modes = []
    for i, s in enumerate(sentences):
        ewords, edur = espeak_words_and_audio(s)
        tokens = re.findall(r"[A-Za-z0-9']+", s)
        # Keep only espeak events with strictly increasing onsets (it sometimes
        # repeats an event for the last word), then take the first N that fit our
        # token count. This preserves the REAL onset times instead of the even
        # distribution the first version fell back to.
        mono = []
        for w in ewords:
            if not mono or w["t"] > mono[-1]["t"] + 1e-6:
                mono.append(w)
        timing_mode = "espeak"
        if len(mono) >= len(tokens):
            chosen = mono[:len(tokens)]
        else:
            chosen = [{"t": (k / max(1, len(tokens) - 1)) * edur} for k in range(len(tokens))]
            timing_mode = "even-fallback"
        ewords = chosen
        timing_modes.append(timing_mode)
        pdur = len(audio_parts[i]) / float(rate)
        scale = (pdur / edur) if edur > 0 else 1.0
        ipa = espeak_ipa(s)
        # espeak emits one IPA cluster per WORD (stress and segments together),
        # in the same order as its word events, so the two lists zip directly.
        # Splitting the cluster into symbols here is what the lip-sync pass
        # consumes; no phoneme-level timestamps are invented.
        for j, w in enumerate(ewords):
            start = starts[i] / float(rate) + w["t"] * scale
            nxt = (starts[i] / float(rate)
                   + (ewords[j + 1]["t"] * scale if j + 1 < len(ewords) else pdur))
            cluster = ipa[j] if j < len(ipa) else ""
            all_words.append({
                "word": tokens[j] if j < len(tokens) else "",
                "t": round(start, 4),
                "dur": round(max(0.04, nxt - start), 4),
                "ipa": cluster,
                "phonemes": split_ipa(cluster),
            })

    report = {
        "out": out_path,
        "rate": rate,
        "duration": round(len(audio) / float(rate), 4),
        "sentences": len(sentences),
        "words": all_words,
        "alignment": "proportional-estimate",
        "timing_per_sentence": timing_modes,
        "engine": {
            "audio": "piper 1.8 (en_US-amy-medium, MIT)",
            "timing": "espeak-ng 1.52 word events, scaled per sentence",
        },
        "text": text,
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
