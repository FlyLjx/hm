export function formatAmount(value, digits = 3) {
  return Number(value || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
}

export function formatCurrency(value) {
  return Number(value || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', {
    hour12: false,
    timeZone: 'Asia/Shanghai',
  })
}

export function resolveAssetUrl(url) {
  if (!url) return ''
  if (url.startsWith('/')) return url
  return url
}

export function resolveOriginalImageUrl(url) {
  return resolveAssetUrl(url).replace('/thumbnails/', '/images/')
}

export function resolveThumbnailImageUrl(url) {
  return resolveAssetUrl(url).replace('/images/', '/thumbnails/')
}
