export type EmailTokenType = 'register_verify' | 'password_reset'

export type EmailToken = {
  id: string
  email: string
  userId: string | null
  type: EmailTokenType
  tokenHash: string
  expiresInMinutes?: number
  expiresAt?: string
  usedAt: string | null
  createdAt?: string
}
