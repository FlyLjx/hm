import {
  Clapperboard,
  Grid3X3,
  LayoutDashboard,
  MessageSquareText,
  Sparkles,
} from 'lucide-react'
import type { NavItem, PromptCategory, PromptItem, SideItem, WorkflowNode } from './types/app'

export const navItems: NavItem[] = [
  { id: 'chat', name: '对话生图' },
  { id: 'generate', name: 'AI 生图' },
  { id: 'plaza', name: '提示词广场' },
  { id: 'canvas', name: '工作流画布' },
  { id: 'video', name: '文生视频' },
]

export const sideItems: SideItem[] = [
  { id: 'chat', icon: MessageSquareText, label: '对话' },
  { id: 'generate', icon: Sparkles, label: '生图' },
  { id: 'plaza', icon: Grid3X3, label: '广场' },
  { id: 'canvas', icon: LayoutDashboard, label: '工作流' },
  { id: 'video', icon: Clapperboard, label: '视频' },
]

export const promptCategories: PromptCategory[] = [
  '热门',
  'GPT Image 2',
  '电商主图',
  '广告创意',
  '人像摄影',
  '海报插画',
  'UI 设计',
  '角色设定',
  '图像编辑',
  '视频分镜',
]

export const promptItems: PromptItem[] = [
  {
    id: 'gpt-image2-poster',
    title: '极简科技产品海报',
    category: 'GPT Image 2',
    model: 'GPT-Image-2',
    prompt:
      '一张高端科技产品海报，白色极简空间，透明玻璃质感设备，柔和蓝绿色边缘光，中心构图，留出中文标题区域，商业摄影质感。',
    color: 'blue',
    tags: ['产品', '海报', '科技感'],
    source: 'awesome-gpt-image-2',
  },
  {
    id: 'ecommerce-beauty',
    title: '美妆电商主图',
    category: '电商主图',
    model: 'GPT-Image-2',
    prompt:
      '电商平台美妆产品主图，洁白背景，粉色花瓣和水滴点缀，产品瓶身清晰可见，柔光棚拍，突出高级感和干净质感。',
    color: 'rose',
    tags: ['电商', '美妆', '主图'],
    source: 'image prompt pattern',
  },
  {
    id: 'ad-drink',
    title: '夏日饮料广告',
    category: '广告创意',
    model: 'GPT-Image-2',
    prompt:
      '夏日冰镇饮料广告画面，透明玻璃杯中有气泡和冰块，背景是明亮海边阳光，水花飞溅，画面清爽，有广告大片感。',
    color: 'green',
    tags: ['广告', '饮料', '清爽'],
    source: 'awesome-gpt-image-2',
  },
  {
    id: 'portrait-soft-light',
    title: '柔光人像写真',
    category: '人像摄影',
    model: 'GPT-4o',
    prompt:
      '半身人像写真，亚洲女性，柔和窗边自然光，浅色背景，真实皮肤质感，85mm 镜头，浅景深，干净高级。',
    color: 'warm',
    tags: ['人像', '写真', '自然光'],
    source: 'Awesome-GPT4o-Image-Prompts',
  },
  {
    id: 'poster-fantasy',
    title: '奇幻电影海报',
    category: '海报插画',
    model: '通用',
    prompt:
      '奇幻电影海报，一位旅人站在发光森林入口，远处有巨大的古代城堡，紫蓝色夜晚氛围，强烈纵深感，标题留白。',
    color: 'purple',
    tags: ['海报', '奇幻', '插画'],
    source: 'general prompt',
  },
  {
    id: 'ui-dashboard',
    title: 'SaaS 数据看板',
    category: 'UI 设计',
    model: 'GPT-Image-2',
    prompt:
      '现代 SaaS 数据分析看板 UI，浅色背景，左侧导航，卡片式指标，折线图和表格，界面简洁克制，适合企业后台。',
    color: 'blue',
    tags: ['UI', 'SaaS', '看板'],
    source: 'awesome-gpt-image-2',
  },
  {
    id: 'character-mecha',
    title: '机甲角色设定',
    category: '角色设定',
    model: 'GPT-Image-2',
    prompt:
      '科幻机甲角色设定图，正面站姿，机械装甲细节丰富，暗色背景，旁边有局部装备拆解图和材质说明，概念设计风格。',
    color: 'dark',
    tags: ['角色', '机甲', '设定'],
    source: 'awesome-gpt-image-2',
  },
  {
    id: 'edit-background',
    title: '商品背景替换',
    category: '图像编辑',
    model: 'GPT-Image-2',
    prompt:
      '保留原商品主体和边缘细节不变，将背景替换为浅米色高级室内场景，加入柔和阴影和自然反光，整体像商业摄影。',
    color: 'warm',
    tags: ['编辑', '换背景', '商品'],
    source: 'image-to-image workflow',
  },
  {
    id: 'video-shot-city',
    title: '城市航拍分镜',
    category: '视频分镜',
    model: '通用',
    prompt:
      '未来城市清晨航拍镜头，镜头从云层下降穿过高楼，阳光照射玻璃幕墙，银色飞行器从画面右侧进入，节奏缓慢。',
    color: 'blue',
    tags: ['视频', '分镜', '运镜'],
    source: 'image-to-video prompt',
  },
  {
    id: 'hot-game-logo',
    title: '游戏 LOGO 字效',
    category: '热门',
    model: '通用',
    prompt:
      '游戏标题 LOGO，中文大字，金属质感，暗紫色魔法光效，边缘有发光纹理，适合 RPG 游戏宣传图。',
    color: 'purple',
    tags: ['热门', 'LOGO', '游戏'],
    source: 'community prompts',
  },
]

export const promptCards = promptItems.slice(0, 6).map((item) => ({
  title: item.title,
  tag: item.category,
  color: item.color,
}))

export const initialWorkflowNodes: WorkflowNode[] = [
  {
    id: 'prompt',
    title: '提示词输入',
    desc: '未来城市雨夜，电影感，霓虹反光',
    kind: 'input',
    x: 180,
    y: 120,
  },
  {
    id: 'reference',
    title: '参考图',
    desc: '上传角色姿态和产品结构',
    kind: 'reference',
    x: 180,
    y: 360,
  },
  {
    id: 'model',
    title: '模型与风格',
    desc: '写实摄影 · 16:9 · 2K',
    kind: 'model',
    x: 520,
    y: 200,
  },
  {
    id: 'generate',
    title: '图片生成',
    desc: '根据提示词和参考图生成 4 张',
    kind: 'generate',
    x: 860,
    y: 210,
  },
  {
    id: 'upscale',
    title: '细节放大',
    desc: '选择最佳结果，提升清晰度',
    kind: 'upscale',
    x: 1180,
    y: 145,
  },
  {
    id: 'export',
    title: '导出作品',
    desc: 'PNG / JPG / 项目文件',
    kind: 'export',
    x: 1180,
    y: 385,
  },
]

export const workflowEdges = [
  ['prompt', 'model'],
  ['reference', 'model'],
  ['model', 'generate'],
  ['generate', 'upscale'],
  ['generate', 'export'],
]
