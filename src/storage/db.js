const DB_NAME = 'chord-builder'
const DB_VERSION = 2
const STORE = 'projectRecords'
const META_STORE = 'meta'
const LEGACY_STORE = 'projects'
const LEGACY_KEY = 'current'
const META_ACTIVE = 'activeProjectId'

/** Warn when a project has not been saved to a file for this long. */
export const STALE_FILE_SAVE_MS = 5 * 24 * 60 * 60 * 1000

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (event) => {
      const db = req.result
      const oldVersion = event.oldVersion

      if (oldVersion < 1 && !db.objectStoreNames.contains(LEGACY_STORE)) {
        db.createObjectStore(LEGACY_STORE)
      }

      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' })
          store.createIndex('updatedAt', 'updatedAt')
          store.createIndex('name', 'name', { unique: false })
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE)
        }
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'))
  })
}

function requestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function newProjectId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function emptyGraph() {
  return {
    nodes: [],
    edges: [],
    draftKey: null,
    idCounter: 1,
    bpm: 120,
    metronomeEnabled: true,
    metronomeType: null,
  }
}

export function isFileSaveStale(lastFileSaveAt, now = Date.now()) {
  if (lastFileSaveAt == null) return true
  return now - lastFileSaveAt > STALE_FILE_SAVE_MS
}

export function countStaleFileSaves(projects, now = Date.now()) {
  return (projects || []).filter((p) => isFileSaveStale(p.lastFileSaveAt, now)).length
}

function projectMeta(project) {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    lastFileSaveAt: project.lastFileSaveAt ?? null,
  }
}

async function migrateLegacy(db) {
  if (!db.objectStoreNames.contains(LEGACY_STORE)) return

  const legacyTx = db.transaction(LEGACY_STORE, 'readonly')
  const legacy = await requestToPromise(legacyTx.objectStore(LEGACY_STORE).get(LEGACY_KEY))
  await txDone(legacyTx)
  if (!legacy) return

  const listTx = db.transaction(STORE, 'readonly')
  const existing = await requestToPromise(listTx.objectStore(STORE).getAll())
  await txDone(listTx)
  if (existing?.length) {
    await clearLegacyCurrent(db)
    return
  }

  const now = Date.now()
  const migrated = {
    id: newProjectId(),
    name: 'Untitled',
    createdAt: legacy.updatedAt || now,
    updatedAt: legacy.updatedAt || now,
    lastFileSaveAt: null,
    nodes: legacy.nodes || [],
    edges: legacy.edges || [],
    draftKey: legacy.draftKey ?? null,
    idCounter: legacy.idCounter ?? 1,
    bpm: legacy.bpm ?? 120,
    metronomeEnabled:
      typeof legacy.metronomeEnabled === 'boolean' ? legacy.metronomeEnabled : true,
    metronomeType: legacy.metronomeType ?? null,
    version: 1,
  }

  const writeTx = db.transaction([STORE, META_STORE], 'readwrite')
  writeTx.objectStore(STORE).put(migrated)
  writeTx.objectStore(META_STORE).put(migrated.id, META_ACTIVE)
  await txDone(writeTx)
  await clearLegacyCurrent(db)
}

async function clearLegacyCurrent(db) {
  if (!db.objectStoreNames.contains(LEGACY_STORE)) return
  const tx = db.transaction(LEGACY_STORE, 'readwrite')
  tx.objectStore(LEGACY_STORE).delete(LEGACY_KEY)
  await txDone(tx)
}

/**
 * List project metadata (no graph payload), newest first by default.
 */
export async function listProjects() {
  const db = await openDb()
  try {
    await migrateLegacy(db)
    const tx = db.transaction(STORE, 'readonly')
    const rows = await requestToPromise(tx.objectStore(STORE).getAll())
    await txDone(tx)
    return (rows || [])
      .map(projectMeta)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  } finally {
    db.close()
  }
}

export async function getActiveProjectId() {
  const db = await openDb()
  try {
    await migrateLegacy(db)
    const tx = db.transaction(META_STORE, 'readonly')
    const id = await requestToPromise(tx.objectStore(META_STORE).get(META_ACTIVE))
    await txDone(tx)
    return id ?? null
  } finally {
    db.close()
  }
}

export async function setActiveProjectId(id) {
  const db = await openDb()
  try {
    const tx = db.transaction(META_STORE, 'readwrite')
    if (id == null) {
      tx.objectStore(META_STORE).delete(META_ACTIVE)
    } else {
      tx.objectStore(META_STORE).put(id, META_ACTIVE)
    }
    await txDone(tx)
  } finally {
    db.close()
  }
}

export async function getProject(id) {
  if (!id) return null
  const db = await openDb()
  try {
    await migrateLegacy(db)
    const tx = db.transaction(STORE, 'readonly')
    const project = await requestToPromise(tx.objectStore(STORE).get(id))
    await txDone(tx)
    return project ?? null
  } finally {
    db.close()
  }
}

/**
 * Create a named empty project and make it active.
 */
export async function createProject(name) {
  const trimmed = String(name || '').trim()
  if (!trimmed) throw new Error('Project name is required.')

  const now = Date.now()
  const project = {
    id: newProjectId(),
    name: trimmed,
    createdAt: now,
    updatedAt: now,
    lastFileSaveAt: null,
    ...emptyGraph(),
    version: 1,
  }

  const db = await openDb()
  try {
    await migrateLegacy(db)
    const tx = db.transaction([STORE, META_STORE], 'readwrite')
    tx.objectStore(STORE).put(project)
    tx.objectStore(META_STORE).put(project.id, META_ACTIVE)
    await txDone(tx)
    return project
  } finally {
    db.close()
  }
}

/**
 * Persist graph fields for an existing project. Preserves name / file-save date.
 */
export async function saveProject(id, project) {
  if (!id) throw new Error('No active project to save.')

  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const existing = await requestToPromise(store.get(id))
    if (!existing) {
      throw new Error('Project not found.')
    }

    store.put({
      ...existing,
      ...project,
      id: existing.id,
      name: existing.name,
      createdAt: existing.createdAt,
      lastFileSaveAt: existing.lastFileSaveAt ?? null,
      updatedAt: Date.now(),
      version: 1,
    })
    await txDone(tx)
  } finally {
    db.close()
  }
}

/** Record that the user downloaded / saved this project to a file. */
export async function markProjectFileSaved(id) {
  if (!id) return null
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const existing = await requestToPromise(store.get(id))
    if (!existing) return null
    const next = {
      ...existing,
      lastFileSaveAt: Date.now(),
      updatedAt: existing.updatedAt || Date.now(),
    }
    store.put(next)
    await txDone(tx)
    return projectMeta(next)
  } finally {
    db.close()
  }
}

/**
 * Clear graph content for a project (keeps the named project entry).
 */
export async function clearProject(id) {
  if (!id) return
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const existing = await requestToPromise(store.get(id))
    if (!existing) {
      await txDone(tx)
      return
    }
    store.put({
      ...existing,
      ...emptyGraph(),
      draftKey: existing.draftKey ?? null,
      updatedAt: Date.now(),
      version: 1,
    })
    await txDone(tx)
  } finally {
    db.close()
  }
}

/**
 * Open a project and mark it active. Returns the full record.
 */
export async function openProject(id) {
  const project = await getProject(id)
  if (!project) throw new Error('Project not found.')
  await setActiveProjectId(id)
  return project
}

/** Debounced save helper for frequent updates (e.g. node drag). */
export function createAutosave(saveFn, delayMs = 200) {
  let timer = null
  let pending = null
  let lastSavedAt = 0

  return {
    queue(payload) {
      pending = payload
      if (timer) clearTimeout(timer)
      timer = setTimeout(async () => {
        const data = pending
        pending = null
        timer = null
        if (!data) return
        try {
          await saveFn(data)
          lastSavedAt = Date.now()
        } catch (err) {
          console.error('Autosave failed', err)
        }
      }, delayMs)
    },
    flush() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (!pending) return Promise.resolve()
      const data = pending
      pending = null
      return saveFn(data).then(() => {
        lastSavedAt = Date.now()
      })
    },
    /** Drop a pending save without writing (use when switching projects). */
    cancel() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      pending = null
    },
    get lastSavedAt() {
      return lastSavedAt
    },
  }
}
