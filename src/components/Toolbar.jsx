import { useEffect, useRef, useState } from 'react'

export default function Toolbar({
  hasStart,
  canAddNode,
  canDelete,
  canPlay,
  isPlaying,
  canRestart,
  canExport,
  canSave,
  saveStatus,
  viewMode = 'graph',
  bpm = 120,
  metronomeEnabled = true,
  onAddNode,
  onDelete,
  onTogglePlay,
  onRestart,
  onExportMidi,
  onSaveFile,
  onLoadFile,
  onReset,
  onViewModeChange,
  onBpmChange,
  onToggleMetronome,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    const onPointer = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  return (
    <div className="toolbar">
      <div className="toolbar__brand">
        <span className="toolbar__mark">NodeChords</span>
        {saveStatus && <span className="toolbar__save">{saveStatus}</span>}
      </div>
      <div className="toolbar__actions">
        <div className="view-switch" role="group" aria-label="View">
          <button
            type="button"
            className={`view-switch__btn ${viewMode === 'graph' ? 'is-active' : ''}`}
            onClick={() => onViewModeChange?.('graph')}
          >
            Graph
          </button>
          <button
            type="button"
            className={`view-switch__btn ${viewMode === 'timing' ? 'is-active' : ''}`}
            onClick={() => onViewModeChange?.('timing')}
          >
            Timing
          </button>
        </div>

        <button type="button" className="btn" disabled={!canAddNode} onClick={onAddNode}>
          Add node
        </button>
        <button type="button" className="btn btn--ghost" disabled={!canDelete} onClick={onDelete}>
          Delete
        </button>

        <div className="transport" role="group" aria-label="Transport">
          <button
            type="button"
            className="btn btn--transport"
            disabled={!canRestart}
            title="Restart (playhead to start)"
            aria-label="Restart"
            onClick={onRestart}
          >
            <span className="transport__icon" aria-hidden>
              ⏮
            </span>
          </button>
          <button
            type="button"
            className={`btn btn--transport btn--accent ${isPlaying ? 'is-playing' : ''}`}
            disabled={!canPlay}
            title={isPlaying ? 'Pause' : 'Play'}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            onClick={onTogglePlay}
          >
            <span className="transport__icon" aria-hidden>
              {isPlaying ? '❚❚' : '▶'}
            </span>
          </button>
        </div>

        <label className="bpm-control" title="Project tempo">
          <span>BPM</span>
          <input
            type="number"
            min={40}
            max={240}
            step={1}
            value={bpm}
            onChange={(e) => onBpmChange?.(e.target.value)}
          />
        </label>

        <button
          type="button"
          className={`btn btn--ghost metronome-toggle ${metronomeEnabled ? 'is-on' : ''}`}
          title={metronomeEnabled ? 'Metronome on' : 'Metronome off'}
          aria-pressed={metronomeEnabled}
          onClick={() => onToggleMetronome?.(!metronomeEnabled)}
        >
          ♩ {metronomeEnabled ? 'On' : 'Off'}
        </button>

        <div className="file-menu" ref={menuRef}>
          <button
            type="button"
            className="btn btn--ghost"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            File ▾
          </button>
          {menuOpen && (
            <div className="file-menu__dropdown" role="menu">
              <button
                type="button"
                role="menuitem"
                className="file-menu__item"
                disabled={!canExport}
                onClick={() => {
                  setMenuOpen(false)
                  onExportMidi?.()
                }}
              >
                Export MIDI
              </button>
              <button
                type="button"
                role="menuitem"
                className="file-menu__item"
                disabled={!canSave}
                onClick={() => {
                  setMenuOpen(false)
                  onSaveFile?.()
                }}
              >
                Save to file…
              </button>
              <button
                type="button"
                role="menuitem"
                className="file-menu__item"
                onClick={() => {
                  setMenuOpen(false)
                  fileInputRef.current?.click()
                }}
              >
                Load from file…
              </button>
              <div className="file-menu__sep" role="separator" />
              <button
                type="button"
                role="menuitem"
                className="file-menu__item file-menu__item--danger"
                disabled={!hasStart}
                onClick={() => {
                  setMenuOpen(false)
                  onReset?.()
                }}
              >
                Reset
              </button>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) onLoadFile?.(file)
          }}
        />
      </div>
    </div>
  )
}
