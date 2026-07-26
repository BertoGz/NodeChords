import { describe, expect, it } from 'vitest'
import { createKey, keyDistance } from './keys.js'

describe('keyDistance', () => {
  it('ranks same-mode tonic steps by semitone (not only fifths)', () => {
    const a = createKey(9, 'mixolydian') // A
    const b = createKey(11, 'mixolydian') // B (whole step from A)
    const c = createKey(0, 'mixolydian') // C (half step from B)
    // Fifths alone: A→B=2, B→C=5. Chromatic: A→B=2, B→C=1.
    expect(keyDistance(a, b)).toBe(2)
    expect(keyDistance(b, c)).toBe(1)
  })

  it('keeps different-mode moves on the fifths metric', () => {
    const b = createKey(11, 'mixolydian')
    const cMaj = createKey(0, 'major')
    // fifths(B,C)=5 + mode penalty → 6
    expect(keyDistance(b, cMaj)).toBe(6)
  })
})
