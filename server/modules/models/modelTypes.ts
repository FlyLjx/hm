export type AiModelStatus = 'active' | 'disabled'
export type AiModelCapability = 'image' | 'video' | 'chat_image' | 'workflow'

export type AiModel = {
  id: string
  providerId: string
  providerName?: string
  modelName: string
  displayName: string
  capability: AiModelCapability
  price1k: number
  price2k: number
  price4k: number
  status: AiModelStatus
  createdAt: string
  updatedAt: string
}
