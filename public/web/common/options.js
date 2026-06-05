export const ratioOptions = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3']
export const sizeTierOptions = ['1k', '2k', '4k']
export const quantityOptions = [1, 2, 3, 4]

export const sizeMap = {
  '1:1': { '1k': '1024x1024', '2k': '2048x2048', '4k': '3072x3072' },
  '16:9': { '1k': '1536x864', '2k': '2048x1152', '4k': '3072x1728' },
  '9:16': { '1k': '864x1536', '2k': '1152x2048', '4k': '1728x3072' },
  '4:3': { '1k': '1152x864', '2k': '2048x1536', '4k': '3072x2304' },
  '3:4': { '1k': '864x1152', '2k': '1536x2048', '4k': '2304x3072' },
  '3:2': { '1k': '1152x768', '2k': '2048x1360', '4k': '3072x2048' },
  '2:3': { '1k': '768x1152', '2k': '1360x2048', '4k': '2048x3072' },
}

export function getSizeForRatio(ratio, sizeTier) {
  return sizeMap[ratio]?.[sizeTier] || `${sizeTier.toUpperCase()} · ${ratio}`
}

export function getActiveModelsByCapability(models, capability = 'chat_image') {
  return models.filter((model) => model.status === 'active' && model.capability === capability)
}

export function getAvailableRatioOptions(model) {
  if (model?.providerType !== 'custom' || !model.variants?.length) return ratioOptions
  const available = new Set(model.variants.map((item) => item.ratio).filter(Boolean))
  if (available.size === 0) return ratioOptions
  const defaults = ratioOptions.filter((ratio) => available.has(ratio))
  const custom = [...available].filter((ratio) => !ratioOptions.includes(ratio))
  return [...defaults, ...custom]
}

export function getAvailableSizeTierOptions(model, ratio) {
  if (model?.providerType !== 'custom' || !model.variants?.length) return sizeTierOptions
  const available = new Set(
    model.variants
      .filter((item) => item.ratio === ratio)
      .map((item) => item.sizeTier)
      .filter((item) => sizeTierOptions.includes(item)),
  )
  if (available.size === 0) return sizeTierOptions
  return sizeTierOptions.filter((item) => available.has(item))
}

export function getModelLabel(model) {
  return model ? model.displayName || model.modelName : '请选择模型'
}

export function getModelPrice(model, sizeTier) {
  if (!model) return 0
  if (sizeTier === '4k') return Number(model.price4k || 0)
  if (sizeTier === '2k') return Number(model.price2k || 0)
  return Number(model.price1k || 0)
}

export function getModelVariantPrice(model, ratio, sizeTier) {
  if (!model) return 0
  if (model.providerType !== 'custom' || !model.variants?.length) return getModelPrice(model, sizeTier)
  const variant =
    model.variants.find((item) => item.ratio === ratio && item.sizeTier === sizeTier) ||
    model.variants.find((item) => item.ratio === ratio) ||
    model.variants.find((item) => item.sizeTier === sizeTier)
  if (!variant) return getModelPrice(model, sizeTier)
  if (variant.sizeTier === '4k') return Number(variant.price4k || 0)
  if (variant.sizeTier === '2k') return Number(variant.price2k || 0)
  return Number(variant.price1k || 0)
}
