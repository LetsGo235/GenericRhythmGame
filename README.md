# Pulse//Space

A complete four-lane rhythm game made with plain HTML, JavaScript, Web Audio, IndexedDB, and one Canvas. There are no visible HTML controls or framework components: every menu, button, card, editor field, waveform, note, result screen, and effect is drawn directly onto the canvas.

## Start the game

The easiest option is to double-click `index.html`. Imported songs and `.pulsepack` files work this way in current Chrome, Edge, and Firefox versions.

For songs placed directly inside the project folder, start a tiny local server from this folder:

```bash
python -m http.server 8080
```

Then open <http://localhost:8080>.

## Controls

| Screen | Keyboard | Mouse / touch |
|---|---|---|
| Menus | Arrow keys, Enter, Escape | Click or tap |
| Gameplay | D/F/J/K or Left/Down/Up/Right to hit lanes, Escape to pause | Tap the corresponding lane |
| Workshop | Enter play/pause, Space record, Backspace undo, arrows seek | Use canvas controls and waveform |
| Song select | Up/down browse, Enter choose, Z favorite, P preview | Select a song, use the wheel to browse, or click the tabs and controls |
| Jukebox | Left/right change, P play/pause | Use canvas controls |

## Make a song in the game

1. Open **Workshop → New Song**.
2. Choose an MP3, WAV, OGG, or another browser-supported audio file.
3. Press **Enter** to start the music.
4. Press **Space** or tap **Tap Beat** on every beat you want the player to hit.
5. Edit the title, artist, and BPM; optionally add square cover art.
6. Choose **Save** to keep it in the browser or **Export Pack** to download a portable `.pulsepack`.

The editor includes waveform scrubbing, five-second seeking, undo, optional half-beat snapping, automatic BPM estimation from recorded taps, cover art, a test-play button, and automatic difficulty calculation.

## Convert maps from other rhythm games

Open **Workshop → Convert Rhythm Map** and choose a chart or complete song archive. Pulse//Space automatically detects every included chart and displays a canvas-based difficulty picker before opening the conversion in the Workshop.

| Game | Supported input | Automatic archive assets |
|---|---|---|
| osu! / osu!mania / osu!taiko | `.osz`, `.osu` | Audio and background art |
| StepMania | `.sm`, `.ssc`, generic `.zip` | Audio, background, or banner |
| Quaver | `.qp`, `.qua` | Audio and background art |
| Clone Hero | `.chart`, generic `.zip` | Song audio and art when present |
| Friday Night Funkin' | Legacy chart `.json`, generic `.zip` | `Inst.ogg` when present |
| Beat Saber | Song `.zip`, `.bplist` | Audio, cover, and every listed difficulty |

Pulse//Space automatically routes converted timing data across its four playable lanes. Conversion deliberately simplifies unsupported spatial mechanics:

- Simultaneous chords become one pulse.
- Source lanes, arrows, saber directions, and fret colors are normalized into the four-lane chart.
- Holds, rolls, sliders, spinners, and sustains become a pulse at their start.
- Mines, bombs, walls, star power, and purely visual events are ignored.
- BPM changes and chart offsets are preserved where the source format provides them.

If you import a standalone chart, the converter asks you to select its matching audio file. Complete archives normally connect the audio and cover automatically. The original foreign file is never changed.

## Share or move a song

A `.pulsepack` is one JSON file containing the beat chart, metadata, cover art, and audio. Another player can load it with **Workshop → Import Pulsepack**. The imported song is stored persistently in that browser with IndexedDB.

Large source songs create large Pulsepacks because their audio is embedded. This is intentional: the pack remains a single portable file.

## Put songs directly in the game files

1. Copy the audio and cover into `songs/`.
2. Open `songs/manifest.js`.
3. Copy the commented example, remove the `//` markers, and fill in the song details and beat timestamps.
4. Run the local server described above.

`audioUrl` and `coverUrl` are paths relative to `index.html`. The `beats` array uses seconds from the start of the audio.

## Included systems

- Three built-in playable synth tracks, so the game works immediately
- Four-lane perspective gameplay with falling notes, lane glow, hit bursts, and D/F/J/K plus arrow-key controls
- Classic, Precision, Survival, and Zen modes
- Score, accuracy, combo, Perfect/Good/Miss timing, grades, and personal bests
- Song library and full-cover song previews
- Arcade-style song select with category tabs, favorites, difficulty display, records, and mouse-wheel browsing
- Jukebox mode
- Beat-map recording studio
- Audio and cover import
- Pulsepack import/export
- Universal map conversion for six rhythm-game ecosystems
- Persistent custom songs and records
- Basic achievements
- Master volume, visual motion, hit-sound, and timing-offset settings
- Keyboard, mouse, and touch support
- Responsive 16:9 scaling with high-DPI rendering

## Project structure

```text
canvas-rhythm-game/
├── index.html
├── style.css
├── README.md
├── js/
│   ├── app.js       # rendering, menus, editor, gameplay, and input
│   ├── audio.js     # Web Audio playback and built-in synth preview
│   ├── converters.js # Foreign chart detection, parsing, and ZIP extraction
│   ├── data.js      # modes, demo charts, and default profile
│   └── storage.js   # IndexedDB and profile persistence
└── songs/
    └── manifest.js  # optional file-based song list
```

## Browser note

Browsers do not allow a webpage to silently write imported files into its own source folder. Pulse//Space handles this with two safe paths: browser storage for instant play, and exported `.pulsepack` files for sharing or permanent project inclusion.
