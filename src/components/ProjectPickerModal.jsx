import { useEffect, useMemo, useRef, useState } from 'react'
import { isFileSaveStale } from '../storage/db.js'

function formatProjectDate(ts) {
  if (!ts) return '—'
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(ts))
  } catch {
    return new Date(ts).toLocaleString()
  }
}

export default function ProjectPickerModal({
  open,
  required = false,
  projects = [],
  activeProjectId = null,
  onCreate,
  onOpen,
  onCancel,
}) {
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const [sortDir, setSortDir] = useState('desc')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const nameRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setName('')
    setQuery('')
    setSortDir('desc')
    setBusy(false)
    setError('')
    const t = window.setTimeout(() => nameRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape' && !required && !busy) onCancel?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, required, busy, onCancel])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let rows = projects
    if (q) {
      rows = rows.filter((p) => (p.name || '').toLowerCase().includes(q))
    }
    const mult = sortDir === 'asc' ? 1 : -1
    return [...rows].sort(
      (a, b) => mult * ((a.updatedAt || 0) - (b.updatedAt || 0)),
    )
  }, [projects, query, sortDir])

  if (!open) return null

  const handleBackdrop = () => {
    if (!required && !busy) onCancel?.()
  }

  const handleCreate = async (e) => {
    e?.preventDefault?.()
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError('')
    try {
      await onCreate?.(trimmed)
    } catch (err) {
      setError(err?.message || 'Could not create project.')
      setBusy(false)
    }
  }

  const handleOpen = async (id) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await onOpen?.(id)
    } catch (err) {
      setError(err?.message || 'Could not open project.')
      setBusy(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={handleBackdrop}
    >
      <div
        className="modal modal--projects"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="project-picker-title" className="modal__title">
          {required ? 'Create a project' : 'Projects'}
        </h2>
        <p className="modal__message">
          {required
            ? 'Name your project to get started. You can open it again later from File.'
            : 'Create a new project or open an existing one.'}
        </p>

        <form className="project-picker__create" onSubmit={handleCreate}>
          <label className="modal__field" htmlFor="project-name-input">
            Project name
            <input
              ref={nameRef}
              id="project-name-input"
              type="text"
              value={name}
              maxLength={80}
              placeholder="e.g. Summer groove"
              autoComplete="off"
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button
            type="submit"
            className="btn btn--accent"
            disabled={busy || !name.trim()}
          >
            Create project
          </button>
        </form>

        {projects.length > 0 && (
          <div className="project-picker__list-block">
            <div className="project-picker__toolbar">
              <label className="project-picker__search">
                <span className="sr-only">Search projects</span>
                <input
                  type="search"
                  value={query}
                  placeholder="Search by name…"
                  disabled={busy}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <label className="project-picker__sort">
                <span>Sort</span>
                <select
                  value={sortDir}
                  disabled={busy}
                  onChange={(e) => setSortDir(e.target.value)}
                >
                  <option value="desc">Newest first</option>
                  <option value="asc">Oldest first</option>
                </select>
              </label>
            </div>

            <ul className="project-picker__list" role="listbox" aria-label="Projects">
              {filtered.length === 0 && (
                <li className="project-picker__empty">No projects match that search.</li>
              )}
              {filtered.map((p) => {
                const stale = isFileSaveStale(p.lastFileSaveAt)
                const isActive = p.id === activeProjectId
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      className={`project-picker__item ${isActive ? 'is-active' : ''}`}
                      disabled={busy}
                      onClick={() => handleOpen(p.id)}
                    >
                      <span className="project-picker__item-main">
                        <span className="project-picker__item-name">
                          {p.name}
                          {stale && (
                            <span
                              className="project-picker__warn"
                              title="This project has not been saved to a file recently."
                              aria-label="Not saved to file recently"
                            >
                              !
                            </span>
                          )}
                        </span>
                        <span className="project-picker__item-date">
                          {formatProjectDate(p.updatedAt)}
                        </span>
                      </span>
                      {isActive && (
                        <span className="project-picker__item-badge">Current</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {error && <p className="project-picker__error">{error}</p>}

        <div className="modal__actions">
          {!required && (
            <button
              type="button"
              className="btn btn--ghost"
              disabled={busy}
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
