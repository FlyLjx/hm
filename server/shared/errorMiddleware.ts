import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { AppError } from './AppError.js'

type ZodIssue = ZodError['issues'][number]

const fieldNames: Record<string, string> = {
  email: '邮箱',
  password: '密码',
  newPassword: '新密码',
  token: '验证信息',
  userId: '用户信息',
  modelId: '模型',
  prompt: '提示词',
  quantity: '数量',
}

function zodIssueMessage(issue?: ZodIssue) {
  if (!issue) return '请求参数错误'
  const key = String(issue.path?.[0] || '')
  const fieldName = fieldNames[key] || '参数'

  if (issue.code === 'too_small') {
    const minimum = 'minimum' in issue ? issue.minimum : undefined
    if (issue.origin === 'string') return `${fieldName}至少需要 ${minimum} 个字符`
    if (issue.origin === 'array') return `${fieldName}至少需要选择 ${minimum} 项`
    if (issue.origin === 'number') return `${fieldName}不能小于 ${minimum}`
    return `${fieldName}长度或数量不符合要求`
  }

  if (issue.code === 'too_big') {
    const maximum = 'maximum' in issue ? issue.maximum : undefined
    if (issue.origin === 'string') return `${fieldName}不能超过 ${maximum} 个字符`
    if (issue.origin === 'array') return `${fieldName}最多只能选择 ${maximum} 项`
    if (issue.origin === 'number') return `${fieldName}不能大于 ${maximum}`
    return `${fieldName}长度或数量不符合要求`
  }

  if (issue.code === 'invalid_format') {
    if ('format' in issue && issue.format === 'email') return '请输入正确的邮箱地址'
    return `${fieldName}格式不正确`
  }

  if (issue.code === 'invalid_type') return `${fieldName}类型不正确`
  if (issue.code === 'invalid_value') return `${fieldName}不是有效选项`
  if (issue.message && !/expected|too small|too big|invalid/i.test(issue.message)) return issue.message
  return '请求参数错误'
}

export const errorMiddleware: ErrorRequestHandler = (error, _req: Request, res: Response, _next: NextFunction) => {
  void _next

  if (error?.type === 'entity.too.large') {
    res.status(413).json({
      message: '参考图请求体过大，请减少图片数量或提高 REQUEST_BODY_LIMIT',
    })
    return
  }

  if (error instanceof ZodError) {
    const firstIssue = error.issues[0]
    res.status(400).json({
      message: zodIssueMessage(firstIssue),
      issues: error.issues,
    })
    return
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({ message: error.message })
    return
  }

  console.error(error)
  res.status(500).json({ message: '服务器内部错误' })
}
