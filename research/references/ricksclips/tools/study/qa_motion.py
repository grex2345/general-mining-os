"""QA gate (thresholds = what 75% of the 19 Ricks videos achieve): measure one of OUR renders against the Ricks targets (docs/07 section 1).
Usage: python3 tools/study/qa_motion.py preview.mp4
Runs the same frame-by-frame measurements used on the 19 Ricks videos and prints PASS/FAIL per target.
Run it on a preview (even a low-res or partial render) BEFORE the full PC render. If it fails: add story actions,
reactors, background life, parallax, and faster composition changes. Don't just make the camera move more.
"""
import sys, subprocess, os, json, tempfile, numpy as np
here = os.path.dirname(os.path.abspath(__file__)); v = os.path.abspath(sys.argv[1])
tmp = tempfile.mkdtemp(); npz = os.path.join(tmp, 'm.npz')
subprocess.run([sys.executable, os.path.join(here, 'motion.py'), v, npz], check=True)
z = np.load(npz); D = {k: z['data'][:, i] for i, k in enumerate(z['cols'])}; N = len(D['diff']); FPS = 30
cam = np.maximum(D['glob_mag'], np.abs(D['scale'] - 1) * 90); loc = D['moving_frac']
ok = np.ones(N, bool)
dead = (cam <= 0.08) & (loc <= 0.01); runs, r = [], 0
for x in dead: r = r + 1 if x else 0; runs.append(r)
# composition changes (cuts + dissolves + whips)
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', v, '-vf', 'scale=36:64:flags=area', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], capture_output=True).stdout
V = np.frombuffer(raw, np.uint8).reshape(-1, 64, 36, 3).astype(np.float32)
H = np.array([np.concatenate([np.histogram(f[..., c], 16, (0, 256))[0] for c in range(3)]) / f[..., 0].size for f in V])
d1 = np.abs(H[1:] - H[:-1]).sum(1); d8 = np.abs(H[8:] - H[:-8]).sum(1); ev = []; i = 0
while i < len(d8):
    if d8[i] > 0.9:
        j = i
        while j < len(d8) and d8[j] > 0.9: j += 1
        seg = d1[i:j + 8]; ev.append('cut' if seg.max() / max(seg.sum(), 1e-6) > 0.5 else 'soft'); i = j + 8
    else: i += 1
dur = N / FPS
res = [
    ('anything moving %', 100 * np.mean((cam > 0.08) | (loc > 0.01)), '>=', 95),
    ('local (non-camera) moving %', 100 * np.mean(loc > 0.01), '>=', 91),
    ('dead frames %', 100 * np.mean(dead), '<=', 4.5),
    ('longest dead stretch s', max(runs) / FPS, '<=', 0.7),
    ('avg moving area %', 100 * loc.mean(), '>=', 30),
    ('composition change every s', dur / max(len(ev), 1), '<=', 2.2),
    ('hard cuts', ev.count('cut'), '<=', 2),
]
advisory = [
    ('camera roll frames %', 100 * np.mean(np.abs(D['rot']) > 0.03), '>=', 25),
    ('pull-back frames %', 100 * np.mean(D['scale'] < 0.9992), '>=', 14),
]
fails = 0
for name, val, op, tgt in res:
    good = val >= tgt if op == '>=' else val <= tgt; fails += not good
    print(f"{'PASS' if good else 'FAIL'}  {name:30s} {val:7.2f}   (target {op} {tgt})")
for name, val, op, tgt in advisory:
    good = val >= tgt
    print(f"{'ok  ' if good else 'LOW '}  {name:30s} {val:7.2f}   (advisory {op} {tgt})")
print('\nRESULT:', 'PASS' if not fails else f'{fails} FAIL(S): add story actions / reactors / background life / parallax, then re-check')
