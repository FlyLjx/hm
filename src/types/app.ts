import type { LucideIcon } from 'lucide-react'

export type Page = 'chat' | 'generate' | 'plaza' | 'canvas' | 'video'

export type CanvasTool = 'select' | 'brush' | 'eraser'

export type WorkflowNodeKind = 'input' | 'reference' | 'model' | 'generate' | 'upscale' | 'export'

export type WorkflowNode = {
  id: string
  title: string
  desc: string
  kind: WorkflowNodeKind
  x: number
  y: number
}

export type NavItem = {
  id: Page
  name: string
}

export type SideItem = {
  id: Page
  icon: LucideIcon
  label: string
}

export type PromptCategory =
  | '热门'
  | 'GPT Image 2'
  | '电商主图'
  | '广告创意'
  | '人像摄影'
  | '海报插画'
  | 'UI 设计'
  | '角色设定'
  | '图像编辑'
  | '视频分镜'

export type PromptItem = {
  id: string
  title: string
  category: PromptCategory
  model: 'GPT-Image-2' | 'GPT-4o' | '通用'
  prompt: string
  color: string
  tags: string[]
  source: string
}
