export type ApiProviderType = 'sub2api' | 'custom'
export type ApiProviderStatus = 'active' | 'disabled'
export type ApiProviderCapability = 'chat_image'

export type ApiProvider = {
  id: string
  name: string
  type: ApiProviderType
  capability: ApiProviderCapability
  baseUrl: string
  apiKey: string
  status: ApiProviderStatus
  createdAt: string
  updatedAt: string
}
