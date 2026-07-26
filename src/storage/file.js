const FILE_VERSION = 1
const FILE_KIND = 'chord-builder-project'

export function buildProjectFile(project) {
  return {
    kind: FILE_KIND,
    version: FILE_VERSION,
    exportedAt: new Date().toISOString(),
    ...project,
  }
}

export function downloadProjectFile(project, filename = 'chord-progression.json') {
  const payload = buildProjectFile(project)
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function parseProjectFile(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }

  if (!data || typeof data !== 'object') {
    throw new Error('That file does not look like a NodeChords project.')
  }

  // Accept our export format or a raw autosave-shaped object
  const nodes = data.nodes
  const edges = data.edges
  if (!Array.isArray(nodes) || !Array.isArray(edges)) {
    throw new Error('Project file is missing nodes or edges.')
  }

  return {
    nodes,
    edges,
    draftKey: data.draftKey ?? null,
    selectedNodeId: data.selectedNodeId ?? null,
    idCounter: data.idCounter ?? null,
    bpm: data.bpm,
    metronomeEnabled: data.metronomeEnabled,
    metronomeType: data.metronomeType,
  }
}

export function readProjectFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        resolve(parseProjectFile(String(reader.result || '')))
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.readAsText(file)
  })
}

export function projectFilenameFromNodes(nodes) {
  const start = nodes?.find((n) => n.data?.isStart)
  const chord = start?.data?.chord
  if (!chord) return 'chord-progression.json'
  const rootNames = ['C', 'Cs', 'D', 'Eb', 'E', 'F', 'Fs', 'G', 'Ab', 'A', 'Bb', 'B']
  const root = rootNames[chord.root] || 'chord'
  return `${root}-${chord.quality || 'prog'}.json`
}
