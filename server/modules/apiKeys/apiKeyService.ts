import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { AppError } from '../../shared/AppError.js'
import { UserRepository } from '../users/userRepository.js'
import { ApiKeyRepository, toPublicApiKey } from './apiKeyRepository.js'
import type { PublicUserApiKey, UserApiKey } from './apiKeyTypes.js'

export type AuthenticatedApiKey = {
  apiKey: UserApiKey
  user: NonNullable<Awaited<ReturnType<UserRepository['findById']>>>
}

function hashKey(key: string) {
  return createHash('sha256').update(key).digest('hex')
}

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a)
  const bBuffer = Buffer.from(b)
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer)
}

function createRawKey() {
  return `sk-aipi-${randomBytes(32).toString('base64url')}`
}

function readKeyPrefix(key: string) {
  return key.slice(0, 16)
}

export class ApiKeyService {
  constructor(
    private readonly apiKeyRepository = new ApiKeyRepository(),
    private readonly userRepository = new UserRepository(),
  ) {}

  async listUserKeys(userId: string): Promise<PublicUserApiKey[]> {
    const user = await this.userRepository.findById(userId)
    if (!user) throw new AppError(404, '用户不存在')
    const keys = await this.apiKeyRepository.findByUserId(user.id)
    return keys.map(toPublicApiKey)
  }

  async createUserKey(input: { userId: string; name: string }): Promise<PublicUserApiKey> {
    const user = await this.userRepository.findById(input.userId)
    if (!user) throw new AppError(404, '用户不存在')
    if (user.status !== 'active') throw new AppError(403, '用户已被禁用')
    const existingKeys = await this.apiKeyRepository.findByUserId(user.id)
    if (existingKeys.length > 0) {
      throw new AppError(409, '每个用户只允许生成一个 API Key')
    }

    const rawKey = createRawKey()
    const key = await this.apiKeyRepository.create({
      id: randomUUID(),
      userId: user.id,
      name: input.name,
      keyPrefix: readKeyPrefix(rawKey),
      keyHash: hashKey(rawKey),
      keyPlain: rawKey,
      status: 'active',
    })
    if (!key) throw new AppError(500, '创建 API Key 失败')
    return { ...toPublicApiKey(key), key: rawKey }
  }

  async updateUserKeyStatus(id: string, input: { userId?: string; status: 'active' | 'disabled' }) {
    const key = await this.apiKeyRepository.findById(id)
    if (!key) throw new AppError(404, 'API Key 不存在')
    if (key.deletedAt) throw new AppError(404, 'API Key 已删除')
    if (input.userId && key.userId !== input.userId) throw new AppError(403, '无权操作该 API Key')
    const updated = await this.apiKeyRepository.updateStatus(id, input.status, key.userId)
    if (!updated) throw new AppError(404, 'API Key 不存在')
    return toPublicApiKey(updated)
  }

  async deleteUserKey(id: string, userId?: string) {
    if (userId) {
      const deleted = await this.apiKeyRepository.deleteByUserId(id, userId)
      if (!deleted) throw new AppError(404, 'API Key 不存在或已删除')
      return
    }
    const key = await this.apiKeyRepository.findById(id)
    if (!key) throw new AppError(404, 'API Key 不存在')
    const deleted = await this.apiKeyRepository.delete(id)
    if (!deleted) throw new AppError(404, 'API Key 不存在或已删除')
  }

  async authenticate(rawKey: string): Promise<AuthenticatedApiKey> {
    const key = rawKey.trim()
    if (!key) throw new AppError(401, '缺少 API Key')
    const keyHash = hashKey(key)
    const candidates = await this.apiKeyRepository.findActiveByPrefix(readKeyPrefix(key))
    const apiKey = candidates.find((candidate) => safeEqual(candidate.keyHash, keyHash))
    if (!apiKey) throw new AppError(401, 'API Key 无效或已禁用')

    const user = await this.userRepository.findById(apiKey.userId)
    if (!user) throw new AppError(401, 'API Key 绑定用户不存在')
    if (user.status !== 'active') throw new AppError(403, '用户已被禁用')

    await this.apiKeyRepository.markUsed(apiKey.id)
    return { apiKey, user }
  }
}
