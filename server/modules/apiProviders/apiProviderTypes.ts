export type ApiProviderType = 'sub2api' | 'custom'
export type ApiProviderStatus = 'active' | 'disabled'

export type ApiProvider = {
  id: string
  name: string
  type: ApiProviderType
  baseUrl: string
  apiKey: string
  status: ApiProviderStatus
  createdAt: string
  updatedAt: string
}
