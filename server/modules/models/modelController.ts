import type { Request, Response } from 'express'
import { getStringParam } from '../../shared/requestParams.js'
import {
  createModelSchema,
  deleteModelsSchema,
  syncModelsSchema,
  updateModelSchema,
} from './modelSchemas.js'
import { ModelService } from './modelService.js'

const modelService = new ModelService()

export class ModelController {
  async list(_req: Request, res: Response) {
    const models = _req.query.dedupe === 'display'
      ? await modelService.listPublicModels()
      : await modelService.listModels()
    res.json({ data: models })
  }

  async create(req: Request, res: Response) {
    const input = createModelSchema.parse(req.body)
    const model = await modelService.createModel(input)
    res.status(201).json({ data: model })
  }

  async sync(req: Request, res: Response) {
    const input = syncModelsSchema.parse(req.body)
    const models = await modelService.syncModels(
      input.providerId,
      input.capability,
      input.keyword,
      input.aliasPrefix,
      input.markupPercent,
    )
    res.json({ data: models })
  }

  async update(req: Request, res: Response) {
    const input = updateModelSchema.parse(req.body)
    const model = await modelService.updateModel(getStringParam(req.params.id, 'id'), input)
    res.json({ data: model })
  }

  async delete(req: Request, res: Response) {
    await modelService.deleteModel(getStringParam(req.params.id, 'id'))
    res.status(204).send()
  }

  async deleteMany(req: Request, res: Response) {
    const input = deleteModelsSchema.parse(req.body)
    const result = await modelService.deleteModels(input.ids)
    res.json({ data: result })
  }
}
