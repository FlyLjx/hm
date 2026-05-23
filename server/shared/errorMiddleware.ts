import type { ErrorRequestHandler } from 'express'
import { ZodError } from 'zod'
import { AppError } from './AppError.js'

export const errorMiddleware: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error?.type === 'entity.too.large') {
    res.status(413).json({
      message: '上传的图片太大了，请压缩后重试',
    })
    return
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      message: '请求参数错误',
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
