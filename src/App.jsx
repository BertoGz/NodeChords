import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  MarkerType,
  SelectionMode,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import ChordNode from './components/ChordNode.jsx'
import ChordPalette from './components/ChordPalette.jsx'
import SuggestionPanel from './components/SuggestionPanel.jsx'
import Toolbar from './components/Toolbar.jsx'
import TimingView from './components/TimingView.jsx'
import ConfirmModal from './components/ConfirmModal.jsx'
import ModulateModal from './components/ModulateModal.jsx'
import ProjectPickerModal from './components/ProjectPickerModal.jsx'
import { DEFAULT_VOICING, formatChord } from './theory/chords.js'
import { createKey, formatKey } from './theory/keys.js'
import {
  DEFAULT_BPM,
  DEFAULT_DURATION_BEATS,
  DEFAULT_MEASURE,
  beatsUsedInMeasure,
  clampBpm,
  inferMeasuresFromDurations,
  normalizeDurationBeats,
  normalizeMeasure,
  suggestNextMeasure,
} from './theory/duration.js'
import {
  previousChord,
  previousKey,
  startChord,
  startNodeId,
  suggest,
  suggestionModeForNode,
} from './theory/suggest.js'
import {
  playProgression,
  setProgressionStopHandler,
  stopProgression,
  DEFAULT_METRONOME_TYPE,
  normalizeMetronomeType,
} from './audio/playChord.js'
import {
  clearProject,
  createAutosave,
  createProject,
  getActiveProjectId,
  getProject,
  listProjects,
  markProjectFileSaved,
  openProject,
  saveProject,
} from './storage/db.js'
import {
  downloadProjectFile,
  projectFilenameFromNodes,
  readProjectFile,
} from './storage/file.js'
import { downloadMidi, midiFilenameFromChords } from './midi/exportMidi.js'
import { readMidiFile } from './midi/importMidi.js'

const nodeTypes = { chord: ChordNode }

const defaultEdgeOptions = {
  markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
  style: { strokeWidth: 2 },
  animated: false,
}

let idCounter = 1

function syncIdCounterFromNodes(nodes) {
  let max = 1
  for (const n of nodes || []) {
    const m = /^n(\d+)$/.exec(n.id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  idCounter = max
}

/** Mint a node id that cannot collide with existing nodes (HMR / desync safe). */
function nextId(existingNodes) {
  syncIdCounterFromNodes(existingNodes)
  const used = new Set((existingNodes || []).map((n) => n.id))
  do {
    idCounter += 1
  } while (used.has(`n${idCounter}`))
  return `n${idCounter}`
}

function serializeNodes(nodes) {
  return nodes.map((n) => ({
    id: n.id,
    type: n.type || 'chord',
    position: n.position,
    data: { ...n.data },
  }))
}

function serializeEdges(edges) {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated: Boolean(e.animated),
    markerEnd: e.markerEnd,
    style: e.style,
  }))
}

function nodeChord(node) {
  return node?.data?.chord ?? null
}

function nodeVoicing(node) {
  return node?.data?.voicing || DEFAULT_VOICING
}

function nodeBassOctave(node) {
  // null => "Auto" (keep current voicing algorithm)
  return node?.data?.bassOctave ?? null
}

function nodeDurationBeats(node) {
  return normalizeDurationBeats(node?.data?.durationBeats ?? DEFAULT_DURATION_BEATS)
}

function nodeMeasure(node) {
  return normalizeMeasure(node?.data?.measure ?? DEFAULT_MEASURE)
}

function withDurationDefaults(nodes) {
  const list = nodes || []
  const chordNodes = list.filter((n) => n.data?.chord)
  const needInfer = chordNodes.some((n) => n.data?.measure == null)
  const inferredById = new Map()

  if (needInfer) {
    const measures = inferMeasuresFromDurations(
      chordNodes.map((n) => ({
        id: n.id,
        durationBeats: nodeDurationBeats(n),
      })),
    )
    chordNodes.forEach((n, i) => {
      if (n.data?.measure == null) inferredById.set(n.id, measures[i] ?? DEFAULT_MEASURE)
    })
  }

  return list.map((n) => ({
    ...n,
    data: {
      ...n.data,
      durationBeats: nodeDurationBeats(n),
      measure: normalizeMeasure(
        n.data?.measure ?? inferredById.get(n.id) ?? DEFAULT_MEASURE,
      ),
      voicing: n.data?.voicing || DEFAULT_VOICING,
      bassOctave: n.data?.bassOctave ?? null,
    },
  }))
}

function nodeIdNum(id) {
  const m = /^n(\d+)$/.exec(id || '')
  return m ? Number(m[1]) : 0
}

/**
 * Prefer the newest forward child (highest n# id).
 * Skips loop-backs to Start and already-visited nodes.
 */
function nextForward(sourceId, startId, nodes, edges, visited) {
  const candidates = edges
    .filter((e) => e.source === sourceId && e.target !== startId && !visited.has(e.target))
    .map((e) => {
      const node = nodes.find((n) => n.id === e.target)
      return node ? { edge: e, node } : null
    })
    .filter(Boolean)
    .sort((a, b) => nodeIdNum(b.node.id) - nodeIdNum(a.node.id))

  return candidates[0] || null
}

/**
 * Walk forward from start. Returns [{ id, chord, voicing }, ...].
 * When a node has multiple outgoing edges, follow the newest branch.
 * Empty (no-chord) nodes stay on the path so Timing view can show placeholders.
 */
function progressionPath(nodes, edges) {
  const start = nodes.find((n) => n.data?.isStart)
  const startChordValue = nodeChord(start)
  if (!startChordValue) return []

  const steps = [
    {
      id: start.id,
      chord: startChordValue,
      voicing: nodeVoicing(start),
      bassOctave: nodeBassOctave(start),
      durationBeats: nodeDurationBeats(start),
      measure: nodeMeasure(start),
    },
  ]
  const visited = new Set([start.id])
  let current = start.id

  while (true) {
    const next = nextForward(current, start.id, nodes, edges, visited)
    if (!next) break
    visited.add(next.node.id)
    steps.push({
      id: next.node.id,
      chord: nodeChord(next.node),
      voicing: nodeVoicing(next.node),
      bassOctave: nodeBassOctave(next.node),
      durationBeats: nodeDurationBeats(next.node),
      measure: nodeMeasure(next.node),
    })
    current = next.node.id
  }

  return steps
}

/** Last node on the newest forward chain from Start (includes empty tip nodes). */
function progressionTip(nodes, edges) {
  const start = nodes.find((n) => n.data?.isStart)
  if (!start) return null

  const visited = new Set([start.id])
  let current = start

  while (true) {
    const next = nextForward(current.id, start.id, nodes, edges, visited)
    if (!next) return current
    visited.add(next.node.id)
    current = next.node
  }
}

function enrichNodes(nodes, edges) {
  const startId = startNodeId(nodes)
  const target = startChord(nodes)
  const targetSymbol = target ? formatChord(target) : ''

  return nodes.map((node) => {
    if (node.data?.chord || node.data?.isStart) {
      return {
        ...node,
        data: {
          ...node.data,
          mode: node.data?.chord ? null : suggestionModeForNode(node.id, edges, startId),
          targetSymbol: '',
        },
      }
    }
    const mode = suggestionModeForNode(node.id, edges, startId)
    return {
      ...node,
      data: {
        ...node.data,
        mode,
        targetSymbol: mode === 'resolve' ? targetSymbol : '',
      },
    }
  })
}

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [draftKey, setDraftKey] = useState(() => createKey(0, 'major'))
  const [hydrated, setHydrated] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const [resetOpen, setResetOpen] = useState(false)
  const [modulateOpen, setModulateOpen] = useState(false)
  const [projectPickerOpen, setProjectPickerOpen] = useState(false)
  const [projectPickerRequired, setProjectPickerRequired] = useState(false)
  const [activeProjectId, setActiveProjectId] = useState(null)
  const [projectName, setProjectName] = useState('')
  const [projectsMeta, setProjectsMeta] = useState([])
  const [playheadNodeId, setPlayheadNodeId] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [viewMode, setViewMode] = useState('graph')
  const [bpm, setBpm] = useState(DEFAULT_BPM)
  const [metronomeEnabled, setMetronomeEnabled] = useState(true)
  const [metronomeType, setMetronomeType] = useState(DEFAULT_METRONOME_TYPE)
  const isPlayingRef = useRef(false)
  const playheadAtEndRef = useRef(false)
  const autosaveRef = useRef(null)
  const lastAutosaveSignatureRef = useRef(null)
  const activeProjectIdRef = useRef(null)
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const flowRef = useRef(null)

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  useEffect(() => {
    edgesRef.current = edges
  }, [edges])

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId
  }, [activeProjectId])

  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  useEffect(() => {
    setProgressionStopHandler(() => {
      setIsPlaying(false)
    })
    return () => setProgressionStopHandler(null)
  }, [])

  const refreshProjectsMeta = useCallback(async () => {
    const list = await listProjects()
    setProjectsMeta(list)
    return list
  }, [])

  const applyProjectRecord = useCallback(
    (project) => {
      const loadedEdges = (project.edges || []).map((e) => ({
        ...defaultEdgeOptions,
        ...e,
      }))
      const loadedNodes = enrichNodes(
        withDurationDefaults(project.nodes || []),
        loadedEdges,
      )

      // Sync refs immediately so in-flight work can't see the previous graph/id.
      nodesRef.current = loadedNodes
      edgesRef.current = loadedEdges
      activeProjectIdRef.current = project.id
      lastAutosaveSignatureRef.current = null

      setNodes(loadedNodes)
      setEdges(loadedEdges)
      setDraftKey(project.draftKey || createKey(0, 'major'))
      setSelectedNodeId(
        project.selectedNodeId ||
          loadedNodes.find((n) => n.data?.isStart)?.id ||
          loadedNodes[0]?.id ||
          null,
      )
      if (project.bpm != null) setBpm(clampBpm(project.bpm))
      else setBpm(DEFAULT_BPM)
      if (typeof project.metronomeEnabled === 'boolean') {
        setMetronomeEnabled(project.metronomeEnabled)
      } else {
        setMetronomeEnabled(true)
      }
      if (project.metronomeType != null) {
        setMetronomeType(normalizeMetronomeType(project.metronomeType))
      } else {
        setMetronomeType(DEFAULT_METRONOME_TYPE)
      }
      syncIdCounterFromNodes(loadedNodes)
      idCounter = 1
      if (project.idCounter) idCounter = Math.max(idCounter, project.idCounter)
      setActiveProjectId(project.id)
      setProjectName(project.name || 'Untitled')
      setPlayheadNodeId(null)
      playheadAtEndRef.current = false
      setIsPlaying(false)
      setViewMode('graph')
    },
    [setNodes, setEdges],
  )

  useEffect(() => {
    // Persist to the projectId captured when the payload was queued — never the
    // "current" id at write time (that races when switching/creating projects).
    autosaveRef.current = createAutosave(async (payload) => {
      const { projectId, ...graph } = payload || {}
      if (!projectId) return
      await saveProject(projectId, graph)
      setSaveStatus('Saved')
      setProjectsMeta((prev) => {
        const now = Date.now()
        const next = prev.map((p) =>
          p.id === projectId ? { ...p, updatedAt: now } : p,
        )
        next.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        return next
      })
    }, 220)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await listProjects()
        if (cancelled) return
        setProjectsMeta(list)

        const savedActiveId = await getActiveProjectId()
        const preferredId =
          (savedActiveId && list.some((p) => p.id === savedActiveId)
            ? savedActiveId
            : null) || list[0]?.id

        if (preferredId) {
          const project = await getProject(preferredId)
          if (cancelled) return
          if (project) {
            applyProjectRecord(project)
            setSaveStatus('Restored')
            setProjectPickerRequired(false)
            setProjectPickerOpen(false)
          } else {
            setProjectPickerRequired(true)
            setProjectPickerOpen(true)
          }
        } else {
          setProjectPickerRequired(true)
          setProjectPickerOpen(true)
        }
      } catch (err) {
        console.error('Failed to load projects', err)
        if (!cancelled) {
          setProjectPickerRequired(true)
          setProjectPickerOpen(true)
        }
      } finally {
        if (!cancelled) setHydrated(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [applyProjectRecord])

  useEffect(() => {
    if (!hydrated || !autosaveRef.current || !activeProjectId) return
    const payload = {
      projectId: activeProjectId,
      nodes: serializeNodes(nodes),
      edges: serializeEdges(edges),
      draftKey,
      idCounter,
      bpm,
      metronomeEnabled,
      metronomeType,
    }
    const signature = JSON.stringify(payload)
    if (signature === lastAutosaveSignatureRef.current) return
    lastAutosaveSignatureRef.current = signature
    setSaveStatus('Saving…')
    autosaveRef.current.queue(payload)
  }, [
    nodes,
    edges,
    draftKey,
    bpm,
    metronomeEnabled,
    metronomeType,
    hydrated,
    activeProjectId,
  ])

  const startId = useMemo(() => startNodeId(nodes), [nodes])
  const hasStart = Boolean(startId)
  const target = useMemo(() => startChord(nodes), [nodes])

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  )

  const mode = useMemo(() => {
    if (!selectedNode) return 'build'
    return suggestionModeForNode(selectedNode.id, edges, startId)
  }, [selectedNode, edges, startId])

  const homeKey = selectedNode?.data?.key ?? (!hasStart ? draftKey : null)
  const intent = selectedNode?.data?.intent ?? 'stay'
  const modulateTo = selectedNode?.data?.modulateTo ?? null
  const modulateRole = selectedNode?.data?.modulateRole ?? null
  const selectedVoicing = nodeVoicing(selectedNode)
  const selectedBassOctave = nodeBassOctave(selectedNode)

  const suggestions = useMemo(() => {
    if (!selectedNode) return []
    const from = previousChord(selectedNode.id, nodes, edges)
    const key = selectedNode.data?.key ?? previousKey(selectedNode.id, nodes, edges)
    const modulating =
      selectedNode.data?.intent === 'modulate' && selectedNode.data?.modulateTo

    if (mode === 'resolve') {
      if (!target) return []
      return suggest({
        fromChord: from,
        mode: 'resolve',
        targetChord: target,
        homeKey: key,
        limit: 16,
      })
    }

    if (modulating) {
      const fromKey =
        selectedNode.data?.modulateFromKey ||
        previousKey(selectedNode.id, nodes, edges) ||
        key
      return suggest({
        fromChord: from,
        mode: 'build',
        homeKey: fromKey,
        modulateTo: selectedNode.data.modulateTo,
        modulateRole: selectedNode.data?.modulateRole || null,
        limit: 16,
      })
    }

    if (!key) return []
    return suggest({
      fromChord: from,
      mode: 'build',
      homeKey: key,
      limit: 16,
    })
  }, [selectedNode, nodes, edges, mode, target])

  const onConnect = useCallback(
    (connection) => {
      const eds = edgesRef.current
      const next = addEdge(
        {
          ...connection,
          ...defaultEdgeOptions,
          id: `e-${connection.source}-${connection.target}-${eds.length}`,
        },
        eds,
      )
      const nextNodes = enrichNodes(nodesRef.current, next)
      edgesRef.current = next
      nodesRef.current = nextNodes
      setEdges(next)
      setNodes(nextNodes)
    },
    [setEdges, setNodes],
  )

  const centerOnNode = useCallback(
    (nodeId) => {
      if (!nodeId || viewMode !== 'graph') return
      // Wait a frame so React Flow has mounted and measured the new node.
      requestAnimationFrame(() => {
        const flow = flowRef.current
        const node = flow?.getNode(nodeId)
        if (!node) return
        const width = node.measured?.width ?? node.width ?? 140
        const height = node.measured?.height ?? node.height ?? 84
        flow.setCenter(node.position.x + width / 2, node.position.y + height / 2, {
          zoom: flow.getZoom(),
          duration: 420,
        })
      })
    },
    [viewMode],
  )

  const startPlayback = useCallback(
    (fromIndex) => {
      const steps = progressionPath(nodes, edges)
      if (!steps.length) return
      const start = Math.max(0, Math.min(fromIndex, steps.length - 1))
      playheadAtEndRef.current = false
      setIsPlaying(true)
      playProgression(steps, {
        fromIndex: start,
        bpm,
        metronome: metronomeEnabled,
        metronomeType,
        onStep: (_i, step) => {
          playheadAtEndRef.current = false
          setPlayheadNodeId(step?.id ?? null)
        },
        onDone: () => {
          playheadAtEndRef.current = true
          setIsPlaying(false)
        },
      })
    },
    [nodes, edges, bpm, metronomeEnabled, metronomeType],
  )

  const selectNode = useCallback(
    (id) => {
      setSelectedNodeId((prev) => (prev === id ? prev : id))
      // During playback the transport owns the playhead — clicks may select, not seek.
      if (!id || isPlayingRef.current) return
      const steps = progressionPath(nodesRef.current, edgesRef.current)
      if (!steps.some((s) => s.id === id)) return
      playheadAtEndRef.current = false
      setPlayheadNodeId((prev) => (prev === id ? prev : id))
    },
    [],
  )

  // RF defaults: clickDistance=0 cancels click on any jitter, but drag only starts
  // after nodeDragThreshold (1px). That dead zone drops selection entirely.
  // Catch select changes from RF (mousedown / drag-start) so we don't depend on click.
  const handleNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes)
      let selectedId
      let sawSelect = false
      for (const change of changes) {
        if (change.type !== 'select') continue
        sawSelect = true
        if (change.selected) selectedId = change.id
      }
      if (!sawSelect) return
      if (selectedId) selectNode(selectedId)
      else setSelectedNodeId(null)
    },
    [onNodesChange, selectNode],
  )

  const onNodeClick = useCallback(
    (_event, node) => {
      selectNode(node?.id ?? null)
    },
    [selectNode],
  )

  const onNodeDragStart = useCallback(
    (_event, node) => {
      selectNode(node?.id ?? null)
    },
    [selectNode],
  )

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null)
  }, [])

  const assignChordToSelected = useCallback(
    (chord) => {
      if (!selectedNodeId) return
      setNodes((nds) => {
        const next = nds.map((n) => {
          if (n.id !== selectedNodeId) return n
          const modulating = n.data?.intent === 'modulate' && n.data?.modulateTo
          if (modulating) {
            // Keep modulate UI + arrival/bridge list so user can swap picks
            return {
              ...n,
              data: {
                ...n.data,
                chord,
                key: n.data.modulateTo,
                intent: 'modulate',
                modulateTo: n.data.modulateTo,
                modulateFromKey:
                  n.data.modulateFromKey || n.data.key || draftKey,
                modulateRole: n.data.modulateRole || 'setup',
              },
            }
          }
          return {
            ...n,
            data: {
              ...n.data,
              chord,
              key: n.data.key || draftKey,
              intent: 'stay',
              modulateTo: null,
              modulateFromKey: null,
              modulateRole: null,
            },
          }
        })
        return enrichNodes(next, edges)
      })
    },
    [selectedNodeId, edges, draftKey, setNodes],
  )

  const handlePickChord = useCallback(
    (chord) => {
      if (!hasStart) {
        const key = draftKey
        const start = {
          id: 'n1',
          type: 'chord',
          position: { x: 280, y: 220 },
          data: {
            chord,
            key,
            intent: 'stay',
            modulateTo: null,
            voicing: DEFAULT_VOICING,
            bassOctave: null,
            durationBeats: DEFAULT_DURATION_BEATS,
            measure: DEFAULT_MEASURE,
            isStart: true,
            mode: null,
            targetSymbol: '',
          },
        }
        idCounter = 1
        setNodes([start])
        setEdges([])
        setSelectedNodeId('n1')
        setPlayheadNodeId('n1')
        playheadAtEndRef.current = false
        return
      }

      if (!selectedNodeId) return
      assignChordToSelected(chord)
    },
    [hasStart, draftKey, selectedNodeId, assignChordToSelected, setNodes, setEdges],
  )

  const handleAddNode = useCallback(() => {
    if (!hasStart) return

    // Keep this outside setState updaters — Strict Mode double-invokes them
    // in dev, which would mint two ids / create two nodes.
    const nds = nodesRef.current
    const eds = edgesRef.current
    const source =
      progressionTip(nds, eds) ||
      nds.find((n) => n.data?.isStart) ||
      nds.find((n) => n.id === startId)
    if (!source) return

    const sourceId = source.id
    const inheritedKey = source.data?.key ?? draftKey
    const inheritedVoicing = nodeVoicing(source)
    const inheritedBassOctave = nodeBassOctave(source)
    const inheritedBeats = nodeDurationBeats(source)
    const path = progressionPath(nds, eds)
    const usedInPrev = beatsUsedInMeasure(path, nodeMeasure(source))
    const measure = suggestNextMeasure(nodeMeasure(source), usedInPrev, inheritedBeats)
    const id = nextId(nds)
    const newNode = {
      id,
      type: 'chord',
      position: {
        x: source.position.x + 220,
        y: source.position.y + (nds.length % 2 === 0 ? 40 : -40),
      },
      data: {
        chord: source.data?.chord ? { ...source.data.chord } : null,
        key: inheritedKey,
        intent: 'stay',
        modulateTo: null,
        modulateFromKey: null,
        modulateRole: null,
        voicing: inheritedVoicing,
          bassOctave: inheritedBassOctave,
        durationBeats: inheritedBeats,
        measure,
        isStart: false,
        mode: 'build',
        targetSymbol: '',
      },
      selected: true,
    }

    const nextEdges = [
      ...eds,
      {
        id: `e-${sourceId}-${id}`,
        source: sourceId,
        target: id,
        ...defaultEdgeOptions,
      },
    ]
    const nextNodes = enrichNodes(
      [...nds.map((n) => ({ ...n, selected: false })), newNode],
      nextEdges,
    )

    nodesRef.current = nextNodes
    edgesRef.current = nextEdges
    setEdges(nextEdges)
    setNodes(nextNodes)
    setSelectedNodeId(id)
    centerOnNode(id)
  }, [hasStart, startId, draftKey, setNodes, setEdges, centerOnNode])

  const handleVoicingChange = useCallback(
    (voicing) => {
      if (!selectedNodeId) return
      setNodes((nds) =>
        nds.map((n) =>
          n.id === selectedNodeId ? { ...n, data: { ...n.data, voicing } } : n,
        ),
      )
    },
    [selectedNodeId, setNodes],
  )

  const handleBassOctaveChange = useCallback(
    (bassOctave) => {
      if (!selectedNodeId) return
      setNodes((nds) =>
        nds.map((n) =>
          n.id === selectedNodeId
            ? { ...n, data: { ...n.data, bassOctave: bassOctave ?? null } }
            : n,
        ),
      )
    },
    [selectedNodeId, setNodes],
  )

  const handleDurationChange = useCallback(
    (nodeId, beats) => {
      if (!nodeId) return
      const durationBeats = normalizeDurationBeats(beats)
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, durationBeats } } : n,
        ),
      )
    },
    [setNodes],
  )

  const handleMeasureChange = useCallback(
    (nodeId, measure) => {
      if (!nodeId) return
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, measure: normalizeMeasure(measure) } }
            : n,
        ),
      )
    },
    [setNodes],
  )

  const handleSelectTimingStep = useCallback(
    (id) => {
      if (!id) return
      setSelectedNodeId(id)
      setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === id })))
      // During playback the transport owns the playhead — clicks may select, not seek.
      if (isPlayingRef.current) return
      playheadAtEndRef.current = false
      setPlayheadNodeId(id)
    },
    [setNodes],
  )

  const handleStartModulate = useCallback(
    ({ key: targetKey, setupLength }) => {
      if (!selectedNodeId || !targetKey) return
      const source = nodesRef.current.find((n) => n.id === selectedNodeId)
      if (!source) return

      const fromKey = source.data?.key || draftKey
      const length = Math.min(3, Math.max(1, setupLength || 1))
      const nds = nodesRef.current
      const eds = edgesRef.current

      const allocated = []
      for (let i = 1; i < length; i++) {
        allocated.push(
          nextId([...nds, ...allocated.map((cid) => ({ id: cid }))]),
        )
      }
      const chainIds = [selectedNodeId, ...allocated]

      const newNodes = []
      const newEdges = []
      const sourceMeasure = nodeMeasure(source)
      for (let i = 1; i < length; i++) {
        const id = chainIds[i]
        const prevId = chainIds[i - 1]
        const prevPos = i === 1 ? source.position : newNodes[i - 2].position
        const isLast = i === length - 1
        newNodes.push({
          id,
          type: 'chord',
          position: {
            x: prevPos.x + 220,
            y: prevPos.y + (i % 2 === 0 ? 36 : -36),
          },
          data: {
            chord: null,
            key: targetKey,
            intent: 'modulate',
            modulateTo: targetKey,
            modulateFromKey: fromKey,
            modulateRole: isLast ? 'arrival' : 'setup',
            voicing: nodeVoicing(source),
            bassOctave: nodeBassOctave(source),
            durationBeats: nodeDurationBeats(source),
            // One modulation step per measure so timing view doesn't stack them.
            measure: normalizeMeasure(sourceMeasure + i),
            isStart: false,
            mode: 'build',
            targetSymbol: '',
          },
        })
        newEdges.push({
          id: `e-${prevId}-${id}-mod`,
          source: prevId,
          target: id,
          ...defaultEdgeOptions,
        })
      }

      const nextEdges = [...eds, ...newEdges]
      const updated = nds.map((n) => {
        if (n.id !== selectedNodeId) return n
        return {
          ...n,
          data: {
            ...n.data,
            // Clear so each modulation step starts empty for a fresh pick.
            chord: null,
            intent: 'modulate',
            modulateTo: targetKey,
            modulateFromKey: fromKey,
            modulateRole: length === 1 ? 'arrival' : 'setup',
            key: length === 1 ? targetKey : fromKey,
          },
        }
      })
      const nextNodes = enrichNodes([...updated, ...newNodes], nextEdges)
      nodesRef.current = nextNodes
      edgesRef.current = nextEdges
      setEdges(nextEdges)
      setNodes(nextNodes)
      // Focus the first empty modulation step so the user can pick its chord.
      setSelectedNodeId(selectedNodeId)
      setModulateOpen(false)
      centerOnNode(selectedNodeId)
    },
    [selectedNodeId, draftKey, setNodes, setEdges, centerOnNode],
  )

  const handleDelete = useCallback(() => {
    if (!selectedNodeId) return
    const nds = nodesRef.current
    const eds = edgesRef.current
    const tip = progressionTip(nds, eds)
    // Only the last node on the forward chain can be deleted for now.
    if (!tip || tip.id !== selectedNodeId) return

    if (tip.data?.isStart) {
      stopProgression({ silent: true })
      setIsPlaying(false)
      setPlayheadNodeId(null)
      playheadAtEndRef.current = false
      nodesRef.current = []
      edgesRef.current = []
      setNodes([])
      setEdges([])
      setSelectedNodeId(null)
      idCounter = 1
      clearProject(activeProjectIdRef.current).catch(() => {})
      return
    }

    const nextNodesRaw = nds.filter((n) => n.id !== selectedNodeId)
    const nextEdges = eds.filter(
      (e) => e.source !== selectedNodeId && e.target !== selectedNodeId,
    )
    const nextNodes = enrichNodes(nextNodesRaw, nextEdges)
    nodesRef.current = nextNodes
    edgesRef.current = nextEdges
    setEdges(nextEdges)
    setNodes(nextNodes)
    const newTip = progressionTip(nextNodes, nextEdges)
    setSelectedNodeId(newTip?.id ?? null)
  }, [selectedNodeId, setNodes, setEdges])

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      stopProgression({ silent: true })
      setIsPlaying(false)
      return
    }

    const steps = progressionPath(nodes, edges)
    if (!steps.length) return

    let fromIndex = 0
    if (playheadAtEndRef.current) {
      fromIndex = 0
    } else if (playheadNodeId) {
      const idx = steps.findIndex((s) => s.id === playheadNodeId)
      fromIndex = idx >= 0 ? idx : 0
    }

    startPlayback(fromIndex)
  }, [isPlaying, nodes, edges, playheadNodeId, startPlayback])

  const handleRestart = useCallback(() => {
    const steps = progressionPath(nodes, edges)
    const startIdLocal = steps[0]?.id ?? null
    stopProgression({ silent: true })
    playheadAtEndRef.current = false
    setIsPlaying(false)
    setPlayheadNodeId(startIdLocal)
  }, [nodes, edges])

  const handleExportMidi = useCallback(() => {
    const steps = progressionPath(nodes, edges)
    downloadMidi(steps, midiFilenameFromChords(steps.map((s) => s.chord)), { bpm })
  }, [nodes, edges, bpm])

  const applyLoadedProject = useCallback(
    (project) => {
      const loadedEdges = (project.edges || []).map((e) => ({
        ...defaultEdgeOptions,
        ...e,
      }))
      const loadedNodes = enrichNodes(
        withDurationDefaults(project.nodes || []),
        loadedEdges,
      )
      nodesRef.current = loadedNodes
      edgesRef.current = loadedEdges
      lastAutosaveSignatureRef.current = null
      setNodes(loadedNodes)
      setEdges(loadedEdges)
      if (project.draftKey) setDraftKey(project.draftKey)
      setSelectedNodeId(
        project.selectedNodeId ||
          loadedNodes.find((n) => n.data?.isStart)?.id ||
          loadedNodes[0]?.id ||
          null,
      )
      if (project.bpm != null) setBpm(clampBpm(project.bpm))
      if (typeof project.metronomeEnabled === 'boolean') {
        setMetronomeEnabled(project.metronomeEnabled)
      }
      if (project.metronomeType != null) {
        setMetronomeType(normalizeMetronomeType(project.metronomeType))
      }
      syncIdCounterFromNodes(loadedNodes)
      if (project.idCounter) idCounter = Math.max(idCounter, project.idCounter)
      setSaveStatus('Loaded')
    },
    [setNodes, setEdges],
  )

  const persistActiveGraph = useCallback(
    async (project) => {
      const id = activeProjectIdRef.current
      if (!id) return
      await saveProject(id, {
        nodes: serializeNodes(withDurationDefaults(project.nodes || [])),
        edges: serializeEdges(project.edges || []),
        draftKey: project.draftKey,
        idCounter: project.idCounter,
        bpm: project.bpm != null ? clampBpm(project.bpm) : DEFAULT_BPM,
        metronomeEnabled:
          typeof project.metronomeEnabled === 'boolean'
            ? project.metronomeEnabled
            : true,
        metronomeType: normalizeMetronomeType(
          project.metronomeType ?? metronomeType,
        ),
      })
      await refreshProjectsMeta()
    },
    [metronomeType, refreshProjectsMeta],
  )

  const handleSaveFile = useCallback(async () => {
    const id = activeProjectIdRef.current
    downloadProjectFile(
      {
        nodes: serializeNodes(nodes),
        edges: serializeEdges(edges),
        draftKey,
        idCounter,
        bpm,
        metronomeEnabled,
        metronomeType,
        name: projectName,
      },
      projectName
        ? `${projectName.replace(/[^\w\-]+/g, '-').replace(/^-|-$/g, '') || 'project'}.json`
        : projectFilenameFromNodes(nodes),
    )
    if (id) {
      try {
        await markProjectFileSaved(id)
        await refreshProjectsMeta()
      } catch (err) {
        console.error(err)
      }
    }
    setSaveStatus('Downloaded')
  }, [
    nodes,
    edges,
    draftKey,
    bpm,
    metronomeEnabled,
    metronomeType,
    projectName,
    refreshProjectsMeta,
  ])

  const handleLoadFile = useCallback(
    async (file) => {
      try {
        const project = await readProjectFile(file)
        applyLoadedProject(project)
        await persistActiveGraph(project)
      } catch (err) {
        console.error(err)
        setSaveStatus(err.message || 'Load failed')
      }
    },
    [applyLoadedProject, persistActiveGraph],
  )

  const handleImportMidi = useCallback(
    async (file) => {
      try {
        const { project, chordCount } = await readMidiFile(file)
        stopProgression({ silent: true })
        setIsPlaying(false)
        setPlayheadNodeId(null)
        playheadAtEndRef.current = false
        applyLoadedProject(project)
        await persistActiveGraph({
          ...project,
          metronomeEnabled: true,
          metronomeType,
        })
        setSaveStatus(`Imported ${chordCount} chord${chordCount === 1 ? '' : 's'}`)
      } catch (err) {
        console.error(err)
        setSaveStatus(err.message || 'Import failed')
      }
    },
    [applyLoadedProject, persistActiveGraph, metronomeType],
  )

  const handleReset = useCallback(() => {
    stopProgression({ silent: true })
    setIsPlaying(false)
    setPlayheadNodeId(null)
    playheadAtEndRef.current = false
    nodesRef.current = []
    edgesRef.current = []
    setNodes([])
    setEdges([])
    setSelectedNodeId(null)
    setBpm(DEFAULT_BPM)
    setMetronomeEnabled(true)
    setMetronomeType(DEFAULT_METRONOME_TYPE)
    setViewMode('graph')
    idCounter = 1
    clearProject(activeProjectIdRef.current).catch(() => {})
    lastAutosaveSignatureRef.current = null
    setSaveStatus('Cleared')
    setResetOpen(false)
  }, [setNodes, setEdges])

  const handleOpenProjects = useCallback(async () => {
    try {
      await autosaveRef.current?.flush?.()
    } catch {
      /* ignore */
    }
    await refreshProjectsMeta()
    setProjectPickerRequired(false)
    setProjectPickerOpen(true)
  }, [refreshProjectsMeta])

  const handleCreateProject = useCallback(
    async (name) => {
      try {
        await autosaveRef.current?.flush?.()
      } catch {
        /* ignore */
      }
      autosaveRef.current?.cancel?.()
      stopProgression({ silent: true })
      const project = await createProject(name)
      applyProjectRecord(project)
      await refreshProjectsMeta()
      setProjectPickerRequired(false)
      setProjectPickerOpen(false)
      setSaveStatus('Created')
    },
    [applyProjectRecord, refreshProjectsMeta],
  )

  const handleOpenProject = useCallback(
    async (id) => {
      if (id === activeProjectIdRef.current) {
        setProjectPickerOpen(false)
        setProjectPickerRequired(false)
        return
      }
      try {
        await autosaveRef.current?.flush?.()
      } catch {
        /* ignore */
      }
      autosaveRef.current?.cancel?.()
      stopProgression({ silent: true })
      const project = await openProject(id)
      applyProjectRecord(project)
      await refreshProjectsMeta()
      setProjectPickerRequired(false)
      setProjectPickerOpen(false)
      setSaveStatus('Restored')
    },
    [applyProjectRecord, refreshProjectsMeta],
  )

  const pathSteps = useMemo(() => progressionPath(nodes, edges), [nodes, edges])
  const canPlay = pathSteps.length > 0
  const tipNodeId = useMemo(
    () => progressionTip(nodes, edges)?.id ?? null,
    [nodes, edges],
  )
  const canDelete = Boolean(selectedNodeId && tipNodeId && selectedNodeId === tipNodeId)

  // Keep playhead on a valid path node when the graph changes
  useEffect(() => {
    if (!pathSteps.length) {
      setPlayheadNodeId(null)
      return
    }
    if (!playheadNodeId || !pathSteps.some((s) => s.id === playheadNodeId)) {
      setPlayheadNodeId(pathSteps[0].id)
      playheadAtEndRef.current = false
    }
  }, [pathSteps, playheadNodeId])

  const displayNodes = useMemo(
    () =>
      enrichNodes(nodes, edges).map((n) => ({
        ...n,
        // Keep RF visual selection in sync with app selection (single source of truth).
        selected: n.id === selectedNodeId,
        data: {
          ...n.data,
          playhead: n.id === playheadNodeId,
          playing: isPlaying && n.id === playheadNodeId,
        },
      })),
    [nodes, edges, playheadNodeId, isPlaying, selectedNodeId],
  )

  const paletteKey = hasStart
    ? selectedNode?.data?.key || selectedNode?.data?.modulateTo || draftKey
    : draftKey

  if (!hydrated) {
    return (
      <div className="app app--loading">
        <p>Loading…</p>
      </div>
    )
  }

  if (!activeProjectId) {
    return (
      <div className="app app--loading">
        <div className="app__glow app__glow--a" aria-hidden />
        <div className="app__glow app__glow--b" aria-hidden />
        <ProjectPickerModal
          open={projectPickerOpen || projectPickerRequired}
          required
          projects={projectsMeta}
          activeProjectId={null}
          onCreate={handleCreateProject}
          onOpen={handleOpenProject}
        />
      </div>
    )
  }

  return (
    <div className="app">
      <div className="app__glow app__glow--a" aria-hidden />
      <div className="app__glow app__glow--b" aria-hidden />

      <Toolbar
        hasStart={hasStart}
        canAddNode={hasStart}
        canDelete={canDelete}
        canPlay={canPlay}
        isPlaying={isPlaying}
        canRestart={canPlay}
        canExport={canPlay}
        canSave={hasStart}
        saveStatus={saveStatus}
        projectName={projectName}
        viewMode={viewMode}
        bpm={bpm}
        metronomeEnabled={metronomeEnabled}
        metronomeType={metronomeType}
        onAddNode={handleAddNode}
        onDelete={handleDelete}
        onTogglePlay={handleTogglePlay}
        onRestart={handleRestart}
        onExportMidi={handleExportMidi}
        onImportMidi={handleImportMidi}
        onSaveFile={handleSaveFile}
        onLoadFile={handleLoadFile}
        onProjects={handleOpenProjects}
        onReset={() => setResetOpen(true)}
        onViewModeChange={setViewMode}
        onBpmChange={(value) => setBpm(clampBpm(value))}
        onToggleMetronome={setMetronomeEnabled}
        onMetronomeTypeChange={(value) => setMetronomeType(normalizeMetronomeType(value))}
      />

      <ProjectPickerModal
        open={projectPickerOpen}
        required={projectPickerRequired}
        projects={projectsMeta}
        activeProjectId={activeProjectId}
        onCreate={handleCreateProject}
        onOpen={handleOpenProject}
        onCancel={() => {
          if (!projectPickerRequired) setProjectPickerOpen(false)
        }}
      />

      <ConfirmModal
        open={resetOpen}
        title="Reset progression?"
        message="This clears the graph for the current project. This can’t be undone."
        confirmLabel="Reset"
        cancelLabel="Cancel"
        onConfirm={handleReset}
        onCancel={() => setResetOpen(false)}
      />

      <ModulateModal
        open={modulateOpen}
        fromKey={selectedNode?.data?.key || draftKey}
        initialTarget={selectedNode?.data?.modulateTo || null}
        initialSetupLength={
          selectedNode?.data?.modulateRole === 'arrival' &&
          selectedNode?.data?.intent === 'modulate'
            ? 1
            : 2
        }
        onCancel={() => setModulateOpen(false)}
        onConfirm={handleStartModulate}
      />

      <div className="app__body">
        <ChordPalette
          onPick={handlePickChord}
          disabled={false}
          voicing={selectedVoicing}
          bassOctave={selectedBassOctave}
          showKeyPicker={
            !hasStart ||
            Boolean(selectedNode && selectedNode.data?.intent !== 'modulate')
          }
          homeKey={paletteKey}
          onHomeKeyChange={(key) => {
            setDraftKey(key)
            if (selectedNode && !selectedNode.data?.isStart) {
              setNodes((nds) =>
                enrichNodes(
                  nds.map((n) =>
                    n.id === selectedNodeId
                      ? {
                          ...n,
                          data: {
                            ...n.data,
                            key,
                            intent: 'stay',
                            modulateTo: null,
                          },
                        }
                      : n,
                  ),
                  edges,
                ),
              )
            }
          }}
          preferDiatonic
          title={!hasStart ? 'Choose a home key' : 'Chord palette'}
          subtitle={
            !hasStart
              ? `Pick ${formatKey(draftKey)}, then a starting chord`
              : selectedNode
                ? 'Click a chord to set or change the selected node'
                : 'Select a node, then pick a chord — or use suggestions'
          }
        />

        <main className="canvas-wrap">
          {!hasStart && viewMode === 'graph' && (
            <div className="canvas-empty">
              <p className="canvas-empty__lead">Start with a home key.</p>
              <p className="canvas-empty__sub">
                Choose tonic + mode on the left, then pick a chord (usually the tonic).
                New nodes inherit that key until you modulate.
              </p>
            </div>
          )}
          {viewMode === 'timing' ? (
            <TimingView
              steps={pathSteps}
              selectedNodeId={selectedNodeId}
              playheadNodeId={playheadNodeId}
              isPlaying={isPlaying}
              onSelectStep={handleSelectTimingStep}
              onDurationChange={handleDurationChange}
              onMeasureChange={handleMeasureChange}
            />
          ) : (
            <ReactFlow
              key={activeProjectId}
              nodes={displayNodes}
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onNodeDragStart={onNodeDragStart}
              onPaneClick={onPaneClick}
              onInit={(instance) => {
                flowRef.current = instance
              }}
              nodeTypes={nodeTypes}
              defaultEdgeOptions={defaultEdgeOptions}
              fitView
              fitViewOptions={{ padding: 0.35 }}
              selectionMode={SelectionMode.Partial}
              // Match thresholds so tiny pointer jitter can't land in the
              // "not a click, not a drag yet" dead zone that drops selection.
              nodeDragThreshold={5}
              nodeClickDistance={5}
              deleteKeyCode={null}
              proOptions={{ hideAttribution: true }}
              colorMode="light"
            >
              <Background gap={22} size={1} color="rgba(40, 32, 24, 0.08)" />
              <Controls showInteractive={false} />
              <MiniMap
                nodeStrokeWidth={2}
                pannable
                zoomable
                maskColor="rgba(28, 24, 20, 0.12)"
              />
            </ReactFlow>
          )}
        </main>

        <SuggestionPanel
          selectedNode={selectedNode}
          mode={mode}
          suggestions={suggestions}
          targetChord={target}
          homeKey={homeKey}
          intent={intent}
          modulateTo={modulateTo}
          modulateRole={modulateRole}
          voicing={selectedVoicing}
          bassOctave={selectedBassOctave}
          onVoicingChange={handleVoicingChange}
          onBassOctaveChange={handleBassOctaveChange}
          onAssign={assignChordToSelected}
          onOpenModulate={() => setModulateOpen(true)}
        />
      </div>
    </div>
  )
}
