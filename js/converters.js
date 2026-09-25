(function () {
  "use strict";

  const AUDIO_EXT = [".mp3", ".ogg", ".egg", ".wav", ".m4a", ".aac", ".flac", ".opus"];
  const IMAGE_EXT = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
  const decoder = new TextDecoder("utf-8");

  function ext(name) {
    const match = String(name || "").toLowerCase().match(/\.[^.\\/]+$/);
    return match ? match[0] : "";
  }

  function basename(path) { return String(path || "").replace(/\\/g, "/").split("/").pop(); }
  function stripQuotes(value) { return String(value || "").trim().replace(/^['"]|['"]$/g, ""); }
  function safeNumber(value, fallback) {
    if (value == null || value === "" || value === false) return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }
  function valueAfter(text, key, separator) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp("^\\s*" + escaped + "\\s*" + (separator || "[:=]") + "\\s*(.*?)\\s*$", "mi"));
    return match ? stripQuotes(match[1]) : "";
  }
  function section(text, name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp("\\[" + escaped + "\\]\\s*([\\s\\S]*?)(?=\\n\\s*\\[|$)", "i"));
    return match ? match[1].trim() : "";
  }
  function dedupeBeats(beats) {
    const sorted = beats.filter(v => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
    const output = [];
    for (const beat of sorted) {
      if (!output.length || beat - output[output.length - 1] > 0.018) output.push(Number(beat.toFixed(4)));
    }
    return output;
  }
  function difficultyFromLabel(label, fallback) {
    const value = String(label || "").toLowerCase();
    if (/expert\+|expertplus|challenge|oni|insane/.test(value)) return 5;
    if (/expert|hard|heavy|another/.test(value)) return 4;
    if (/normal|medium|standard|difficult/.test(value)) return 3;
    if (/easy|light|basic/.test(value)) return 2;
    if (/beginner|novice/.test(value)) return 1;
    return Math.max(1, Math.min(5, Math.round(safeNumber(fallback, 2))));
  }
  function baseCandidate(format, fileName) {
    return {
      format,
      sourceName: fileName,
      title: basename(fileName).replace(/\.[^.]+$/, ""),
      artist: "Unknown Artist",
      bpm: 120,
      difficultyName: "Converted",
      difficulty: 2,
      beats: [],
      warnings: [],
      audioRef: "",
      coverRef: ""
    };
  }

  function parseOsu(text, fileName) {
    const result = baseCandidate("osu!", fileName);
    const general = section(text, "General");
    const metadata = section(text, "Metadata");
    const difficulty = section(text, "Difficulty");
    const timing = section(text, "TimingPoints");
    const objects = section(text, "HitObjects");
    const events = section(text, "Events");
    result.title = valueAfter(metadata, "TitleUnicode") || valueAfter(metadata, "Title") || result.title;
    result.artist = valueAfter(metadata, "ArtistUnicode") || valueAfter(metadata, "Artist") || result.artist;
    result.difficultyName = valueAfter(metadata, "Version") || "Converted";
    result.audioRef = valueAfter(general, "AudioFilename");
    result.difficulty = difficultyFromLabel(result.difficultyName, valueAfter(difficulty, "OverallDifficulty"));
    const timingPoints = timing.split(/\r?\n/).map(line => line.trim().split(","));
    const firstRed = timingPoints.find(parts => safeNumber(parts[1], -1) > 0 && String(parts[6]).trim() !== "0");
    if (firstRed) result.bpm = Math.round(60000 / safeNumber(firstRed[1], 500));
    result.beats = dedupeBeats(objects.split(/\r?\n/).map(line => safeNumber(line.split(",")[2], -1) / 1000));
    const bg = events.match(/^\s*(?:0|Background)\s*,\s*0\s*,\s*["']?([^,"']+)["']?/mi);
    if (bg) result.coverRef = bg[1].trim();
    const mode = valueAfter(general, "Mode") || "0";
    result.warnings.push(mode === "3" ? "osu!mania lanes and simultaneous chords were collapsed to one button." : "Sliders and spinners were converted to a tap at their start time.");
    return result;
  }

  function parsePairs(value) {
    return String(value || "").split(",").map(part => {
      const pieces = part.trim().split("=");
      return { beat: safeNumber(pieces[0], NaN), value: safeNumber(pieces[1], NaN) };
    }).filter(pair => Number.isFinite(pair.beat) && Number.isFinite(pair.value)).sort((a, b) => a.beat - b.beat);
  }

  function makeBeatConverter(bpms, offset, stops) {
    bpms = bpms.filter(p => p.value > 0);
    if (!bpms.length) bpms = [{ beat: 0, value: 120 }];
    let atZero = bpms[0].value;
    for (const point of bpms) if (point.beat <= 0) atZero = point.value;
    const future = bpms.filter(p => p.beat > 0);
    return beat => {
      let time = -safeNumber(offset, 0);
      let position = 0;
      let bpm = atZero;
      for (const point of future) {
        if (point.beat > beat) break;
        time += (point.beat - position) * 60 / bpm;
        position = point.beat;
        bpm = point.value;
      }
      time += (beat - position) * 60 / bpm;
      for (const stop of stops || []) if (stop.beat < beat) time += stop.value;
      return time;
    };
  }

  function stepRowsToBeats(noteData, beatToTime) {
    const beats = [];
    const measures = String(noteData || "").replace(/\/\/.*$/gm, "").trim().split(",");
    measures.forEach((measure, measureIndex) => {
      const rows = measure.split(/\r?\n/).map(row => row.trim()).filter(Boolean);
      rows.forEach((row, rowIndex) => {
        if (/[124L]/i.test(row)) {
          const beat = measureIndex * 4 + rowIndex * 4 / rows.length;
          beats.push(beatToTime(beat));
        }
      });
    });
    return dedupeBeats(beats);
  }

  function parseStepMania(text, fileName) {
    const title = valueAfter(text, "#TITLE", ":") || basename(fileName).replace(/\.[^.]+$/, "");
    const artist = valueAfter(text, "#ARTIST", ":") || "Unknown Artist";
    const audioRef = valueAfter(text, "#MUSIC", ":");
    const coverRef = valueAfter(text, "#BACKGROUND", ":") || valueAfter(text, "#BANNER", ":");
    const bpms = parsePairs(valueAfter(text, "#BPMS", ":"));
    const stops = parsePairs(valueAfter(text, "#STOPS", ":"));
    const offset = safeNumber(valueAfter(text, "#OFFSET", ":"), 0);
    const beatToTime = makeBeatConverter(bpms, offset, stops);
    const baseBpm = Math.round((bpms.find(p => p.beat <= 0) || bpms[0] || { value: 120 }).value);
    const results = [];

    if (/\.ssc$/i.test(fileName) || /#NOTEDATA\s*:/i.test(text)) {
      const blocks = text.split(/#NOTEDATA\s*:\s*;/i).slice(1);
      for (const block of blocks) {
        const noteMatch = block.match(/#NOTES\s*:\s*([\s\S]*?);/i);
        if (!noteMatch) continue;
        const label = valueAfter(block, "#DIFFICULTY", ":") || valueAfter(block, "#CHARTNAME", ":") || "Converted";
        const meter = safeNumber(valueAfter(block, "#METER", ":"), 2);
        const result = baseCandidate("StepMania SSC", fileName);
        Object.assign(result, { title, artist, audioRef, coverRef, bpm: baseBpm, difficultyName: label, difficulty: difficultyFromLabel(label, meter) });
        const chartBpms = parsePairs(valueAfter(block, "#BPMS", ":"));
        const chartStops = parsePairs(valueAfter(block, "#STOPS", ":"));
        const chartOffsetText = valueAfter(block, "#OFFSET", ":");
        const chartBeatToTime = makeBeatConverter(chartBpms.length ? chartBpms : bpms, chartOffsetText ? safeNumber(chartOffsetText, offset) : offset, chartStops.length ? chartStops : stops);
        result.beats = stepRowsToBeats(noteMatch[1], chartBeatToTime);
        result.warnings.push("Dance lanes and chords were collapsed; holds and rolls become one starting tap. Mines are ignored.");
        if (result.beats.length) results.push(result);
      }
    } else {
      const regex = /#NOTES\s*:\s*([\s\S]*?);/gi;
      let match;
      while ((match = regex.exec(text))) {
        const body = match[1];
        const pieces = body.split(":");
        if (pieces.length < 6) continue;
        const label = pieces[2].trim() || "Converted";
        const meter = safeNumber(pieces[3], 2);
        const noteData = pieces.slice(5).join(":");
        const result = baseCandidate("StepMania SM", fileName);
        Object.assign(result, { title, artist, audioRef, coverRef, bpm: baseBpm, difficultyName: label, difficulty: difficultyFromLabel(label, meter) });
        result.beats = stepRowsToBeats(noteData, beatToTime);
        result.warnings.push("Dance lanes and chords were collapsed; holds and rolls become one starting tap. Mines are ignored.");
        if (result.beats.length) results.push(result);
      }
    }
    return results;
  }

  function yamlScalar(text, key) {
    const match = text.match(new RegExp("^\\s*" + key + "\\s*:\\s*(.*?)\\s*$", "mi"));
    return match ? stripQuotes(match[1]) : "";
  }

  function parseQuaver(text, fileName) {
    const result = baseCandidate("Quaver", fileName);
    const hitIndex = text.search(/^HitObjects\s*:/mi);
    const head = hitIndex >= 0 ? text.slice(0, hitIndex) : text;
    const hitText = hitIndex >= 0 ? text.slice(hitIndex) : "";
    result.title = yamlScalar(head, "Title") || result.title;
    result.artist = yamlScalar(head, "Artist") || result.artist;
    result.difficultyName = yamlScalar(head, "DifficultyName") || yamlScalar(head, "Creator") || "Converted";
    result.audioRef = yamlScalar(head, "AudioFile");
    result.coverRef = yamlScalar(head, "BackgroundFile");
    const bpmMatch = head.match(/^\s*Bpm\s*:\s*([\d.]+)/mi);
    result.bpm = Math.round(safeNumber(bpmMatch && bpmMatch[1], 120));
    result.beats = dedupeBeats(Array.from(hitText.matchAll(/StartTime\s*:\s*([-\d.]+)/gi), match => safeNumber(match[1], -1) / 1000));
    result.difficulty = difficultyFromLabel(result.difficultyName, result.beats.length > 800 ? 5 : result.beats.length > 400 ? 4 : 2);
    result.warnings.push("Quaver lanes and chords were collapsed; long notes become one starting tap.");
    return result;
  }

  function chartSections(text) {
    const output = {};
    const regex = /\[([^\]]+)\]\s*\{([\s\S]*?)\}/g;
    let match;
    while ((match = regex.exec(text))) output[match[1]] = match[2];
    return output;
  }

  function parseCloneHero(text, fileName) {
    const sections = chartSections(text);
    const songText = sections.Song || "";
    const sync = sections.SyncTrack || "";
    const resolution = safeNumber(valueAfter(songText, "Resolution", "="), 192);
    const offset = safeNumber(valueAfter(songText, "Offset", "="), 0);
    const bpmEvents = [];
    for (const match of sync.matchAll(/^\s*(\d+)\s*=\s*B\s+(\d+)/gmi)) bpmEvents.push({ beat: safeNumber(match[1], 0) / resolution, value: safeNumber(match[2], 120000) / 1000 });
    const beatToTime = makeBeatConverter(bpmEvents, -offset, []);
    const title = valueAfter(songText, "Name", "=") || basename(fileName).replace(/\.[^.]+$/, "");
    const artist = valueAfter(songText, "Artist", "=") || "Unknown Artist";
    const audioRef = valueAfter(songText, "MusicStream", "=") || "song.ogg";
    const results = [];
    for (const [name, body] of Object.entries(sections)) {
      if (!/(Easy|Medium|Hard|Expert).*(Single|DoubleGuitar|Drums|Keys|GHL)/i.test(name)) continue;
      const ticks = Array.from(body.matchAll(/^\s*(\d+)\s*=\s*N\s+(-?\d+)\s+(\d+)/gmi), match => safeNumber(match[1], -1));
      if (!ticks.length) continue;
      const result = baseCandidate("Clone Hero", fileName);
      Object.assign(result, { title, artist, audioRef, bpm: Math.round((bpmEvents[0] || { value: 120 }).value), difficultyName: name, difficulty: difficultyFromLabel(name, 3) });
      result.beats = dedupeBeats(ticks.map(tick => beatToTime(tick / resolution)));
      result.warnings.push("Fret lanes, chords, sustains, forced notes, and star-power markers were flattened to one-button taps.");
      results.push(result);
    }
    return results;
  }

  function parseFNF(text, fileName) {
    const root = JSON.parse(text);
    const song = root.song && typeof root.song === "object" ? root.song : root;
    if (!Array.isArray(song.notes)) throw new Error("This JSON is not a supported Friday Night Funkin' chart.");
    const result = baseCandidate("Friday Night Funkin'", fileName);
    result.title = typeof song.song === "string" ? song.song : result.title;
    result.artist = "Friday Night Funkin' chart";
    result.bpm = Math.round(safeNumber(song.bpm, 120));
    result.difficultyName = root.difficulty || "Converted";
    const beats = [];
    for (const chartSection of song.notes) {
      for (const note of chartSection.sectionNotes || []) if (Array.isArray(note)) beats.push(safeNumber(note[0], -1) / 1000);
    }
    result.beats = dedupeBeats(beats);
    result.difficulty = difficultyFromLabel(result.difficultyName, result.beats.length > 500 ? 4 : 3);
    result.audioRef = "Inst.ogg";
    result.warnings.push("Opponent/player lanes and simultaneous notes were merged; sustains become one starting tap.");
    return result;
  }

  function beatSaberCandidates(info, entries, infoName) {
    const title = info._songName || (info.song && info.song.title) || info.songTitle || "Beat Saber Song";
    const artist = info._songAuthorName || (info.song && info.song.author) || info.songAuthorName || "Unknown Artist";
    const bpm = safeNumber(info._beatsPerMinute || info.beatsPerMinute || (info.audio && info.audio.bpm), 120);
    const offset = safeNumber(info._songTimeOffset || info.songTimeOffset, 0);
    const audioRef = info._songFilename || info.songFilename || (info.audio && info.audio.songFilename) || "";
    const coverRef = info._coverImageFilename || info.coverImageFilename || "";
    const maps = [];
    const sets = info._difficultyBeatmapSets || info.difficultyBeatmapSets || [];
    for (const set of sets) {
      for (const map of set._difficultyBeatmaps || set.difficultyBeatmaps || []) {
        maps.push({
          name: map._beatmapFilename || map.beatmapDataFilename || map.beatmapFilename,
          difficulty: map._difficulty || map.difficulty || "Converted",
          rank: map._difficultyRank || map.difficultyRank || 3
        });
      }
    }
    for (const map of info.difficultyBeatmaps || []) {
      maps.push({
        name: map.beatmapDataFilename || map.beatmapFilename,
        difficulty: map.difficulty || "Converted",
        rank: map.difficultyRank || 3
      });
    }
    const results = [];
    for (const map of maps) {
      const entry = findEntry(entries, map.name);
      if (!entry) continue;
      let data;
      try { data = JSON.parse(decoder.decode(entry.bytes)); } catch (_) { continue; }
      const notes = data._notes || data.colorNotes || data.notes || [];
      const bpmChanges = [{ beat: 0, value: bpm }];
      for (const event of data.bpmEvents || data._BPMChanges || []) {
        bpmChanges.push({ beat: safeNumber(event.b ?? event._time, 0), value: safeNumber(event.m ?? event._BPM, bpm) });
      }
      const beatToTime = makeBeatConverter(bpmChanges, -offset, []);
      const noteBeats = [];
      for (const note of notes) {
        const bomb = note._type === 3 || note.c === 3 || note.type === "bomb";
        if (!bomb) noteBeats.push(safeNumber(note.b ?? note._time ?? note.beat, -1));
      }
      const result = baseCandidate("Beat Saber", infoName);
      Object.assign(result, { title, artist, bpm: Math.round(bpm), audioRef, coverRef, difficultyName: map.difficulty, difficulty: difficultyFromLabel(map.difficulty, map.rank) });
      result.beats = dedupeBeats(noteBeats.map(beatToTime));
      result.warnings.push("Saber colors, cut directions, lanes, walls, bombs, and simultaneous blocks were flattened to one-button taps.");
      results.push(result);
    }
    return results;
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot decompress ZIP charts. Import an extracted chart instead.");
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function unzip(buffer) {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("ZIP directory not found.");
    const count = view.getUint16(eocd + 10, true);
    if (count > 10000) throw new Error("Archive contains too many files.");
    let pointer = view.getUint32(eocd + 16, true);
    const entries = [];
    let expanded = 0;
    for (let i = 0; i < count; i++) {
      if (view.getUint32(pointer, true) !== 0x02014b50) throw new Error("Invalid ZIP directory.");
      const method = view.getUint16(pointer + 10, true);
      const compressedSize = view.getUint32(pointer + 20, true);
      const size = view.getUint32(pointer + 24, true);
      const nameLength = view.getUint16(pointer + 28, true);
      const extraLength = view.getUint16(pointer + 30, true);
      const commentLength = view.getUint16(pointer + 32, true);
      const localOffset = view.getUint32(pointer + 42, true);
      const name = decoder.decode(bytes.slice(pointer + 46, pointer + 46 + nameLength));
      pointer += 46 + nameLength + extraLength + commentLength;
      if (name.endsWith("/")) continue;
      const extension = ext(name);
      const wanted = AUDIO_EXT.includes(extension) || IMAGE_EXT.includes(extension) || [".osu", ".sm", ".ssc", ".qua", ".chart", ".json", ".dat"].includes(extension);
      if (!wanted) continue;
      expanded += size;
      if (expanded > 350 * 1024 * 1024) throw new Error("Archive is too large after extraction.");
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(start, start + compressedSize);
      let content;
      if (method === 0) content = compressed;
      else if (method === 8) content = await inflateRaw(compressed);
      else continue;
      entries.push({ name, bytes: content });
    }
    return entries;
  }

  function findEntry(entries, reference, allowed) {
    const ref = stripQuotes(reference).replace(/\\/g, "/").toLowerCase();
    if (ref) {
      const exact = entries.find(entry => entry.name.replace(/\\/g, "/").toLowerCase().endsWith(ref));
      if (exact) return exact;
      const base = basename(ref);
      const byBase = entries.find(entry => basename(entry.name).toLowerCase() === base);
      if (byBase) return byBase;
    }
    if (allowed) return entries.find(entry => allowed.includes(ext(entry.name)));
    return null;
  }

  function resolveEntry(entries, sourceName, reference, allowed) {
    const source = String(sourceName || "").replace(/\\/g, "/");
    const directory = source.includes("/") ? source.slice(0, source.lastIndexOf("/") + 1) : "";
    const ref = stripQuotes(reference).replace(/\\/g, "/");
    if (ref) {
      const target = (directory + ref).replace(/\/\.\//g, "/").toLowerCase();
      const exact = entries.find(entry => entry.name.replace(/\\/g, "/").toLowerCase() === target);
      if (exact) return exact;
    }
    if (allowed && directory) {
      const nearby = entries.find(entry => entry.name.replace(/\\/g, "/").toLowerCase().startsWith(directory.toLowerCase()) && allowed.includes(ext(entry.name)));
      if (nearby && !ref) return nearby;
    }
    return findEntry(entries, reference, allowed);
  }

  function mimeFor(name) {
    const types = { ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".egg": "audio/ogg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac", ".flac": "audio/flac", ".opus": "audio/opus", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };
    return types[ext(name)] || "application/octet-stream";
  }

  function attachArchiveAssets(candidates, entries) {
    for (const candidate of candidates) {
      const audio = resolveEntry(entries, candidate.sourceName, candidate.audioRef, AUDIO_EXT);
      const cover = resolveEntry(entries, candidate.sourceName, candidate.coverRef, IMAGE_EXT);
      if (audio) {
        candidate.audioBlob = new Blob([audio.bytes], { type: mimeFor(audio.name) });
        candidate.audioName = basename(audio.name);
      }
      if (cover) candidate.coverBlob = new Blob([cover.bytes], { type: mimeFor(cover.name) });
      if (!candidate.audioBlob) candidate.warnings.push("Audio was not found in the archive; choose it separately after conversion.");
    }
    return candidates;
  }

  async function parseArchive(file) {
    const entries = await unzip(await file.arrayBuffer());
    const candidates = [];
    const infoEntry = entries.find(entry => /^info\.dat$/i.test(basename(entry.name)));
    if (infoEntry) {
      try { candidates.push(...beatSaberCandidates(JSON.parse(decoder.decode(infoEntry.bytes)), entries, infoEntry.name)); } catch (_) {}
    }
    for (const entry of entries) {
      const extension = ext(entry.name);
      const text = [".osu", ".sm", ".ssc", ".qua", ".chart", ".json"].includes(extension) ? decoder.decode(entry.bytes) : "";
      try {
        if (extension === ".osu") candidates.push(parseOsu(text, entry.name));
        else if (extension === ".sm" || extension === ".ssc") candidates.push(...parseStepMania(text, entry.name));
        else if (extension === ".qua") candidates.push(parseQuaver(text, entry.name));
        else if (extension === ".chart") candidates.push(...parseCloneHero(text, entry.name));
        else if (extension === ".json" && !/^info\.dat$/i.test(basename(entry.name))) {
          const parsed = JSON.parse(text);
          if ((parsed.song && Array.isArray(parsed.song.notes)) || Array.isArray(parsed.notes)) candidates.push(parseFNF(text, entry.name));
        }
      } catch (_) {}
    }
    const unique = [];
    const keys = new Set();
    for (const candidate of candidates) {
      if (!candidate || !candidate.beats.length) continue;
      const key = [candidate.format, candidate.title, candidate.difficultyName, candidate.beats.length, candidate.beats[0]].join("|");
      if (!keys.has(key)) { keys.add(key); unique.push(candidate); }
    }
    if (!unique.length) throw new Error("No supported rhythm charts were found in this archive.");
    return attachArchiveAssets(unique, entries);
  }

  async function parseFile(file) {
    const extension = ext(file.name);
    if ([".osz", ".qp", ".zip", ".bplist"].includes(extension)) {
      if (file.size && file.size > 600 * 1024 * 1024) throw new Error("This archive is larger than the 600 MB safety limit.");
      return parseArchive(file);
    }
    const text = await file.text();
    let results;
    if (extension === ".osu") results = [parseOsu(text, file.name)];
    else if (extension === ".sm" || extension === ".ssc") results = parseStepMania(text, file.name);
    else if (extension === ".qua") results = [parseQuaver(text, file.name)];
    else if (extension === ".chart") results = parseCloneHero(text, file.name);
    else if (extension === ".json") results = [parseFNF(text, file.name)];
    else throw new Error("Unsupported rhythm chart format.");
    results = results.filter(result => result.beats.length);
    if (!results.length) throw new Error("This chart did not contain any convertible notes.");
    results.forEach(result => result.warnings.push("Choose the matching audio file to finish the import."));
    return results;
  }

  window.PulseConverters = {
    parseFile,
    supported: ["osu! (.osz/.osu)", "StepMania (.sm/.ssc)", "Quaver (.qp/.qua)", "Clone Hero (.chart)", "Friday Night Funkin' (.json)", "Beat Saber (.zip/.bplist)"],
    _test: { parseOsu, parseStepMania, parseQuaver, parseCloneHero, parseFNF, dedupeBeats, makeBeatConverter }
  };
}());
