"""Frame-by-frame motion analysis of one video.
Per frame: cut score, global camera motion (affine fit to dense optical flow: pan x/y, zoom, roll),
local (non-camera) motion = residual flow after removing the camera, split by screen region.
Caption band (burned-in one-word captions) is masked so caption pops don't count as motion.
Usage: python3 motion.py video.mp4 out.npz
"""
import sys, subprocess, numpy as np, cv2

src, out = sys.argv[1], sys.argv[2]
W, H = 180, 320
p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", src, "-vf", f"scale={W}:{H}:flags=area", "-pix_fmt", "gray", "-f", "rawvideo", "-"], stdout=subprocess.PIPE)
ys, xs = np.mgrid[4:H - 4:6, 4:W - 4:6]
pts = np.stack([xs.ravel(), ys.ravel()], 1).astype(np.float32)
cap = np.zeros((H, W), bool); cap[int(0.57 * H):int(0.77 * H)] = True   # caption band
REG = {"top": (0, 0.33), "mid": (0.33, 0.57), "bot": (0.77, 1.0)}
rows = []; heat = np.zeros((H, W), np.float64); prev = None; n = 0
while True:
    b = p.stdout.read(W * H)
    if len(b) < W * H: break
    f = np.frombuffer(b, np.uint8).reshape(H, W)
    if prev is None: prev = f; continue
    small_a = cv2.resize(prev, (18, 32), interpolation=cv2.INTER_AREA).astype(np.float32)
    small_b = cv2.resize(f, (18, 32), interpolation=cv2.INTER_AREA).astype(np.float32)
    diff = float(np.mean(np.abs(small_a - small_b)))
    flow = cv2.calcOpticalFlowFarneback(prev, f, None, 0.5, 3, 15, 3, 5, 1.2, 0)
    fv = flow[ys, xs].reshape(-1, 2)
    keep = ~cap[ys, xs].ravel()
    A, inl = cv2.estimateAffinePartial2D(pts[keep], pts[keep] + fv[keep], method=cv2.RANSAC, ransacReprojThreshold=0.8)
    if A is None: A = np.array([[1, 0, 0], [0, 1, 0]], np.float32)
    sc = float(np.hypot(A[0, 0], A[1, 0])); rot = float(np.degrees(np.arctan2(A[1, 0], A[0, 0])))
    gx = A[0, 0] * np.arange(W)[None, :] + A[0, 1] * np.arange(H)[:, None] + A[0, 2] - np.arange(W)[None, :]
    gy = A[1, 0] * np.arange(W)[None, :] + A[1, 1] * np.arange(H)[:, None] + A[1, 2] - np.arange(H)[:, None]
    res = np.hypot(flow[..., 0] - gx, flow[..., 1] - gy)
    mov = (res > 0.5) & ~cap
    heat += mov
    r = [diff, float(A[0, 2]), float(A[1, 2]), sc, rot, float(np.mean(np.hypot(gx, gy))),
         float(mov.sum() / (~cap).sum()), float(res[~cap].mean()), float(inl.mean()) if inl is not None else 0.0]
    for k, (a, bb) in REG.items():
        m = mov[int(a * H):int(bb * H)]; r.append(float(m.mean()))
    c = mov[:, W // 4: 3 * W // 4]; r.append(float(c.mean())); r.append(float(np.concatenate([mov[:, :W // 4], mov[:, 3 * W // 4:]], 1).mean()))
    rows.append(r); prev = f; n += 1
cols = "diff tx ty scale rot glob_mag moving_frac res_mean inlier top mid bot center sides".split()
np.savez_compressed(out, data=np.array(rows, np.float32), cols=np.array(cols), heat=heat / max(n, 1))
print(src, n, "frames")
