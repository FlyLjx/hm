import { Router } from 'express'
import { asyncHandler } from '../../shared/asyncHandler.js'
import { OAuthController } from './oauthController.js'

const oauthController = new OAuthController()

export const oauthRoutes = Router()

oauthRoutes.get('/client', asyncHandler(oauthController.client.bind(oauthController)))
oauthRoutes.post('/authorize', asyncHandler(oauthController.authorize.bind(oauthController)))
oauthRoutes.post('/token', asyncHandler(oauthController.token.bind(oauthController)))
oauthRoutes.get('/me', asyncHandler(oauthController.me.bind(oauthController)))
