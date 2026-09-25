(function () {
  "use strict";

  class AudioEngine {
    constructor() {
      this.context = null;
      this.source = null;
      this.buffer = null;
      this.song = null;
      this.startedAt = 0;
      this.pausedAt = 0;
      this.playing = false;
      this.volume = 0.78;
      this.onEnded = null;
      this.previewTimer = 0;
      this.demoNodes = [];
    }

    ensure() {
      if (!this.context) this.context = new (window.AudioContext || window.webkitAudioContext)();
      if (this.context.state === "suspended") this.context.resume();
      return this.context;
    }

    async load(song) {
      this.stop();
      this.song = song;
      this.buffer = null;
      if (song.audioBlob) {
        const ctx = this.ensure();
        const bytes = await song.audioBlob.arrayBuffer();
        this.buffer = await ctx.decodeAudioData(bytes.slice(0));
      } else if (song.audioUrl) {
        const ctx = this.ensure();
        const response = await fetch(song.audioUrl);
        if (!response.ok) throw new Error("Could not load " + song.audioUrl);
        this.buffer = await ctx.decodeAudioData(await response.arrayBuffer());
      }
      return this.duration();
    }

    duration() {
      if (this.buffer) return this.buffer.duration;
      return this.song ? (this.song.duration || 0) : 0;
    }

    play(offset) {
      offset = Math.max(0, Number.isFinite(offset) ? offset : this.pausedAt);
      this.stopSource();
      const ctx = this.ensure();
      this.startedAt = ctx.currentTime - offset;
      this.pausedAt = offset;
      this.playing = true;

      if (this.buffer) {
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        source.buffer = this.buffer;
        gain.gain.value = this.volume;
        source.connect(gain).connect(ctx.destination);
        source.onended = () => {
          if (this.source !== source) return;
          this.source = null;
          this.playing = false;
          this.pausedAt = 0;
          if (this.onEnded) this.onEnded();
        };
        source.start(0, Math.min(offset, Math.max(0, this.buffer.duration - 0.01)));
        this.source = source;
      }
    }

    pause() {
      if (!this.playing) return;
      this.pausedAt = this.time();
      this.playing = false;
      this.stopSource();
    }

    stop() {
      this.playing = false;
      this.pausedAt = 0;
      this.stopSource();
      this.stopPreview();
    }

    stopSource() {
      if (this.source) {
        this.source.onended = null;
        try { this.source.stop(); } catch (_) {}
        try { this.source.disconnect(); } catch (_) {}
        this.source = null;
      }
      for (const node of this.demoNodes) {
        try { node.stop(); } catch (_) {}
        try { node.disconnect(); } catch (_) {}
      }
      this.demoNodes.length = 0;
      this.stopPreview();
    }

    seek(time) {
      const wasPlaying = this.playing;
      this.pause();
      this.pausedAt = Math.max(0, Math.min(time, this.duration()));
      if (wasPlaying) this.play(this.pausedAt);
    }

    time() {
      if (!this.playing || !this.context) return this.pausedAt;
      return Math.max(0, this.context.currentTime - this.startedAt);
    }

    setVolume(value) {
      this.volume = Math.max(0, Math.min(1, value));
    }

    tickSound(strength) {
      const ctx = this.ensure();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      osc.type = "sine";
      osc.frequency.setValueAtTime(strength > 0.8 ? 880 : 560, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.07);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12 * this.volume, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.09);
    }

    playDemo(song, offset) {
      this.stop();
      this.song = song;
      const ctx = this.ensure();
      offset = Math.max(0, offset || 0);
      this.startedAt = ctx.currentTime - offset;
      this.pausedAt = offset;
      this.playing = true;
      const notes = song.demoNotes || [];
      for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        if (note.t < offset || note.t > offset + 40) continue;
        const when = ctx.currentTime + note.t - offset;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = note.wave || "triangle";
        osc.frequency.value = note.hz;
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime((note.gain || 0.055) * this.volume, when + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + (note.len || 0.18));
        osc.connect(gain).connect(ctx.destination);
        osc.start(when);
        osc.stop(when + (note.len || 0.18) + 0.02);
        this.demoNodes.push(osc);
      }
      this.previewTimer = window.setTimeout(() => {
        this.playing = false;
        this.pausedAt = 0;
        if (this.onEnded) this.onEnded();
      }, Math.max(0, song.duration - offset) * 1000);
    }

    stopPreview() {
      clearTimeout(this.previewTimer);
      this.previewTimer = 0;
    }
  }

  window.PulseAudio = new AudioEngine();
}());
