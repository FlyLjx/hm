import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

type BuildInfoFile = {
  buildId?: string
  builtAt?: string
  gitCommit?: string
  generationPolicy?: string
}

const startedAt = new Date().toISOString()
const fallbackBuildInfo: Required<BuildInfoFile> = {
  buildId: process.env.BUILD_ID || 'development',
  builtAt: process.env.BUILD_TIME || '',
  gitCommit: process.env.GIT_COMMIT || '',
  generationPolicy: 'url-only-no-fallback-v2',
}

function readBuildInfoFile(): BuildInfoFile {
  const candidates = [
    join(process.cwd(), 'build-info.json'),
    join(process.cwd(), 'dist-server', 'build-info.json'),
  ]
  for (const path of candidates) {
    if (!existsSync(path)) continue
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as BuildInfoFile
    } catch {
      return {}
    }
  }
  return {}
}

const fileBuildInfo = readBuildInfoFile()

export const runtimeBuildInfo = {
  status: 'ok',
  buildId: fileBuildInfo.buildId || fallbackBuildInfo.buildId,
  builtAt: fileBuildInfo.builtAt || fallbackBuildInfo.builtAt,
  gitCommit: fileBuildInfo.gitCommit || fallbackBuildInfo.gitCommit,
  generationPolicy: fileBuildInfo.generationPolicy || fallbackBuildInfo.generationPolicy,
  pid: process.pid,
  startedAt,
}
