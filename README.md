# NodeChords

React app for building chord progressions as a directed graph.

- Pick a starting chord from the palette → Node 1
- **Add node** creates an empty node linked from the selection
- Suggestions use **Build** mode (tension) by default
- Draw an edge from a node back to Start → **Resolve** suggestions (cadences into Node 1)
- Play individual chords or the progression path
- Each node has its own **voicing** (balanced, close, open, spread, shell, inversions), set from the side panel; new nodes inherit the previous node's choice
- **Timing** view: assign each chord to a **measure** and a **note type** (like notation); leftover beats in a bar are rests; BPM + metronome drive playback and MIDI

```bash
npm install
npm run dev
```
