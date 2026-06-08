import type { Request, Response } from 'express'
import { getStringParam } from '../../shared/requestParams.js'
import { createApiKeySchema, updateApiKeyStatusSchema } from './apiKeySchemas.js'
import { ApiKeyService } from './apiKeyService.js'

const apiKeyService = new ApiKeyService()

export class ApiKeyController {
  async listUserKeys(req: Request, res: Response) {
    const userId = getStringParam(req.params.id, 'id')
    const keys = await apiKeyService.listUserKeys(userId)
    res.json({ data: keys })
  }

  async createUserKey(req: Request, res: Response) {
    const userId = getStringParam(req.params.id, 'id')
    const input = createApiKeySchema.parse({ ...req.body, userId })
    const key = await apiKeyService.createUserKey(input)
    res.status(201).json({ data: key })
  }

  async updateUserKeyStatus(req: Request, res: Response) {
    const input = updateApiKeyStatusSchema.parse({
      ...req.body,
      userId: getStringParam(req.params.id, 'id'),
    })
    const key = await apiKeyService.updateUserKeyStatus(getStringParam(req.params.keyId, 'keyId'), input)
    res.json({ data: key })
  }

  async deleteUserKey(req: Request, res: Response) {
    await apiKeyService.deleteUserKey(getStringParam(req.params.keyId, 'keyId'), getStringParam(req.params.id, 'id'))
    res.status(204).send()
  }
}
