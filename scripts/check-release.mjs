import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const requiredPaths = [
  'dist-server/index.js',
  'public/web/index.html',
  'public/admin/index.html',
]

const missing = requiredPaths.filter((item) => !existsSync(resolve(process.cwd(), item)))

if (missing.length > 0) {
  console.error('发布文件不完整，缺少以下文件：')
  missing.forEach((item) => console.error(`- ${item}`))
  console.error('')
  console.error('请在本地运行 npm run release:web，然后把 release/web 目录里面的所有内容上传到服务器项目根目录。')
  console.error('注意：上传的是 release/web 里面的内容，不是 release/web 这个外层目录。')
  process.exit(1)
}

try {
  await import('sharp')
} catch (error) {
  console.error('sharp 图片处理依赖不可用，通常是 node_modules 平台不匹配或 optional dependencies 没装完整。')
  console.error('')
  console.error('请在服务器项目目录执行：')
  console.error('  rm -rf node_modules')
  console.error('  npm ci --omit=dev --include=optional')
  console.error('')
  console.error('如果仍失败，再执行：')
  console.error('  npm install --os=linux --cpu=x64 sharp')
  console.error('')
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
