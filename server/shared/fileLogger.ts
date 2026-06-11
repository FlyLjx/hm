import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { env } from '../config/env.js'

const logDir = resolve(process.env.LOG_DIR || join(process.cwd(), 'logs'))
let installed = false

function ensureLogDir() {
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })
}

function logFileName(date = new Date()) {
  return `app-${date.toISOString().slice(0, 10)}.log`
}

function logFilePath(date = new Date()) {
  return join(logDir, logFileName(date))
}

function serializeArg(value: unknown) {
  if (value instanceof Error) return value.stack || value.message
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function writeLine(level: string, args: unknown[]) {
  try {
    ensureLogDir()
    const line = `${new Date().toISOString()} [${level}] ${args.map(serializeArg).join(' ')}\n`
    appendFileSync(logFilePath(), line, 'utf8')
  } catch {
    // Logging must never break the app.
  }
}

export function installFileLogger() {
  if (installed) return
  installed = true
  ensureLogDir()
  ;(['log', 'info', 'warn', 'error'] as const).forEach((method) => {
    const original = console[method].bind(console)
    console[method] = (...args: unknown[]) => {
      writeLine(method.toUpperCase(), args)
      original(...args)
    }
  })
  console.info('[file-logger] enabled', { logDir, port: env.port })
}

export function listLogFiles() {
  ensureLogDir()
  return readdirSync(logDir)
    .filter((name) => /^app-\d{4}-\d{2}-\d{2}\.log$/.test(name))
    .map((name) => {
      const path = join(logDir, name)
      const stats = statSync(path)
      return {
        name,
        size: stats.size,
        updatedAt: stats.mtime.toISOString(),
      }
    })
    .sort((left, right) => right.name.localeCompare(left.name))
}

export function readLogFile(inputName?: string, maxBytes = 300_000) {
  ensureLogDir()
  const name = basename(inputName || logFileName())
  if (!/^app-\d{4}-\d{2}-\d{2}\.log$/.test(name)) {
    return { name, content: '', size: 0, truncated: false }
  }
  const path = join(logDir, name)
  if (!existsSync(path)) {
    return { name, content: '', size: 0, truncated: false }
  }
  const stats = statSync(path)
  const start = Math.max(0, stats.size - maxBytes)
  const buffer = readFileSync(path)
  return {
    name,
    content: buffer.subarray(start).toString('utf8'),
    size: stats.size,
    truncated: start > 0,
  }
}

export function readLogFileSince(inputName?: string, offset = 0, maxBytes = 200_000) {
  ensureLogDir()
  const name = basename(inputName || logFileName())
  if (!/^app-\d{4}-\d{2}-\d{2}\.log$/.test(name)) {
    return { name, content: '', size: 0, offset: 0, truncated: false }
  }
  const path = join(logDir, name)
  if (!existsSync(path)) {
    return { name, content: '', size: 0, offset: 0, truncated: false }
  }
  const stats = statSync(path)
  const safeOffset = Math.max(0, Math.min(Number(offset) || 0, stats.size))
  const availableBytes = stats.size - safeOffset
  const bytesToRead = Math.min(availableBytes, maxBytes)
  if (bytesToRead <= 0) {
    return { name, content: '', size: stats.size, offset: stats.size, truncated: false }
  }
  const buffer = readFileSync(path)
  const start = stats.size - safeOffset > maxBytes ? stats.size - maxBytes : safeOffset
  return {
    name,
    content: buffer.subarray(start, stats.size).toString('utf8'),
    size: stats.size,
    offset: stats.size,
    truncated: start > safeOffset,
  }
}
