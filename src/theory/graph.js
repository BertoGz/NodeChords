import {
  allChords,
  chordFamily,
  chordId,
  formatChord,
  isDominantQuality,
  isMajorish,
  isMinorish,
  pitchClasses,
  rootInterval,
  sharedTones,
} from './chords.js'

/**
 * Score how well `candidate` continues from `from` in Build mode
 * (tension, color, forward motion — avoid settling on tonic feel).
 */
export function scoreBuild(from, candidate) {
  if (!from || chordId(from) === chordId(candidate)) return { score: 0, reason: '' }

  const interval = rootInterval(from, candidate)
  const shared = sharedTones(from, candidate)
  const fromFamily = chordFamily(from.quality)
  const toFamily = chordFamily(candidate.quality)
  let score = 0
  let reason = 'forward motion'

  // Secondary / applied dominant: root up a P4 (or down P5) into a new center
  if (isDominantQuality(candidate.quality) && interval === 7) {
    score += 42
    reason = 'secondary dominant'
  }

  // Classic dominant prep / ii–V feel from minor-ish into dominant
  if (isMinorish(from.quality) && isDominantQuality(candidate.quality) && interval === 5) {
    score += 38
    reason = 'ii → V motion'
  }

  // Tritone sub color (root up +1 from expected V, or flat-II from current)
  if (isDominantQuality(candidate.quality) && (interval === 1 || interval === 6)) {
    score += 34
    reason = 'tritone / chromatic color'
  }

  // Modal interchange / borrowed color — major ↔ minor quality flip, same or nearby root
  if (
    ((isMajorish(from.quality) && isMinorish(candidate.quality)) ||
      (isMinorish(from.quality) && isMajorish(candidate.quality))) &&
    (interval === 0 || interval === 5 || interval === 7 || interval === 3 || interval === 8)
  ) {
    score += 30
    reason = 'modal borrow'
  }

  // Extensions / richer quality from same root family motion
  if (interval === 0 && from.quality !== candidate.quality) {
    score += 22
    reason = 'extension / recolor'
  }

  // Stepwise root motion (build without resolving)
  if (interval === 2 || interval === 10 || interval === 1 || interval === 11) {
    score += 18
    if (reason === 'forward motion') reason = 'stepwise climb'
  }

  // Circle-of-fifths motion (P4/P5) without being tonic-settling
  if (interval === 5 || interval === 7) {
    score += 16
    if (reason === 'forward motion') reason = 'circle-of-fifths'
  }

  // Mediant / chromatic mediants
  if (interval === 3 || interval === 4 || interval === 8 || interval === 9) {
    score += 20
    if (reason === 'forward motion') reason = 'mediant color'
  }

  // Prefer some shared tones (voice leading) but not identical sets
  score += shared * 4
  if (shared === 0) score += 6 // fresh color

  // Prefer richer / tenser qualities when building
  if (['7', '9', 'm7b5', 'dim7', 'aug', 'sus4'].includes(candidate.quality)) {
    score += 10
  }

  // Mild penalty for landing on soft major triad after dominant (feels like resolve)
  if (fromFamily === 'dominant' && toFamily === 'major' && interval === 5) {
    score -= 25
  }

  return { score: Math.max(0, score), reason }
}

/**
 * Score how well `candidate` resolves toward `target` (Node 1 / loop).
 * `from` is the previous chord (optional context).
 */
export function scoreResolve(from, candidate, target) {
  if (!target || chordId(candidate) === chordId(target)) {
    return { score: 0, reason: '' }
  }

  const toTarget = rootInterval(candidate, target)
  const shared = sharedTones(candidate, target)
  let score = 0
  let reason = 'cadence approach'

  // Authentic: V → I (dominant root a P5 above tonic / P4 below)
  if (isDominantQuality(candidate.quality) && toTarget === 5) {
    score += 55
    reason = 'V7 → I'
  }

  // Major V triad → I
  if (isMajorish(candidate.quality) && toTarget === 5 && !isDominantQuality(candidate.quality)) {
    score += 40
    reason = 'V → I'
  }

  // Leading-tone / vii° → I
  if (
    (chordFamily(candidate.quality) === 'diminished' || candidate.quality === 'm7b5') &&
    toTarget === 1
  ) {
    score += 48
    reason = 'vii → I'
  }

  // ii → I (plagal-adjacent / soft) or IV → I
  if (toTarget === 7 && (isMinorish(candidate.quality) || isMajorish(candidate.quality))) {
    score += 28
    reason = isMinorish(candidate.quality) ? 'ii → I' : 'IV → I (plagal)'
  }

  // Sus resolving quality toward tonic
  if ((candidate.quality === 'sus4' || candidate.quality === 'sus2') && toTarget === 5) {
    score += 36
    reason = 'sus dominant → I'
  }

  // Deceptive setup: V that would go to vi — still useful when looping to I as alternate color
  if (isDominantQuality(candidate.quality) && toTarget === 3) {
    score += 18
    reason = 'deceptive neighbor'
  }

  // Strong voice leading into target
  score += shared * 6

  // Prefer candidates that also connect smoothly from previous chord
  if (from) {
    const fromShared = sharedTones(from, candidate)
    score += fromShared * 3
    const step = rootInterval(from, candidate)
    if (step === 2 || step === 5 || step === 7 || step === 10) score += 8
    // ii–V–I fragment: from is ii-ish relative to target, candidate is V
    const fromToTarget = rootInterval(from, target)
    if (
      fromToTarget === 2 &&
      isMinorish(from.quality) &&
      isDominantQuality(candidate.quality) &&
      toTarget === 5
    ) {
      score += 20
      reason = 'ii → V → I'
    }
  }

  // Tritone sub resolving to I (bII7 → I)
  if (isDominantQuality(candidate.quality) && toTarget === 11) {
    score += 32
    reason = 'tritone sub → I'
  }

  return { score: Math.max(0, score), reason }
}

export function scoreEdge(from, to, mode, target) {
  if (mode === 'resolve') return scoreResolve(from, to, target)
  return scoreBuild(from, to)
}

export { allChords, formatChord, chordId, pitchClasses }
