import { describe, expect, it } from 'vitest'
import { Midi } from '@tonejs/midi'

import { parseChordLabel, detectChord, parseMidiToProject } from './importMidi.js'
import { buildMidiFile } from './exportMidi.js'
import { allChords, chordId, formatChord } from '../theory/chords.js'

function makeMidi(notesSpec, { bpm = 120, channel } = {}) {
  const midi = new Midi()
  midi.header.setTempo(bpm)
  const ppq = midi.header.ppq
  const track = midi.addTrack()
  if (channel != null) track.channel = channel
  for (const n of notesSpec) {
    track.addNote({
      midi: n.midi,
      ticks: Math.round(n.time * ppq),
      durationTicks: Math.round(n.duration * ppq),
    })
  }
  return midi.toArray()
}

function chordAt(project, i) {
  return formatChord(project.nodes[i].data.chord)
}

describe('parseChordLabel', () => {
  it('reverses formatChord for every chord', () => {
    for (const chord of allChords()) {
      const parsed = parseChordLabel(formatChord(chord))
      expect(parsed).not.toBeNull()
      expect(chordId(parsed)).toBe(chordId(chord))
    }
  })

  it('rejects garbage', () => {
    expect(parseChordLabel('')).toBeNull()
    expect(parseChordLabel('nonsense')).toBeNull()
  })
})

describe('detectChord', () => {
  it('finds a major triad', () => {
    expect(formatChord(detectChord([0, 4, 7], 0))).toBe('C')
  })

  it('finds a minor seventh regardless of inversion / doubling', () => {
    // A C E G with C in the bass (first inversion), doubled root.
    expect(formatChord(detectChord([9, 0, 4, 7, 9], 0))).toBe('Am7')
  })

  it('ignores single notes', () => {
    expect(detectChord([0], 0)).toBeNull()
  })
})

describe('parseMidiToProject', () => {
  it('round-trips a NodeChords export exactly (via Chord: labels)', () => {
    const steps = [
      { chord: { root: 0, quality: 'maj' }, durationBeats: 4, measure: 1, voicing: 'balanced' },
      { chord: { root: 9, quality: 'm7' }, durationBeats: 4, measure: 2, voicing: 'balanced' },
      { chord: { root: 5, quality: 'maj7' }, durationBeats: 4, measure: 3, voicing: 'balanced' },
    ]
    const data = buildMidiFile(steps, { bpm: 100 })
    const { project, chordCount } = parseMidiToProject(data)

    expect(chordCount).toBe(3)
    expect(project.bpm).toBe(100)
    expect(chordAt(project, 0)).toBe('C')
    expect(chordAt(project, 1)).toBe('Am7')
    expect(chordAt(project, 2)).toBe('Fmaj7')
    expect(project.nodes[0].data.isStart).toBe(true)
    expect(project.nodes.map((n) => n.data.measure)).toEqual([1, 2, 3])
    expect(project.edges).toHaveLength(2)
  })

  it('detects block chords from raw notes (Ableton style, no labels)', () => {
    const data = makeMidi(
      [
        { midi: 60, time: 0, duration: 4 },
        { midi: 64, time: 0, duration: 4 },
        { midi: 67, time: 0, duration: 4 },
        { midi: 62, time: 4, duration: 4 },
        { midi: 65, time: 4, duration: 4 },
        { midi: 69, time: 4, duration: 4 },
      ],
      { bpm: 90 },
    )
    const { project } = parseMidiToProject(data)
    expect(chordAt(project, 0)).toBe('C')
    expect(chordAt(project, 1)).toBe('Dm')
    expect(project.bpm).toBe(90)
  })

  it('excludes percussion tracks (channel 10)', () => {
    const midi = new Midi()
    midi.header.setTempo(120)
    const ppq = midi.header.ppq
    const chords = midi.addTrack()
    for (const m of [60, 64, 67]) chords.addNote({ midi: m, ticks: 0, durationTicks: 4 * ppq })
    const drums = midi.addTrack()
    drums.channel = 9
    for (let i = 0; i < 4; i++) drums.addNote({ midi: 36, ticks: i * ppq, durationTicks: ppq })

    const { project, chordCount } = parseMidiToProject(midi.toArray())
    expect(chordCount).toBe(1)
    expect(chordAt(project, 0)).toBe('C')
  })

  it('splits a chord longer than one bar across measures', () => {
    const data = makeMidi([
      { midi: 60, time: 0, duration: 8 },
      { midi: 64, time: 0, duration: 8 },
      { midi: 67, time: 0, duration: 8 },
    ])
    const { project } = parseMidiToProject(data)
    expect(project.nodes).toHaveLength(2)
    expect(project.nodes.map((n) => n.data.measure)).toEqual([1, 2])
    expect(project.nodes.map((n) => n.data.durationBeats)).toEqual([4, 4])
    expect(new Set(project.nodes.map((n) => chordId(n.data.chord))).size).toBe(1)
  })

  it('preserves an empty bar between chords via measure numbers', () => {
    const data = makeMidi([
      { midi: 60, time: 0, duration: 4 },
      { midi: 64, time: 0, duration: 4 },
      { midi: 67, time: 0, duration: 4 },
      { midi: 62, time: 8, duration: 4 },
      { midi: 65, time: 8, duration: 4 },
      { midi: 69, time: 8, duration: 4 },
    ])
    const { project } = parseMidiToProject(data)
    expect(project.nodes.map((n) => n.data.measure)).toEqual([1, 3])
  })

  it('throws on an invalid MIDI file', () => {
    expect(() => parseMidiToProject(new Uint8Array([1, 2, 3, 4]))).toThrow()
  })

  it('throws when there are no pitched notes', () => {
    const midi = new Midi()
    midi.addTrack()
    expect(() => parseMidiToProject(midi.toArray())).toThrow(/no pitched notes/i)
  })
})
