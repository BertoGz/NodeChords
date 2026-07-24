import * as Tone from 'tone'
import { chordMidiNotes, DEFAULT_VOICING } from '../theory/chords.js'

let synth = null
let started = false
let playGeneration = 0

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

/** Stop any in-flight progression (notes + scheduled steps). */
export function stopProgression() {
  playGeneration += 1
  try {
    Tone.Transport.stop()
    Tone.Transport.cancel(0)
    Tone.Transport.position = 0
  } catch {
    // Transport may not be started yet
  }
  if (synth) {
    try {
      synth.releaseAll()
    } catch {
      // ignore
    }
  }
}

export async function playChord(chord, { voicing = DEFAULT_VOICING, duration = 0.9 } = {}) {
  if (!chord) return
  stopProgression()
  const s = await ensureAudio()
  const now = Tone.now()
  const freqs = chordMidiNotes(chord, voicing).map(midiToFreq)
  s.triggerAttackRelease(freqs, duration, now)
}

/**
 * Play chords in sequence along a path (one cycle).
 * Cancels any previous progression first so plays never overlap.
 * @param {Array<{chord: object, id?: string, voicing?: string}>|object[]} steps
 * @param {object} [options]
 */
export async function playProgression(
  steps,
  { noteDuration = 0.7, gap = 0.08, onStep = null, onDone = null } = {},
) {
  stopProgression()
  if (!steps?.length) return

  const s = await ensureAudio()
  const generation = playGeneration

  let t = 0
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    const chord = step?.chord ?? step
    if (!chord) continue
    const freqs = chordMidiNotes(chord, step?.voicing || DEFAULT_VOICING).map(midiToFreq)
    const index = i
    Tone.Transport.schedule((time) => {
      if (generation !== playGeneration) return
      s.triggerAttackRelease(freqs, noteDuration, time)
      if (onStep) {
        Tone.Draw.schedule(() => {
          if (generation !== playGeneration) return
          onStep(index, step)
        }, time)
      }
    }, t)
    t += noteDuration + gap
  }

  Tone.Transport.schedule((time) => {
    if (generation !== playGeneration) return
    if (onDone) {
      Tone.Draw.schedule(() => {
        if (generation !== playGeneration) return
        onDone()
      }, time)
    }
  }, t)

  // Stop/park after the sequence so a later Play starts clean
  Tone.Transport.scheduleOnce(() => {
    if (generation !== playGeneration) return
    Tone.Transport.stop()
    Tone.Transport.cancel(0)
    Tone.Transport.position = 0
  }, t + 0.05)

  Tone.Transport.start('+0.01')
}
