import {
  Eraser,
  FileImage,
  Image,
  ImageDown,
  Maximize2,
  MousePointer2,
  PenLine,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { initialWorkflowNodes, workflowEdges } from '../data'
import type { CanvasTool, Page, WorkflowNode, WorkflowNodeKind } from '../types/app'

type WorkflowCanvasPageProps = {
  setActivePage: (page: Page) => void
}

export function WorkflowCanvasPage({ setActivePage }: WorkflowCanvasPageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [tool, setTool] = useState<CanvasTool>('select')
  const [isDrawing, setIsDrawing] = useState(false)
  const [nodes, setNodes] = useState<WorkflowNode[]>(initialWorkflowNodes)
  const [selectedNodeId, setSelectedNodeId] = useState('generate')
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? nodes[0],
    [nodes, selectedNodeId],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const scale = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.floor(rect.width * scale)
    canvas.height = Math.floor(rect.height * scale)
    ctx.scale(scale, scale)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#4ade80'
    ctx.lineWidth = 3
  }, [])

  const getPoint = (event: PointerEvent<HTMLElement>) => {
    const shell = event.currentTarget.closest('.workflow-shell')
    const rect = shell?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
  }

  const startDrawing = (event: PointerEvent<HTMLCanvasElement>) => {
    if (tool === 'select') return

    const ctx = event.currentTarget.getContext('2d')
    if (!ctx) return

    const rect = event.currentTarget.getBoundingClientRect()
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over'
    ctx.lineWidth = tool === 'eraser' ? 18 : 3
    ctx.beginPath()
    ctx.moveTo(event.clientX - rect.left, event.clientY - rect.top)
    setIsDrawing(true)
  }

  const draw = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return

    const ctx = event.currentTarget.getContext('2d')
    if (!ctx) return

    const rect = event.currentTarget.getBoundingClientRect()
    ctx.lineTo(event.clientX - rect.left, event.clientY - rect.top)
    ctx.stroke()
  }

  const stopDrawing = () => setIsDrawing(false)

  const clearCanvas = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  const startNodeDrag = (event: PointerEvent<HTMLButtonElement>, node: WorkflowNode) => {
    if (tool !== 'select') return

    const point = getPoint(event)
    setSelectedNodeId(node.id)
    setDraggingNodeId(node.id)
    setDragOffset({ x: point.x - node.x, y: point.y - node.y })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const dragNode = (event: PointerEvent<HTMLButtonElement>) => {
    if (!draggingNodeId) return

    const point = getPoint(event)
    setNodes((current) =>
      current.map((node) =>
        node.id === draggingNodeId
          ? { ...node, x: point.x - dragOffset.x, y: point.y - dragOffset.y }
          : node,
      ),
    )
  }

  return (
    <section className="canvas-page">
      <div className="canvas-topbar">
        <button onClick={() => setActivePage('generate')} type="button">
          返回
        </button>
        <strong>工作流画布</strong>
        <div>
          <button type="button">保存模板</button>
          <button className="primary-small" type="button">
            运行工作流
          </button>
        </div>
      </div>

      <div className="workflow-shell">
        <WorkflowToolbar clearCanvas={clearCanvas} setTool={setTool} tool={tool} />
        <WorkflowLinks nodes={nodes} />

        <canvas
          className="drawing-canvas"
          onPointerDown={startDrawing}
          onPointerLeave={stopDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          ref={canvasRef}
        />

        {nodes.map((node) => (
          <button
            className={`workflow-node ${node.kind} ${selectedNodeId === node.id ? 'selected' : ''}`}
            key={node.id}
            onPointerDown={(event) => startNodeDrag(event, node)}
            onPointerMove={dragNode}
            onPointerUp={() => setDraggingNodeId(null)}
            style={{ left: node.x, top: node.y }}
            type="button"
          >
            <span className="node-icon">{getNodeIcon(node.kind)}</span>
            <span className="node-copy">
              <strong>{node.title}</strong>
              <small>{node.desc}</small>
            </span>
            <i className="node-port input-port" />
            <i className="node-port output-port" />
          </button>
        ))}

        <WorkflowPanel selectedNode={selectedNode} />
      </div>
    </section>
  )
}

function WorkflowToolbar({
  clearCanvas,
  setTool,
  tool,
}: {
  clearCanvas: () => void
  setTool: (tool: CanvasTool) => void
  tool: CanvasTool
}) {
  return (
    <div className="canvas-toolbox">
      <button
        className={tool === 'select' ? 'active' : ''}
        onClick={() => setTool('select')}
        title="选择节点"
        type="button"
      >
        <MousePointer2 size={17} aria-hidden="true" />
      </button>
      <button
        className={tool === 'brush' ? 'active' : ''}
        onClick={() => setTool('brush')}
        title="批注画笔"
        type="button"
      >
        <PenLine size={17} aria-hidden="true" />
      </button>
      <button
        className={tool === 'eraser' ? 'active' : ''}
        onClick={() => setTool('eraser')}
        title="橡皮擦"
        type="button"
      >
        <Eraser size={17} aria-hidden="true" />
      </button>
      <button onClick={clearCanvas} title="清空批注" type="button">
        <Trash2 size={17} aria-hidden="true" />
      </button>
    </div>
  )
}

function WorkflowLinks({ nodes }: { nodes: WorkflowNode[] }) {
  return (
    <svg className="workflow-links" aria-hidden="true">
      {workflowEdges.map(([from, to]) => {
        const start = nodes.find((node) => node.id === from)
        const end = nodes.find((node) => node.id === to)
        if (!start || !end) return null

        const x1 = start.x + 220
        const y1 = start.y + 58
        const x2 = end.x
        const y2 = end.y + 58
        const mid = (x1 + x2) / 2

        return (
          <path
            d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
            key={`${from}-${to}`}
          />
        )
      })}
    </svg>
  )
}

function WorkflowPanel({ selectedNode }: { selectedNode: WorkflowNode }) {
  return (
    <aside className="workflow-panel">
      <h2>{selectedNode.title}</h2>
      <p>{selectedNode.desc}</p>
      <div className="node-setting">
        <span>节点类型</span>
        <strong>{getNodeLabel(selectedNode.kind)}</strong>
      </div>
      <div className="node-setting">
        <span>运行状态</span>
        <strong>等待执行</strong>
      </div>
      <button className="primary-panel-button" type="button">
        运行此节点
      </button>
    </aside>
  )
}

function getNodeIcon(kind: WorkflowNodeKind) {
  if (kind === 'input') return <FileImage size={18} aria-hidden="true" />
  if (kind === 'reference') return <Image size={18} aria-hidden="true" />
  if (kind === 'model') return <SlidersHorizontal size={18} aria-hidden="true" />
  if (kind === 'generate') return <Sparkles size={18} aria-hidden="true" />
  if (kind === 'upscale') return <Maximize2 size={18} aria-hidden="true" />
  return <ImageDown size={18} aria-hidden="true" />
}

function getNodeLabel(kind: WorkflowNodeKind) {
  const labels: Record<WorkflowNodeKind, string> = {
    input: '输入',
    reference: '参考',
    model: '模型',
    generate: '生成',
    upscale: '放大',
    export: '导出',
  }

  return labels[kind]
}
