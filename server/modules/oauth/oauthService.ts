import { randomBytes, randomUUID } from 'node:crypto'
import { env } from '../../config/env.js'
import { AppError } from '../../shared/AppError.js'
import { ApiKeyService } from '../apiKeys/apiKeyService.js'
import { ApiKeyRepository } from '../apiKeys/apiKeyRepository.js'
import { UserService } from '../users/userService.js'
import { parseUserToken } from '../users/userAuth.js'

type OAuthGrant = {
  code: string
  clientId: string
  redirectUri: string
  userId: string
  expiresAt: number
  usedAt: number | null
}

type OAuthAccessToken = {
  token: string
  clientId: string
  userId: string
  expiresAt: number
}

const grants = new Map<string, OAuthGrant>()
const accessTokens = new Map<string, OAuthAccessToken>()
const codeTtlMs = 5 * 60 * 1000
const accessTokenTtlMs = 24 * 60 * 60 * 1000

function createOpaqueToken(prefix: string) {
  return `${prefix}-${randomBytes(32).toString('base64url')}`
}

function publicClient(clientId: string) {
  const client = env.oauth.clients.find((item) => item.id === clientId)
  if (!client) throw new AppError(400, 'OAuth client 不存在')
  return client
}

function assertClientRedirect(clientId: string, redirectUri: string) {
  const client = publicClient(clientId)
  if (client.redirectUri !== redirectUri) {
    throw new AppError(400, 'redirect_uri 不匹配')
  }
  return client
}

function cleanExpired() {
  const now = Date.now()
  for (const [code, grant] of grants) {
    if (grant.expiresAt < now || grant.usedAt) grants.delete(code)
  }
  for (const [token, accessToken] of accessTokens) {
    if (accessToken.expiresAt < now) accessTokens.delete(token)
  }
}

export class OAuthService {
  constructor(
    private readonly userService = new UserService(),
    private readonly apiKeyService = new ApiKeyService(),
    private readonly apiKeyRepository = new ApiKeyRepository(),
  ) {}

  getClient(clientId: string, redirectUri: string) {
    const client = assertClientRedirect(clientId, redirectUri)
    return {
      id: client.id,
      name: client.name,
      redirectUri: client.redirectUri,
    }
  }

  async createAuthorizationCode(input: {
    userToken: string
    clientId: string
    redirectUri: string
  }) {
    cleanExpired()
    assertClientRedirect(input.clientId, input.redirectUri)
    const session = parseUserToken(input.userToken)
    await this.userService.getPublicUser(session.userId)
    const code = createOpaqueToken('aipi-code')
    grants.set(code, {
      code,
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      userId: session.userId,
      expiresAt: Date.now() + codeTtlMs,
      usedAt: null,
    })
    return code
  }

  async exchangeCode(input: {
    code: string
    clientId: string
    clientSecret: string
    redirectUri: string
  }) {
    cleanExpired()
    const client = assertClientRedirect(input.clientId, input.redirectUri)
    if (client.secret !== input.clientSecret) throw new AppError(401, 'client_secret 不正确')
    const grant = grants.get(input.code)
    if (!grant || grant.usedAt || grant.expiresAt < Date.now()) throw new AppError(400, '授权码无效或已过期')
    if (grant.clientId !== input.clientId || grant.redirectUri !== input.redirectUri) {
      throw new AppError(400, '授权码和客户端不匹配')
    }
    grant.usedAt = Date.now()
    grants.delete(input.code)
    const accessToken = createOpaqueToken('aipi-oauth')
    accessTokens.set(accessToken, {
      token: accessToken,
      clientId: input.clientId,
      userId: grant.userId,
      expiresAt: Date.now() + accessTokenTtlMs,
    })
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: Math.floor(accessTokenTtlMs / 1000),
    }
  }

  async getMe(accessToken: string) {
    cleanExpired()
    const token = accessTokens.get(accessToken)
    if (!token || token.expiresAt < Date.now()) throw new AppError(401, 'OAuth token 无效或已过期')
    const user = await this.userService.getPublicUser(token.userId)
    const keys = await this.apiKeyRepository.findByUserId(user.id)
    let activeKey = keys.find((key) => key.status === 'active' && !key.deletedAt) ?? null
    let createdKey: Awaited<ReturnType<ApiKeyService['createUserKey']>> | null = null
    if (!activeKey) {
      createdKey = await this.apiKeyService.createUserKey({ userId: user.id, name: 'Canvas OAuth' })
      activeKey = await this.apiKeyRepository.findById(createdKey.id)
    }
    const plainKey = activeKey?.keyPlain || createdKey?.key || ''
    if (!plainKey) {
      throw new AppError(409, '当前 API Key 缺少明文密钥，请在用户中心重新生成后再授权画布')
    }
    return {
      user,
      apiKey: {
        id: activeKey?.id ?? createdKey?.id ?? randomUUID(),
        name: activeKey?.name ?? createdKey?.name ?? 'Canvas OAuth',
        keyPrefix: activeKey?.keyPrefix ?? createdKey?.keyPrefix ?? '',
        key: plainKey,
      },
    }
  }
}
