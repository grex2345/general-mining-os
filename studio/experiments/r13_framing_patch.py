import pathlib, sys
p = pathlib.Path('studio/src/film_bell.js')
t = p.read_text()
orig = t
edits = []

def rep(label, a, b):
    global t
    if a not in t:
        edits.append((label, 'MISS'))
        return
    t = t.replace(a, b, 1)
    edits.append((label, 'ok'))

# FORGE
rep('forge-fog', "sc.fog = new T.Fog(0x3a2a22, 12, 40);", "sc.fog = new T.Fog(0x241a14, 12, 40);")
rep('forge-sky', "top: '#2a1e18', mid: '#4a3226', bottom: '#6b4530'", "top: '#1a120e', mid: '#30221a', bottom: '#4a3020'")
rep('forge-backwall', "p: [0, 3.2, -5], s: [16, 6.4, 0.5], color: '#7a6350'", "p: [0, 3.2, -5], s: [16, 6.4, 0.5], color: '#5c4938'")
rep('forge-leftwall', "p: [-7.5, 3.2, 0], s: [0.5, 6.4, 12], color: '#6f5a48'", "p: [-6, 3.2, 0], s: [0.5, 6.4, 12], color: '#54432f'")
rep('forge-rightwall', "p: [7.5, 3.2, 0], s: [0.5, 6.4, 12], color: '#6f5a48'", "p: [6, 3.2, 0], s: [0.5, 6.4, 12], color: '#54432f'")
rep('forge-fire-pos', "forgeFire(T, W, K, [2.6, 0, -2.2])", "forgeFire(T, W, K, [1.7, 0, -2.2])")
rep('forge-anvil-pos', "anvil(T, W, K, [-1.6, 0, -0.6])", "anvil(T, W, K, [-1.2, 0, -0.6])")
rep('forge-f1', "const f1 = A.Actor({ p: [-1.6, 0, 0.5], h: 2.5, look: FOUNDER });", "const f1 = A.Actor({ p: [-1.2, 0, 0.5], h: 2.5, look: FOUNDER });")
rep('forge-f2', "const f2 = A.Actor({ p: [2.4, 0, -0.9], h: 2.4,", "const f2 = A.Actor({ p: [1.6, 0, -0.9], h: 2.4,")
rep('forge-cam0', "{ t: 0, pos: [0.4, 2.4, 7.4], look: [0, 1.5, -1], fov: 52 },", "{ t: 0, pos: [0.3, 2.3, 6.6], look: [0.2, 1.6, -1.4], fov: 56 },")
rep('forge-cam1', "{ t: 2.9, pos: [-0.6, 2.0, 5.6], look: [-0.6, 1.5, -0.6], fov: 48 },", "{ t: 2.9, pos: [-0.3, 2.0, 5.6], look: [-0.2, 1.5, -1.0], fov: 52 },")

# SILENT TOWER — hold on the bell before tilting down
rep('silent-cams',
    "{ t: 0, pos: [0, 12.5, 5.0], look: [0, 15.6, -8], fov: 48 },\n        { t: 2.6, pos: [-1.2, 9.0, 7.5], look: [0, 10.0, -8], fov: 50 },\n        { t: 5.1, pos: [-0.4, 3.2, 9.5], look: [0, 1.6, 0], fov: 52 },",
    "{ t: 0, pos: [0, 13.0, 6.0], look: [0, 15.4, -8], fov: 50 },\n        { t: 2.2, pos: [-1.0, 12.4, 7.0], look: [0, 15.0, -8], fov: 50 },\n        { t: 3.6, pos: [-1.2, 8.0, 8.6], look: [0, 8.4, -8], fov: 52 },\n        { t: 5.1, pos: [-0.4, 3.2, 9.5], look: [0, 1.7, 0], fov: 54 },")

# NOT TOUCHING
rep('nt-beam', "p: [0, 6.4, -1.6], s: [9, 0.34, 0.34]", "p: [0, 4.85, -1.6], s: [9, 0.34, 0.34]")
rep('nt-bell', "bell(T, W, K, { p: [1.5, 6.2, -1.6], s: 1.15 })", "bell(T, W, K, { p: [1.3, 4.6, -1.6], s: 1.15 })")
rep('nt-rope', "p: [1.5, 6.3, -1.6], rt: 0.05, h: 0.5", "p: [1.3, 4.75, -1.6], rt: 0.05, h: 0.4")
rep('nt-cam0', "{ t: 0, pos: [-0.4, 2.6, 6.0], look: [0.2, 2.6, -1.6], fov: 50 },", "{ t: 0, pos: [-0.4, 2.7, 5.0], look: [0.3, 2.5, -1.6], fov: 56 },")
rep('nt-cam1', "{ t: 2.9, pos: [-0.2, 3.2, 4.6], look: [0.6, 3.4, -1.6], fov: 46 },", "{ t: 2.9, pos: [-0.2, 2.8, 4.4], look: [0.4, 2.6, -1.6], fov: 52 },")

# TAPPING
rep('tap-beam', "p: [0, 6.6, -1.4], s: [8, 0.32, 0.32]", "p: [0, 4.85, -1.4], s: [8, 0.32, 0.32]")
rep('tap-bell', "bell(T, W, K, { p: [-1.4, 6.4, -1.4], s: 1.0 })", "bell(T, W, K, { p: [-1.5, 4.6, -1.4], s: 1.0 })")
rep('tap-cams',
    "{ t: 0, pos: [-1.6, 2.2, 5.0], look: [0.8, 1.8, -0.6], fov: 50 },\n        { t: 2.2, pos: [-0.6, 2.0, 3.8], look: [1.2, 1.7, -0.4], fov: 46 },\n        { t: 4.4, pos: [0.2, 2.4, 3.2], look: [1.0, 2.0, -0.6], fov: 44 },\n        { t: 7.2, pos: [-0.8, 2.6, 4.2], look: [0.6, 2.0, -0.8], fov: 48 },",
    "{ t: 0, pos: [-1.6, 2.5, 5.2], look: [0.8, 2.3, -0.8], fov: 54 },\n        { t: 2.2, pos: [-0.8, 2.3, 4.4], look: [1.0, 2.2, -0.6], fov: 50 },\n        { t: 4.4, pos: [-0.2, 2.5, 4.0], look: [0.9, 2.3, -0.6], fov: 50 },\n        { t: 7.2, pos: [-1.0, 2.7, 4.8], look: [0.5, 2.4, -0.8], fov: 54 },")

# HELD BREATH — give the crowd a tower to look at
rep('hb-tower', "sc.add(K.hut({ p: [-8.5, 0, -6], s: 1.3, rotY: 0.3 }));",
    "sc.add(tower(T, W, K, { p: [0.5, 0, -20], h: 17, w: 4.4 }));\n      sc.add(K.hut({ p: [-8.5, 0, -6], s: 1.3, rotY: 0.3 }));")
rep('hb-cam0', "{ t: 0, pos: [0, 3.4, 8.6], look: [0, 1.8, 0], fov: 54 },", "{ t: 0, pos: [0, 3.8, 8.6], look: [0, 3.0, -4], fov: 56 },")

# BELL FINE
rep('bf-beam', "p: [0, 6.6, -1.2], s: [9, 0.34, 0.34]", "p: [0, 4.75, -1.2], s: [9, 0.34, 0.34]")
rep('bf-bell', "bell(T, W, K, { p: [0, 6.4, -1.2], s: 1.5 })", "bell(T, W, K, { p: [0.2, 4.4, -1.2], s: 1.35 })")
rep('bf-rope', "p: [0, 6.5, -1.2], rt: 0.06, h: 0.5", "p: [0.2, 4.6, -1.2], rt: 0.06, h: 0.4")
rep('bf-halo', "K.glow({ p: [0, 4.6, -1.2], r: 3.2,", "K.glow({ p: [0.2, 3.2, -1.2], r: 3.0,")
rep('bf-nora', "const nora = A.Actor({ p: [-2.2, 0, 0.8], h: 2.15, look: NORA });", "const nora = A.Actor({ p: [-1.3, 0, 0.9], h: 2.15, look: NORA });")
rep('bf-cams',
    "{ t: 0, pos: [0, 3.4, 5.6], look: [0, 4.4, -1.2], fov: 50 },\n        { t: 1.5, pos: [0.6, 4.2, 4.2], look: [0, 4.8, -1.2], fov: 46 },\n        { t: 3.0, pos: [-0.4, 4.6, 3.6], look: [0, 4.9, -1.2], fov: 44 },",
    "{ t: 0, pos: [0, 3.0, 5.6], look: [0.1, 3.0, -1.2], fov: 54 },\n        { t: 1.5, pos: [0.4, 3.2, 4.8], look: [0.2, 3.2, -1.2], fov: 50 },\n        { t: 3.0, pos: [-0.2, 3.3, 4.4], look: [0.1, 3.3, -1.2], fov: 50 },")

# STONE TRUTH
rep('st-beam', "p: [0, 6.8, -1.4], s: [8.5, 0.34, 0.34]", "p: [0, 5.05, -1.4], s: [8.5, 0.34, 0.34]")
rep('st-bell', "bell(T, W, K, { p: [-1.6, 6.6, -1.4], s: 1.05 })", "bell(T, W, K, { p: [-1.3, 4.8, -1.4], s: 1.05 })")
rep('st-rings', "soundRings(T, W, K, { p: [-1.6, 5.2, -1.4], n: 4 })", "soundRings(T, W, K, { p: [-1.3, 3.6, -1.4], n: 4 })")
rep('st-cams',
    "{ t: 0, pos: [-0.2, 2.4, 4.4], look: [1.4, 2.2, -1.2], fov: 48 },\n        { t: 1.4, pos: [0.4, 2.6, 3.4], look: [1.8, 2.4, -1.4], fov: 44 },\n        { t: 4.2, pos: [-1.0, 3.4, 4.6], look: [0.6, 3.6, -1.4], fov: 50 },\n        { t: 7.0, pos: [-1.8, 4.6, 5.4], look: [-0.4, 4.8, -1.4], fov: 52 },\n        { t: 9.6, pos: [-0.6, 3.0, 5.0], look: [0.4, 2.6, -1.0], fov: 50 },",
    "{ t: 0, pos: [-0.4, 2.7, 5.0], look: [1.0, 2.6, -1.4], fov: 56 },\n        { t: 1.4, pos: [0.1, 2.8, 4.4], look: [1.3, 2.7, -1.4], fov: 52 },\n        { t: 4.2, pos: [-0.8, 3.0, 5.0], look: [0.5, 3.0, -1.4], fov: 54 },\n        { t: 7.0, pos: [-1.4, 3.4, 5.6], look: [-0.2, 3.4, -1.4], fov: 56 },\n        { t: 9.6, pos: [-0.5, 2.9, 5.2], look: [0.4, 2.7, -1.2], fov: 54 },")

# MOVING BELL
rep('mb-beam', "p: [-0.6, 6.6, -1.4], s: [8.5, 0.34, 0.34]", "p: [-0.6, 4.85, -1.4], s: [8.5, 0.34, 0.34]")
rep('mb-bell', "bell(T, W, K, { p: [0.9, 6.4, -1.4], s: 1.1 })", "bell(T, W, K, { p: [0.9, 4.6, -1.4], s: 1.1 })")
rep('mb-rope', "p: [0.9, 6.5, -1.4], rt: 0.05, h: 0.5", "p: [0.9, 4.75, -1.4], rt: 0.05, h: 0.4")
rep('mb-helper', "const helper = A.Actor({ p: [-3.2, 0, -0.4], h: 2.35, look: FOUNDER });", "const helper = A.Actor({ p: [-2.7, 0, -0.4], h: 2.35, look: FOUNDER });")
rep('mb-cams',
    "{ t: 0, pos: [-0.6, 3.0, 5.4], look: [-0.2, 3.4, -1.4], fov: 52 },\n        { t: 2.0, pos: [-1.4, 3.4, 4.6], look: [-0.8, 3.8, -1.4], fov: 50 },\n        { t: 4.1, pos: [-2.0, 3.0, 5.2], look: [-1.4, 3.4, -1.4], fov: 52 },",
    "{ t: 0, pos: [-0.4, 2.9, 5.6], look: [-0.2, 2.8, -1.4], fov: 56 },\n        { t: 2.0, pos: [-1.0, 3.0, 5.0], look: [-0.7, 2.9, -1.4], fov: 54 },\n        { t: 4.1, pos: [-1.5, 2.9, 5.4], look: [-1.1, 2.8, -1.4], fov: 56 },")

for label, st in edits:
    print(('  OK  ' if st == 'ok' else ' MISS ') + label)
miss = [l for l, s in edits if s != 'ok']
p.write_text(t)
print(f"\n{len(edits)-len(miss)}/{len(edits)} applied; changed={t!=orig}")
if miss:
    print('MISSED:', ', '.join(miss)); sys.exit(1)
