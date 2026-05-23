import type { AiModel, AiModelCapability } from '../api/clientApi'

export type RatioOption = '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '3:2' | '2:3'
export type SizeTierOption = '1k' | '2k' | '4k'

export const ratioOptions: RatioOption[] = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3']
export const sizeTierOptions: SizeTierOption[] = ['1k', '2k', '4k']
export const quantityOptions = [1, 2, 3, 4]

export const sizeMap: Record<RatioOption, Record<SizeTierOption, string>> = {
  '1:1': { '1k': '1024x1024', '2k': '2048x2048', '4k': '2864x2864' },
  '16:9': { '1k': '1536x864', '2k': '2048x1152', '4k': '3840x2160' },
  '9:16': { '1k': '864x1536', '2k': '1152x2048', '4k': '2160x3840' },
  '4:3': { '1k': '1152x864', '2k': '2048x1536', '4k': '3328x2496' },
  '3:4': { '1k': '864x1152', '2k': '1536x2048', '4k': '2496x3328' },
  '3:2': { '1k': '1152x768', '2k': '2048x1360', '4k': '3504x2336' },
  '2:3': { '1k': '768x1152', '2k': '1360x2048', '4k': '2336x3504' },
}

export function getActiveModelsByCapability(models: AiModel[], capability: AiModelCapability) {
  return models.filter((model) => model.status === 'active' && model.capability === capability)
}

export function getModelLabel(model?: AiModel) {
  if (!model) {
    return '请选择模型'
  }

  return model.displayName || model.modelName
}

export function getSizeLabel(ratio: RatioOption, sizeTier: SizeTierOption) {
  return `${sizeTier.toUpperCase()} · ${sizeMap[ratio][sizeTier]}`
}

export function getModelPrice(model: AiModel | undefined, sizeTier: SizeTierOption) {
  if (!model) {
    return 0
  }

  if (sizeTier === '4k') return model.price4k
  if (sizeTier === '2k') return model.price2k
  return model.price1k
}

export function getRatioBoxStyle(ratio: RatioOption) {
  const [width, height] = ratio.split(':').map(Number)
  const max = 18
  const scale = max / Math.max(width, height)
  return {
    width: `${Math.max(7, width * scale)}px`,
    height: `${Math.max(7, height * scale)}px`,
  }
}
