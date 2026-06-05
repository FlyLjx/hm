import type { Request } from 'express'

function firstHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0]
  return value
}

function normalizeIp(value?: string | null) {
  if (!value) return ''

  let ip = value.trim()
  if (!ip || ip.toLowerCase() === 'unknown') return ''

  const forwardedMatch = ip.match(/(?:^|[;,]\s*)for=(?:"?\[?)([^";,\]]+)/i)
  if (forwardedMatch?.[1]) {
    ip = forwardedMatch[1].trim()
  }

  if (ip.includes(',')) {
    ip = ip.split(',')[0]?.trim() ?? ''
  }

  if (ip.startsWith('[')) {
    const end = ip.indexOf(']')
    if (end > 0) ip = ip.slice(1, end)
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip)) {
    ip = ip.replace(/:\d+$/, '')
  }

  if (ip.startsWith('::ffff:')) {
    ip = ip.slice('::ffff:'.length)
  }

  if (ip === '::1') return '127.0.0.1'
  return ip
}

export function getRequestIp(req: Request) {
  const candidates = [
    firstHeaderValue(req.headers['cf-connecting-ip']),
    firstHeaderValue(req.headers['x-real-ip']),
    firstHeaderValue(req.headers['x-forwarded-for']),
    firstHeaderValue(req.headers.forwarded),
    req.ip,
    req.socket.remoteAddress,
  ]

  for (const candidate of candidates) {
    const ip = normalizeIp(candidate)
    if (ip) return ip
  }

  return ''
}
