import { copyFile, cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = resolve(rootDir, 'release', 'web')

function isInside(parent, target) {
  const path = relative(parent, target)
  return path && !path.startsWith('..') && !resolve(path).startsWith(resolve(path).root)
}

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: 'inherit',
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolveRun()
      else reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}`))
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

  await writeFile(resolve(releaseDir, '.env.example'), envExample(), 'utf8')
  await writeFile(resolve(releaseDir, 'README_DEPLOY.md'), deployReadme(), 'utf8')
  await writeFile(resolve(releaseDir, 'start-web.sh'), startShell(), 'utf8')
  await writeFile(resolve(releaseDir, 'start-web.bat'), startBat(), 'utf8')

  console.log('')
  console.log(`Release ready: ${releaseDir}`)
  console.log('Upload the contents of release/web to your server, then follow README_DEPLOY.md.')
}

function envExample() {
  return `# Runtime
NODE_ENV=production
PORT=3001
SERVE_STATIC=true
REQUEST_BODY_LIMIT=80mb

# If frontend and backend are on the same domain, keep this as your domain origin.
CORS_ORIGIN=https://your-domain.com

# Prompt reverse
# Use chat_completions for /v1/chat/completions, or messages for /v1/messages.
PROMPT_REVERSE_ENDPOINT=chat_completions
PROMPT_REVERSE_MODEL=gpt-4o-mini
PROMPT_REVERSE_MESSAGES_VERSION=2023-06-01
PROMPT_REVERSE_MAX_ATTEMPTS=3

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
