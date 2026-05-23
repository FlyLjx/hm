import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { EmailTokenRepository } from './emailTokenRepository.js'
import type { EmailTokenType } from './emailTokenTypes.js'

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export class EmailTokenService {
  constructor(private readonly emailTokenRepository = new EmailTokenRepository()) {}

  async createToken(input: {
    email: string
    userId?: string | null
    type: EmailTokenType
    expiresInMinutes?: number
  }) {
    await this.emailTokenRepository.invalidateOpenTokens(input.email, input.type)
    const token = randomBytes(32).toString('hex')

    await this.emailTokenRepository.create({
      id: randomUUID(),
      email: input.email,
      userId: input.userId ?? null,
      type: input.type,
      tokenHash: hashToken(token),
      expiresInMinutes: input.expiresInMinutes ?? 30,
      usedAt: null,
    })

    return token
  }

  async consumeToken(token: string, type: EmailTokenType) {
    const emailToken = await this.emailTokenRepository.findActiveByHash(hashToken(token), type)
    if (!emailToken) {
      return null
    }

    await this.emailTokenRepository.markUsed(emailToken.id)
    return emailToken
  }
}
