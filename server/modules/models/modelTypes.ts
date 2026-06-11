export type AiModelStatus = 'active' | 'disabled'
export type AiModelCapability = 'chat_image'

export type AiModel = {
  id: string
  providerId: string
  providerName?: string
  providerStatus?: 'active' | 'disabled'
  modelName: string
  displayName: string
  capability: AiModelCapability
  cost1k: number
  cost2k: number
  cost4k: number
  markupPercent: number
  priceChangePercent: number
  price1k: number
  price2k: number
  price4k: number
  appendSizeToPrompt: boolean
  sortOrder: number
  status: AiModelStatus
  createdAt: string
  updatedAt: string
  providerType?: 'sub2api' | 'custom'
  variants?: AiModelVariant[]
}

export type AiModelVariant = {
  id: string
  modelName: string
  ratio: string | null
  sizeTier: '1k' | '2k' | '4k' | null
  price1k: number
  price2k: number
  price4k: number
  sortOrder: number
}
