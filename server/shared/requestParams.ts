import { AppError } from './AppError.js'

export function getStringParam(value: string | string[] | undefined, name: string) {
  if (!value || Array.isArray(value)) {
    throw new AppError(400, `缺少参数：${name}`)
  }
  return value
}
