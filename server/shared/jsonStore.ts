import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export class JsonStore<T> {
  private filePath: string

  constructor(fileName: string) {
    this.filePath = path.resolve(process.cwd(), 'server', 'data', fileName)
  }

  async read(defaultValue: T): Promise<T> {
    try {
      const content = await readFile(this.filePath, 'utf8')
      return JSON.parse(content) as T
    } catch {
      await this.write(defaultValue)
      return defaultValue
    }
  }

  async write(data: T) {
    await mkdir(path.dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  }
}
