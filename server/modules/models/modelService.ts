import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/AppError.js'
import { ApiProviderRepository } from '../apiProviders/apiProviderRepository.js'
import { ApiProviderService } from '../apiProviders/apiProviderService.js'
import { ModelRepository } from './modelRepository.js'
import type { AiModel, AiModelCapability, AiModelStatus } from './modelTypes.js'

type CreateModelInput = {
  providerId: string
  modelName: string
  displayName: string
  capability: AiModelCapability
  price1k: number
  price2k: number
  price4k: number
}

type UpdateModelInput = Partial<CreateModelInput> & {
  status?: AiModelStatus
}

export class ModelService {
  constructor(
    private readonly modelRepository = new ModelRepository(),
    private readonly apiProviderRepository = new ApiProviderRepository(),
    private readonly apiProviderService = new ApiProviderService(),
  ) {}

  async listModels() {
    return this.modelRepository.findAll()
  }

  async createModel(input: CreateModelInput) {
    await this.assertProviderExists(input.providerId)
    const now = new Date().toISOString()
    const model: AiModel = {
      id: randomUUID(),
      ...input,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }

    return this.modelRepository.create(model)
  }

  async updateModel(id: string, input: UpdateModelInput) {
    if (input.providerId) {
      await this.assertProviderExists(input.providerId)
    }

    const model = await this.modelRepository.update(id, input)
    if (!model) {
      throw new AppError(404, '模型不存在')
    }
    return model
  }

  async deleteModel(id: string) {
    const deleted = await this.modelRepository.delete(id)
    if (!deleted) {
      throw new AppError(404, '模型不存在')
    }
  }

  async deleteModels(ids: string[]) {
    const deletedCount = await this.modelRepository.deleteMany(ids)
    return { deletedCount }
  }

  async syncModels(providerId: string, capability: AiModelCapability, keyword = '') {
    const provider = await this.apiProviderRepository.findById(providerId)
    if (!provider) {
      throw new AppError(404, '接口配置不存在')
    }

    const remoteModels = await this.apiProviderService.fetchModels({
      type: provider.type,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
    })
    const normalizedKeyword = keyword.trim().toLowerCase()
    const matchedModels = normalizedKeyword
      ? remoteModels.filter((modelName) => modelName.toLowerCase().includes(normalizedKeyword))
      : remoteModels

    const savedModels = await Promise.all(
      matchedModels.map((modelName) =>
        this.createModel({
          providerId,
          modelName,
          displayName: modelName,
          capability,
          price1k: 0,
          price2k: 0,
          price4k: 0,
        }),
      ),
    )

    return savedModels.filter((model): model is AiModel => Boolean(model))
  }

  private async assertProviderExists(providerId: string) {
    const provider = await this.apiProviderRepository.findById(providerId)
    if (!provider) {
      throw new AppError(404, '接口配置不存在')
    }
  }
}
