// actor.js — Round 11 continuous-acting + locomotion layer over the puppet billboard.
// EXTENDS the engine (StickWorld billboard + puppet2d). Provides: distance-driven walk cycles,
// idle micro-motion (breath/weight-shift/blink), waypoint locomotion between locations, and a
// library of gesture "recipes" that map narration beats to body/facial acting + object interaction.
// Browser-side classic script: window.ActorKit(THREE, W, K).
window.ActorKit = function (THREE, W, K) {
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const smooth = (u) => u * u * (3 - 2 * u);
  const lerp = (a, b, u) => a + (b - a) * u;

  function Actor({ p = [0, 0, 0], h = 2.5, look = {} }) {
    const bb = W.billboard({ p, h, look });
    const sh = W.shadow({ p, r: h * 0.30, o: 0.42 });
    const pos = [p[0], p[2]];
    return {
      group: bb.group, shadow: sh, h, look, pos,
      setPos(x, z) { pos[0] = x; pos[1] = z; bb.group.position.set(x, h * 0.483, z); sh.position.set(x, 0.02, z); },
      update(camera, frameT, pose) { bb.update(camera, Object.assign({ t: frameT }, pose)); },
    };
  }

  // Waypoint locomotion. keys=[{t,x,z}] -> {x,z,walk,speed,moving,flip}. Walk phase tracks
  // DISTANCE travelled (no foot-sliding); speed amp ramps with instantaneous velocity.
  function path(t, keys, { stride = 0.95 } = {}) {
    if (t <= keys[0].t) return { x: keys[0].x, z: keys[0].z, walk: 0, speed: 0, moving: false, flip: false };
    if (t >= keys[keys.length - 1].t) { const k = keys[keys.length - 1]; return { x: k.x, z: k.z, walk: 0, speed: 0, moving: false, flip: false }; }
    let i = 0; while (i < keys.length - 2 && t > keys[i + 1].t) i++;
    const a = keys[i], b = keys[i + 1];
    const u = smooth(clamp((t - a.t) / (b.t - a.t), 0, 1));
    const x = lerp(a.x, b.x, u), z = lerp(a.z, b.z, u);
    // distance travelled up to t
    let dist = 0; for (let k = 0; k < i; k++) dist += Math.hypot(keys[k + 1].x - keys[k].x, keys[k + 1].z - keys[k].z);
    dist += Math.hypot(x - a.x, z - a.z);
    const segLen = Math.hypot(b.x - a.x, b.z - a.z);
    const vel = segLen / Math.max(0.05, b.t - a.t);
    const speed = clamp(vel / 1.6, 0, 1);
    const moving = speed > 0.06;
    const flip = (b.x - a.x) < -0.01;
    return { x, z, walk: dist / stride * Math.PI * 2, speed, moving, flip };
  }

  // Idle micro-motion so a standing character never freezes: weight-shift, breath, glance-around.
  function idle(t, base = {}) {
    const sway = Math.sin(t * 0.9) * 0.02;
    const glance = Math.sin(t * 0.35) * 0.35;
    return Object.assign({ mood: 'smile', arms: 'down', tilt: sway, lookX: glance, squash: Math.sin(t * 1.1) * 0.008 }, base);
  }

  /* ---- gesture recipes: return pose fragments for a local beat time ---- */
  const G = {
    // working the wheel: lean in, hands shaping, focused; small rhythmic bob
    workWheel(t) { return { mood: 'deadpan', arms: 'hold', hunch: 0.35, tilt: 0.05 + Math.sin(t * 2.2) * 0.02, lookX: 0.2, armR: [0.16, 0.42], armL: [-0.16, 0.42], armRK: 0.9, armLK: 0.9, squash: Math.sin(t * 2.2) * 0.01 }; },
    // shaping clay upward: hands rise, proud grin
    shapeClay(t) { const u = (t % 2) / 2; return { mood: 'grin', arms: 'hold', hunch: 0.2, armR: [0.14, 0.4 + u * 0.18], armL: [-0.14, 0.4 + u * 0.18], armRK: 0.9, armLK: 0.9, lookX: 0.1 }; },
    // sweep a failed pot away: wind-up then fling, deadpan -> shrug
    throwPot(t) { const u = clamp(t / 0.8, 0, 1); if (u < 0.4) return { mood: 'deadpan', arms: 'hold', armR: [0.2, 0.5], armRK: 0.9, hunch: 0.2 }; return { mood: 'deadpan', arms: 'point', armR: [0.42, 0.55], armRK: 1, tilt: -0.06, lookX: 0.5 }; },
    // feed the kiln: reach forward, heat worry, sweat
    fireKiln(t) { return { mood: 'worry', arms: 'hold', hunch: 0.3, nerv: 0.3, sweat: 0.4, armR: [0.2, 0.45], armL: [-0.1, 0.4], armRK: 0.9, armLK: 0.8, lookX: 0.3 }; },
    // present the masterpiece: arms open wide, proud grin, slight bounce
    reveal(t) { return { mood: 'grin', arms: 'up', squash: Math.sin(t * 2) * 0.02, tilt: Math.sin(t * 1.2) * 0.02, lookX: 0 }; },
    // hold vase aloft + celebrate: bounce, laugh
    celebrate(t) { return { mood: 'laugh', arms: 'up', squash: 0.05 * Math.abs(Math.sin(t * 3)), tilt: Math.sin(t * 3) * 0.04, air: 0.2 * Math.abs(Math.sin(t * 3)) }; },
    // mock / point and laugh (villagers)
    mock(t) { return { mood: 'laugh', arms: 'point', lookX: 0.6, tilt: Math.sin(t * 4) * 0.05, squash: 0.03 * Math.abs(Math.sin(t * 4)) }; },
    // greedy gold-clutching
    greedy(t) { return { mood: 'grin', arms: 'chest', lookX: -0.3, hunch: 0.15, armR: [0.1, 0.5], armL: [-0.1, 0.5], armRK: 0.9, armLK: 0.9 }; },
    // determined close-up: deadpan -> resolve
    resolve(t) { const u = clamp(t / 2, 0, 1); return { mood: u < 0.5 ? 'deadpan' : 'grin', arms: 'down', tilt: 0.02, lookX: 0.1, hunch: 0.1 * (1 - u) }; },
    // carry a vase carefully
    carry(t) { return { mood: 'smile', arms: 'box', hunch: 0.1, armR: [0.18, 0.5], armL: [-0.18, 0.5], armRK: 0.95, armLK: 0.95, squash: Math.sin(t * 2) * 0.008 }; },
    // crowd gasp: shock, hands to head
    gasp(t) { return { mood: 'shock', arms: 'head', nerv: 0.4, lookX: 0 }; },
    // applaud: hands together rhythmically
    applaud(t) { return { mood: 'grin', arms: 'chest', armR: [0.06, 0.55], armL: [-0.06, 0.55], armRK: 0.95, armLK: 0.95, squash: 0.02 * Math.abs(Math.sin(t * 6)) }; },
  };

  return { Actor, path, idle, G };
};
