import * as Tone from 'tone'
import { chordMidiNotes, DEFAULT_VOICING } from '../theory/chords.js'
import {
  BEATS_PER_BAR,
  DEFAULT_BPM,
  beatsToSeconds,
  clampBpm,
  layoutStepsInMeasures,
  timelineBeatsFromSteps,
} from '../theory/duration.js'

let piano = null
let clickSynth = null
let loadPromise = null
let started = false
let playGeneration = 0
let stopHandler = null

export function setProgressionStopHandler(fn) {
  stopHandler = typeof fn === 'function' ? fn : null
}

function midiToNote(midi) {
  return Tone.Frequency(midi, 'midi').toNote()
}

/**
 * Salamander grand piano samples (Tone.js CDN).
 * Sparse map — Sampler interpolates the gaps.
 */
function createPiano() {
  const reverb = new Tone.Reverb({
    decay: 2.4,
    preDelay: 0.01,
    wet: 0.22,
  })

  const sampler = new Tone.Sampler({
    urls: {
      A0: 'A0.mp3',
      C1: 'C1.mp3',
      'D#1': 'Ds1.mp3',
      'F#1': 'Fs1.mp3',
      A1: 'A1.mp3',
      C2: 'C2.mp3',
      'D#2': 'Ds2.mp3',
      'F#2': 'Fs2.mp3',
      A2: 'A2.mp3',
      C3: 'C3.mp3',
      'D#3': 'Ds3.mp3',
      'F#3': 'Fs3.mp3',
      A3: 'A3.mp3',
      C4: 'C4.mp3',
      'D#4': 'Ds4.mp3',
      'F#4': 'Fs4.mp3',
      A4: 'A4.mp3',
      C5: 'C5.mp3',
      'D#5': 'Ds5.mp3',
      'F#5': 'Fs5.mp3',
      A5: 'A5.mp3',
      C6: 'C6.mp3',
      'D#6': 'Ds6.mp3',
      'F#6': 'Fs6.mp3',
      A6: 'A6.mp3',
      C7: 'C7.mp3',
      'D#7': 'Ds7.mp3',
      'F#7': 'Fs7.mp3',
      A7: 'A7.mp3',
      C8: 'C8.mp3',
    },
    release: 1.2,
    baseUrl: 'https://tonejs.github.io/audio/salamander/',
  })

  sampler.volume.value = -6
  sampler.connect(reverb)
  reverb.toDestination()

  return Promise.all([Tone.loaded(), reverb.generate()]).then(() => sampler)
}

function ensureClick() {
  if (!clickSynth) {
    clickSynth = new Tone.MembraneSynth({
      pitchDecay: 0.008,
      octaves: 2,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.04 },
    }).toDestination()
    clickSynth.volume.value = -10
  }
  return clickSynth
}

async function ensureAudio() {
  if (!started) {
    await Tone.start()
    started = true
  }
  if (!loadPromise) {
    loadPromise = createPiano().catch((err) => {
      console.error('Piano samples failed to load, falling back to synth', err)
      const fallback = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle8' },
        envelope: { attack: 0.005, decay: 0.4, sustain: 0.2, release: 1.1 },
      }).toDestination()
      fallback.volume.value = -8
      return fallback
    })
  }
  piano = await loadPromise
  ensureClick()
  return piano
}

/**
 * Stop any in-flight progression (notes + scheduled steps).
 * @param {{ silent?: boolean }} [options] silent skips the App stop handler (used when restarting play)
 */
export function stopProgression({ silent = false } = {}) {
  playGeneration += 1
  try {
    Tone.Transport.stop()
    Tone.Transport.cancel(0)
    Tone.Transport.position = 0
  } catch {
    // Transport may not be started yet
  }
  if (piano) {
    try {
      piano.releaseAll()
    } catch {
      // ignore
    }
  }
  if (clickSynth) {
    try {
      clickSynth.triggerRelease()
    } catch {
      // ignore
    }
  }
  if (!silent) stopHandler?.()
}

export async function playNote(midi, duration = 0.55) {
  if (midi == null) return
  stopProgression()
  const s = await ensureAudio()
  const now = Tone.now()
  s.triggerAttackRelease(midiToNote(midi), duration, now)
}

export async function playChord(chord, { voicing = DEFAULT_VOICING, duration = 1.1 } = {}) {
  if (!chord) return
  stopProgression()
  const s = await ensureAudio()
  const now = Tone.now()
  const notes = chordMidiNotes(chord, voicing).map(midiToNote)
  s.triggerAttackRelease(notes, duration, now)
}

/**
 * Play chords using measure + note-type layout (4/4).
 * Incomplete measures pad with silence; metronome accents beat 1 of each bar.
 */
export async function playProgression(
  steps,
  {
    fromIndex = 0,
    bpm = DEFAULT_BPM,
    metronome = true,
    onStep = null,
    onDone = null,
  } = {},
) {
  stopProgression({ silent: true })
  if (!steps?.length) return

  const start = Math.max(0, Math.min(fromIndex, steps.length - 1))
  const layout = layoutStepsInMeasures(steps)
  if (!layout.length) return

  const startId = steps[start]?.id
  const startEvent = layout.find((e) => e.id === startId) || layout[0]
  const startBeat = startEvent.startBeat
  const toPlay = layout.filter((e) => e.startBeat + 0.0001 >= startBeat)
  if (!toPlay.length) return

  const safeBpm = clampBpm(bpm)
  const beatSec = 60 / safeBpm
  const s = await ensureAudio()
  const click = ensureClick()
  const generation = playGeneration
  const timelineEnd = timelineBeatsFromSteps(steps)

  for (const ev of toPlay) {
    const chord = ev.chord ?? ev.step?.chord
    if (!chord) continue
    const absoluteIndex = steps.findIndex((s) => s.id === ev.id)
    const seconds = beatsToSeconds(ev.durationBeats, safeBpm)
    const noteLen = Math.max(0.12, seconds * 0.92)
    const notes = chordMidiNotes(chord, ev.voicing || ev.step?.voicing || DEFAULT_VOICING).map(
      midiToNote,
    )
    const t = (ev.startBeat - startBeat) * beatSec
    const step = ev.step || steps[absoluteIndex]

    Tone.Transport.schedule((time) => {
      if (generation !== playGeneration) return
      s.triggerAttackRelease(notes, noteLen, time)
      if (onStep) {
        Tone.Draw.schedule(() => {
          if (generation !== playGeneration) return
          onStep(absoluteIndex, step)
        }, time)
      }
    }, t)
  }

  const tEnd = Math.max(0, (timelineEnd - startBeat) * beatSec)

  if (metronome) {
    for (let beat = Math.floor(startBeat); beat < timelineEnd; beat++) {
      if (beat + 0.0001 < startBeat) continue
      const local = beat - startBeat
      const isAccent = beat % BEATS_PER_BAR === 0
      Tone.Transport.schedule((time) => {
        if (generation !== playGeneration) return
        click.triggerAttackRelease(isAccent ? 'C3' : 'G2', 0.05, time, isAccent ? 0.95 : 0.5)
      }, local * beatSec)
    }
  }

  Tone.Transport.schedule((time) => {
    if (generation !== playGeneration) return
    if (onDone) {
      Tone.Draw.schedule(() => {
        if (generation !== playGeneration) return
        onDone()
      }, time)
    }
  }, tEnd)

  Tone.Transport.scheduleOnce(() => {
    if (generation !== playGeneration) return
    Tone.Transport.stop()
    Tone.Transport.cancel(0)
    Tone.Transport.position = 0
  }, tEnd + 0.05)

  Tone.Transport.start('+0.01')
}
