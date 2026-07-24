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
import ConfirmModal from './components/ConfirmModal.jsx'
import ModulateModal from './components/ModulateModal.jsx'
import { formatChord } from './theory/chords.js'
import { createKey, formatKey } from './theory/keys.js'
import {
  previousChord,
  previousKey,
  startChord,
  startNodeId,
  suggest,
  suggestionModeForNode,
} from './theory/suggest.js'
import { playProgression, setBalancedVoicing } from './audio/playChord.js'
import { clearProject, createAutosave, loadProject, saveProject } from './storage/db.js'
import {
  downloadProjectFile,
  projectFilenameFromNodes,
  readProjectFile,
} from './storage/file.js'
import { downloadMidi, midiFilenameFromChords } from './midi/exportMidi.js'

const nodeTypes = { chord: ChordNode }

const defaultEdgeOptions = {
  markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
  style: { strokeWidth: 2 },
  animated: false,
}

let idCounter = 1
function nextId() {
  idCounter += 1
  return `n${idCounter}`
}

function syncIdCounterFromNodes(nodes) {
  let max = 1
  for (const n of nodes) {
    const m = /^n(\d+)$/.exec(n.id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  idCounter = max
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

/** Walk from start along first outgoing edge. */
function progressionPath(nodes, edges) {
  const start = nodes.find((n) => n.data?.isStart)
  const startChordValue = nodeChord(start)
  if (!startChordValue) return []

  const chords = [startChordValue]
  const visited = new Set([start.id])
  let current = start.id

  while (true) {
    const out = edges.find((e) => e.source === current)
    if (!out) break
    if (out.target === start.id) break
    if (visited.has(out.target)) break
    visited.add(out.target)
    const next = nodes.find((n) => n.id === out.target)
    const chord = nodeChord(next)
    if (!chord) break
    chords.push(chord)
    current = out.target
  }

  return chords
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
  const [balancedVoicing, setBalancedVoicingState] = useState(true)
  const [draftKey, setDraftKey] = useState(() => createKey(0, 'major'))
  const [hydrated, setHydrated] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const [resetOpen, setResetOpen] = useState(false)
  const [modulateOpen, setModulateOpen] = useState(false)
  const autosaveRef = useRef(null)

  useEffect(() => {
    autosaveRef.current = createAutosave(async (payload) => {
      await saveProject(payload)
      setSaveStatus('Saved')
    }, 220)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const project = await loadProject()
        if (cancelled) return
        if (project) {
          const loadedNodes = enrichNodes(project.nodes || [], project.edges || [])
          setNodes(loadedNodes)
          setEdges(
            (project.edges || []).map((e) => ({
              ...defaultEdgeOptions,
              ...e,
            })),
          )
          if (project.draftKey) setDraftKey(project.draftKey)
          if (typeof project.balancedVoicing === 'boolean') {
            setBalancedVoicingState(project.balancedVoicing)
            setBalancedVoicing(project.balancedVoicing)
          }
          if (project.selectedNodeId) setSelectedNodeId(project.selectedNodeId)
          syncIdCounterFromNodes(loadedNodes)
          if (project.idCounter) idCounter = Math.max(idCounter, project.idCounter)
          setSaveStatus('Restored')
        }
      } catch (err) {
        console.error('Failed to load project', err)
      } finally {
        if (!cancelled) setHydrated(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [setNodes, setEdges])

  useEffect(() => {
    if (!hydrated || !autosaveRef.current) return
    setSaveStatus('Saving…')
    autosaveRef.current.queue({
      nodes: serializeNodes(nodes),
      edges: serializeEdges(edges),
      draftKey,
      balancedVoicing,
      selectedNodeId,
      idCounter,
    })
  }, [nodes, edges, draftKey, balancedVoicing, selectedNodeId, hydrated])

  const handleToggleVoicing = useCallback((enabled) => {
    setBalancedVoicingState(enabled)
    setBalancedVoicing(enabled)
  }, [])

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
      setEdges((eds) => {
        const next = addEdge(
          {
            ...connection,
            ...defaultEdgeOptions,
            id: `e-${connection.source}-${connection.target}-${eds.length}`,
          },
          eds,
        )
        setNodes((nds) => enrichNodes(nds, next))
        return next
      })
    },
    [setEdges, setNodes],
  )

  const onSelectionChange = useCallback(({ nodes: sel }) => {
    setSelectedNodeId(sel[0]?.id ?? null)
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
            isStart: true,
            mode: null,
            targetSymbol: '',
          },
        }
        idCounter = 1
        setNodes([start])
        setEdges([])
        setSelectedNodeId('n1')
        return
      }

      if (!selectedNodeId) return
      assignChordToSelected(chord)
    },
    [hasStart, draftKey, selectedNodeId, assignChordToSelected, setNodes, setEdges],
  )

  const handleAddNode = useCallback(() => {
    if (!hasStart) return
    const sourceId = selectedNodeId || startId
    const source = nodes.find((n) => n.id === sourceId)
    if (!source) return

    const inheritedKey = source.data?.key ?? draftKey
    const id = nextId()
    const newNode = {
      id,
      type: 'chord',
      position: {
        x: source.position.x + 220,
        y: source.position.y + (nodes.length % 2 === 0 ? 40 : -40),
      },
      data: {
        chord: null,
        key: inheritedKey,
        intent: 'stay',
        modulateTo: null,
        modulateFromKey: null,
        modulateRole: null,
        isStart: false,
        mode: 'build',
        targetSymbol: '',
      },
    }

    setEdges((eds) => {
      const nextEdges = [
        ...eds,
        {
          id: `e-${sourceId}-${id}`,
          source: sourceId,
          target: id,
          ...defaultEdgeOptions,
        },
      ]
      setNodes((nds) => enrichNodes([...nds, newNode], nextEdges))
      return nextEdges
    })
    setSelectedNodeId(id)
  }, [hasStart, selectedNodeId, startId, nodes, draftKey, setNodes, setEdges])

  const handleClearChord = useCallback(() => {
    if (!selectedNodeId) return
    const node = nodes.find((n) => n.id === selectedNodeId)
    if (node?.data?.isStart) return
    setNodes((nds) => {
      const next = nds.map((n) =>
        n.id === selectedNodeId
          ? {
              ...n,
              data: {
                ...n.data,
                chord: null,
                intent: 'stay',
                modulateTo: null,
                modulateFromKey: null,
                modulateRole: null,
              },
            }
          : n,
      )
      return enrichNodes(next, edges)
    })
  }, [selectedNodeId, nodes, edges, setNodes])

  const handleStayInKey = useCallback(() => {
    if (!selectedNodeId) return
    setNodes((nds) => {
      const next = nds.map((n) => {
        if (n.id !== selectedNodeId) return n
        return {
          ...n,
          data: {
            ...n.data,
            intent: 'stay',
            modulateTo: null,
            modulateFromKey: null,
            modulateRole: null,
          },
        }
      })
      return enrichNodes(next, edges)
    })
  }, [selectedNodeId, edges, setNodes])

  const handleStartModulate = useCallback(
    ({ key: targetKey, setupLength }) => {
      if (!selectedNodeId || !targetKey) return
      const source = nodes.find((n) => n.id === selectedNodeId)
      if (!source) return

      const fromKey = source.data?.modulateFromKey || source.data?.key || draftKey
      const length = Math.min(3, Math.max(1, setupLength || 1))

      const chainIds = [selectedNodeId]
      for (let i = 1; i < length; i++) {
        chainIds.push(nextId())
      }

      const newNodes = []
      const newEdges = []
      for (let i = 1; i < length; i++) {
        const id = chainIds[i]
        const prevId = chainIds[i - 1]
        const prevPos =
          i === 1
            ? source.position
            : newNodes[i - 2].position
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

      setEdges((eds) => {
        const nextEdges = [...eds, ...newEdges]
        setNodes((nds) => {
          const updated = nds.map((n) => {
            if (n.id !== selectedNodeId) return n
            return {
              ...n,
              data: {
                ...n.data,
                intent: 'modulate',
                modulateTo: targetKey,
                modulateFromKey: fromKey,
                modulateRole: length === 1 ? 'arrival' : 'setup',
                key: length === 1 ? targetKey : fromKey,
              },
            }
          })
          return enrichNodes([...updated, ...newNodes], nextEdges)
        })
        return nextEdges
      })

      setSelectedNodeId(selectedNodeId)
      setModulateOpen(false)
    },
    [selectedNodeId, nodes, draftKey, setNodes, setEdges],
  )

  const handleDelete = useCallback(() => {
    if (!selectedNodeId) return
    const node = nodes.find((n) => n.id === selectedNodeId)
    if (node?.data?.isStart) {
      setNodes([])
      setEdges([])
      setSelectedNodeId(null)
      idCounter = 1
      clearProject().catch(() => {})
      return
    }
    setNodes((nds) => {
      const next = nds.filter((n) => n.id !== selectedNodeId)
      const nextEdges = edges.filter(
        (e) => e.source !== selectedNodeId && e.target !== selectedNodeId,
      )
      setEdges(nextEdges)
      return enrichNodes(next, nextEdges)
    })
    setSelectedNodeId(null)
  }, [selectedNodeId, nodes, edges, setNodes, setEdges])

  const handlePlay = useCallback(() => {
    playProgression(progressionPath(nodes, edges))
  }, [nodes, edges])

  const handleExportMidi = useCallback(() => {
    const path = progressionPath(nodes, edges)
    downloadMidi(path, midiFilenameFromChords(path))
  }, [nodes, edges])

  const applyLoadedProject = useCallback(
    (project) => {
      const loadedNodes = enrichNodes(project.nodes || [], project.edges || [])
      setNodes(loadedNodes)
      setEdges(
        (project.edges || []).map((e) => ({
          ...defaultEdgeOptions,
          ...e,
        })),
      )
      if (project.draftKey) setDraftKey(project.draftKey)
      if (typeof project.balancedVoicing === 'boolean') {
        setBalancedVoicingState(project.balancedVoicing)
        setBalancedVoicing(project.balancedVoicing)
      }
      setSelectedNodeId(project.selectedNodeId || null)
      syncIdCounterFromNodes(loadedNodes)
      if (project.idCounter) idCounter = Math.max(idCounter, project.idCounter)
      setSaveStatus('Loaded')
    },
    [setNodes, setEdges],
  )

  const handleSaveFile = useCallback(() => {
    downloadProjectFile(
      {
        nodes: serializeNodes(nodes),
        edges: serializeEdges(edges),
        draftKey,
        balancedVoicing,
        selectedNodeId,
        idCounter,
      },
      projectFilenameFromNodes(nodes),
    )
    setSaveStatus('Downloaded')
  }, [nodes, edges, draftKey, balancedVoicing, selectedNodeId])

  const handleLoadFile = useCallback(
    async (file) => {
      try {
        const project = await readProjectFile(file)
        applyLoadedProject(project)
        await saveProject({
          nodes: serializeNodes(project.nodes || []),
          edges: serializeEdges(project.edges || []),
          draftKey: project.draftKey,
          balancedVoicing: project.balancedVoicing,
          selectedNodeId: project.selectedNodeId,
          idCounter: project.idCounter,
        })
      } catch (err) {
        console.error(err)
        setSaveStatus(err.message || 'Load failed')
      }
    },
    [applyLoadedProject],
  )

  const handleReset = useCallback(() => {
    setNodes([])
    setEdges([])
    setSelectedNodeId(null)
    idCounter = 1
    clearProject().catch(() => {})
    setSaveStatus('Cleared')
    setResetOpen(false)
  }, [setNodes, setEdges])

  const handleLoopToStart = useCallback(() => {
    if (!selectedNodeId || !startId || selectedNodeId === startId) return
    const exists = edges.some((e) => e.source === selectedNodeId && e.target === startId)
    if (exists) return
    setEdges((eds) => {
      const next = [
        ...eds,
        {
          id: `e-${selectedNodeId}-${startId}-loop`,
          source: selectedNodeId,
          target: startId,
          ...defaultEdgeOptions,
          animated: true,
        },
      ]
      setNodes((nds) => enrichNodes(nds, next))
      return next
    })
  }, [selectedNodeId, startId, edges, setEdges, setNodes])

  const pathChords = useMemo(() => progressionPath(nodes, edges), [nodes, edges])
  const canPlay = pathChords.length > 0
  const canLoopToStart =
    Boolean(selectedNode) &&
    !selectedNode.data?.isStart &&
    mode === 'build' &&
    Boolean(startId)
  const displayNodes = useMemo(() => enrichNodes(nodes, edges), [nodes, edges])

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

  return (
    <div className="app">
      <div className="app__glow app__glow--a" aria-hidden />
      <div className="app__glow app__glow--b" aria-hidden />

      <Toolbar
        hasStart={hasStart}
        canAddNode={hasStart}
        canDelete={Boolean(selectedNodeId)}
        canPlay={canPlay}
        canExport={canPlay}
        canSave={hasStart}
        balancedVoicing={balancedVoicing}
        saveStatus={saveStatus}
        onToggleVoicing={handleToggleVoicing}
        onAddNode={handleAddNode}
        onDelete={handleDelete}
        onPlay={handlePlay}
        onExportMidi={handleExportMidi}
        onSaveFile={handleSaveFile}
        onLoadFile={handleLoadFile}
        onReset={() => setResetOpen(true)}
      />

      <ConfirmModal
        open={resetOpen}
        title="Reset progression?"
        message="This clears the graph and saved project. This can’t be undone."
        confirmLabel="Reset"
        cancelLabel="Cancel"
        onConfirm={handleReset}
        onCancel={() => setResetOpen(false)}
      />

      <ModulateModal
        open={modulateOpen}
        fromKey={
          selectedNode?.data?.modulateFromKey ||
          selectedNode?.data?.key ||
          draftKey
        }
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
          {!hasStart && (
            <div className="canvas-empty">
              <p className="canvas-empty__lead">Start with a home key.</p>
              <p className="canvas-empty__sub">
                Choose tonic + mode on the left, then pick a chord (usually the tonic).
                New nodes inherit that key until you modulate.
              </p>
            </div>
          )}
          <ReactFlow
            nodes={displayNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            fitView
            fitViewOptions={{ padding: 0.35 }}
            selectionMode={SelectionMode.Partial}
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
          onAssign={assignChordToSelected}
          onClearChord={handleClearChord}
          onPlay={handlePlay}
          onLoopToStart={handleLoopToStart}
          canLoopToStart={canLoopToStart}
          onStayInKey={handleStayInKey}
          onOpenModulate={() => setModulateOpen(true)}
        />
      </div>
    </div>
  )
}
