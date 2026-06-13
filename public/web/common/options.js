export const ratioOptions = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3']
export const sizeTierOptions = ['1k', '2k', '4k']
export const quantityOptions = [1, 2, 3, 4]

export const sizeMap = {
  '1:1': { '1k': '1024x1024', '2k': '2048x2048', '4k': '3072x3072' },
  '16:9': { '1k': '1536x864', '2k': '2048x1152', '4k': '3072x1728' },
  '9:16': { '1k': '864x1536', '2k': '1152x2048', '4k': '1728x3072' },
  '4:3': { '1k': '1536x1152', '2k': '2048x1536', '4k': '3072x2304' },
  '3:4': { '1k': '1152x1536', '2k': '1536x2048', '4k': '2304x3072' },
  '3:2': { '1k': '1536x1024', '2k': '2048x1360', '4k': '3072x2048' },
  '2:3': { '1k': '1024x1536', '2k': '1360x2048', '4k': '2048x3072' },
}

export function getSizeForRatio(ratio, sizeTier) {
  return sizeMap[ratio]?.[sizeTier] || `${sizeTier.toUpperCase()} · ${ratio}`
}

export function getActiveModelsByCapability(models, capability = 'chat_image') {
  return models
    .filter((model) => model.status === 'active' && model.capability === capability)
    .sort((a, b) => {
      const sortDiff = Number(a.sortOrder ?? 100) - Number(b.sortOrder ?? 100)
      if (sortDiff !== 0) return sortDiff
      return getModelLabel(a).localeCompare(getModelLabel(b), 'zh-CN')
    })
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
  const modelEnabled = Array.isArray(model?.enabledSizeTiers) && model.enabledSizeTiers.length
    ? model.enabledSizeTiers.filter((item) => sizeTierOptions.includes(item))
    : sizeTierOptions
  const baseEnabled = modelEnabled.length ? modelEnabled : sizeTierOptions
  if (model?.providerType !== 'custom' || !model.variants?.length) return sizeTierOptions.filter((item) => baseEnabled.includes(item))
  const available = new Set(
    model.variants
      .filter((variant) => {
        const tier = variant.sizeTier
        const variantEnabled = Array.isArray(variant.enabledSizeTiers) && variant.enabledSizeTiers.length
          ? variant.enabledSizeTiers
          : sizeTierOptions
        return variant.ratio === ratio && sizeTierOptions.includes(tier) && variantEnabled.includes(tier)
      })
      .map((variant) => variant.sizeTier),
  )
  if (available.size === 0) return sizeTierOptions.filter((item) => baseEnabled.includes(item))
  return sizeTierOptions.filter((item) => baseEnabled.includes(item) && available.has(item))
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
