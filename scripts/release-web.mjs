import { copyFile, cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = resolve(rootDir, 'release', 'web')
const archivePath = resolve(rootDir, 'release', 'web.zip')

function isInside(parent, target) {
  const path = relative(parent, target)
  return path && !path.startsWith('..') && !resolve(path).startsWith(resolve(path).root)
}

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? rootDir,
      stdio: 'inherit',
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolveRun()
      else reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}`))
    })
  })
}

function runQuiet(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: 'pipe',
    })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolveRun(output)
      else reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}\n${output}`))
    })
  })
}

async function buildServer() {
  await run(process.execPath, [
    resolve(rootDir, 'node_modules', 'typescript', 'bin', 'tsc'),
    '-p',
    'tsconfig.server.json',
  ])
}

async function copyRequired(source, target) {
  const sourcePath = resolve(rootDir, source)
  const targetPath = resolve(releaseDir, target)
  if (!existsSync(sourcePath)) {
    throw new Error(`Missing required path: ${source}`)
  }
  await mkdir(dirname(targetPath), { recursive: true })
  await cp(sourcePath, targetPath, { recursive: true })
}

async function copyOptional(source, target) {
  const sourcePath = resolve(rootDir, source)
  if (!existsSync(sourcePath)) return
  await copyRequired(source, target)
}

async function main() {
  if (!isInside(rootDir, releaseDir)) {
    throw new Error(`Refusing to clean unsafe release directory: ${releaseDir}`)
  }

  console.log('> Building server')
  await buildServer()

  console.log('> Preparing release/web')
  await rm(releaseDir, { recursive: true, force: true })
  await mkdir(releaseDir, { recursive: true })

  await copyRequired('dist-server', 'dist-server')
  await copyRequired('public', 'public')
  await copyRequired('scripts/check-release.mjs', 'scripts/check-release.mjs')
  await copyRequired('package.json', 'package.json')
  await copyRequired('package-lock.json', 'package-lock.json')
  await copyOptional('sync-legacy-user-passwords.sh', 'sync-legacy-user-passwords.sh')

  await writeBuildInfo()
  await writeFile(resolve(releaseDir, '.env.example'), envExample(), 'utf8')
  await writeFile(resolve(releaseDir, 'README_DEPLOY.md'), deployReadme(), 'utf8')
  await writeFile(resolve(releaseDir, 'start-web.sh'), startShell(), 'utf8')
  await writeFile(resolve(releaseDir, 'start-web.bat'), startBat(), 'utf8')

  console.log('> Creating release/web.zip')
  await createArchive()

  console.log('')
  console.log(`Release ready: ${releaseDir}`)
  console.log(`Archive ready: ${archivePath}`)
  console.log('Upload the contents of release/web to your server, then follow README_DEPLOY.md.')
}

async function writeBuildInfo() {
  const builtAt = new Date().toISOString()
  let gitCommit = ''
  try {
    gitCommit = (await runQuiet('git', ['rev-parse', '--short', 'HEAD'])).trim()
  } catch {
    // Release builds can also run outside a Git checkout.
  }
  const buildId = `${builtAt.replace(/\D/g, '').slice(0, 14)}-${gitCommit || 'nogit'}`
  await writeFile(resolve(releaseDir, 'build-info.json'), `${JSON.stringify({
    buildId,
    builtAt,
    gitCommit,
    generationPolicy: 'url-only-no-fallback-v2',
  }, null, 2)}\n`, 'utf8')
}

async function createArchive() {
  await rm(archivePath, { force: true })

  if (process.platform === 'win32') {
    await run('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Compress-Archive -Path "${releaseDir}\\*" -DestinationPath "${archivePath}" -Force`,
    ])
    return
  }

  try {
    await runQuiet('zip', ['-v'])
    await run('zip', ['-r', archivePath, '.'], { cwd: releaseDir })
    return
  } catch {
    await run('tar', ['-a', '-cf', archivePath, '-C', releaseDir, '.'])
  }
}

function envExample() {
  return `# Runtime
NODE_ENV=production
PORT=3001
SERVE_STATIC=true
REQUEST_BODY_LIMIT=80mb
GENERATION_LOG_VERBOSE=0
SCHEDULER_LOG_VERBOSE=0
LOG_TIME_ZONE=Asia/Shanghai

# If frontend and backend are on the same domain, keep this as your domain origin.
CORS_ORIGIN=https://your-domain.com

# Prompt reverse
# Use chat_completions for /v1/chat/completions, or messages for /v1/messages.
PROMPT_REVERSE_ENDPOINT=chat_completions
PROMPT_REVERSE_MODEL=gpt-4o-mini
PROMPT_REVERSE_MESSAGES_VERSION=2023-06-01
PROMPT_REVERSE_MAX_ATTEMPTS=3

# OAuth clients for external apps, format:
# client_id|client_secret|redirect_uri|display_name;another_id|another_secret|another_redirect|another_name
# OAUTH_CLIENTS=canvas-client-id|canvas-client-secret|https://canvas.example.com/oauth/aipi/callback|画布应用

# MySQL
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=aipi
MYSQL_USER=aipi
MYSQL_PASSWORD=change-this-password

# Optional: only needed when database creation/migration requires a different root account.
MYSQL_ROOT_USER=root
MYSQL_ROOT_PASSWORD=change-this-root-password

# Optional proxy for Alipay/upstream HTTPS requests.
# ALIPAY_PROXY_URL=http://127.0.0.1:7890
# HTTP_PROXY=http://127.0.0.1:7890
# HTTPS_PROXY=http://127.0.0.1:7890
ALIPAY_TIMEOUT_MS=30000
`
}

function deployReadme() {
  return `# AIπ Web Release

This folder is a production release package.

## Files

- \`dist-server/\`: compiled Node.js/Express server.
- \`public/\`: static frontend, admin frontend, and local vendor assets.
- \`scripts/check-release.mjs\`: startup file completeness check.
- \`package.json\` and \`package-lock.json\`: production dependency install files.
- \`build-info.json\`: release fingerprint exposed by \`/api/health\`.
- \`.env.example\`: copy this to \`.env\` and fill real values.

## Deploy

\`\`\`bash
cp .env.example .env
npm ci --omit=dev --include=optional
npm start
\`\`\`

If \`npm start\` reports missing \`dist-server/index.js\`, the release was not uploaded completely.
Upload the contents inside local \`release/web\` to your server root, not only \`package.json\`.

If \`npm start\` reports that \`sharp\` cannot load the \`linux-x64\` runtime, delete server dependencies and reinstall:

\`\`\`bash
rm -rf node_modules
npm ci --omit=dev --include=optional
\`\`\`

Do not upload local Windows \`node_modules\` to Linux servers.

The app listens on \`PORT\`, default \`3001\`.

## Routes

- Frontend: \`/\`
- Admin: \`/admin/\`
- API health: \`/api/health\`
- WebSocket: \`/ws/tasks\`, \`/ws/users\`

## Nginx Reverse Proxy Example

\`\`\`nginx
server {
  listen 80;
  server_name your-domain.com;

  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /ws/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
  }
}
\`\`\`

## PM2 Example

\`\`\`bash
npm i -g pm2
pm2 start dist-server/index.js --name aipi-web
pm2 save
\`\`\`

After updating and restarting, verify the running release:

\`\`\`bash
curl "http://127.0.0.1:3001/api/health?_=1"
pm2 describe aipi-web
\`\`\`

The health response must contain the same \`buildId\` as \`build-info.json\`.
`
}

function startShell() {
  return `#!/usr/bin/env sh
set -e
npm ci --omit=dev --include=optional
npm start
`
}

function startBat() {
  return `@echo off
npm ci --omit=dev
npm start
`
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
