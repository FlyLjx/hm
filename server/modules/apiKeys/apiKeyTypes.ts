export type ApiKeyStatus = 'active' | 'disabled'

export type UserApiKey = {
  id: string
  userId: string
  userEmail?: string | null
  name: string
  keyPrefix: string
  keyHash: string
  keyPlain?: string | null
  status: ApiKeyStatus
  lastUsedAt?: string | null
  deletedAt?: string | null
  createdAt: string
  updatedAt: string
}

export type PublicUserApiKey = Omit<UserApiKey, 'keyHash'> & {
  key?: string
}
