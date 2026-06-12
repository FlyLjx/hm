import type { Request, Response } from 'express'
import { authorizeQuerySchema, authorizeSchema, tokenSchema } from './oauthSchemas.js'
import { OAuthService } from './oauthService.js'

const oauthService = new OAuthService()

function bearerToken(req: Request) {
  const header = req.headers.authorization || ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

export class OAuthController {
  async client(req: Request, res: Response) {
    const input = authorizeQuerySchema.parse(req.query)
    const client = oauthService.getClient(input.client_id, input.redirect_uri)
    res.json({ data: client })
  }

  async authorize(req: Request, res: Response) {
    const input = authorizeSchema.parse(req.body)
    const code = await oauthService.createAuthorizationCode({
      userToken: input.userToken,
      clientId: input.client_id,
      redirectUri: input.redirect_uri,
    })
    const url = new URL(input.redirect_uri)
    url.searchParams.set('code', code)
    if (input.state) url.searchParams.set('state', input.state)
    res.json({ data: { redirectUrl: url.toString(), code } })
  }

  async token(req: Request, res: Response) {
    const input = tokenSchema.parse(req.body)
    const token = await oauthService.exchangeCode({
      code: input.code,
      clientId: input.client_id,
      clientSecret: input.client_secret,
      redirectUri: input.redirect_uri,
    })
    res.json(token)
  }

  async me(req: Request, res: Response) {
    const profile = await oauthService.getMe(bearerToken(req))
    res.json({ data: profile })
  }
}
