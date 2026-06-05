export type AccountPoolLimitProgress = {
  featureName: string
  remaining: number | null
  resetAfter: string | null
}

export type AccountPoolAccount = {
  createdAt: string | null
  email: string
  password: string
  accessToken: string
  refreshToken: string
  idToken: string
  sourceType: string
  type: string
  status: string
  quota: number | null
  imageQuotaUnknown: boolean
  userId: string
  proxy: string
  limitsProgress: AccountPoolLimitProgress[]
  defaultModelSlug: string
  restoreAt: string | null
  success: number
  fail: number
  invalidCount: number
  lastUsedAt: string | null
  lastInvalidAt: string | null
  lastRefreshError: string | null
  lastRefreshErrorAt: string | null
  lastTokenRefreshAt: string | null
  lastTokenRefreshError: string | null
  lastTokenRefreshErrorAt: string | null
}
