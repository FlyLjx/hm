import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/AppError.js'
import { ApiProviderRepository } from '../apiProviders/apiProviderRepository.js'
import { ApiProviderService, type RemoteModel } from '../apiProviders/apiProviderService.js'
import { ModelRepository } from './modelRepository.js'
import type { AiModel, AiModelCapability, AiModelStatus, AiModelVariant } from './modelTypes.js'

type CreateModelInput = {
  providerId: string
  modelName: string
  displayName: string
  capability: AiModelCapability
  cost1k: number
  cost2k: number
  cost4k: number
  markupPercent: number
  price1k: number
  price2k: number
  price4k: number
  appendSizeToPrompt: boolean
}

type UpdateModelInput = Partial<CreateModelInput> & {
  status?: AiModelStatus
}

function uniqueModelNames(modelNames: string[]) {
  return Array.from(new Set(modelNames))
}

function filterModelsByCapability(modelNames: string[]) {
  return uniqueModelNames(modelNames)
}

function roundPrice(value: number) {
  return Math.round(value * 10000) / 10000
}

function calculateSalePrice(cost: number, markupPercent: number) {
  return roundPrice(cost * (1 + markupPercent / 100))
}

function calculateSalePrices(input: {
  cost1k: number
  cost2k: number
  cost4k: number
  markupPercent: number
}) {
  return {
    price1k: calculateSalePrice(input.cost1k, input.markupPercent),
    price2k: calculateSalePrice(input.cost2k, input.markupPercent),
    price4k: calculateSalePrice(input.cost4k, input.markupPercent),
  }
}

function salePricesFromInputOrCost(input: CreateModelInput, calculatedPrices: Pick<CreateModelInput, 'price1k' | 'price2k' | 'price4k'>) {
  return {
    price1k: input.price1k > 0 ? input.price1k : calculatedPrices.price1k,
    price2k: input.price2k > 0 ? input.price2k : calculatedPrices.price2k,
    price4k: input.price4k > 0 ? input.price4k : calculatedPrices.price4k,
  }
}

function hasExplicitSalePrice(input: UpdateModelInput) {
  return input.price1k !== undefined || input.price2k !== undefined || input.price4k !== undefined
}

function hasRemoteCost(model: Pick<RemoteModel, 'cost1k' | 'cost2k' | 'cost4k'>) {
  return model.cost1k > 0 || model.cost2k > 0 || model.cost4k > 0
}

function parseModelRatio(modelName: string) {
  const matches = Array.from(modelName.matchAll(/(?:^|[-_\s])(\d{1,2})\s*[xX*×]\s*(\d{1,2})(?=$|[-_\s])/g))
  const lastMatch = matches.at(-1)
  if (!lastMatch) return null
  return `${Number(lastMatch[1])}:${Number(lastMatch[2])}`
}

function parseModelSizeTier(modelName: string): AiModelVariant['sizeTier'] {
  const match = modelName.match(/(?:^|[-_\s])([1248])k(?=$|[-_\s])/i)
  if (!match) return null
  const tier = `${match[1].toLowerCase()}k`
  return tier === '1k' || tier === '2k' || tier === '4k' ? tier : null
}

function createModelVariant(model: AiModel): AiModelVariant {
  return {
    id: model.id,
    modelName: model.modelName,
    ratio: parseModelRatio(model.modelName),
    sizeTier: parseModelSizeTier(model.modelName),
    price1k: model.price1k,
    price2k: model.price2k,
    price4k: model.price4k,
  }
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

  async listPublicModels() {
    const models = await this.modelRepository.findAll()
    const groupedModels = new Map<string, AiModel & { variants: AiModelVariant[] }>()

    models.forEach((model) => {
      const key = [
        model.providerId,
        model.capability,
        (model.displayName || model.modelName).trim().toLowerCase(),
      ].join(':')
      const variant = createModelVariant(model)
      const existing = groupedModels.get(key)
      if (!existing) {
        groupedModels.set(key, {
          ...model,
          variants: [variant],
        })
        return
      }

      existing.variants.push(variant)
      existing.price1k = Math.min(existing.price1k || model.price1k, model.price1k || existing.price1k)
      existing.price2k = Math.min(existing.price2k || model.price2k, model.price2k || existing.price2k)
      existing.price4k = Math.min(existing.price4k || model.price4k, model.price4k || existing.price4k)
      if (existing.status !== 'active' && model.status === 'active') {
        Object.assign(existing, {
          ...existing,
          id: model.id,
          modelName: model.modelName,
          status: model.status,
        })
      }
    })

    return Array.from(groupedModels.values())
  }

  async createModel(input: CreateModelInput) {
    await this.assertProviderExists(input.providerId, input.capability)
    const now = new Date().toISOString()
    const cost1k = input.cost1k || input.price1k || 0
    const cost2k = input.cost2k || input.price2k || 0
    const cost4k = input.cost4k || input.price4k || 0
    const markupPercent = input.markupPercent ?? 0
    const calculatedSalePrices = calculateSalePrices({ cost1k, cost2k, cost4k, markupPercent })
    const salePrices = salePricesFromInputOrCost(input, calculatedSalePrices)
    const model: AiModel = {
      id: randomUUID(),
      ...input,
      cost1k,
      cost2k,
      cost4k,
      markupPercent,
      ...salePrices,
      appendSizeToPrompt: Boolean(input.appendSizeToPrompt),
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }

    return this.modelRepository.create(model)
  }

  async updateModel(id: string, input: UpdateModelInput) {
    const current = await this.modelRepository.findById(id)
    if (!current) {
      throw new AppError(404, '模型不存在')
    }
    if (input.providerId) {
      await this.assertProviderExists(input.providerId, input.capability ?? current.capability)
    }

    const shouldRecalculatePrice = !hasExplicitSalePrice(input) && ['cost1k', 'cost2k', 'cost4k', 'markupPercent'].some(
      (key) => input[key as keyof UpdateModelInput] !== undefined,
    )
    const normalizedInput = shouldRecalculatePrice
      ? {
          ...input,
          ...calculateSalePrices({
            cost1k: input.cost1k ?? current.cost1k,
            cost2k: input.cost2k ?? current.cost2k,
            cost4k: input.cost4k ?? current.cost4k,
            markupPercent: input.markupPercent ?? current.markupPercent,
          }),
        }
      : input

    const model = await this.modelRepository.update(id, normalizedInput)
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

  async syncModels(providerId: string, capability: AiModelCapability, keyword = '', aliasPrefix = '', markupPercent = 0) {
    const provider = await this.apiProviderRepository.findById(providerId)
    if (!provider) {
      throw new AppError(404, '接口配置不存在')
    }
    if (provider.capability !== capability) {
      throw new AppError(400, '请选择相同用途的接口进行模型同步')
    }

    const remoteModels = await this.apiProviderService.fetchModelDetails({
      type: provider.type,
      capability: provider.capability,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
    })
    const remoteModelNames = remoteModels.map((model) => model.name)
    const normalizedKeyword = keyword.trim().toLowerCase()
    const capabilityModels = filterModelsByCapability(remoteModelNames)
    const matchedModels = normalizedKeyword
      ? capabilityModels.filter((modelName) => modelName.toLowerCase().includes(normalizedKeyword))
      : capabilityModels
    const remoteByName = new Map(remoteModels.map((model) => [model.name, model]))
    const normalizedAliasPrefix = aliasPrefix.trim()

    const savedModels = await Promise.all(
      matchedModels.map(async (modelName) => {
        const existingModel = await this.modelRepository.findByProviderNameAndCapability(
          providerId,
          modelName,
          capability,
        )
        const remoteCost = remoteByName.get(modelName)
        const costSource = remoteCost && hasRemoteCost(remoteCost)
          ? remoteCost
          : {
              cost1k: existingModel?.cost1k ?? 0,
              cost2k: existingModel?.cost2k ?? 0,
              cost4k: existingModel?.cost4k ?? 0,
            }

        return this.createModel({
          providerId,
          modelName,
          displayName: existingModel?.displayName || (normalizedAliasPrefix ? `${normalizedAliasPrefix}${modelName}` : modelName),
          capability,
          cost1k: costSource.cost1k,
          cost2k: costSource.cost2k,
          cost4k: costSource.cost4k,
          markupPercent,
          price1k: existingModel?.price1k ?? 0,
          price2k: existingModel?.price2k ?? 0,
          price4k: existingModel?.price4k ?? 0,
          appendSizeToPrompt: existingModel?.appendSizeToPrompt ?? false,
        })
      }),
    )

    return savedModels.filter((model): model is AiModel => Boolean(model))
  }

  private async assertProviderExists(providerId: string, capability?: AiModelCapability) {
    const provider = await this.apiProviderRepository.findById(providerId)
    if (!provider) {
      throw new AppError(404, '接口配置不存在')
    }
    if (capability && provider.capability !== capability) {
      throw new AppError(400, '接口用途和模型用途不一致')
    }
  }
}
