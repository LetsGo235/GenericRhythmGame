(function () {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const audioPicker = document.getElementById("audioPicker");
  const coverPicker = document.getElementById("coverPicker");
  const packPicker = document.getElementById("packPicker");
  const foreignPicker = document.getElementById("foreignPicker");
  const Audio = window.PulseAudio;
  const Store = window.PulseStorage;
  const Data = window.PulseData;
  const W = 1280;
  const H = 720;
  const TAU = Math.PI * 2;

  const app = {
    screen: "boot",
    previous: "title",
    songs: [],
    selectedSong: 0,
    selectedMode: 0,
    profile: JSON.parse(JSON.stringify(Data.defaultProfile)),
    buttons: [],
    focus: 0,
    pointer: { x: -999, y: -999, down: false },
    scale: 1,
    ox: 0,
    oy: 0,
    time: 0,
    dt: 0,
    last: performance.now(),
    particles: [],
    toast: null,
    coverCache: new Map(),
    editor: null,
    importSession: null,
    pendingForeign: null,
    game: null,
    result: null,
    textField: null,
    reducedMotion: false
  };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { return 1 - Math.pow(1 - clamp(t, 0, 1), 3); }
  function pad(n) { return String(Math.floor(n)).padStart(2, "0"); }
  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "0:00";
    return Math.floor(seconds / 60) + ":" + pad(seconds % 60);
  }
  function formatNumber(n) { return Math.round(n || 0).toLocaleString("en-US"); }
  function uid() { return "song-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7); }
  function pointIn(x, y, r) { return x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h; }
  function rgba(hex, alpha) {
    const clean = hex.replace("#", "");
    const value = parseInt(clean.length === 3 ? clean.split("").map(c => c + c).join("") : clean, 16);
    return `rgba(${value >> 16},${(value >> 8) & 255},${value & 255},${alpha})`;
  }
  function rounded(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function panel(x, y, w, h, alpha, radius) {
    ctx.fillStyle = `rgba(18,22,48,${alpha == null ? 0.82 : alpha})`;
    rounded(x, y, w, h, radius || 22);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.085)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  function text(value, x, y, size, color, align, weight) {
    ctx.font = `${weight || 600} ${size}px system-ui, -apple-system, Segoe UI, sans-serif`;
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color || "#f7f8ff";
    ctx.fillText(String(value), x, y);
  }
  function smallCaps(value, x, y, color, align) {
    ctx.save();
    ctx.letterSpacing = "2px";
    text(String(value).toUpperCase(), x, y, 12, color || "#9ca6ca", align, 800);
    ctx.restore();
  }
  function line(x1, y1, x2, y2, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function gradient(a, b, x, y, w, h) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, a); g.addColorStop(1, b); return g;
  }
  function truncate(value, max) { return value.length > max ? value.slice(0, max - 1) + "…" : value; }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const nextWidth = Math.round(innerWidth * dpr);
    const nextHeight = Math.round(innerHeight * dpr);
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }
    app.scale = Math.min(innerWidth / W, innerHeight / H);
    app.ox = (innerWidth - W * app.scale) / 2;
    app.oy = (innerHeight - H * app.scale) / 2;
    ctx.setTransform(dpr * app.scale, 0, 0, dpr * app.scale, dpr * app.ox, dpr * app.oy);
  }

  function background(accentA, accentB) {
    accentA = accentA || "#6cf2ff";
    accentB = accentB || "#7058ff";
    ctx.fillStyle = "#090b18";
    ctx.fillRect(0, 0, W, H);
    const g1 = ctx.createRadialGradient(1040, 80, 0, 1040, 80, 600);
    g1.addColorStop(0, rgba(accentB, 0.18));
    g1.addColorStop(1, "rgba(9,11,24,0)");
    ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);
    const g2 = ctx.createRadialGradient(120, 700, 0, 120, 700, 520);
    g2.addColorStop(0, rgba(accentA, 0.13));
    g2.addColorStop(1, "rgba(9,11,24,0)");
    ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = "#b9c0eb";
    ctx.lineWidth = 1;
    const drift = app.reducedMotion ? 0 : (app.time * 8) % 64;
    for (let x = -64 + drift; x < W + 64; x += 64) line(x, 0, x - 180, H, "rgba(185,192,235,.12)", 1);
    for (let y = 40; y < H; y += 64) line(0, y, W, y, "rgba(185,192,235,.08)", 1);
    ctx.restore();
  }

  function drawLogo(x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(app.reducedMotion ? -0.15 : -0.15 + Math.sin(app.time * 0.8) * 0.03);
    ctx.strokeStyle = "#6cf2ff";
    ctx.lineWidth = size * 0.08;
    ctx.shadowColor = "#6cf2ff";
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.42, -2.4, 0.8);
    ctx.stroke();
    ctx.strokeStyle = "#ff4fbb";
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.26, 0.75, 4.05);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(0, 0, size * 0.055, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function beginUI() { app.buttons = []; }
  function button(label, x, y, w, h, action, options) {
    options = options || {};
    const index = app.buttons.length;
    const r = { x, y, w, h, action, disabled: !!options.disabled, index };
    app.buttons.push(r);
    const hover = !r.disabled && (pointIn(app.pointer.x, app.pointer.y, r) || app.focus === index);
    ctx.save();
    if (options.accent) {
      ctx.fillStyle = hover ? gradient(options.a || "#6cf2ff", options.b || "#7058ff", x, y, w, h) : rgba(options.a || "#6cf2ff", 0.15);
    } else {
      ctx.fillStyle = hover ? "rgba(255,255,255,.13)" : "rgba(255,255,255,.055)";
    }
    rounded(x, y, w, h, options.radius || 14); ctx.fill();
    ctx.strokeStyle = hover ? (options.a || "rgba(108,242,255,.7)") : "rgba(255,255,255,.09)";
    ctx.lineWidth = hover ? 2 : 1; ctx.stroke();
    if (r.disabled) ctx.globalAlpha = 0.35;
    if (options.icon) text(options.icon, x + 25, y + h / 2, 18, options.color || "#fff", "center", 800);
    text(label, options.icon ? x + 47 : x + w / 2, y + h / 2, options.size || 15, options.color || "#f8f9ff", options.icon ? "left" : "center", 800);
    if (options.hint) text(options.hint, x + w - 18, y + h / 2, 12, "#8f99bf", "right", 700);
    ctx.restore();
    return r;
  }

  function topBar(title, subtitle, backAction) {
    drawLogo(48, 42, 48);
    text(title, 86, 35, 22, "#fff", "left", 900);
    text(subtitle || "", 86, 58, 12, "#8f99bf", "left", 600);
    if (backAction) button("BACK", 1110, 24, 130, 44, backAction, { icon: "←", hint: "ESC" });
  }

  function toast(message, color) {
    app.toast = { message, color: color || "#6cf2ff", until: app.time + 2.7 };
  }

  function drawToast() {
    if (!app.toast || app.time > app.toast.until) return;
    const left = app.toast.until - app.time;
    ctx.save();
    ctx.globalAlpha = clamp(Math.min(1, left * 3), 0, 1);
    const w = Math.min(620, Math.max(260, app.toast.message.length * 8.5 + 50));
    panel(W / 2 - w / 2, 642, w, 48, 0.96, 18);
    ctx.fillStyle = app.toast.color;
    rounded(W / 2 - w / 2 + 10, 653, 5, 26, 3); ctx.fill();
    text(app.toast.message, W / 2, 666, 14, "#fff", "center", 750);
    ctx.restore();
  }

  function setScreen(name, previous) {
    Audio.stop();
    app.previous = previous || app.screen;
    app.screen = name;
    app.focus = 0;
    app.textField = null;
  }

  function selectedSong() { return app.songs[clamp(app.selectedSong, 0, app.songs.length - 1)]; }
  function selectedMode() { return Data.modes[app.selectedMode]; }

  function cover(song, x, y, w, h) {
    ctx.save();
    rounded(x, y, w, h, Math.min(24, w * 0.08)); ctx.clip();
    if (song && (song.coverBlob || song.coverUrl)) {
      let img = app.coverCache.get(song.id);
      if (!img) {
        img = new Image();
        img.src = song.coverBlob ? URL.createObjectURL(song.coverBlob) : song.coverUrl;
        if (song.coverBlob) img.onload = () => URL.revokeObjectURL(img.src);
        app.coverCache.set(song.id, img);
      }
      if (img.complete && img.naturalWidth) {
        const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
        const iw = img.naturalWidth * s, ih = img.naturalHeight * s;
        ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
      }
    } else {
      ctx.fillStyle = gradient(song ? song.colorA : "#6cf2ff", song ? song.colorB : "#7058ff", x, y, w, h);
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 0.2;
      for (let i = 0; i < 7; i++) {
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x + w * 0.5, y + h * 0.5, w * (0.12 + i * 0.09), 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      text((song ? song.title : "?").charAt(0).toUpperCase(), x + w / 2, y + h / 2, w * 0.33, "rgba(255,255,255,.92)", "center", 950);
    }
    ctx.restore();
  }

  function grade(score) {
    const a = score && score.accuracy || 0;
    if (a >= 99.5) return "S+";
    if (a >= 96) return "S";
    if (a >= 90) return "A";
    if (a >= 82) return "B";
    if (a >= 70) return "C";
    return score ? "D" : "—";
  }

  async function boot() {
    const saved = await Store.getProfile();
    if (saved) {
      app.profile = Object.assign({}, Data.defaultProfile, saved);
      app.profile.settings = Object.assign({}, Data.defaultProfile.settings, saved.settings || {});
      app.profile.scores = saved.scores || {};
    }
    app.reducedMotion = app.profile.settings.reducedMotion;
    Audio.setVolume(app.profile.settings.volume);
    const custom = await Store.listSongs();
    const external = (window.PulseExternalSongs || []).map((song, i) => Object.assign({
      id: "file-song-" + i, artist: "Unknown Artist", bpm: 120, difficulty: 2,
      colorA: "#6cf2ff", colorB: "#7058ff", beats: [], duration: 0,
      fileBased: true, createdAt: 10 + i
    }, song));
    app.songs = Data.demoSongs.concat(external, custom.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
    setTimeout(() => setScreen("title"), 350);
  }

  function drawBoot() {
    background();
    drawLogo(W / 2, H / 2 - 35, 100);
    text("LOADING PULSES", W / 2, H / 2 + 55, 13, "#9ca6ca", "center", 800);
  }

  function drawTitle() {
    background("#6cf2ff", "#ff4fbb");
    drawLogo(W / 2, 205, 150);
    text("PULSE//SPACE", W / 2, 325, 62, "#fff", "center", 950);
    text("A ONE-BUTTON RHYTHM PLAYGROUND", W / 2, 374, 14, "#aeb7d9", "center", 800);
    const pulse = 0.65 + Math.sin(app.time * 4) * 0.15;
    text("PRESS SPACE • ENTER • OR TAP", W / 2, 495, 16, `rgba(108,242,255,${pulse})`, "center", 850);
    text("Canvas only. Keyboard, mouse, and touch ready.", W / 2, 662, 12, "#687092", "center", 600);
  }

  function drawMain() {
    background(); beginUI();
    drawLogo(126, 121, 88);
    text("PULSE//SPACE", 190, 105, 34, "#fff", "left", 950);
    text("MAKE THE BEAT. PLAY THE BEAT.", 192, 142, 13, "#8f99bf", "left", 800);
    const menu = [
      ["PLAY", "◆", () => setScreen("songs", "main")],
      ["WORKSHOP", "+", () => setScreen("workshop", "main")],
      ["JUKEBOX", "♫", () => setScreen("jukebox", "main")],
      ["RECORDS", "★", () => setScreen("records", "main")],
      ["SETTINGS", "⚙", () => setScreen("settings", "main")],
      ["HOW TO PLAY", "?", () => setScreen("help", "main")]
    ];
    menu.forEach((m, i) => button(m[0], 92, 218 + i * 62, 330, 48, m[2], { icon: m[1], accent: i === 0, a: "#6cf2ff", b: "#7058ff" }));

    const song = app.songs[(Math.floor(app.time / 5)) % app.songs.length];
    panel(540, 106, 636, 504, 0.72, 30);
    smallCaps("FEATURED PULSE", 588, 148, "#6cf2ff");
    cover(song, 588, 184, 236, 236);
    text(song.title, 858, 211, 30, "#fff", "left", 900);
    text(song.artist, 858, 247, 15, "#aeb7d9", "left", 650);
    smallCaps("BPM", 858, 303); text(song.bpm, 858, 334, 25, "#fff", "left", 850);
    smallCaps("BEATS", 978, 303); text(song.beats.length, 978, 334, 25, "#fff", "left", 850);
    smallCaps("LENGTH", 1080, 303); text(formatTime(song.duration), 1080, 334, 25, "#fff", "left", 850);
    line(858, 378, 1126, 378, "rgba(255,255,255,.1)");
    text("Your library", 588, 474, 15, "#aeb7d9", "left", 650);
    text(app.songs.length + " SONGS", 588, 510, 26, "#fff", "left", 900);
    text(formatNumber(app.profile.plays) + " TOTAL PLAYS", 588, 545, 13, "#8f99bf", "left", 750);
    text("Everything visible is drawn directly on one canvas.", 858, 500, 13, "#8f99bf", "left", 600);
    text("No framework. No web UI components.", 858, 527, 13, "#8f99bf", "left", 600);
  }

  function drawSongSelect() {
    const song = selectedSong();
    background(song.colorA, song.colorB); beginUI();
    topBar("SELECT A SONG", `${app.songs.length} tracks available`, () => setScreen("main"));

    const start = clamp(app.selectedSong - 2, 0, Math.max(0, app.songs.length - 5));
    for (let i = 0; i < Math.min(5, app.songs.length); i++) {
      const idx = start + i;
      const s = app.songs[idx];
      const active = idx === app.selectedSong;
      const y = 116 + i * 100;
      const action = () => { app.selectedSong = idx; app.focus = i + 1; };
      const r = button("", 54, y, 510, 84, action, { accent: active, a: s.colorA, b: s.colorB });
      cover(s, r.x + 10, r.y + 10, 64, 64);
      text(truncate(s.title, 28), 94 + 54, y + 29, 19, "#fff", "left", 850);
      text(truncate(s.artist, 32), 148, y + 55, 12, "#9ca6ca", "left", 600);
      text(formatTime(s.duration), 538, y + 28, 13, "#cbd1ea", "right", 750);
      text("◆".repeat(s.difficulty || 1), 538, y + 55, 10, s.colorA, "right", 800);
    }

    panel(620, 116, 606, 504, 0.79, 28);
    cover(song, 654, 150, 240, 240);
    smallCaps(song.builtin ? "BUILT-IN TRACK" : song.fileBased ? "FILE TRACK" : "CUSTOM TRACK", 930, 157, song.colorA);
    text(truncate(song.title, 22), 930, 195, 29, "#fff", "left", 900);
    text(truncate(song.artist, 26), 930, 227, 14, "#aeb7d9", "left", 650);
    stat("BPM", song.bpm || "—", 930, 276);
    stat("BEATS", song.beats.length, 1056, 276);
    stat("LENGTH", formatTime(song.duration), 1155, 276);
    const best = app.profile.scores[song.id + ":" + selectedMode().id];
    line(930, 342, 1187, 342, "rgba(255,255,255,.1)");
    smallCaps("BEST CLEAR • " + selectedMode().name, 930, 370);
    text(grade(best), 930, 411, 42, best ? song.colorA : "#59617f", "left", 950);
    text(best ? `${formatNumber(best.score)}  •  ${best.accuracy.toFixed(1)}%` : "NO SCORE YET", 1000, 411, 14, "#cbd1ea", "left", 750);
    button("CHOOSE MODE", 654, 528, 532, 58, () => setScreen("modes", "songs"), { accent: true, a: song.colorA, b: song.colorB, icon: "▶", hint: "ENTER" });
    text("↑ ↓ browse  •  Enter choose  •  P preview", 894, 608, 12, "#70799e", "center", 650);
  }

  function stat(label, value, x, y) {
    smallCaps(label, x, y, "#8089ad");
    text(value, x, y + 29, 21, "#fff", "left", 850);
  }

  function drawModes() {
    const song = selectedSong();
    background(song.colorA, song.colorB); beginUI();
    topBar("CHOOSE A MODE", song.title, () => setScreen("songs"));
    Data.modes.forEach((mode, i) => {
      const x = 70 + i * 300;
      const active = i === app.selectedMode;
      const y = 150;
      button("", x, y, 270, 350, () => { app.selectedMode = i; app.focus = i + 1; }, { accent: active, a: song.colorA, b: song.colorB, radius: 26 });
      text(mode.icon, x + 135, y + 78, 45, active ? song.colorA : "#8993b7", "center", 700);
      text(mode.name, x + 135, y + 145, 22, "#fff", "center", 900);
      wrapText(mode.blurb, x + 34, y + 195, 202, 22, 13, "#aeb7d9", "center");
      smallCaps(mode.id === "precision" ? "EXPERT" : mode.id === "zen" ? "RELAXED" : mode.id === "survival" ? "3 LIVES" : "STANDARD", x + 135, y + 302, active ? song.colorA : "#737c9f", "center");
    });
    button("START SONG", 444, 558, 392, 64, () => startGame(), { accent: true, a: song.colorA, b: song.colorB, icon: "▶", hint: "SPACE" });
    text("← → select mode", W / 2, 660, 12, "#70799e", "center", 650);
  }

  function wrapText(value, x, y, width, lineHeight, size, color, align) {
    const words = value.split(" ");
    const lines = [];
    let current = "";
    ctx.font = `600 ${size}px system-ui`;
    for (const word of words) {
      const test = current ? current + " " + word : word;
      if (ctx.measureText(test).width > width && current) { lines.push(current); current = word; }
      else current = test;
    }
    if (current) lines.push(current);
    lines.forEach((l, i) => text(l, align === "center" ? x + width / 2 : x, y + i * lineHeight, size, color, align || "left", 600));
  }

  function drawWorkshop() {
    background("#ff4fbb", "#7058ff"); beginUI();
    topBar("BEAT WORKSHOP", "Create, record, save, and share playable songs", () => setScreen("main"));
    panel(68, 118, 1144, 492, 0.72, 30);
    text("TURN ANY SONG INTO A LEVEL", 110, 169, 30, "#fff", "left", 900);
    text("Import audio, tap along, add cover art, then save it to your library.", 110, 207, 15, "#aeb7d9", "left", 600);
    const items = [
      { y: 246, icon: "+", title: "NEW SONG", sub: "Choose audio and record your own beat map", action: () => { app.pendingForeign = null; audioPicker.click(); }, a: "#6cf2ff" },
      { y: 320, icon: "⇄", title: "CONVERT RHYTHM MAP", sub: "osu!, StepMania, Quaver, Clone Hero, FNF, Beat Saber", action: () => { app.pendingForeign = null; foreignPicker.click(); }, a: "#ffd166" },
      { y: 394, icon: "⇧", title: "IMPORT PULSEPACK", sub: "Load a native .pulsepack song file", action: () => packPicker.click(), a: "#ff4fbb" },
      { y: 468, icon: "▦", title: "MANAGE SONGS", sub: `${Math.max(0, app.songs.filter(s => !s.builtin && !s.fileBased).length)} custom songs saved`, action: () => setScreen("manage", "workshop"), a: "#9cff7a" }
    ];
    items.forEach(item => {
      button("", 108, item.y, 650, 62, item.action, { radius: 18 });
      ctx.fillStyle = rgba(item.a, 0.16); rounded(124, item.y + 9, 44, 44, 13); ctx.fill();
      text(item.icon, 146, item.y + 31, 21, item.a, "center", 900);
      text(item.title, 188, item.y + 22, 15, "#fff", "left", 850);
      text(item.sub, 188, item.y + 43, 11, "#8f99bf", "left", 600);
    });
    panel(808, 263, 352, 252, 0.6, 22);
    smallCaps("WORKFLOW", 840, 298, "#ff75c8");
    const steps = ["1  Choose MP3, WAV, OGG, or M4A", "2  Press Enter to play", "3  Tap Space on every beat", "4  Add art, title, and BPM", "5  Save or export the Pulsepack"];
    steps.forEach((s, i) => text(s, 840, 336 + i * 32, 13, i === 2 ? "#fff" : "#9ca6ca", "left", i === 2 ? 800 : 600));
    text("Conversion and imported audio stay entirely on this device.", 108, 568, 12, "#687092", "left", 600);
  }

  function converterColors(format) {
    if (/osu/i.test(format)) return ["#ff66aa", "#8c63ff"];
    if (/stepmania/i.test(format)) return ["#65f5ff", "#475dff"];
    if (/quaver/i.test(format)) return ["#58d5ff", "#9d64ff"];
    if (/clone/i.test(format)) return ["#9cff7a", "#ffd166"];
    if (/friday/i.test(format)) return ["#ff4fbb", "#59e1ff"];
    if (/beat saber/i.test(format)) return ["#ff4f5e", "#35a7ff"];
    return ["#6cf2ff", "#7058ff"];
  }

  async function importForeign(file) {
    if (!file) return;
    try {
      toast("Reading rhythm map…", "#ffd166");
      const candidates = await window.PulseConverters.parseFile(file);
      candidates.forEach(candidate => {
        const colors = converterColors(candidate.format);
        candidate.colorA = colors[0]; candidate.colorB = colors[1];
      });
      app.importSession = { fileName: file.name, candidates, selected: 0 };
      setScreen("importer", "workshop");
    } catch (error) {
      console.error(error);
      toast(error.message || "This rhythm map could not be converted.", "#ff758f");
    }
  }

  function drawImporter() {
    const session = app.importSession;
    if (!session || !session.candidates.length) { setScreen("workshop"); return; }
    const selected = session.candidates[session.selected];
    background(selected.colorA, selected.colorB); beginUI();
    topBar("UNIVERSAL CONVERTER", `${session.candidates.length} playable chart${session.candidates.length === 1 ? "" : "s"} found`, () => setScreen("workshop"));

    panel(54, 108, 540, 510, 0.73, 26);
    smallCaps("CHOOSE DIFFICULTY / CHART", 84, 143, "#ffd166");
    const start = clamp(session.selected - 2, 0, Math.max(0, session.candidates.length - 5));
    session.candidates.slice(start, start + 5).forEach((candidate, visibleIndex) => {
      const index = start + visibleIndex;
      const y = 171 + visibleIndex * 82;
      const active = index === session.selected;
      button("", 76, y, 496, 68, () => { session.selected = index; }, { accent: active, a: candidate.colorA, b: candidate.colorB, radius: 16 });
      text(candidate.format, 94, y + 20, 11, active ? candidate.colorA : "#8f99bf", "left", 850);
      text(truncate(candidate.difficultyName, 33), 94, y + 44, 16, "#fff", "left", 800);
      text(`${candidate.beats.length} beats`, 548, y + 34, 12, "#aeb7d9", "right", 700);
    });
    if (session.candidates.length > 5) text(`${session.selected + 1} / ${session.candidates.length}  •  ↑ ↓ to browse`, 324, 596, 11, "#70799e", "center", 650);

    panel(624, 108, 602, 510, 0.79, 26);
    smallCaps(selected.format + " IMPORT", 660, 143, selected.colorA);
    text(truncate(selected.title, 30), 660, 184, 29, "#fff", "left", 900);
    text(truncate(selected.artist, 40), 660, 217, 14, "#aeb7d9", "left", 650);
    stat("BPM", selected.bpm || "—", 660, 270);
    stat("BEATS", selected.beats.length, 785, 270);
    stat("DIFFICULTY", selected.difficultyName, 910, 270);
    line(660, 333, 1190, 333, "rgba(255,255,255,.1)");
    smallCaps("CONVERSION NOTES", 660, 361, "#8f99bf");
    const warning = selected.warnings.join(" ");
    wrapText(warning, 660, 394, 510, 21, 12, "#aeb7d9", "left");
    const hasAudio = !!selected.audioBlob;
    const hasCover = !!selected.coverBlob;
    text(hasAudio ? "✓ AUDIO FOUND" : "! AUDIO NEEDED", 660, 477, 12, hasAudio ? "#9cff7a" : "#ffd166", "left", 850);
    text(hasCover ? "✓ ART FOUND" : "— NO COVER ART", 832, 477, 12, hasCover ? "#9cff7a" : "#737c9f", "left", 850);
    button(hasAudio ? "OPEN IN WORKSHOP" : "CHOOSE AUDIO & CONTINUE", 660, 520, 530, 60, () => chooseForeignCandidate(), { accent: true, a: selected.colorA, b: selected.colorB, icon: "⇄", hint: "ENTER" });
    text("Foreign charts are copied—not modified.", 925, 596, 11, "#70799e", "center", 600);
  }

  async function chooseForeignCandidate() {
    const session = app.importSession;
    if (!session) return;
    const candidate = session.candidates[session.selected];
    if (!candidate.audioBlob) {
      app.pendingForeign = candidate;
      toast("Choose the matching song audio.", "#ffd166");
      audioPicker.click();
      return;
    }
    await finishForeignImport(candidate);
  }

  async function finishForeignImport(candidate) {
    const song = {
      id: uid(), title: candidate.title || "Converted Song", artist: candidate.artist || "Unknown Artist",
      bpm: candidate.bpm || 120, duration: candidate.beats[candidate.beats.length - 1] + 3,
      difficulty: candidate.difficulty || 2, difficultyName: candidate.difficultyName,
      colorA: candidate.colorA, colorB: candidate.colorB, beats: candidate.beats.slice(),
      audioBlob: candidate.audioBlob, audioName: candidate.audioName || "imported-audio",
      coverBlob: candidate.coverBlob || null, importSource: candidate.format, createdAt: Date.now()
    };
    try {
      await Audio.load(song);
      song.duration = Audio.duration() || song.duration;
      app.pendingForeign = null;
      openEditor(song, false);
      toast(`${candidate.format} chart converted. Review, test, then save.`, "#9cff7a");
    } catch (error) {
      console.error(error);
      candidate.audioBlob = null;
      app.pendingForeign = candidate;
      toast("That audio could not be decoded. Choose another file.", "#ff758f");
      audioPicker.click();
    }
  }

  function drawManage() {
    background("#9cff7a", "#2ab7ca"); beginUI();
    topBar("MANAGE SONGS", "Custom tracks stored in this browser", () => setScreen("workshop"));
    const custom = app.songs.filter(s => !s.builtin && !s.fileBased);
    if (!custom.length) {
      panel(260, 214, 760, 260, 0.72, 26);
      text("NO CUSTOM SONGS YET", W / 2, 285, 28, "#fff", "center", 900);
      text("Return to the Workshop and choose New Song.", W / 2, 332, 14, "#9ca6ca", "center", 600);
      button("CREATE ONE", 490, 382, 300, 54, () => { app.pendingForeign = null; audioPicker.click(); }, { accent: true, a: "#9cff7a", b: "#2ab7ca" });
      return;
    }
    custom.slice(0, 5).forEach((song, i) => {
      const y = 120 + i * 102;
      panel(70, y, 1140, 84, 0.66, 18);
      cover(song, 82, y + 10, 64, 64);
      text(song.title, 166, y + 28, 18, "#fff", "left", 850);
      text(`${song.artist}  •  ${song.beats.length} beats  •  ${formatTime(song.duration)}`, 166, y + 55, 12, "#8f99bf", "left", 600);
      button("EDIT", 876, y + 18, 124, 48, () => editExisting(song), { icon: "✎" });
      button("EXPORT", 1012, y + 18, 102, 48, () => exportPack(song), { icon: "⇩" });
      button("×", 1125, y + 18, 62, 48, () => deleteSong(song), { color: "#ff758f" });
    });
  }

  function drawJukebox() {
    const song = selectedSong();
    background(song.colorA, song.colorB); beginUI();
    topBar("JUKEBOX", "Preview your songs without playing a chart", () => setScreen("main"));
    cover(song, 116, 152, 360, 360);
    text(song.title, 540, 195, 40, "#fff", "left", 900);
    text(song.artist, 542, 240, 17, "#aeb7d9", "left", 600);
    text(`${song.bpm || "—"} BPM  •  ${formatTime(song.duration)}  •  ${song.beats.length} BEATS`, 542, 288, 13, "#8f99bf", "left", 750);
    const duration = Math.max(1, song.duration);
    const progress = Audio.song && Audio.song.id === song.id ? clamp(Audio.time() / duration, 0, 1) : 0;
    ctx.fillStyle = "rgba(255,255,255,.08)"; rounded(542, 341, 602, 8, 4); ctx.fill();
    ctx.fillStyle = gradient(song.colorA, song.colorB, 542, 341, 602, 8); rounded(542, 341, 602 * progress, 8, 4); ctx.fill();
    text(formatTime(progress * duration), 542, 374, 12, "#9ca6ca", "left", 650);
    text(formatTime(duration), 1144, 374, 12, "#9ca6ca", "right", 650);
    button(Audio.playing ? "PAUSE" : "PLAY PREVIEW", 542, 414, 285, 58, () => togglePreview(song), { accent: true, a: song.colorA, b: song.colorB, icon: Audio.playing ? "Ⅱ" : "▶" });
    button("PREVIOUS", 842, 414, 145, 58, () => changeSong(-1), { icon: "←" });
    button("NEXT", 1000, 414, 144, 58, () => changeSong(1), { icon: "→" });
    text("P preview/pause  •  ← → change track", 843, 524, 12, "#70799e", "center", 650);
  }

  function drawRecords() {
    background("#ffd166", "#ff4fbb"); beginUI();
    topBar("RECORDS", "Your rhythm career at a glance", () => setScreen("main"));
    const cards = [
      ["TOTAL PLAYS", formatNumber(app.profile.plays), "▶"],
      ["TOTAL HITS", formatNumber(app.profile.totalHits), "◆"],
      ["PERFECT HITS", formatNumber(app.profile.perfects), "◎"],
      ["BEST COMBO", formatNumber(app.profile.streak), "⚡"]
    ];
    cards.forEach((c, i) => {
      const x = 70 + i * 292;
      panel(x, 128, 270, 134, 0.72, 20);
      text(c[2], x + 28, 162, 22, i % 2 ? "#ff75c8" : "#ffd166", "left", 800);
      smallCaps(c[0], x + 28, 200);
      text(c[1], x + 28, 234, 29, "#fff", "left", 900);
    });
    panel(70, 290, 1146, 300, 0.7, 24);
    smallCaps("BEST CLEARS", 104, 328, "#ffd166");
    const scores = Object.entries(app.profile.scores).sort((a, b) => b[1].score - a[1].score).slice(0, 5);
    if (!scores.length) text("Play a song to put your first score on the board.", 104, 385, 15, "#8f99bf", "left", 600);
    scores.forEach(([key, score], i) => {
      const song = app.songs.find(s => key.startsWith(s.id + ":"));
      const mode = key.split(":").pop().toUpperCase();
      const y = 375 + i * 42;
      text(i + 1, 106, y, 12, "#737c9f", "left", 800);
      text(song ? song.title : "Unknown track", 142, y, 14, "#fff", "left", 750);
      text(mode, 700, y, 11, "#8f99bf", "left", 800);
      text(score.accuracy.toFixed(1) + "%", 920, y, 13, "#cbd1ea", "right", 750);
      text(formatNumber(score.score), 1095, y, 14, "#fff", "right", 850);
      text(grade(score), 1175, y, 20, "#ffd166", "center", 950);
    });
  }

  function drawSettings() {
    background("#6cf2ff", "#7058ff"); beginUI();
    topBar("SETTINGS", "Tune the game to your setup", () => { saveProfile(); setScreen("main"); });
    panel(260, 120, 760, 490, 0.73, 28);
    settingRow("MASTER VOLUME", Math.round(app.profile.settings.volume * 100) + "%", 180,
      () => changeSetting("volume", -0.05), () => changeSetting("volume", 0.05));
    settingRow("TIMING OFFSET", `${app.profile.settings.offset > 0 ? "+" : ""}${app.profile.settings.offset} ms`, 270,
      () => changeSetting("offset", -5), () => changeSetting("offset", 5));
    settingToggle("HIT SOUNDS", app.profile.settings.hitSounds, 360, () => changeSetting("hitSounds", !app.profile.settings.hitSounds));
    settingToggle("REDUCED MOTION", app.profile.settings.reducedMotion, 450, () => changeSetting("reducedMotion", !app.profile.settings.reducedMotion));
    text("Offset: positive values make notes arrive later.", W / 2, 558, 12, "#70799e", "center", 600);
  }

  function settingRow(label, value, y, minus, plus) {
    smallCaps(label, 310, y, "#9ca6ca");
    button("−", 660, y - 26, 58, 52, minus, { size: 22 });
    text(value, 790, y, 18, "#fff", "center", 850);
    button("+", 862, y - 26, 58, 52, plus, { size: 22 });
    line(310, y + 43, 920, y + 43, "rgba(255,255,255,.08)");
  }

  function settingToggle(label, value, y, action) {
    smallCaps(label, 310, y, "#9ca6ca");
    button(value ? "ON" : "OFF", 760, y - 26, 160, 52, action, { accent: value, a: "#6cf2ff", b: "#7058ff" });
    line(310, y + 43, 920, y + 43, "rgba(255,255,255,.08)");
  }

  function drawHelp() {
    background("#6cf2ff", "#ff4fbb"); beginUI();
    topBar("HOW TO PLAY", "One button. Good timing. Endless songs.", () => setScreen("main"));
    const help = [
      ["PLAY", "Press SPACE or tap when a moving pulse reaches the target ring."],
      ["TIMING", "Perfect hits score the most. Early and late hits still count inside the window."],
      ["WORKSHOP", "Choose audio, press ENTER to play it, then tap SPACE on each beat you hear."],
      ["NAVIGATION", "Use arrows + Enter, the mouse, or touch. Escape always goes back or pauses."],
      ["SHARING", "Export a .pulsepack. It bundles the chart, audio, metadata, and cover art."],
      ["MODES", "Classic, Precision, Survival, and Zen each score the same chart differently."]
    ];
    help.forEach((item, i) => {
      const x = 80 + (i % 2) * 590;
      const y = 126 + Math.floor(i / 2) * 170;
      panel(x, y, 540, 138, 0.7, 22);
      text(String(i + 1).padStart(2, "0"), x + 35, y + 35, 15, i % 2 ? "#ff75c8" : "#6cf2ff", "left", 900);
      text(item[0], x + 80, y + 35, 17, "#fff", "left", 850);
      wrapText(item[1], x + 35, y + 76, 470, 21, 13, "#9ca6ca", "left");
    });
  }

  function makeWaveform(buffer) {
    if (!buffer) return [];
    const data = buffer.getChannelData(0);
    const count = 180;
    const step = Math.max(1, Math.floor(data.length / count));
    const wave = [];
    for (let i = 0; i < count; i++) {
      let peak = 0;
      const start = i * step;
      const end = Math.min(data.length, start + step);
      for (let j = start; j < end; j += Math.max(1, Math.floor(step / 80))) peak = Math.max(peak, Math.abs(data[j]));
      wave.push(peak);
    }
    return wave;
  }

  async function newSongFromFile(file) {
    if (!file) return;
    const title = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
    const draft = {
      id: uid(), title: title || "Untitled", artist: "Unknown Artist", bpm: 120,
      duration: 0, difficulty: 1, colorA: "#6cf2ff", colorB: "#7058ff",
      beats: [], audioBlob: file, audioName: file.name, createdAt: Date.now()
    };
    try {
      toast("Decoding audio…");
      await Audio.load(draft);
      draft.duration = Audio.duration();
      openEditor(draft, false);
    } catch (error) {
      console.error(error);
      toast("That audio format could not be decoded.", "#ff758f");
    }
  }

  async function editExisting(song) {
    const clone = Object.assign({}, song, { beats: song.beats.slice() });
    try {
      await Audio.load(clone);
      openEditor(clone, true);
    } catch (error) {
      toast("Could not open this song's audio.", "#ff758f");
    }
  }

  function openEditor(song, existing) {
    app.editor = {
      song,
      existing,
      waveform: makeWaveform(Audio.buffer),
      selectedField: null,
      snap: true,
      flash: 0,
      lastBeat: -1,
      dirty: false,
      saving: false
    };
    app.screen = "editor";
    app.previous = "workshop";
    app.focus = 0;
  }

  function drawEditor() {
    const ed = app.editor;
    if (!ed) { setScreen("workshop"); return; }
    const song = ed.song;
    background(song.colorA, song.colorB); beginUI();
    drawLogo(44, 36, 40);
    text("BEAT WORKSHOP", 75, 31, 18, "#fff", "left", 900);
    text("Recording studio", 76, 52, 11, "#8f99bf", "left", 600);
    button("EXIT", 1132, 19, 108, 42, () => exitEditor(), { icon: "←", hint: "ESC" });

    panel(42, 82, 1196, 204, 0.76, 24);
    cover(song, 62, 102, 164, 164);
    field("TITLE", song.title, 258, 114, 460, "title");
    field("ARTIST", song.artist, 258, 190, 460, "artist");
    field("BPM", String(song.bpm || 120), 750, 114, 130, "bpm", true);
    button("COVER ART", 750, 190, 180, 54, () => coverPicker.click(), { icon: "▣" });
    button("AUTO BPM", 946, 114, 172, 54, () => estimateBPM(), { icon: "≈" });
    button("CLEAR BEATS", 946, 190, 172, 54, () => { song.beats = []; ed.dirty = true; toast("Beat map cleared"); }, { icon: "×", color: "#ff758f" });
    smallCaps("LENGTH", 1148, 120, "#8f99bf", "center");
    text(formatTime(song.duration), 1148, 155, 22, "#fff", "center", 850);
    smallCaps("BEATS", 1148, 202, "#8f99bf", "center");
    text(song.beats.length, 1148, 237, 22, "#fff", "center", 850);

    panel(42, 308, 1196, 252, 0.82, 24);
    const duration = Math.max(1, song.duration);
    const now = Audio.time();
    drawWaveform(ed, 72, 342, 1136, 124, now / duration);
    text(formatTime(now), 72, 493, 13, "#fff", "left", 750);
    text(formatTime(duration), 1208, 493, 13, "#9ca6ca", "right", 750);
    ctx.fillStyle = "rgba(255,255,255,.07)"; rounded(72, 516, 1136, 5, 3); ctx.fill();
    ctx.fillStyle = gradient(song.colorA, song.colorB, 72, 516, 1136, 5); rounded(72, 516, 1136 * clamp(now / duration, 0, 1), 5, 3); ctx.fill();
    if (ed.flash > 0) {
      ctx.save(); ctx.globalAlpha = ed.flash;
      ctx.strokeStyle = song.colorA; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(W / 2, 404, 75 + (1 - ed.flash) * 40, 0, TAU); ctx.stroke(); ctx.restore();
    }

    button(Audio.playing ? "PAUSE" : (now > 0 ? "RESUME" : "PLAY"), 42, 586, 175, 58, () => toggleEditorPlay(), { icon: Audio.playing ? "Ⅱ" : "▶", hint: "ENTER", accent: true, a: song.colorA, b: song.colorB });
    button("TAP BEAT", 231, 586, 220, 58, () => recordBeat(), { icon: "◆", hint: "SPACE", accent: Audio.playing, a: "#ff4fbb", b: "#ff8a3d" });
    button("UNDO", 465, 586, 130, 58, () => undoBeat(), { icon: "↶", hint: "⌫" });
    button(ed.snap ? "SNAP ON" : "SNAP OFF", 609, 586, 140, 58, () => { ed.snap = !ed.snap; }, { icon: "⌁" });
    button("SAVE", 782, 586, 130, 58, () => saveEditorSong(false), { icon: "✓" });
    button("EXPORT PACK", 926, 586, 190, 58, () => saveEditorSong(true), { icon: "⇩" });
    button("TEST", 1130, 586, 108, 58, () => testEditorSong(), { icon: "▶", disabled: song.beats.length < 1 });
    text("← → seek 5 sec  •  Click waveform to scrub  •  Enter play/pause  •  Space record", W / 2, 680, 12, "#70799e", "center", 650);

    ed.flash = Math.max(0, ed.flash - app.dt * 3.7);
  }

  function field(label, value, x, y, w, id, numeric) {
    const active = app.textField && app.textField.id === id;
    smallCaps(label, x, y - 10, active ? "#6cf2ff" : "#8f99bf");
    button("", x, y + 8, w, 46, () => startTextField(id, value, numeric), { radius: 10 });
    text(truncate(value || "", numeric ? 10 : 38), x + 14, y + 31, 15, "#fff", "left", 700);
    if (active && Math.floor(app.time * 2) % 2 === 0) {
      const tw = ctx.measureText(truncate(app.textField.value, numeric ? 10 : 38)).width;
      line(x + 15 + tw, y + 20, x + 15 + tw, y + 42, "#6cf2ff", 2);
    }
  }

  function drawWaveform(ed, x, y, w, h, progress) {
    const song = ed.song;
    const wave = ed.waveform;
    ctx.save();
    rounded(x, y, w, h, 14); ctx.clip();
    ctx.fillStyle = "rgba(4,6,18,.62)"; ctx.fillRect(x, y, w, h);
    if (wave.length) {
      ctx.strokeStyle = "rgba(174,183,217,.42)"; ctx.lineWidth = 2;
      ctx.beginPath();
      wave.forEach((v, i) => {
        const px = x + i / (wave.length - 1) * w;
        const py = y + h / 2 - v * h * 0.42;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      for (let i = wave.length - 1; i >= 0; i--) {
        const v = wave[i];
        ctx.lineTo(x + i / (wave.length - 1) * w, y + h / 2 + v * h * 0.42);
      }
      ctx.closePath(); ctx.fillStyle = "rgba(108,242,255,.12)"; ctx.fill(); ctx.stroke();
    } else {
      for (let i = 0; i < 90; i++) {
        const amp = 6 + Math.sin(i * 1.7) * 4 + Math.sin(i * 0.31) * 9;
        line(x + i / 89 * w, y + h / 2 - amp, x + i / 89 * w, y + h / 2 + amp, "rgba(174,183,217,.25)", 2);
      }
    }
    song.beats.forEach((beat, i) => {
      const bx = x + beat / Math.max(1, song.duration) * w;
      line(bx, y + 6, bx, y + h - 6, i === ed.lastBeat ? "#fff" : song.colorB, i === ed.lastBeat ? 3 : 1.5);
    });
    ctx.fillStyle = rgba(song.colorA, 0.12); ctx.fillRect(x, y, w * clamp(progress, 0, 1), h);
    const px = x + w * clamp(progress, 0, 1);
    line(px, y, px, y + h, "#fff", 2);
    ctx.restore();
    app.waveformRect = { x, y, w, h };
  }

  function startTextField(id, value, numeric) {
    app.textField = { id, value: String(value || ""), numeric: !!numeric };
  }

  function commitTextField() {
    if (!app.textField || !app.editor) return;
    const f = app.textField;
    if (f.id === "bpm") app.editor.song.bpm = clamp(parseInt(f.value, 10) || 120, 30, 300);
    else app.editor.song[f.id] = f.value.trim() || (f.id === "title" ? "Untitled" : "Unknown Artist");
    app.editor.dirty = true;
    app.textField = null;
  }

  function toggleEditorPlay() {
    if (!app.editor) return;
    if (Audio.playing) Audio.pause();
    else {
      if (Audio.time() >= Audio.duration() - 0.05) Audio.seek(0);
      Audio.play(Audio.time());
    }
  }

  function recordBeat() {
    const ed = app.editor;
    if (!ed || !Audio.playing) { toast("Press Enter to start the song first.", "#ffd166"); return; }
    let t = Audio.time();
    if (t < 0.03 || t > ed.song.duration) return;
    if (ed.snap && ed.song.bpm) {
      const grid = 60 / ed.song.bpm / 2;
      const origin = ed.song.beats.length ? ed.song.beats[0] : t;
      t = origin + Math.round((t - origin) / grid) * grid;
    }
    const closest = ed.song.beats.findIndex(b => Math.abs(b - t) < 0.07);
    if (closest >= 0) ed.song.beats[closest] = Number(t.toFixed(3));
    else ed.song.beats.push(Number(t.toFixed(3)));
    ed.song.beats.sort((a, b) => a - b);
    ed.lastBeat = ed.song.beats.findIndex(b => Math.abs(b - t) < 0.001);
    ed.flash = 1;
    ed.dirty = true;
    if (app.profile.settings.hitSounds) Audio.tickSound(1);
  }

  function undoBeat() {
    const ed = app.editor;
    if (!ed || !ed.song.beats.length) return;
    const now = Audio.time();
    let index = ed.song.beats.length - 1;
    for (let i = 0; i < ed.song.beats.length; i++) if (ed.song.beats[i] <= now + 0.1) index = i;
    ed.song.beats.splice(index, 1);
    ed.lastBeat = -1; ed.dirty = true;
  }

  function estimateBPM() {
    const beats = app.editor.song.beats;
    if (beats.length < 4) { toast("Record at least four beats first.", "#ffd166"); return; }
    const gaps = [];
    for (let i = 1; i < beats.length; i++) {
      const gap = beats[i] - beats[i - 1];
      if (gap > 0.15 && gap < 2.1) gaps.push(gap);
    }
    gaps.sort((a, b) => a - b);
    let median = gaps[Math.floor(gaps.length / 2)] || 0.5;
    let bpm = 60 / median;
    while (bpm < 70) bpm *= 2;
    while (bpm > 190) bpm /= 2;
    app.editor.song.bpm = Math.round(bpm);
    app.editor.dirty = true;
    toast(`Estimated ${app.editor.song.bpm} BPM`);
  }

  function calculateDifficulty(song) {
    if (!song.beats.length || !song.duration) return 1;
    const density = song.beats.length / song.duration;
    let bursts = 0;
    for (let i = 1; i < song.beats.length; i++) if (song.beats[i] - song.beats[i - 1] < 0.32) bursts++;
    return clamp(Math.round(density * 1.6 + bursts / Math.max(1, song.beats.length) * 2), 1, 5);
  }

  async function saveEditorSong(alsoExport) {
    const ed = app.editor;
    if (!ed || ed.saving) return;
    commitTextField();
    if (!ed.song.beats.length) { toast("Record at least one beat before saving.", "#ff758f"); return; }
    ed.saving = true;
    ed.song.difficulty = calculateDifficulty(ed.song);
    ed.song.updatedAt = Date.now();
    try {
      await Store.saveSong(ed.song);
      const idx = app.songs.findIndex(s => s.id === ed.song.id);
      if (idx >= 0) app.songs[idx] = ed.song;
      else app.songs.push(ed.song);
      app.selectedSong = app.songs.findIndex(s => s.id === ed.song.id);
      ed.existing = true; ed.dirty = false;
      toast("Song saved to your library.", "#9cff7a");
      if (alsoExport) await exportPack(ed.song);
    } catch (error) {
      console.error(error); toast("Could not save the song.", "#ff758f");
    }
    ed.saving = false;
  }

  function exitEditor() {
    Audio.stop();
    if (app.editor && app.editor.dirty) toast("Unsaved changes were not kept.", "#ffd166");
    setScreen("workshop");
  }

  async function testEditorSong() {
    await saveEditorSong(false);
    if (!app.editor || !app.editor.song.beats.length) return;
    app.selectedSong = app.songs.findIndex(s => s.id === app.editor.song.id);
    app.selectedMode = 0;
    startGame();
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  function dataURLToBlob(dataURL) {
    const parts = dataURL.split(",");
    const mime = (parts[0].match(/:(.*?);/) || [])[1] || "application/octet-stream";
    const binary = atob(parts[1]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  async function exportPack(song) {
    try {
      toast("Building Pulsepack…");
      const payload = {
        format: "pulse-space-pack", version: 1,
        song: {
          id: song.id, title: song.title, artist: song.artist, bpm: song.bpm,
          duration: song.duration, difficulty: song.difficulty, colorA: song.colorA,
          colorB: song.colorB, beats: song.beats, audioName: song.audioName || "song.audio",
          difficultyName: song.difficultyName || "", importSource: song.importSource || ""
        },
        audio: song.audioBlob ? await blobToDataURL(song.audioBlob) : null,
        cover: song.coverBlob ? await blobToDataURL(song.coverBlob) : null
      };
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = song.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() + ".pulsepack";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("Pulsepack exported.", "#9cff7a");
    } catch (error) {
      console.error(error); toast("Export failed.", "#ff758f");
    }
  }

  async function importPack(file) {
    if (!file) return;
    try {
      const pack = JSON.parse(await file.text());
      if (pack.format !== "pulse-space-pack" || !pack.song || !Array.isArray(pack.song.beats)) throw new Error("Invalid pack");
      const song = Object.assign({}, pack.song, {
        id: uid(),
        audioBlob: pack.audio ? dataURLToBlob(pack.audio) : null,
        coverBlob: pack.cover ? dataURLToBlob(pack.cover) : null,
        builtin: false,
        createdAt: Date.now()
      });
      if (!song.audioBlob) throw new Error("Pack has no audio");
      await Audio.load(song);
      song.duration = Audio.duration() || song.duration;
      await Store.saveSong(song);
      app.songs.push(song);
      app.selectedSong = app.songs.length - 1;
      toast(`Imported “${song.title}”`, "#9cff7a");
      setScreen("songs");
    } catch (error) {
      console.error(error); toast("That file is not a valid Pulsepack.", "#ff758f");
    }
  }

  async function deleteSong(song) {
    if (!song || song.builtin) return;
    if (!song.pendingDelete) {
      song.pendingDelete = true;
      toast(`Press delete again to remove “${song.title}”.`, "#ffd166");
      setTimeout(() => { song.pendingDelete = false; }, 3000);
      return;
    }
    await Store.deleteSong(song.id);
    app.coverCache.delete(song.id);
    app.songs = app.songs.filter(s => s.id !== song.id);
    app.selectedSong = clamp(app.selectedSong, 0, app.songs.length - 1);
    toast("Song removed.", "#ff758f");
  }

  async function startGame() {
    const song = selectedSong();
    if (!song || !song.beats.length) { toast("This song has no beat map.", "#ff758f"); return; }
    try {
      await Audio.load(song);
      if (!song.duration) song.duration = Audio.duration();
      app.game = {
        song,
        mode: selectedMode(),
        notes: song.beats.map(t => ({ t, state: "pending", delta: 0 })),
        countdown: 2.4,
        started: false,
        paused: false,
        score: 0,
        combo: 0,
        bestCombo: 0,
        perfect: 0,
        good: 0,
        miss: 0,
        health: 100,
        judgement: "",
        judgementAge: 10,
        hitFlash: 0,
        ended: false
      };
      app.screen = "play";
      app.focus = 0;
      Audio.onEnded = () => { if (app.screen === "play" && app.game && app.game.started) finishGame(false); };
    } catch (error) {
      console.error(error); toast("Could not load this song.", "#ff758f");
    }
  }

  function gameTime() {
    return app.game && app.game.started ? Audio.time() + app.profile.settings.offset / 1000 : 0;
  }

  function updateGame(dt) {
    const g = app.game;
    if (!g || g.paused || g.ended) return;
    if (!g.started) {
      g.countdown -= dt;
      if (g.countdown <= 0) {
        g.started = true;
        if (g.song.builtin) Audio.playDemo(g.song, 0);
        else Audio.play(0);
      }
      return;
    }
    const now = gameTime();
    const missWindow = g.mode.miss / 1000;
    for (const note of g.notes) {
      if (note.state === "pending" && now - note.t > missWindow) registerMiss(note);
    }
    g.judgementAge += dt;
    g.hitFlash = Math.max(0, g.hitFlash - dt * 4.2);
    if (g.health <= 0 && g.mode.fail) finishGame(true);
    if (!Audio.playing && now > 0 && !g.ended) finishGame(false);
  }

  function hitBeat() {
    const g = app.game;
    if (!g || g.paused || !g.started || g.ended) return;
    const now = gameTime();
    let best = null;
    let bestAbs = Infinity;
    for (const note of g.notes) {
      if (note.state !== "pending") continue;
      const delta = now - note.t;
      const abs = Math.abs(delta);
      if (abs < bestAbs) { best = note; bestAbs = abs; }
      if (note.t > now + g.mode.miss / 1000) break;
    }
    if (!best || bestAbs > g.mode.miss / 1000) {
      g.judgement = "EMPTY"; g.judgementAge = 0;
      g.combo = 0;
      if (g.mode.id === "survival") g.health = Math.max(0, g.health - 4);
      return;
    }
    best.delta = (now - best.t) * 1000;
    if (bestAbs <= g.mode.perfect / 1000) {
      best.state = "perfect"; g.perfect++; g.combo++;
      const multi = g.mode.id === "precision" ? 1.3 : 1;
      g.score += Math.round((1000 + Math.min(500, g.combo * 5)) * multi);
      g.judgement = "PERFECT";
      if (g.mode.id === "survival") g.health = Math.min(100, g.health + 1.5);
    } else {
      best.state = "good"; g.good++; g.combo++;
      g.score += Math.round(500 + Math.min(250, g.combo * 2));
      g.judgement = best.delta < 0 ? "EARLY" : "LATE";
    }
    g.bestCombo = Math.max(g.bestCombo, g.combo);
    g.judgementAge = 0; g.hitFlash = 1;
    if (app.profile.settings.hitSounds && !g.song.builtin) Audio.tickSound(best.state === "perfect" ? 1 : 0.5);
    burst(300, 435, best.state === "perfect" ? g.song.colorA : "#ffd166", best.state === "perfect" ? 16 : 8);
  }

  function registerMiss(note) {
    const g = app.game;
    note.state = "miss"; g.miss++; g.combo = 0;
    g.judgement = "MISS"; g.judgementAge = 0;
    if (g.mode.id === "survival") g.health = Math.max(0, g.health - 17);
  }

  function finishGame(failed) {
    const g = app.game;
    if (!g || g.ended) return;
    g.ended = true;
    Audio.stop();
    const judged = g.perfect + g.good + g.miss;
    const accuracy = judged ? (g.perfect + g.good * 0.55) / judged * 100 : 0;
    const result = {
      song: g.song, mode: g.mode, score: g.score, accuracy,
      perfect: g.perfect, good: g.good, miss: g.miss, combo: g.bestCombo,
      failed: !!failed
    };
    app.result = result;
    app.profile.plays++;
    app.profile.totalHits += g.perfect + g.good;
    app.profile.perfects += g.perfect;
    app.profile.streak = Math.max(app.profile.streak, g.bestCombo);
    const key = g.song.id + ":" + g.mode.id;
    const old = app.profile.scores[key];
    if (!old || result.score > old.score) app.profile.scores[key] = { score: result.score, accuracy, combo: result.combo, date: Date.now() };
    unlockAchievements(result);
    saveProfile();
    app.screen = "results";
    app.focus = 0;
  }

  function unlockAchievements(result) {
    const unlocked = app.profile.achievements || (app.profile.achievements = []);
    const tests = [
      ["first-clear", app.profile.plays >= 1, "FIRST SIGNAL • Complete one song"],
      ["combo-25", result.combo >= 25, "LOCKED IN • Reach a 25 combo"],
      ["full-combo", result.miss === 0, "UNBROKEN • Finish with no misses"],
      ["perfect-100", app.profile.perfects >= 100, "PRECISION TOOL • Earn 100 perfects"]
    ];
    for (const [id, pass, label] of tests) {
      if (pass && !unlocked.includes(id)) { unlocked.push(id); toast("ACHIEVEMENT: " + label, "#ffd166"); break; }
    }
  }

  function pauseGame() {
    const g = app.game;
    if (!g || !g.started) return;
    g.paused = !g.paused;
    if (g.paused) Audio.pause(); else {
      if (g.song.builtin) {
        // Built-in synth previews cannot truly pause, so restart their future notes at the same chart time.
        Audio.playDemo(g.song, Audio.pausedAt);
      } else Audio.play(Audio.pausedAt);
    }
  }

  function drawPlay() {
    const g = app.game;
    if (!g) { setScreen("songs"); return; }
    const song = g.song;
    background(song.colorA, song.colorB);
    updateGame(app.dt);
    updateParticles(app.dt);
    drawParticles();

    text(song.title, 48, 38, 18, "#fff", "left", 850);
    text(g.mode.name, 48, 62, 11, song.colorA, "left", 850);
    text(formatNumber(g.score), 1232, 42, 28, "#fff", "right", 900);
    text("SCORE", 1232, 70, 10, "#8f99bf", "right", 800);

    if (g.mode.id === "survival") {
      ctx.fillStyle = "rgba(255,255,255,.09)"; rounded(472, 38, 336, 10, 5); ctx.fill();
      ctx.fillStyle = g.health > 35 ? gradient(song.colorA, song.colorB, 472, 38, 336, 10) : "#ff5874";
      rounded(472, 38, 336 * g.health / 100, 10, 5); ctx.fill();
      smallCaps("ENERGY", W / 2, 66, "#8f99bf", "center");
    }

    const targetX = 300;
    const trackY = 435;
    const lead = 1.7;
    const now = gameTime();
    const endX = 1180;
    ctx.save();
    ctx.globalAlpha = 0.8;
    line(94, trackY, 1200, trackY, "rgba(255,255,255,.13)", 3);
    line(targetX, 146, targetX, 610, rgba(song.colorA, 0.22), 2);
    for (let i = 0; i < 12; i++) {
      const x = targetX + i / 11 * (endX - targetX);
      const height = 30 + i * 2;
      line(x, trackY - height, x, trackY + height, "rgba(255,255,255,.045)", 1);
    }
    ctx.restore();

    for (const note of g.notes) {
      if (note.state !== "pending") continue;
      const until = note.t - now;
      if (until < -0.3 || until > lead + 0.4) continue;
      const p = 1 - until / lead;
      const x = lerp(endX, targetX, p);
      const size = lerp(14, 31, clamp(p, 0, 1));
      ctx.save();
      ctx.shadowColor = song.colorB; ctx.shadowBlur = 18;
      ctx.fillStyle = gradient(song.colorA, song.colorB, x - size, trackY - size, size * 2, size * 2);
      ctx.beginPath(); ctx.arc(x, trackY, size, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.7)";
      ctx.beginPath(); ctx.arc(x, trackY, size * 0.28, 0, TAU); ctx.fill();
      ctx.restore();
    }

    const breathe = app.reducedMotion ? 0 : Math.sin(app.time * 5) * 3;
    ctx.save();
    ctx.strokeStyle = g.hitFlash ? "#fff" : song.colorA;
    ctx.lineWidth = 7;
    ctx.shadowColor = song.colorA; ctx.shadowBlur = 26 + g.hitFlash * 25;
    ctx.beginPath(); ctx.arc(targetX, trackY, 49 + breathe + g.hitFlash * 12, 0, TAU); ctx.stroke();
    ctx.lineWidth = 2; ctx.globalAlpha = 0.45;
    ctx.beginPath(); ctx.arc(targetX, trackY, 72 + breathe, 0, TAU); ctx.stroke();
    ctx.restore();

    if (!g.started) {
      const count = Math.max(1, Math.ceil(g.countdown));
      text(count, W / 2, H / 2, 104, "#fff", "center", 950);
      text("GET READY", W / 2, H / 2 + 82, 15, song.colorA, "center", 850);
    } else {
      if (g.judgementAge < 0.65) {
        const alpha = 1 - clamp((g.judgementAge - 0.35) / 0.3, 0, 1);
        const color = g.judgement === "PERFECT" ? song.colorA : g.judgement === "MISS" ? "#ff5874" : g.judgement === "EMPTY" ? "#737c9f" : "#ffd166";
        ctx.save(); ctx.globalAlpha = alpha;
        text(g.judgement, targetX, 320 - ease(g.judgementAge / 0.65) * 15, 25, color, "center", 950);
        ctx.restore();
      }
      if (g.combo > 1) {
        text(g.combo, targetX, 538, 42, "#fff", "center", 950);
        smallCaps("COMBO", targetX, 573, "#8f99bf", "center");
      }
    }

    const progress = g.started ? clamp(Audio.time() / Math.max(1, song.duration), 0, 1) : 0;
    ctx.fillStyle = "rgba(255,255,255,.07)"; ctx.fillRect(0, 709, W, 11);
    ctx.fillStyle = gradient(song.colorA, song.colorB, 0, 709, W, 11); ctx.fillRect(0, 709, W * progress, 11);
    text("SPACE / TAP", W / 2, 665, 13, "#8f99bf", "center", 800);
    text("ESC PAUSE", 1232, 675, 10, "#687092", "right", 750);

    if (g.paused) drawPause();
  }

  function drawPause() {
    const g = app.game;
    beginUI();
    ctx.fillStyle = "rgba(5,7,18,.82)"; ctx.fillRect(0, 0, W, H);
    panel(420, 170, 440, 380, 0.96, 28);
    text("PAUSED", W / 2, 225, 34, "#fff", "center", 950);
    text(g.song.title, W / 2, 264, 14, "#9ca6ca", "center", 650);
    button("RESUME", 485, 318, 310, 56, () => pauseGame(), { accent: true, a: g.song.colorA, b: g.song.colorB, icon: "▶" });
    button("RESTART", 485, 390, 310, 56, () => startGame(), { icon: "↻" });
    button("QUIT TO SONGS", 485, 462, 310, 56, () => setScreen("songs"), { icon: "×" });
  }

  function drawResults() {
    const r = app.result;
    if (!r) { setScreen("songs"); return; }
    const song = r.song;
    background(song.colorA, song.colorB); beginUI();
    smallCaps(r.failed ? "RUN ENDED" : "SONG COMPLETE", W / 2, 69, r.failed ? "#ff5874" : song.colorA, "center");
    text(song.title, W / 2, 111, 29, "#fff", "center", 900);
    panel(152, 150, 976, 344, 0.78, 30);
    text(grade(r), 300, 292, 112, r.failed ? "#ff5874" : song.colorA, "center", 950);
    smallCaps(r.mode.name + " CLEAR", 300, 378, "#9ca6ca", "center");
    line(438, 189, 438, 455, "rgba(255,255,255,.1)");
    smallCaps("SCORE", 502, 209); text(formatNumber(r.score), 502, 252, 34, "#fff", "left", 900);
    smallCaps("ACCURACY", 820, 209); text(r.accuracy.toFixed(2) + "%", 820, 252, 34, "#fff", "left", 900);
    resultStat("PERFECT", r.perfect, 502, 331, song.colorA);
    resultStat("GOOD", r.good, 690, 331, "#ffd166");
    resultStat("MISS", r.miss, 858, 331, "#ff5874");
    resultStat("BEST COMBO", r.combo, 1004, 331, "#ff75c8");
    button("PLAY AGAIN", 304, 534, 260, 60, () => startGame(), { accent: true, a: song.colorA, b: song.colorB, icon: "↻" });
    button("SONG SELECT", 580, 534, 260, 60, () => setScreen("songs"), { icon: "▦" });
    button("MAIN MENU", 856, 534, 170, 60, () => setScreen("main"), { icon: "⌂" });
    text("Enter replay  •  Esc song select", W / 2, 650, 12, "#70799e", "center", 650);
  }

  function resultStat(label, value, x, y, color) {
    smallCaps(label, x, y, color, "center");
    text(value, x, y + 42, 29, "#fff", "center", 900);
  }

  function burst(x, y, color, count) {
    if (app.reducedMotion) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const s = 80 + Math.random() * 180;
      app.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.35, max: 0.75, color });
    }
  }

  function updateParticles(dt) {
    for (const p of app.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.95; p.vy *= 0.95; p.life -= dt; }
    app.particles = app.particles.filter(p => p.life > 0);
  }

  function drawParticles() {
    for (const p of app.particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function togglePreview(song) {
    if (Audio.playing && Audio.song && Audio.song.id === song.id) { Audio.pause(); return; }
    Audio.load(song).then(() => {
      if (song.builtin) Audio.playDemo(song, Audio.pausedAt || 0);
      else Audio.play(Audio.pausedAt || 0);
    }).catch(() => toast("Preview could not be loaded.", "#ff758f"));
  }

  function changeSong(direction) {
    Audio.stop();
    app.selectedSong = (app.selectedSong + direction + app.songs.length) % app.songs.length;
  }

  function changeSetting(key, value) {
    if (key === "volume") {
      app.profile.settings.volume = clamp(app.profile.settings.volume + value, 0, 1);
      Audio.setVolume(app.profile.settings.volume);
      Audio.tickSound(1);
    } else if (key === "offset") app.profile.settings.offset = clamp(app.profile.settings.offset + value, -200, 200);
    else {
      app.profile.settings[key] = value;
      if (key === "reducedMotion") app.reducedMotion = value;
    }
    saveProfile();
  }

  function saveProfile() { Store.saveProfile(app.profile); }

  function render(now) {
    app.dt = Math.min(0.05, (now - app.last) / 1000);
    app.last = now;
    app.time += app.dt;
    resize();
    app.buttons = [];
    switch (app.screen) {
      case "boot": drawBoot(); break;
      case "title": drawTitle(); break;
      case "main": drawMain(); break;
      case "songs": drawSongSelect(); break;
      case "modes": drawModes(); break;
      case "workshop": drawWorkshop(); break;
      case "importer": drawImporter(); break;
      case "manage": drawManage(); break;
      case "editor": drawEditor(); break;
      case "jukebox": drawJukebox(); break;
      case "records": drawRecords(); break;
      case "settings": drawSettings(); break;
      case "help": drawHelp(); break;
      case "play": drawPlay(); break;
      case "results": drawResults(); break;
      default: drawMain();
    }
    if (app.screen !== "play") drawToast();
    canvas.style.cursor = app.buttons.some(b => !b.disabled && pointIn(app.pointer.x, app.pointer.y, b)) ? "pointer" : "default";
    requestAnimationFrame(render);
  }

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    app.pointer.x = ((event.clientX - rect.left) - app.ox) / app.scale;
    app.pointer.y = ((event.clientY - rect.top) - app.oy) / app.scale;
  }

  canvas.addEventListener("pointermove", pointerPosition);
  canvas.addEventListener("pointerdown", event => {
    pointerPosition(event);
    app.pointer.down = true;
    Audio.ensure();
    if (app.screen === "title") { setScreen("main"); return; }
    if (app.screen === "play" && app.game && !app.game.paused) { hitBeat(); return; }
    if (app.screen === "editor" && app.waveformRect && pointIn(app.pointer.x, app.pointer.y, app.waveformRect)) {
      const p = clamp((app.pointer.x - app.waveformRect.x) / app.waveformRect.w, 0, 1);
      Audio.seek(p * app.editor.song.duration); return;
    }
    for (let i = app.buttons.length - 1; i >= 0; i--) {
      const b = app.buttons[i];
      if (!b.disabled && pointIn(app.pointer.x, app.pointer.y, b)) { app.focus = b.index; b.action(); break; }
    }
  });
  canvas.addEventListener("pointerup", () => { app.pointer.down = false; });
  canvas.addEventListener("contextmenu", e => e.preventDefault());

  window.addEventListener("keydown", event => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
    Audio.ensure();

    if (app.textField) {
      if (event.key === "Enter") { commitTextField(); return; }
      if (event.key === "Escape") { app.textField = null; return; }
      if (event.key === "Backspace") { app.textField.value = app.textField.value.slice(0, -1); return; }
      if (event.key.length === 1 && app.textField.value.length < 48) {
        if (!app.textField.numeric || /[0-9]/.test(event.key)) app.textField.value += event.key;
      }
      return;
    }

    if (app.screen === "title") { if (["Space", "Enter"].includes(event.code)) setScreen("main"); return; }
    if (app.screen === "play") {
      if (event.code === "Escape") { pauseGame(); return; }
      if (event.code === "Space" || event.code === "Enter") { if (app.game.paused) pauseGame(); else hitBeat(); }
      if (app.game.paused) navigateButtons(event);
      return;
    }
    if (app.screen === "editor") {
      if (event.code === "Space") { recordBeat(); return; }
      if (event.code === "Enter") { toggleEditorPlay(); return; }
      if (event.code === "Backspace") { undoBeat(); return; }
      if (event.code === "ArrowLeft") { Audio.seek(Audio.time() - 5); return; }
      if (event.code === "ArrowRight") { Audio.seek(Audio.time() + 5); return; }
      if (event.code === "Escape") { exitEditor(); return; }
    }
    if (app.screen === "importer") {
      if (event.code === "ArrowUp") { app.importSession.selected = Math.max(0, app.importSession.selected - 1); return; }
      if (event.code === "ArrowDown") { app.importSession.selected = Math.min(app.importSession.candidates.length - 1, app.importSession.selected + 1); return; }
      if (event.code === "Enter" || event.code === "Space") { chooseForeignCandidate(); return; }
      if (event.code === "Escape") { setScreen("workshop"); return; }
    }
    if (app.screen === "songs") {
      if (event.code === "ArrowUp") { changeSelection(-1); return; }
      if (event.code === "ArrowDown") { changeSelection(1); return; }
      if (event.key.toLowerCase() === "p") { togglePreview(selectedSong()); return; }
      if (event.code === "Enter" || event.code === "Space") { setScreen("modes", "songs"); return; }
      if (event.code === "Escape") { setScreen("main"); return; }
    }
    if (app.screen === "modes") {
      if (event.code === "ArrowLeft") { app.selectedMode = (app.selectedMode + Data.modes.length - 1) % Data.modes.length; return; }
      if (event.code === "ArrowRight") { app.selectedMode = (app.selectedMode + 1) % Data.modes.length; return; }
      if (event.code === "Space" || event.code === "Enter") { startGame(); return; }
      if (event.code === "Escape") { setScreen("songs"); return; }
    }
    if (app.screen === "jukebox") {
      if (event.code === "ArrowLeft") { changeSong(-1); return; }
      if (event.code === "ArrowRight") { changeSong(1); return; }
      if (event.key.toLowerCase() === "p" || event.code === "Space") { togglePreview(selectedSong()); return; }
      if (event.code === "Escape") { setScreen("main"); return; }
    }
    if (app.screen === "results") {
      if (event.code === "Enter" || event.code === "Space") { startGame(); return; }
      if (event.code === "Escape") { setScreen("songs"); return; }
    }
    if (event.code === "Escape") {
      const backs = { main: "title", workshop: "main", importer: "workshop", manage: "workshop", records: "main", settings: "main", help: "main" };
      if (backs[app.screen]) { if (app.screen === "settings") saveProfile(); setScreen(backs[app.screen]); }
      return;
    }
    navigateButtons(event);
  });

  function navigateButtons(event) {
    if (!app.buttons.length) return;
    if (["ArrowDown", "ArrowRight"].includes(event.code)) app.focus = (app.focus + 1) % app.buttons.length;
    else if (["ArrowUp", "ArrowLeft"].includes(event.code)) app.focus = (app.focus + app.buttons.length - 1) % app.buttons.length;
    else if (["Enter", "Space"].includes(event.code)) {
      const b = app.buttons[clamp(app.focus, 0, app.buttons.length - 1)];
      if (b && !b.disabled) b.action();
    }
  }

  function changeSelection(direction) {
    Audio.stop();
    app.selectedSong = clamp(app.selectedSong + direction, 0, app.songs.length - 1);
    app.focus = app.selectedSong + 1;
  }

  audioPicker.addEventListener("change", () => {
    const file = audioPicker.files && audioPicker.files[0];
    audioPicker.value = "";
    if (!file) return;
    if (app.pendingForeign) {
      const candidate = app.pendingForeign;
      candidate.audioBlob = file;
      candidate.audioName = file.name;
      finishForeignImport(candidate);
    } else newSongFromFile(file);
  });
  coverPicker.addEventListener("change", () => {
    const file = coverPicker.files && coverPicker.files[0];
    coverPicker.value = "";
    if (!file || !app.editor) return;
    app.editor.song.coverBlob = file;
    app.coverCache.delete(app.editor.song.id);
    app.editor.dirty = true;
    toast("Cover art added.", "#9cff7a");
  });
  packPicker.addEventListener("change", () => {
    const file = packPicker.files && packPicker.files[0];
    packPicker.value = "";
    importPack(file);
  });
  foreignPicker.addEventListener("change", () => {
    const file = foreignPicker.files && foreignPicker.files[0];
    foreignPicker.value = "";
    importForeign(file);
  });

  window.addEventListener("resize", resize);
  window.addEventListener("blur", () => {
    if (app.screen === "play" && app.game && app.game.started && !app.game.paused) pauseGame();
  });

  resize();
  boot();
  requestAnimationFrame(render);
}());
