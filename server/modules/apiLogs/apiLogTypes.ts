export type ApiCallLogStatus = 'success' | 'failed'
export type ApiCallLogDirection = 'upstream' | 'downstream'

export type ApiCallLog = {
  id: string
  direction: ApiCallLogDirection
  taskId?: string | null
  userId?: string | null
  userEmail?: string | null
  apiKeyId?: string | null
  apiKeyName?: string | null
  providerId?: string | null
  providerName?: string | null
  providerType?: string | null
  endpoint: string
  phase: string
  method: string
  status: ApiCallLogStatus
  statusCode?: number | null
  durationMs: number
  requestSummary?: unknown
  responseSummary?: unknown
  errorMessage?: string | null
  createdAt: string
}

export type CreateApiCallLogInput = Omit<ApiCallLog, 'id' | 'providerName' | 'userEmail' | 'createdAt' | 'direction'> & {
  direction?: ApiCallLogDirection
}
