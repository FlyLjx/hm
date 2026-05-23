import type { Request, Response } from 'express'
import { generateImageSchema } from './generationSchemas.js'
import { GenerationService } from './generationService.js'

const generationService = new GenerationService()

function getRequestIp(req: Request) {
  const forwardedFor = req.headers['x-forwarded-for']
  if (typeof forwardedFor === 'string') {
    return forwardedFor.split(',')[0]?.trim() ?? req.ip ?? ''
  }
  return req.ip ?? ''
}

function summarizeReferenceImage(value?: string) {
  if (!value) return null
  return {
    type: value.startsWith('data:') ? 'base64' : 'url',
    length: value.length,
  }
}

function logGenerationRequest(event: string, payload: Record<string, unknown>) {
  console.info(`[generation:${event}]`, JSON.stringify(payload, null, 2))
}

export class GenerationController {
  async generateImage(req: Request, res: Response) {
    const input = generateImageSchema.parse(req.body)
    const userIp = getRequestIp(req)
    logGenerationRequest('request-received', {
      userId: input.userId,
      modelId: input.modelId,
      prompt: input.prompt,
      sizeTier: input.sizeTier,
      size: input.size,
      quantity: input.quantity,
      referenceImage: summarizeReferenceImage(input.referenceImageUrl),
      userIp,
    })

    const task = await generationService.generateImage({
      ...input,
      userIp,
    })
    logGenerationRequest('request-accepted', {
      taskId: task?.id,
      status: task?.status,
      userId: task?.userId,
      modelId: task?.modelId,
      sizeTier: task?.sizeTier,
      size: task?.size,
      quantity: task?.quantity,
    })
    res.status(201).json({ data: task })
  }
}
