import pathlib, sys
p = pathlib.Path('studio/src/film_bell.js')
t = p.read_text(); orig = t
edits = []
def rep(label, a, b):
    global t
    if a not in t: edits.append((label, 'MISS')); return
    t = t.replace(a, b, 1); edits.append((label, 'ok'))

# Portrait framing rule learned here: a bell hung at y~4.6 and an actor on the
# floor at y~0..2.2 do NOT share a 720x1280 frame at these distances — the bell
# clips the top and the actor's head clips the bottom. Hang the belfry bells at
# y~3.6-3.9 so the rim sits just above the actor's head, and aim the camera at
# y~1.9-2.6. Both then fit with margin.

# NOT TOUCHING
rep('nt-beam', "p: [0, 4.85, -1.6], s: [9, 0.34, 0.34]", "p: [0, 3.85, -1.6], s: [9, 0.34, 0.34]")
rep('nt-bell', "bell(T, W, K, { p: [1.3, 4.6, -1.6], s: 1.15 })", "bell(T, W, K, { p: [1.2, 3.6, -1.6], s: 1.1 })")
rep('nt-rope', "p: [1.3, 4.75, -1.6], rt: 0.05, h: 0.4", "p: [1.2, 3.75, -1.6], rt: 0.05, h: 0.4")
rep('nt-cam0', "{ t: 0, pos: [-0.4, 2.7, 5.0], look: [0.3, 2.5, -1.6], fov: 56 },", "{ t: 0, pos: [-0.4, 2.2, 4.8], look: [0.3, 1.95, -1.6], fov: 56 },")
rep('nt-cam1', "{ t: 2.9, pos: [-0.2, 2.8, 4.4], look: [0.4, 2.6, -1.6], fov: 52 },", "{ t: 2.9, pos: [-0.2, 2.3, 4.4], look: [0.4, 2.05, -1.6], fov: 54 },")

# TAPPING
rep('tap-beam', "p: [0, 4.85, -1.4], s: [8, 0.32, 0.32]", "p: [0, 3.85, -1.4], s: [8, 0.32, 0.32]")
rep('tap-bell', "bell(T, W, K, { p: [-1.5, 4.6, -1.4], s: 1.0 })", "bell(T, W, K, { p: [-1.6, 3.6, -1.4], s: 1.0 })")
rep('tap-cams',
    "{ t: 0, pos: [-1.6, 2.5, 5.2], look: [0.8, 2.3, -0.8], fov: 54 },\n        { t: 2.2, pos: [-0.8, 2.3, 4.4], look: [1.0, 2.2, -0.6], fov: 50 },\n        { t: 4.4, pos: [-0.2, 2.5, 4.0], look: [0.9, 2.3, -0.6], fov: 50 },\n        { t: 7.2, pos: [-1.0, 2.7, 4.8], look: [0.5, 2.4, -0.8], fov: 54 },",
    "{ t: 0, pos: [-1.6, 2.2, 5.2], look: [0.8, 1.9, -0.8], fov: 56 },\n        { t: 2.2, pos: [-0.8, 2.1, 4.6], look: [1.0, 1.85, -0.6], fov: 52 },\n        { t: 4.4, pos: [-0.2, 2.2, 4.4], look: [0.9, 1.95, -0.6], fov: 52 },\n        { t: 7.2, pos: [-1.0, 2.3, 5.0], look: [0.5, 2.0, -0.8], fov: 56 },")

# BELL FINE
rep('bf-beam', "p: [0, 4.75, -1.2], s: [9, 0.34, 0.34]", "p: [0, 4.05, -1.2], s: [9, 0.34, 0.34]")
rep('bf-bell', "bell(T, W, K, { p: [0.2, 4.4, -1.2], s: 1.35 })", "bell(T, W, K, { p: [0.2, 3.8, -1.2], s: 1.3 })")
rep('bf-rope', "p: [0.2, 4.6, -1.2], rt: 0.06, h: 0.4", "p: [0.2, 3.95, -1.2], rt: 0.06, h: 0.4")
rep('bf-halo', "K.glow({ p: [0.2, 3.2, -1.2], r: 3.0,", "K.glow({ p: [0.2, 2.7, -1.2], r: 2.8,")
rep('bf-cams',
    "{ t: 0, pos: [0, 3.0, 5.6], look: [0.1, 3.0, -1.2], fov: 54 },\n        { t: 1.5, pos: [0.4, 3.2, 4.8], look: [0.2, 3.2, -1.2], fov: 50 },\n        { t: 3.0, pos: [-0.2, 3.3, 4.4], look: [0.1, 3.3, -1.2], fov: 50 },",
    "{ t: 0, pos: [0, 2.7, 5.8], look: [0.1, 2.5, -1.2], fov: 56 },\n        { t: 1.5, pos: [0.4, 2.8, 5.2], look: [0.2, 2.6, -1.2], fov: 52 },\n        { t: 3.0, pos: [-0.2, 2.9, 4.9], look: [0.1, 2.7, -1.2], fov: 52 },")

# STONE TRUTH
rep('st-beam', "p: [0, 5.05, -1.4], s: [8.5, 0.34, 0.34]", "p: [0, 4.15, -1.4], s: [8.5, 0.34, 0.34]")
rep('st-bell', "bell(T, W, K, { p: [-1.3, 4.8, -1.4], s: 1.05 })", "bell(T, W, K, { p: [-1.4, 3.9, -1.4], s: 1.05 })")
rep('st-rings', "soundRings(T, W, K, { p: [-1.3, 3.6, -1.4], n: 4 })", "soundRings(T, W, K, { p: [-1.4, 2.9, -1.4], n: 4 })")
rep('st-cams',
    "{ t: 0, pos: [-0.4, 2.7, 5.0], look: [1.0, 2.6, -1.4], fov: 56 },\n        { t: 1.4, pos: [0.1, 2.8, 4.4], look: [1.3, 2.7, -1.4], fov: 52 },\n        { t: 4.2, pos: [-0.8, 3.0, 5.0], look: [0.5, 3.0, -1.4], fov: 54 },\n        { t: 7.0, pos: [-1.4, 3.4, 5.6], look: [-0.2, 3.4, -1.4], fov: 56 },\n        { t: 9.6, pos: [-0.5, 2.9, 5.2], look: [0.4, 2.7, -1.2], fov: 54 },",
    "{ t: 0, pos: [-0.4, 2.4, 5.2], look: [1.0, 2.15, -1.4], fov: 58 },\n        { t: 1.4, pos: [0.1, 2.5, 4.8], look: [1.3, 2.2, -1.4], fov: 54 },\n        { t: 4.2, pos: [-0.8, 2.6, 5.2], look: [0.5, 2.35, -1.4], fov: 56 },\n        { t: 7.0, pos: [-1.4, 2.9, 5.8], look: [-0.2, 2.6, -1.4], fov: 58 },\n        { t: 9.6, pos: [-0.5, 2.5, 5.4], look: [0.4, 2.2, -1.2], fov: 56 },")

# MOVING BELL
rep('mb-beam', "p: [-0.6, 4.85, -1.4], s: [8.5, 0.34, 0.34]", "p: [-0.6, 3.95, -1.4], s: [8.5, 0.34, 0.34]")
rep('mb-bell', "bell(T, W, K, { p: [0.9, 4.6, -1.4], s: 1.1 })", "bell(T, W, K, { p: [0.9, 3.7, -1.4], s: 1.05 })")
rep('mb-rope', "p: [0.9, 4.75, -1.4], rt: 0.05, h: 0.4", "p: [0.9, 3.85, -1.4], rt: 0.05, h: 0.4")
rep('mb-cams',
    "{ t: 0, pos: [-0.4, 2.9, 5.6], look: [-0.2, 2.8, -1.4], fov: 56 },\n        { t: 2.0, pos: [-1.0, 3.0, 5.0], look: [-0.7, 2.9, -1.4], fov: 54 },\n        { t: 4.1, pos: [-1.5, 2.9, 5.4], look: [-1.1, 2.8, -1.4], fov: 56 },",
    "{ t: 0, pos: [-0.4, 2.5, 5.8], look: [-0.2, 2.2, -1.4], fov: 58 },\n        { t: 2.0, pos: [-1.0, 2.6, 5.4], look: [-0.7, 2.25, -1.4], fov: 56 },\n        { t: 4.1, pos: [-1.5, 2.5, 5.6], look: [-1.1, 2.2, -1.4], fov: 58 },")

# anvil horn read as a white arrow — shrink it
rep('anvil-horn', "g.add(W.cone({ p: [0.9, 0.72, 0], r: 0.24, h: 0.7, color: '#4a4a52', seg: 10, rot: [0, 0, -Math.PI / 2] }));",
    "g.add(W.cone({ p: [0.78, 0.72, 0], r: 0.19, h: 0.45, color: '#3e3e46', seg: 10, rot: [0, 0, -Math.PI / 2] }));")

for label, st in edits: print(('  OK  ' if st=='ok' else ' MISS ')+label)
miss=[l for l,s in edits if s!='ok']
p.write_text(t)
print(f"\n{len(edits)-len(miss)}/{len(edits)} applied; changed={t!=orig}")
if miss: print('MISSED:', ', '.join(miss)); sys.exit(1)
