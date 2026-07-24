const DB_NAME = 'chord-builder'
const DB_VERSION = 1
const STORE = 'projects'
const PROJECT_KEY = 'current'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
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

/**
 * Persist the full graph project. Called on every meaningful change.
 */
export async function saveProject(project) {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).put(
    {
      ...project,
      updatedAt: Date.now(),
      version: 1,
    },
    PROJECT_KEY,
  )
  await txDone(tx)
  db.close()
}

export async function loadProject() {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readonly')
  const store = tx.objectStore(STORE)
  const project = await new Promise((resolve, reject) => {
    const req = store.get(PROJECT_KEY)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => reject(req.error)
  })
  await txDone(tx)
  db.close()
  return project
}

export async function clearProject() {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).delete(PROJECT_KEY)
  await txDone(tx)
  db.close()
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
    get lastSavedAt() {
      return lastSavedAt
    },
  }
}
