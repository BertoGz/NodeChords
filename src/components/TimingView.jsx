import { useEffect, useMemo, useRef, useState } from 'react'
import { formatChord } from '../theory/chords.js'
import {
  BEATS_PER_BAR,
  DURATION_OPTIONS,
  beatsUsedInMeasure,
  durationOptionForBeats,
  layoutStepsInMeasures,
  normalizeMeasure,
} from '../theory/duration.js'

const PX_PER_BEAT = 52
const MEASURE_WIDTH = BEATS_PER_BAR * PX_PER_BEAT

export default function TimingView({
  steps = [],
  selectedNodeId = null,
  playheadNodeId = null,
  isPlaying = false,
  onSelectStep,
  onDurationChange,
  onMeasureChange,
}) {
  const [openId, setOpenId] = useState(null)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!openId) return
    const onPointer = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpenId(null)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpenId(null)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [openId])

  const layout = useMemo(() => layoutStepsInMeasures(steps), [steps])

  const maxMeasure = useMemo(() => {
    if (!steps.length) return 1
    return Math.max(1, ...steps.map((s) => normalizeMeasure(s.measure ?? 1)))
  }, [steps])

  // Show one empty measure ahead so users can place into a new bar
  const measureCount = Math.max(1, maxMeasure + 1)

  const measures = useMemo(() => {
    return Array.from({ length: measureCount }, (_, i) => {
      const measure = i + 1
      const events = layout.filter((e) => e.measure === measure)
      const used = beatsUsedInMeasure(steps, measure)
      return {
        measure,
        events,
        used,
        overflow: used > BEATS_PER_BAR + 0.001,
        remaining: Math.max(0, BEATS_PER_BAR - used),
      }
    })
  }, [layout, measureCount, steps])

  if (!steps.length) {
    return (
      <div className="timing-view timing-view--empty">
        <p className="timing-view__empty">
          Add chords in the graph, then assign each one to a measure and a note type.
        </p>
      </div>
    )
  }

  return (
    <div className="timing-view" ref={rootRef}>
      <div className="timing-view__meta">
        <span>
          {steps.length} chord{steps.length === 1 ? '' : 's'} · 4/4 · measure + note type
        </span>
        <span className="timing-view__hint">
          Pick the measure a chord belongs to, then its note length
        </span>
      </div>

      <div className="timing-view__scroll">
        <div
          className="timing-view__measures"
          style={{ width: `${measureCount * (MEASURE_WIDTH + 12)}px` }}
        >
          {measures.map((bar) => (
            <section
              key={bar.measure}
              className={`timing-measure ${bar.overflow ? 'is-overflow' : ''} ${
                bar.events.length === 0 ? 'is-empty' : ''
              }`}
              style={{ width: `${MEASURE_WIDTH}px` }}
            >
              <header className="timing-measure__head">
                <span className="timing-measure__label">Measure {bar.measure}</span>
                <span className="timing-measure__beats">
                  {bar.used}/{BEATS_PER_BAR}
                  {bar.overflow ? ' · overfull' : ''}
                </span>
              </header>

              <div className="timing-measure__grid" aria-hidden>
                {[0, 1, 2, 3].map((b) => (
                  <div key={b} className="timing-measure__beat" />
                ))}
              </div>

              <div className="timing-measure__lane">
                {bar.events.map((ev) => {
                  const selected = ev.id === selectedNodeId
                  const playhead = ev.id === playheadNodeId
                  const playing = isPlaying && playhead
                  const option = durationOptionForBeats(ev.durationBeats)
                  return (
                    <div
                      key={ev.id}
                      className={[
                        'timing-block',
                        selected ? 'is-selected' : '',
                        playhead ? 'is-playhead' : '',
                        playing ? 'is-playing' : '',
                        ev.overflow ? 'is-overflow' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{
                        left: `${ev.beatInBar * PX_PER_BEAT}px`,
                        width: `${Math.max(ev.durationBeats * PX_PER_BEAT - 3, 32)}px`,
                      }}
                    >
                      <button
                        type="button"
                        className="timing-block__main"
                        onClick={() => {
                          onSelectStep?.(ev.id)
                          setOpenId((id) => (id === ev.id ? null : ev.id))
                        }}
                      >
                        <span className="timing-block__symbol">
                          {ev.chord ? formatChord(ev.chord) : '—'}
                        </span>
                        <span className="timing-block__duration">
                          <span className="timing-block__note" aria-hidden>
                            {option.symbol}
                          </span>
                          <span>{option.label}</span>
                        </span>
                      </button>

                      {openId === ev.id && (
                        <div className="timing-block__picker" role="dialog">
                          <p className="timing-block__picker-title">Measure</p>
                          <div className="timing-block__measures">
                            {Array.from({ length: maxMeasure + 1 }, (_, i) => i + 1).map((m) => (
                              <button
                                key={m}
                                type="button"
                                className={`timing-block__mbtn ${
                                  m === ev.measure ? 'is-active' : ''
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onMeasureChange?.(ev.id, m)
                                }}
                              >
                                {m}
                              </button>
                            ))}
                          </div>

                          <p className="timing-block__picker-title">Note type</p>
                          {DURATION_OPTIONS.map((opt) => {
                            const usedElsewhere = beatsUsedInMeasure(steps, ev.measure, ev.id)
                            const fits =
                              usedElsewhere + opt.beats <= BEATS_PER_BAR + 0.001
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                role="menuitemradio"
                                aria-checked={
                                  Math.abs(opt.beats - ev.durationBeats) < 0.001
                                }
                                className={`timing-block__opt ${
                                  Math.abs(opt.beats - ev.durationBeats) < 0.001
                                    ? 'is-active'
                                    : ''
                                } ${fits ? '' : 'is-tight'}`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onDurationChange?.(ev.id, opt.beats)
                                  setOpenId(null)
                                }}
                              >
                                <span className="timing-block__opt-sym">{opt.symbol}</span>
                                <span className="timing-block__opt-label">{opt.label}</span>
                                <span className="timing-block__opt-beats">
                                  {opt.beats} beat{opt.beats === 1 ? '' : 's'}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}

                {bar.remaining > 0.001 && bar.events.length > 0 && (
                  <div
                    className="timing-rest"
                    style={{
                      left: `${bar.used * PX_PER_BEAT}px`,
                      width: `${bar.remaining * PX_PER_BEAT - 3}px`,
                    }}
                    title={`Rest · ${bar.remaining} beat${bar.remaining === 1 ? '' : 's'}`}
                  >
                    𝄽
                  </div>
                )}

                {bar.events.length === 0 && (
                  <div className="timing-measure__placeholder">Empty (rests)</div>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
