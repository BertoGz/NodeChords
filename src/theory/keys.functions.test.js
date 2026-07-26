import { describe, expect, it } from 'vitest'
import { createKey, diatonicChords, harmonicFunctionForChord } from './keys.js'

/** Collapse palette to unique degree → function (using triad / primary quality). */
function degreeMap(mode, tonic = 0) {
  const key = createKey(tonic, mode)
  const byDegree = new Map()
  for (const entry of diatonicChords(key)) {
    if (!byDegree.has(entry.degree)) {
      byDegree.set(entry.degree, {
        degree: entry.degree,
        symbol: entry.symbol,
        function: entry.function,
        reason: entry.reason,
      })
    }
  }
  return [...byDegree.values()]
}

function functionsByDegree(mode) {
  return Object.fromEntries(degreeMap(mode).map((d) => [d.degree, d.function]))
}

describe('modal harmonic functions', () => {
  it('major: V and vii° tension; I/iii/vi home; ii/IV departure', () => {
    expect(functionsByDegree('major')).toEqual({
      I: 'home',
      ii: 'departure',
      iii: 'home',
      IV: 'departure',
      V: 'tension',
      vi: 'home',
      'vii°': 'tension',
    })
  })

  it('natural minor: minor v is home; raised V7 is tension; VII and ii° tension', () => {
    expect(functionsByDegree('minor')).toEqual({
      i: 'home',
      'ii°': 'tension',
      III: 'home',
      iv: 'departure',
      v: 'home',
      VI: 'departure',
      VII: 'tension',
    })

    const key = createKey(0, 'minor') // C minor
    // Raised dominant on 5th degree (G7)
    expect(harmonicFunctionForChord({ root: 7, quality: '7' }, key)).toBe('tension')
    expect(harmonicFunctionForChord({ root: 7, quality: '9' }, key)).toBe('tension')
    // Natural minor v
    expect(harmonicFunctionForChord({ root: 7, quality: 'min' }, key)).toBe('home')
  })

  it('dorian: v home; characteristic IV departure; vi° and VII tension', () => {
    expect(functionsByDegree('dorian')).toEqual({
      i: 'home',
      ii: 'departure',
      III: 'home',
      IV: 'departure',
      v: 'home',
      'vi°': 'tension',
      VII: 'tension',
    })
  })

  it('mixolydian: I and v home; VII and iii° tension', () => {
    expect(functionsByDegree('mixolydian')).toEqual({
      I: 'home',
      ii: 'departure',
      'iii°': 'tension',
      IV: 'departure',
      v: 'home',
      vi: 'departure',
      VII: 'tension',
    })
  })

  it('ii° / dim sonorities in minor read as tension via quality override', () => {
    const key = createKey(0, 'minor')
    // Degree default for ii° is departure, but dim quality forces tension
    expect(harmonicFunctionForChord({ root: 2, quality: 'dim' }, key)).toBe('tension')
    expect(harmonicFunctionForChord({ root: 2, quality: 'm7b5' }, key)).toBe('tension')
  })
})
