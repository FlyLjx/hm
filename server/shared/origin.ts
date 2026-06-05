import type { Request } from 'express'

export function getRequestOrigin(req: Request) {
  const forwardedProto = req.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const proto = forwardedProto || req.protocol
  const host = req.get('x-forwarded-host') || req.get('host')
  if (!host) return ''
  return `${proto}://${host}`.replace(/\/$/, '')
}
