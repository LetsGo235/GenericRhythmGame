(function () {
  "use strict";

  function makeBeats(bpm, seconds, pattern) {
    const step = 60 / bpm;
    const beats = [];
    for (let i = 0, t = 2; t < seconds - 1; i++, t += step) {
      if (!pattern || pattern[i % pattern.length]) beats.push(Number(t.toFixed(3)));
    }
    return beats;
  }

  function makeNotes(beats, root) {
    const scale = [0, 3, 7, 10, 12, 10, 7, 3];
    return beats.map((t, i) => ({
      t,
      hz: root * Math.pow(2, scale[i % scale.length] / 12),
      len: i % 4 === 0 ? 0.28 : 0.14,
      gain: i % 4 === 0 ? 0.075 : 0.045,
      wave: i % 8 < 4 ? "triangle" : "sine"
    }));
  }

  const neonBeats = makeBeats(120, 34, [1, 1, 1, 1, 1, 1, 1, 1]);
  const orbitBeats = makeBeats(142, 39, [1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 1]);
  const driftBeats = makeBeats(96, 42, [1, 0, 1, 1, 1, 0, 1, 0]);

  window.PulseData = {
    modes: [
      { id: "classic", name: "CLASSIC", icon: "◆", blurb: "Hit every pulse. Misses break your combo.", perfect: 72, good: 145, miss: 210, fail: false },
      { id: "precision", name: "PRECISION", icon: "◎", blurb: "Tighter timing. Higher score multiplier.", perfect: 45, good: 92, miss: 150, fail: false },
      { id: "survival", name: "SURVIVAL", icon: "♥", blurb: "Misses drain energy. Reach the end alive.", perfect: 70, good: 140, miss: 205, fail: true },
      { id: "zen", name: "ZEN", icon: "∞", blurb: "No failure, no pressure. Just follow the music.", perfect: 85, good: 180, miss: 280, fail: false }
    ],
    demoSongs: [
      {
        id: "demo-neon-steps", title: "Neon Steps", artist: "Pulse System", bpm: 120,
        duration: 34, difficulty: 2, colorA: "#6cf2ff", colorB: "#7058ff", builtin: true,
        beats: neonBeats, demoNotes: makeNotes(neonBeats, 220), createdAt: 1
      },
      {
        id: "demo-orbit-breaker", title: "Orbit Breaker", artist: "Canvas Club", bpm: 142,
        duration: 39, difficulty: 4, colorA: "#ff4fbb", colorB: "#ff8a3d", builtin: true,
        beats: orbitBeats, demoNotes: makeNotes(orbitBeats, 164.81), createdAt: 2
      },
      {
        id: "demo-slow-drift", title: "Slow Drift", artist: "Night Window", bpm: 96,
        duration: 42, difficulty: 1, colorA: "#9cff7a", colorB: "#2ab7ca", builtin: true,
        beats: driftBeats, demoNotes: makeNotes(driftBeats, 196), createdAt: 3
      }
    ],
    defaultProfile: {
      settings: { volume: 0.78, offset: 0, reducedMotion: false, hitSounds: true },
      scores: {},
      plays: 0,
      totalHits: 0,
      perfects: 0,
      streak: 0,
      achievements: []
    }
  };
}());
