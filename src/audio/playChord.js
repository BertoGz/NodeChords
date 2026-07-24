import * as Tone from 'tone'
import { chordMidiNotes } from '../theory/chords.js'

let synth = null
let started = false
let balancedVoicing = true

export function setBalancedVoicing(enabled) {
  balancedVoicing = Boolean(enabled)
}

export function getBalancedVoicing() {
  return balancedVoicing
}

async function ensureAudio() {
  if (!started) {
    await Tone.start()
    started = true
  }
  if (!synth) {
    synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle8' },
      envelope: { attack: 0.02, decay: 0.3, sustain: 0.35, release: 0.8 },
    }).toDestination()
    synth.volume.value = -8
  }
  return synth
}

function midiToFreq(midi) {
  return Tone.Frequency(midi, 'midi').toFrequency()
}

export async function playChord(chord, duration = 0.9) {
  if (!chord) return
  const s = await ensureAudio()
  const now = Tone.now()
  const freqs = chordMidiNotes(chord, balancedVoicing).map(midiToFreq)
  s.triggerAttackRelease(freqs, duration, now)
}

/**
 * Play chords in sequence along a path (one cycle).
 */
export async function playProgression(chords, noteDuration = 0.7, gap = 0.08) {
  if (!chords?.length) return
  const s = await ensureAudio()
  let t = Tone.now() + 0.05
  for (const chord of chords) {
    if (!chord) continue
    const freqs = chordMidiNotes(chord, balancedVoicing).map(midiToFreq)
    s.triggerAttackRelease(freqs, noteDuration, t)
    t += noteDuration + gap
  }
}
