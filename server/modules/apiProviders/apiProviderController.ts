import type { Request, Response } from 'express'
import { getStringParam } from '../../shared/requestParams.js'
import {
  createApiProviderSchema,
  fetchApiProviderModelsSchema,
  updateApiProviderSchema,
} from './apiProviderSchemas.js'
import { ApiProviderService } from './apiProviderService.js'

const apiProviderService = new ApiProviderService()

export class ApiProviderController {
  async list(_req: Request, res: Response) {
    const providers = await apiProviderService.listProviders()
    res.json({ data: providers })
  }

  async create(req: Request, res: Response) {
    const input = createApiProviderSchema.parse(req.body)
    const provider = await apiProviderService.createProvider(input)
    res.status(201).json({ data: provider })
  }

  async models(req: Request, res: Response) {
    const input = fetchApiProviderModelsSchema.parse(req.body)
    const models = await apiProviderService.fetchModels(input)
    res.json({ data: models })
  }

  async update(req: Request, res: Response) {
    const input = updateApiProviderSchema.parse(req.body)
    const provider = await apiProviderService.updateProvider(getStringParam(req.params.id, 'id'), input)
    res.json({ data: provider })
  }

  async delete(req: Request, res: Response) {
    await apiProviderService.deleteProvider(getStringParam(req.params.id, 'id'))
    res.status(204).send()
  }
}
